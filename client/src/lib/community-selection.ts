type CommunityIdentity = { id: number };

export function reconcileCommunitySelection(
  activeCommunityId: number | null,
  communities: CommunityIdentity[],
) {
  if (communities.some((community) => community.id === activeCommunityId)) {
    return activeCommunityId;
  }

  return communities[0]?.id ?? null;
}
