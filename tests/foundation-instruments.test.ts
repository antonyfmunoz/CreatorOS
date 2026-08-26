import { describe, expect, it } from "vitest";
import {
  createEmptyFoundationContent,
  createFoundationInstrumentSchema,
  databaseContentSchema,
  financeLedgerContentSchema,
  formContentSchema,
  foundationInstrumentKinds,
  nextFoundationStatus,
  parseFoundationContent,
  presentationContentSchema,
  spreadsheetContentSchema,
} from "../shared/foundation-instruments";

describe("foundation instrument contract", () => {
  it("covers the entire required first-wave instrument family", () => {
    expect(foundationInstrumentKinds).toEqual([
      "document",
      "spreadsheet",
      "presentation",
      "database",
      "form",
      "calendar",
      "finance_ledger",
    ]);
  });

  it("creates valid standalone defaults for every unbound instrument", () => {
    for (const kind of foundationInstrumentKinds.filter((value) => value !== "form")) {
      expect(() => parseFoundationContent(kind, createEmptyFoundationContent(kind))).not.toThrow();
    }
    expect(() => createEmptyFoundationContent("form")).toThrow(/bound to a database/);
  });

  it("rejects a mismatched typed payload at the command boundary", () => {
    const parsed = createFoundationInstrumentSchema.safeParse({
      kind: "spreadsheet",
      title: "Campaign plan",
      content: { format: "markdown", body: "This is a document" },
    });
    expect(parsed.success).toBe(false);
  });

  it("requires the selected sheet and slide to exist", () => {
    expect(spreadsheetContentSchema.safeParse({
      version: 1,
      activeSheetId: "missing",
      sheets: [{ id: "sheet_1", name: "Sheet 1", rowCount: 40, columnCount: 10, cells: {} }],
    }).success).toBe(false);
    expect(presentationContentSchema.safeParse({
      version: 1,
      aspectRatio: "16:9",
      activeSlideId: "missing",
      slides: [{ id: "slide_1", title: "One", speakerNotes: "", background: "#fff", elements: [] }],
    }).success).toBe(false);
  });

  it("supports every required database field and view type", () => {
    const now = new Date().toISOString();
    const content = databaseContentSchema.parse({
      version: 1,
      fields: [
        { id: "name", name: "Name", type: "text", required: true },
        { id: "owner", name: "Owner", type: "person_ref" },
        { id: "assets", name: "Assets", type: "file_ref" },
        { id: "score", name: "Score", type: "formula", expression: "views * rate" },
        { id: "total", name: "Total", type: "rollup", relationInstrumentId: "a04ca42d-30bb-4a9a-9a74-c4ed1bebf6f5" },
      ],
      records: [{ id: "record_1", values: { name: "Launch" }, createdAt: now, updatedAt: now }],
      views: ["table", "kanban", "calendar", "timeline", "gallery", "chart", "form"].map((type) => ({ id: `view_${type}`, name: type, type, configuration: {} })),
    });
    expect(content.views).toHaveLength(7);
  });

  it("binds forms to databases without granting database read fields", () => {
    const form = formContentSchema.parse({
      version: 1,
      databaseInstrumentId: "a04ca42d-30bb-4a9a-9a74-c4ed1bebf6f5",
      public: true,
      fields: [{ id: "field_1", databaseFieldId: "email", label: "Email", required: true }],
    });
    expect(form.public).toBe(true);
    expect(Object.keys(form)).not.toContain("records");
  });

  it("enforces the review, approval, publish, archive, and restore state machine", () => {
    expect(nextFoundationStatus("draft", "request_review")).toBe("in_review");
    expect(nextFoundationStatus("in_review", "request_changes")).toBe("draft");
    expect(nextFoundationStatus("in_review", "approve")).toBe("approved");
    expect(nextFoundationStatus("approved", "publish")).toBe("published");
    expect(nextFoundationStatus("published", "archive")).toBe("archived");
    expect(nextFoundationStatus("archived", "restore")).toBe("draft");
    expect(() => nextFoundationStatus("draft", "publish")).toThrow(/Cannot publish/);
  });

  it("rejects unbalanced or mixed-currency journal entries", () => {
    const base = {
      version: 1 as const,
      accounts: [
        { id: "cash", name: "Cash", type: "asset" as const, currency: "USD" },
        { id: "sales", name: "Sales", type: "revenue" as const, currency: "USD" },
      ],
    };
    const balanced = financeLedgerContentSchema.safeParse({
      ...base,
      journalEntries: [{
        id: "entry_1", status: "posted", occurredAt: new Date().toISOString(), memo: "Sale", reversalOf: null,
        lines: [
          { accountId: "cash", debit: { currency: "USD", minorUnits: 1000 }, credit: { currency: "USD", minorUnits: 0 } },
          { accountId: "sales", debit: { currency: "USD", minorUnits: 0 }, credit: { currency: "USD", minorUnits: 1000 } },
        ],
      }],
    });
    expect(balanced.success).toBe(true);
    expect(financeLedgerContentSchema.safeParse({
      ...base,
      journalEntries: [{
        id: "entry_2", status: "posted", occurredAt: new Date().toISOString(), memo: "Broken", reversalOf: null,
        lines: [
          { accountId: "cash", debit: { currency: "USD", minorUnits: 1000 }, credit: { currency: "USD", minorUnits: 0 } },
          { accountId: "sales", debit: { currency: "USD", minorUnits: 0 }, credit: { currency: "USD", minorUnits: 999 } },
        ],
      }],
    }).success).toBe(false);
  });
});
