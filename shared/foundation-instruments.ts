import { z } from "zod";

export const foundationInstrumentKinds = [
  "document",
  "spreadsheet",
  "presentation",
  "database",
  "form",
  "calendar",
  "finance_ledger",
] as const;

export const foundationInstrumentKindSchema = z.enum(foundationInstrumentKinds);
export type FoundationInstrumentKind = z.infer<typeof foundationInstrumentKindSchema>;

export const foundationInstrumentStatuses = [
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
] as const;
export const foundationInstrumentStatusSchema = z.enum(foundationInstrumentStatuses);
export type FoundationInstrumentStatus = z.infer<typeof foundationInstrumentStatusSchema>;

const titleSchema = z.string().trim().min(1).max(160);
const identitySchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const documentContentSchema = z.object({
  format: z.enum(["markdown", "rich_text", "plain_text"]).default("markdown"),
  body: z.string().max(1_000_000),
}).strict();

export const spreadsheetAddressPattern = /^[A-Z]{1,3}[1-9][0-9]{0,3}$/;
export const spreadsheetCellSchema = z.object({
  input: z.string().max(10_000),
  format: z.object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    numberFormat: z.enum(["decimal", "percent", "currency_usd"]).optional(),
  }).strict().optional(),
}).strict();
export const spreadsheetContentSchema = z.object({
  version: z.literal(1),
  activeSheetId: identitySchema,
  sheets: z.array(z.object({
    id: identitySchema,
    name: z.string().trim().min(1).max(80),
    rowCount: z.number().int().min(1).max(2_000),
    columnCount: z.number().int().min(1).max(200),
    cells: z.record(z.string().regex(spreadsheetAddressPattern), spreadsheetCellSchema)
      .refine((cells) => Object.keys(cells).length <= 50_000, "A sheet can contain at most 50,000 populated cells."),
  }).strict()).min(1).max(50),
}).strict().superRefine((content, ctx) => {
  const ids = content.sheets.map((sheet) => sheet.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sheet IDs must be unique." });
  if (!ids.includes(content.activeSheetId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The active sheet must exist." });
});

const presentationElementSchema = z.discriminatedUnion("type", [
  z.object({ id: identitySchema, type: z.literal("text"), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), text: z.string().max(20_000) }).strict(),
  z.object({ id: identitySchema, type: z.literal("image"), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), assetRef: z.string().min(1).max(2_000), alt: z.string().max(500) }).strict(),
  z.object({ id: identitySchema, type: z.literal("shape"), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), shape: z.enum(["rectangle", "ellipse", "line"]), color: z.string().max(64) }).strict(),
]);
export const presentationContentSchema = z.object({
  version: z.literal(1),
  aspectRatio: z.enum(["16:9", "4:3", "1:1"]).default("16:9"),
  activeSlideId: identitySchema,
  slides: z.array(z.object({
    id: identitySchema,
    title: z.string().max(160),
    speakerNotes: z.string().max(20_000).default(""),
    background: z.string().max(128).default("#ffffff"),
    elements: z.array(presentationElementSchema).max(500),
  }).strict()).min(1).max(500),
}).strict().superRefine((content, ctx) => {
  const ids = content.slides.map((slide) => slide.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Slide IDs must be unique." });
  if (!ids.includes(content.activeSlideId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The active slide must exist." });
});

export const databaseFieldTypes = [
  "text", "rich_text", "number", "boolean", "date", "datetime", "select",
  "multi_select", "person_ref", "organization_ref", "relation", "file_ref",
  "url", "email", "phone", "formula", "rollup",
] as const;
export const databaseFieldSchema = z.object({
  id: identitySchema,
  name: z.string().trim().min(1).max(100),
  type: z.enum(databaseFieldTypes),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(200).optional(),
  relationInstrumentId: z.string().uuid().optional(),
  expression: z.string().max(1_000).optional(),
}).strict();
export const databaseContentSchema = z.object({
  version: z.literal(1),
  fields: z.array(databaseFieldSchema).min(1).max(200),
  records: z.array(z.object({ id: identitySchema, values: z.record(identitySchema, z.unknown()), createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).strict()).max(100_000),
  views: z.array(z.object({
    id: identitySchema,
    name: z.string().trim().min(1).max(100),
    type: z.enum(["table", "kanban", "calendar", "timeline", "gallery", "chart", "form"]),
    configuration: z.record(z.string(), z.unknown()).default({}),
  }).strict()).min(1).max(100),
}).strict().superRefine((content, ctx) => {
  const fieldIds = content.fields.map((field) => field.id);
  if (new Set(fieldIds).size !== fieldIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Field IDs must be unique." });
  const recordIds = content.records.map((record) => record.id);
  if (new Set(recordIds).size !== recordIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Record IDs must be unique." });
});

export const formContentSchema = z.object({
  version: z.literal(1),
  databaseInstrumentId: z.string().uuid(),
  public: z.boolean().default(false),
  submitLabel: z.string().trim().min(1).max(80).default("Submit"),
  successMessage: z.string().max(500).default("Your response was received."),
  fields: z.array(z.object({
    id: identitySchema,
    databaseFieldId: identitySchema,
    label: z.string().trim().min(1).max(160),
    description: z.string().max(500).optional(),
    required: z.boolean().default(false),
  }).strict()).min(1).max(200),
}).strict();

export const calendarContentSchema = z.object({
  version: z.literal(1),
  timezone: z.string().trim().min(1).max(100),
  events: z.array(z.object({
    id: identitySchema,
    title: z.string().trim().min(1).max(200),
    status: z.enum(["tentative", "confirmed", "canceled", "completed"]),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    participantRefs: z.array(z.string().max(200)).max(1_000).default([]),
    recurrenceRule: z.string().max(500).nullable().default(null),
    seriesId: identitySchema.nullable().default(null),
  }).strict()).max(100_000),
  availabilityRules: z.array(z.object({ id: identitySchema, weekdays: z.array(z.number().int().min(0).max(6)), startsAtLocal: z.string(), endsAtLocal: z.string(), capacity: z.number().int().positive() }).strict()).max(100),
}).strict();

const moneySchema = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), minorUnits: z.number().int() }).strict();
export const financeLedgerContentSchema = z.object({
  version: z.literal(1),
  accounts: z.array(z.object({ id: identitySchema, name: z.string().trim().min(1).max(160), type: z.enum(["asset", "liability", "equity", "revenue", "expense"]), currency: z.string().regex(/^[A-Z]{3}$/) }).strict()).max(10_000),
  journalEntries: z.array(z.object({
    id: identitySchema,
    status: z.enum(["draft", "posted", "reversed"]),
    occurredAt: z.string().datetime(),
    memo: z.string().max(500),
    reversalOf: identitySchema.nullable().default(null),
    lines: z.array(z.object({ accountId: identitySchema, debit: moneySchema, credit: moneySchema }).strict()).min(2).max(1_000),
  }).strict()).max(100_000),
}).strict().superRefine((content, ctx) => {
  content.journalEntries.forEach((entry: { lines: Array<{ debit: { minorUnits: number; currency: string }; credit: { minorUnits: number; currency: string } }> }, index: number) => {
    let debit = 0;
    let credit = 0;
    const currencies = new Set<string>();
    entry.lines.forEach((line) => {
      debit += line.debit.minorUnits;
      credit += line.credit.minorUnits;
      currencies.add(line.debit.currency);
      currencies.add(line.credit.currency);
    });
    if (debit !== credit || currencies.size !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["journalEntries", index], message: "Posted finance entries must be balanced in one currency." });
  });
});

export const foundationContentSchemas = {
  document: documentContentSchema,
  spreadsheet: spreadsheetContentSchema,
  presentation: presentationContentSchema,
  database: databaseContentSchema,
  form: formContentSchema,
  calendar: calendarContentSchema,
  finance_ledger: financeLedgerContentSchema,
} satisfies Record<FoundationInstrumentKind, z.ZodTypeAny>;

export function parseFoundationContent(kind: FoundationInstrumentKind, value: unknown) {
  return foundationContentSchemas[kind].parse(value);
}

export const createFoundationInstrumentSchema = z.object({
  kind: foundationInstrumentKindSchema,
  title: titleSchema,
  content: z.unknown(),
  authorityScope: z.string().trim().min(1).max(200).default("business"),
  extension: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  const parsed = foundationContentSchemas[value.kind].safeParse(value.content);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ["content", ...issue.path] });
});

