export type RankedTopic = { topic: string; postCount: number };

export function rankPostTopics(
  contents: string[],
  limit = 6,
): RankedTopic[] {
  const counts = new Map<string, number>();
  for (const content of contents) {
    const topicsInPost = new Set<string>();
    const hashtag = /(?:^|\s)#([A-Za-z0-9_]{2,40})/g;
    let match: RegExpExecArray | null;
    while ((match = hashtag.exec(content)) !== null)
      topicsInPost.add(match[1].toLocaleLowerCase());
    topicsInPost.forEach((topic) => {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    });
  }
  return Array.from(counts.entries())
    .map(([topic, postCount]) => ({ topic, postCount }))
    .sort(
      (left, right) =>
        right.postCount - left.postCount || left.topic.localeCompare(right.topic),
    )
    .slice(0, Math.max(0, limit));
}
