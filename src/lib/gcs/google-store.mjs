import { Storage } from "@google-cloud/storage";
import { assertPrivateBucket } from "./core.mjs";
export class GoogleStore {
  constructor({ storage = new Storage(), bucket }) {
    this.bucket = storage.bucket(bucket);
  }
  async assertPrivate() {
    const [metadata] = await this.bucket.getMetadata();
    assertPrivateBucket(metadata);
  }
  async signPost(key, file, metadata, expires) {
    const fields = {
      "Content-Type": file.type,
      "Cache-Control": "private, no-store",
    };
    for (const [k, v] of Object.entries(metadata))
      fields["x-goog-meta-" + k] = v;
    const [policy] = await this.bucket.file(key).generateSignedPostPolicyV4({
      expires,
      fields,
      conditions: [["content-length-range", file.size, file.size]],
    });
    return policy;
  }
  async save(key, data, metadata) {
    const { contentType, ...custom } = metadata;
    await this.bucket.file(key).save(data, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType,
        cacheControl: "private, no-store",
        metadata: custom,
      },
    });
  }
  async stat(key) {
    try {
      const [m] = await this.bucket.file(key).getMetadata();
      return {
        size: m.size,
        contentType: m.contentType,
        generation: m.generation,
        metadata: m.metadata ?? {},
      };
    } catch (e) {
      if (e.code === 404) return null;
      throw e;
    }
  }
  async freeze(from, to, generation, metadata) {
    try {
      await this.bucket.file(from, { generation }).copy(this.bucket.file(to), {
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata,
        cacheControl: "private, no-store",
      });
    } catch (e) {
      if (e.code !== 412) throw e;
    }
    // A previous transaction may have copied this immutable object then rolled back.
    // Core verifies its original owner, upload-id, route, type, and size before using it.
    return this.stat(to);
  }
  async readUrl(key, generation, expires) {
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: "v4",
      action: "read",
      expires,
      queryParams: { generation },
    });
    return url;
  }
  async delete(key, generation) {
    await this.bucket.file(key).delete({
      preconditionOpts: { ifGenerationMatch: generation },
      ignoreNotFound: true,
    });
  }
}
