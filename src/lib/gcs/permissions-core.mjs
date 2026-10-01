export function matchesShare(payload, asset) {
  return (
    !!payload &&
    payload.t === asset.tenantId &&
    (payload.k === "asset"
      ? payload.id === asset.id
      : payload.k === "folder" && payload.f === asset.folder)
  );
}
export function tenantCanRead(viewer, tenantId) {
  return !!viewer?.tenants?.some((t) => t.id === tenantId);
}
export function eventPhotoCanRead(access, status, guestId) {
  return (
    !!access?.canView &&
    (access.organizer ||
      status === "live" ||
      (!!access.guestId && access.guestId === guestId))
  );
}
