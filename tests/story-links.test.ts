import { describe, expect, it } from 'vitest';
import { buildStoryShareUrl, parseStoryId } from '../client/src/lib/story-links';

describe('story deep links', () => {
  it('builds a canonical story URL', () => {
    expect(buildStoryShareUrl('https://creativesos.net', 42)).toBe('https://creativesos.net/?story=42');
  });

  it('accepts only positive integer story identifiers', () => {
    expect(parseStoryId('?story=42')).toBe(42);
    expect(parseStoryId('?story=0')).toBeNull();
    expect(parseStoryId('?story=4.2')).toBeNull();
    expect(parseStoryId('?story=missing')).toBeNull();
  });
});
