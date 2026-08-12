/**
 * Utility functions for parsing text content with @user mentions.
 */

/**
 * Extracts usernames from text content.
 * Returns an array of usernames that were mentioned with @ symbol.
 */
export function extractMentionedUsers(text?: string): string[] {
  if (!text) return [];

  const matches = text.match(/@(\w+)/g) || [];
  return matches.map((match) => match.substring(1));
}
