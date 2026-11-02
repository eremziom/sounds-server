type TrackAccessUser = { isActive: boolean; permissions: readonly string[] };

export function canCreateTrack(user: TrackAccessUser | null | undefined): boolean {
  return user?.isActive === true && user.permissions.includes("tracks:create");
}
