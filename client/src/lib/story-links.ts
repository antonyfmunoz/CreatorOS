export function buildStoryShareUrl(origin: string, storyId: number): string {
  const url = new URL('/', origin);
  url.searchParams.set('story', String(storyId));
  return url.toString();
}

export function parseStoryId(search: string): number | null {
  const value = Number(new URLSearchParams(search).get('story'));
  return Number.isInteger(value) && value > 0 ? value : null;
}