export const reviseFoundationInstrumentSchema = z.object({
  title: titleSchema.optional(),
  content: z.unknown(),
  changeSummary: z.string().trim().min(1).max(500),
  baseRevision: z.number().int().positive(),
}).strict();

export const foundationCommands = ["request_review", "approve", "request_changes", "publish", "archive", "restore"] as const;
export const foundationCommandSchema = z.object({ command: z.enum(foundationCommands), note: z.string().trim().max(1_000).default("") }).strict();
export type FoundationCommand = z.infer<typeof foundationCommandSchema>["command"];

const transitions: Record<FoundationCommand, readonly FoundationInstrumentStatus[]> = {
  request_review: ["draft"],
  approve: ["in_review"],
  request_changes: ["in_review"],
  publish: ["approved"],
  archive: ["draft", "in_review", "approved", "published"],
  restore: ["archived"],
};

export function nextFoundationStatus(current: FoundationInstrumentStatus, command: FoundationCommand): FoundationInstrumentStatus {
  if (!transitions[command].includes(current)) throw new Error(`Cannot ${command} an instrument in ${current} state.`);
  switch (command) {
    case "request_review": return "in_review";
    case "approve": return "approved";
    case "request_changes": return "draft";
    case "publish": return "published";
    case "archive": return "archived";
    case "restore": return "draft";
  }
}

export function createEmptyFoundationContent(kind: FoundationInstrumentKind): unknown {
  const identity = () => Math.random().toString(36).slice(2, 12);
  switch (kind) {
    case "document": return { format: "markdown", body: "" };
    case "spreadsheet": { const id = `sheet_${identity()}`; return { version: 1, activeSheetId: id, sheets: [{ id, name: "Sheet 1", rowCount: 40, columnCount: 10, cells: {} }] }; }
    case "presentation": { const id = `slide_${identity()}`; return { version: 1, aspectRatio: "16:9", activeSlideId: id, slides: [{ id, title: "Untitled slide", speakerNotes: "", background: "#ffffff", elements: [] }] }; }
    case "database": return { version: 1, fields: [{ id: "name", name: "Name", type: "text", required: true }], records: [], views: [{ id: "table", name: "Table", type: "table", configuration: {} }] };
    case "form": throw new Error("A form must be bound to a database instrument.");
    case "calendar": return { version: 1, timezone: "UTC", events: [], availabilityRules: [] };
    case "finance_ledger": return { version: 1, accounts: [], journalEntries: [] };
  }
}
