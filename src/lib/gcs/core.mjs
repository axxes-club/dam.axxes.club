import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
export class StorageError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => {
  throw new StorageError(message, status);
};
const segment = /^[A-Za-z0-9_-]+$/;
export function safeKey(key) {
  if (
    typeof key !== "string" ||
    key.length > 1024 ||
    /[\\%\x00-\x1f\x7f]/.test(key) ||
    !key
      .split("/")
      .every(
        (p) => p && p !== "." && p !== ".." && /^[A-Za-z0-9._ -]+$/.test(p),
      )
  )
    fail("Invalid object key");
  if (!key.startsWith("uploads/") && !key.startsWith("imports/"))
    fail("Object key outside asset namespace");
  return key;
}
export function ownerDigest(owner) {
  if (typeof owner !== "string" || !owner.trim() || owner.length > 512)
    fail("Unauthorized owner", 403);
  return createHash("sha256").update(owner).digest("hex").slice(0, 32);
}
function kind(type) {
  return type.startsWith("image/")
    ? "image"
    : type.startsWith("video/")
      ? "video"
      : type.startsWith("audio/")
        ? "audio"
        : type === "application/pdf"
          ? "pdf"
          : type.startsWith("text/")
            ? "text"
            : "blob";
}
export function validateFiles(files, rules) {
  if (!Array.isArray(files) || !files.length || files.length > 200)
    fail("Invalid file batch");
  const counts = {};
  for (const f of files) {
    if (
      !f ||
      typeof f.name !== "string" ||
      !f.name.trim() ||
      f.name.length > 255 ||
      /[\/\\\x00-\x1f\x7f]/.test(f.name)
    )
      fail("Invalid filename");
    if (!Number.isSafeInteger(f.size) || f.size < 1) fail("Invalid file size");
    if (typeof f.type !== "string" || !/^[-\w.+]+\/[-\w.+]+$/.test(f.type))
      fail("Invalid content type");
    const category = kind(f.type),
      rule = rules[category];
    if (!rule) fail("File type is not allowed");
    counts[category] = (counts[category] ?? 0) + 1;
    if (f.size > rule.bytes || counts[category] > rule.count)
      fail("File size/count limit exceeded");
  }
}
export function assertPrivateBucket(metadata) {
  const iam = metadata?.iamConfiguration;
  if (
    iam?.publicAccessPrevention !== "enforced" ||
    iam?.uniformBucketLevelAccess?.enabled !== true
  )
    fail("Bucket must enforce private uniform access", 503);
}
export function corsForOrigins(origins) {
  if (!Array.isArray(origins) || !origins.length)
    fail("Exact HTTPS CORS origins required");
  for (const origin of origins) {
    const u = new URL(origin);
    if (
      u.protocol !== "https:" ||
      u.origin !== origin ||
      u.username ||
      u.password
    )
      fail("Exact HTTPS CORS origins required");
  }
  return [
    {
      origin: [...new Set(origins)],
      method: ["GET", "HEAD", "POST"],
      responseHeader: ["Content-Type", "Content-Length", "ETag"],
      maxAgeSeconds: 3600,
    },
  ];
}
export function objectKeyFromUrl(
  raw,
  { bucket, origins = [], aliases = {}, verifiedKeys = new Set() },
) {
  try {
    if (typeof raw !== "string" || raw.length > 8192) return null;
    if (aliases[raw]) {
      const key = safeKey(aliases[raw].object_name ?? aliases[raw]);
      return verifiedKeys.has(key) ? key : null;
    }
    if (/\/(?:\.{1,2})(?:\/|$)|%(?:2e|2f|5c)/i.test(raw.split(/[?#]/)[0]))
      return null;
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    let key;
    if (origins.includes(u.origin) && u.pathname === "/api/assets/gcp")
      key = u.searchParams.get("key");
    else if (
      u.hostname === "storage.googleapis.com" &&
      u.pathname.startsWith("/" + bucket + "/")
    ) {
      if (u.pathname.includes("%")) return null;
      key = u.pathname.slice(bucket.length + 2);
    } else if (
      (u.hostname === "utfs.io" || /^[a-z0-9-]+\.ufs\.sh$/.test(u.hostname)) &&
      /^\/f\/[A-Za-z0-9_-]+$/.test(u.pathname)
    )
      key = "imports/uploadthing/" + u.pathname.slice(3);
    else return null;
    safeKey(key);
    if (key.startsWith("imports/") && !verifiedKeys.has(key)) return null;
    return key;
  } catch {
    return null;
  }
}
export class Adapter {
  constructor({
    app,
    bucket,
    baseUrl,
    routes,
    store,
    registry,
    now = Date.now,
    origins = [baseUrl],
  }) {
    if (!segment.test(app) || !segment.test(bucket)) fail("Invalid app/bucket");
    corsForOrigins(origins);
    if (new URL(baseUrl).origin !== baseUrl)
      fail("Public base URL must be an origin");
    Object.assign(this, {
      app,
      bucket,
      baseUrl,
      routes,
      store,
      registry,
      now,
      origins,
    });
  }
  checkOrigin(request) {
    if (!this.origins.includes(request.headers.get("origin")))
      fail("Origin not allowed", 403);
  }
  async init(request, routeName, files, input) {
    this.checkOrigin(request);
    const route = this.routes[routeName];
    if (!route) fail("Unknown upload route");
    validateFiles(files, route.files);
    const authorization = await route.authorize(request, input, {
      phase: "init",
    });
    const owner = authorization.owner;
    const digest = ownerDigest(owner);
    if (!["private", "public"].includes(route.visibility))
      fail("Explicit visibility required");
    await this.store.assertPrivate();
    const records = [];
    for (const descriptor of files) {
      const id = randomUUID(),
        suffix = `${this.app}/${digest}/${id}`,
        staging = "staging/" + suffix,
        key = "uploads/" + suffix;
      const objectMetadata = {
        app: this.app,
        owner: digest,
        route: routeName,
        uploadid: id,
        visibility: route.visibility,
      };
      const record = {
        id,
        app: this.app,
        route: routeName,
        owner,
        descriptor: {
          name: descriptor.name,
          type: descriptor.type,
          size: descriptor.size,
        },
        metadata: authorization.metadata ?? {},
        staging,
        key,
        objectMetadata,
        createdAt: this.now(),
        maxExpiresAt: this.now() + 24 * 60 * 60 * 1000,
        expiresAt: this.now() + 15 * 60 * 1000,
      };
      records.push(record);
    }
    if(this.registry.createBatch) await this.registry.createBatch(records);
    else for(const record of records) await this.registry.create(record);
    const results=[];
    for(const record of records) {
      const policy=await this.store.signPost(record.staging,record.descriptor,record.objectMetadata,record.expiresAt);
      results.push({uploadId:record.id,policy});
    }
    return results;
  }
  async renew(request, id, input) {
    this.checkOrigin(request);
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
      fail("Invalid upload identifier");
    const record = await this.registry.get(id);
    if (!record || record.app !== this.app) fail("No such upload", 404);
    const route = this.routes[record.route];
    if (!route) fail("Upload route removed", 404);
    const authorization = await route.authorize(request, input, {
      phase: record.result != null ? "replay" : "continue",
    });
    if (!isDeepStrictEqual(authorization.metadata ?? {}, record.metadata))
      fail("Upload metadata mismatch", 403);
    if (authorization.owner !== record.owner)
      fail("Upload owner mismatch", 403);
    await this.store.assertPrivate();
    return this.registry.renewOnce(id, record.owner, async (current) => {
      if (current.app !== this.app || current.owner !== authorization.owner)
        fail("Upload owner mismatch", 403);
      const deadline = current.maxExpiresAt ?? current.expiresAt;
      if (deadline <= this.now()) fail("Upload expired", 410);
      current.expiresAt = Math.min(this.now() + 15 * 60 * 1000, deadline);
      const policy = await this.store.signPost(
        current.staging,
        current.descriptor,
        current.objectMetadata,
        current.expiresAt,
      );
      return { uploadId: id, policy };
    });
  }
  async complete(request, id, input) {
    this.checkOrigin(request);
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id))
      fail("Invalid upload identifier");
    const record = await this.registry.get(id);
    if (!record || record.app !== this.app) fail("No such upload", 404);
    const route = this.routes[record.route];
    if (!route) fail("Upload route removed", 404);
    const authorization = await route.authorize(request, input, {
      phase: record.result != null ? "replay" : "continue",
    });
    if (!isDeepStrictEqual(authorization.metadata ?? {}, record.metadata))
      fail("Upload metadata mismatch", 403);
    if (authorization.owner !== record.owner)
      fail("Upload owner mismatch", 403);
    await this.store.assertPrivate();
    const result = await this.registry.completeOnce(
      id,
      record.owner,
      async (current, transaction) => {
        if (current.app !== this.app || current.owner !== authorization.owner)
          fail("Upload owner mismatch", 403);
        if ((current.maxExpiresAt ?? current.expiresAt) < this.now())
          fail("Upload expired", 410);
        const uploaded = await this.store.stat(current.staging);
        this.checkObject(uploaded, current);
        const frozen = await this.store.freeze(
          current.staging,
          current.key,
          uploaded.generation,
          current.objectMetadata,
          current.descriptor.type,
        );
        this.checkObject(frozen, current);
        const url =
          this.baseUrl +
          "/api/assets/gcp?key=" +
          encodeURIComponent(current.key);
        const file = {
          key: current.key,
          name: current.descriptor.name,
          size: current.descriptor.size,
          type: current.descriptor.type,
          url,
          ufsUrl: url,
          generation: frozen.generation,
        };
        // The receipt and DB callback must commit in the SAME SQL transaction.
        const serverData = await route.complete({
          metadata: current.metadata,
          file,
          uploadId: id,
          transaction,
        });
        return { ...file, serverData };
      },
    );
    // SQL has committed. Cleanup cannot invalidate a durable completion receipt.
    // Freeze/callback retry never runs again merely because object deletion fails.
    try {
      const staging = await this.store.stat(record.staging);
      if (staging) {
        this.checkObject(staging, record);
        await this.store.delete(record.staging, staging.generation);
      }
    } catch {
      console.warn("GCS staging cleanup deferred");
    }
    return result;
  }
  checkObject(file, record) {
    if (
      !file ||
      String(file.size) !== String(record.descriptor.size) ||
      file.contentType !== record.descriptor.type ||
      !file.generation
    )
      fail("Uploaded bytes do not match authorized file");
    for (const [k, v] of Object.entries(record.objectMetadata))
      if (file.metadata?.[k] !== v)
        fail("Uploaded owner/route metadata mismatch", 403);
  }
  async read(request, key, authorize) {
    safeKey(key);
    await this.store.assertPrivate();
    const file = await this.store.stat(key);
    if (!file) fail("Asset not found", 404);
    if (
      !(key.startsWith("uploads/") && file.metadata?.visibility === "public") &&
      !(await authorize(request, key, file))
    )
      fail("Denied", 403);
    return this.store.readUrl(key, file.generation, this.now() + 5 * 60 * 1000);
  }
  async remove(request, key, authorize) {
    safeKey(key);
    await this.store.assertPrivate();
    const file = await this.store.stat(key);
    if (!file) return false;
    if (!(await authorize(request, key, file))) fail("Denied", 403);
    await this.store.delete(key, file.generation);
    return true;
  }
}
