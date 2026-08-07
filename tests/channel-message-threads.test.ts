import { describe, expect, it } from "vitest";
import { channelMessages } from "../shared/schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("channel message threads", () => {
  it("persists replies as messages scoped to a parent message", () => {
    expect(channelMessages.parentMessageId.name).toBe("parent_message_id");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0029_channel_message_threads.sql"), "utf8");
    expect(migration).toContain('REFERENCES "channel_messages"("id") ON DELETE CASCADE');
    expect(migration).toContain('"channel_id", "parent_message_id", "created_at"');
  });
});
