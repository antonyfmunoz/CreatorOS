import { describe, expect, it } from "vitest";
import { channelPollOptions, channelPollVotes, channelPolls } from "../shared/schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("channel polls", () => {
  it("stores polls, ordered options, and one replaceable vote per member", () => {
    expect(channelPolls.channelId.name).toBe("channel_id");
    expect(channelPollOptions.position.name).toBe("position");
    expect(channelPollVotes.optionId.name).toBe("option_id");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0030_channel_polls.sql"), "utf8");
    expect(migration).toContain('CONSTRAINT "channel_poll_vote_user_unique" UNIQUE("poll_id", "user_id")');
  });
});
