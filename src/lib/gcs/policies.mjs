const MB = 1024 * 1024;
const image = (mb, count) => ({ image: { bytes: mb * MB, count } });
const library = {
  image: { bytes: 16 * MB, count: 50 },
  video: { bytes: 512 * MB, count: 10 },
  audio: { bytes: 64 * MB, count: 20 },
  pdf: { bytes: 64 * MB, count: 20 },
  text: { bytes: 4 * MB, count: 20 },
  blob: { bytes: 64 * MB, count: 20 },
};
export const policies = {
  dam: {
    assetUploader: { files: library, visibility: "private" },
    handoffUploader: { files: image(16, 10), visibility: "private" },
  },
  members: { damUploader: { files: library, visibility: "private" } },
  krates: {
    itemImage: { files: image(4, 1), visibility: "public" },
    ticketImage: {
      files: { ...image(8, 10), pdf: { bytes: 16 * MB, count: 10 } },
      visibility: "private",
    },
    handoffImage: { files: image(8, 10), visibility: "private" },
  },
  vibez: { vibezPhoto: { files: image(16, 1), visibility: "private" } },
  afters: {
    eventFlyer: { files: image(4, 1), visibility: "public" },
    eventGallery: { files: image(4, 10), visibility: "public" },
    feedbackScreenshot: { files: image(4, 3), visibility: "private" },
    customLogo: { files: image(2, 1), visibility: "public" },
    vibezPost: { files: image(4, 1), visibility: "private" },
  },
  qortr: {
    spaceImage: { files: image(4, 10), visibility: "public" },
    roomImage: { files: image(4, 10), visibility: "public" },
    profileImage: { files: image(2, 1), visibility: "public" },
  },
};
export function attachRoutes(service, hooks) {
  const result = {};
  for (const [name, policy] of Object.entries(policies[service] ?? {})) {
    if (
      typeof hooks[name]?.authorize !== "function" ||
      typeof hooks[name]?.complete !== "function"
    )
      throw Error("Missing authorization/completion hook: " + name);
    result[name] = { ...policy, ...hooks[name] };
  }
  if (!Object.keys(result).length) throw Error("Unknown service");
  return result;
}
