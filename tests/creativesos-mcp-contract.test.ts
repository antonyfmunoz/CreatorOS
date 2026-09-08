import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mcpSource = readFileSync(new URL("../mcp/creativesos-mcp.mjs", import.meta.url), "utf8");

describe("CreativesOS MCP CutStudio surface", () => {
  it("allows project inspection without exposing an execution or device-control tool", () => {
    expect(mcpSource).toContain('"creativesos_cut_projects"');
    expect(mcpSource).toContain('"/cut/projects"');
    expect(mcpSource).toContain('"creativesos_cut_local_nodes"');
    expect(mcpSource).not.toContain('"creativesos_cut_render"');
    expect(mcpSource).not.toContain('"creativesos_cut_pair_node"');
    expect(mcpSource).not.toContain('"creativesos_cut_revoke_node"');
  });
});
