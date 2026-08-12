export function shouldCountStoryView(ownerUserId: number, viewerUserId: number): boolean {
  return ownerUserId !== viewerUserId;
}
