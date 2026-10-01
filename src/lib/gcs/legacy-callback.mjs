// Server route selection only. The legacy SDK authenticates the untouched raw body.
// A provider hook header is never treated as authentication by this guard.
export function legacyCallbackRequest(request) {
  const hook = request.headers.get("uploadthing-hook");
  return (
    request.method === "POST" &&
    !new URL(request.url).searchParams.has("actionType") &&
    (hook === "callback" || hook === "error")
  );
}
