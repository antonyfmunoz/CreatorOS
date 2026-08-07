export function wantsStory(value: unknown): boolean {
  return value === true || value === "true";
}

export function buildTextStory(userId: number, content: unknown) {
  const caption = typeof content === "string" ? content.trim() : "";
  if (!caption) throw new Error("A text story needs post content");

  return {
    userId,
    mediaUrl: "",
    mediaType: "text",
    caption,
  };
}
