/**
 * Utility functions for parsing text content with @user mentions
 */

import React from 'react';

/**
 * Parses text to identify user tags (@username) and converts them to clickable links
 * Returns HTML string with user tags wrapped in <a> elements
 */
export function parseUserTags(text: string): string {
  if (!text) return '';
  
  // Replace @username with clickable links
  // The regex matches @ followed by word characters (letters, numbers, underscores)
  return text.replace(/@(\w+)/g, '<a href="/profile/$1" class="user-tag">@$1</a>');
}

/**
 * Extracts usernames from text content
 * Returns an array of usernames that were mentioned with @ symbol
 */
export function extractMentionedUsers(text: string): string[] {
  if (!text) return [];
  
  const matches = text.match(/@(\w+)/g) || [];
  // Remove @ symbol from each match
  return matches.map(match => match.substring(1));
}

/**
 * React-friendly version that returns JSX elements instead of HTML strings
 * This is useful for components that need to render user tags as React components
 */
export function parseUserTagsToJSX(text: string): React.ReactNode {
  if (!text) return '';
  
  // Split the text by @username pattern
  const parts = text.split(/(@\w+)/g);
  
  // Convert each part to either plain text or a link component
  return parts.map((part, index) => {
    if (part.match(/^@\w+$/)) {
      const username = part.substring(1);
      return React.createElement(
        'a',
        {
          key: index,
          href: `/profile/${username}`,
          className: "text-primary hover:underline font-medium"
        },
        part
      );
    }
    return part;
  });
}