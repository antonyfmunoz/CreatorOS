/**
 * Utility functions for parsing text content with @user mentions
 */

/**
 * Extracts usernames from text content
 * Returns an array of usernames that were mentioned with @ symbol
 */
export function extractMentionedUsers(text?: string): string[] {
  if (!text) return [];
  
  const matches = text.match(/@(\w+)/g) || [];
  // Remove @ symbol from each match
  return matches.map(match => match.substring(1));
}

/**
 * Formats the text with HTML styling for rendering @username mentions
 * as styled spans in a component
 */
export function parseUserTags(text?: string): string {
  if (!text) return '';
  
  // Replace @username with styled spans
  return text.replace(
    /@(\w+)/g, 
    '<span class="text-primary font-medium hover:underline cursor-pointer">@$1</span>'
  );
}

// Safe version for React components that doesn't use JSX
export function parseUserTagsToJSX(text?: string): string {
  if (!text) return '';
  
  // Basic implementation that simply styles user tags differently
  return text.replace(
    /@(\w+)/g, 
    '<span class="text-primary font-medium">@$1</span>'
  );
}