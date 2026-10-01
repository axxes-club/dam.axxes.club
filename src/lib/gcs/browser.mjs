export function postFile(file, policy, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(policy.fields)) body.append(k, v);
    body.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", policy.url);
    xhr.withCredentials = false;
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      reject(Error("Upload cancelled"));
      return;
    }
    const finish = (fn) => (value) => {
      signal?.removeEventListener("abort", abort);
      fn(value);
    };
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? finish(resolve)()
        : finish(reject)(Error("Object upload failed"));
    xhr.onerror = finish(reject).bind(null, Error("Object upload failed"));
    xhr.onabort = finish(reject).bind(null, Error("Upload cancelled"));
    xhr.send(body);
  });
}
export function createUploader({
  endpoint = "/api/storage",
  fetchImpl = fetch,
  postImpl = postFile,
} = {}) {
  /** @param {string} route
   * @param {{files: File[], input?: unknown, headers?: Record<string,string> | (() => Record<string,string> | Promise<Record<string,string>>), onUploadProgress?: (percent:number) => void, signal?: AbortSignal}} options */
  return async function uploadFiles(
    route,
    {
      files,
      input,
      headers = {},
      onUploadProgress = (/** @type {number} */ _percent) => {},
      signal,
    },
  ) {
    const h = typeof headers === "function" ? await headers() : headers;
    const request = async (body) => {
      const r = await fetchImpl(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      const payload = await r.json();
      if (!r.ok) throw Error(payload.error ?? "Upload request failed");
      return payload;
    };
    const permits = await request({
      action: "init",
      route,
      input,
      files: files.map((f) => ({
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
      })),
    });
    if (!Array.isArray(permits) || permits.length !== files.length)
      throw Error("Invalid upload permits");
    const total = files.reduce((sum, f) => sum + f.size, 0),
      progress = files.map(() => 0),
      results = files.map(() => null);
    let next = 0;
    const update = (index, value) => {
      progress[index] = Math.max(progress[index], Math.min(1, value)) * 1;
      onUploadProgress(
        total
          ? Math.round(
              (progress.reduce((n, p, i) => n + p * files[i].size, 0) / total) *
                100,
            )
          : 0,
      );
    };
    await Promise.all(
      Array.from({ length: Math.min(3, files.length) }, async () => {
        while (next < files.length) {
          const i = next++;
          const permit = await request({
            action: "renew",
            uploadId: permits[i].uploadId,
            input,
          });
          if (permit.complete) {
            results[i] = permit.complete;
            update(i, 1);
            continue;
          }
          if (!permit.policy) throw Error("Invalid upload permit");
          await postImpl(files[i], permit.policy, (p) => update(i, p), signal);
          results[i] = await request({
            action: "complete",
            uploadId: permits[i].uploadId,
            input,
          });
          update(i, 1);
        }
      }),
    );
    return results;
  };
}
