import { StorageError } from "./core.mjs";
export class UploadThingError extends StorageError {
  constructor(message) {
    super(message, 403);
  }
}
export function createUploadthing() {
  return (files) => ({
    files,
    input(parser) {
      this.parser = parser;
      return this;
    },
    middleware(fn) {
      this.authorizeHook = fn;
      return this;
    },
    onUploadComplete(fn) {
      this.completeHook = fn;
      return this;
    },
  });
}
export function principalOwner(m) {
  const scope = m.eventId
    ? `event:${m.eventId}`
    : m.tenantId
      ? `tenant:${m.tenantId}`
      : "account";
  const principal = m.subject
    ? `subject:${m.subject}`
    : m.userId
      ? `user:${m.userId}`
      : m.sessionId != null
        ? `session:${m.sessionId}`
        : m.tokenId
          ? `handoff:${m.tokenId}`
          : m.guestId && m.guestId !== "organizer"
            ? `guest:${m.guestId}`
            : null;
  if (!principal)
    throw new StorageError("Authenticated principal required", 403);
  return scope + ":" + principal;
}
export function compileRouter(router, visibility) {
  return Object.fromEntries(
    Object.entries(router).map(([name, builder]) => {
      if (!visibility[name]) throw Error("Missing storage visibility");
      const files = Object.fromEntries(
        Object.entries(builder.files).map(([kind, limit]) => {
          const match = /^(\d+)(KB|MB|GB)$/.exec(limit.maxFileSize);
          if (!match) throw Error("Invalid file limit");
          return [
            kind,
            {
              bytes:
                Number(match[1]) *
                { KB: 1024, MB: 1048576, GB: 1073741824 }[match[2]],
              count: limit.maxFileCount,
            },
          ];
        }),
      );
      return [
        name,
        {
          files,
          visibility: visibility[name],
          authorize: async (request, input) => {
            const validated = builder.parser
              ? await builder.parser.parseAsync(input)
              : input;
            const raw = await builder.authorizeHook({
              req: request,
              input: validated,
            });
            const metadata = JSON.parse(
              JSON.stringify(
                Object.fromEntries(
                  Object.entries(raw).filter(
                    ([key]) => !["token", "tokenStr", "ticket"].includes(key),
                  ),
                ),
              ),
            );
            return { owner: principalOwner(metadata), metadata };
          },
          complete: (args) => builder.completeHook(args),
        },
      ];
    }),
  );
}
