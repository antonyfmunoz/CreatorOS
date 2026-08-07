import { describe, expect, it } from "vitest";
import { deleteAgentWithChats } from "../server/memory-cleanup";

describe("demo storage cleanup", () => {
  it("deletes an agent's chats with the agent", () => {
    const agents = new Map([[7, { name: "Cleanup agent" }]]);
    const chats = new Map([
      [1, { agentId: 7, body: "remove" }],
      [2, { agentId: 8, body: "keep" }],
    ]);

    expect(deleteAgentWithChats(7, agents, chats)).toBe(true);
    expect(agents.has(7)).toBe(false);
    expect(chats.has(1)).toBe(false);
    expect(chats.get(2)?.body).toBe("keep");
    expect(deleteAgentWithChats(7, agents, chats)).toBe(false);
  });
});
