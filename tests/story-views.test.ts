import { describe, expect, it } from 'vitest';
import { shouldCountStoryView } from '../server/story-views';

describe('story view accounting', () => {
  it('excludes the story owner and accepts another signed-in viewer', () => {
    expect(shouldCountStoryView(7, 7)).toBe(false);
    expect(shouldCountStoryView(7, 9)).toBe(true);
  });
});
