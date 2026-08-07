import { describe, expect, it } from "vitest";
import { channelMessageLikes } from "../shared/schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("channel message likes", () => {
  it("stores one selected reaction per user and message", () => {
    expect(channelMessageLikes.messageId.name).toBe("message_id");
    expect(channelMessageLikes.userId.name).toBe("user_id");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0027_channel_message_likes.sql"), "utf8");
    expect(migration).toContain('CONSTRAINT "channel_message_like_unique" UNIQUE("message_id", "user_id")');
  });
});
