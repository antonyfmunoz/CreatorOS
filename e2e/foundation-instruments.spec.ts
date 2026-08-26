import { expect, test, type Page } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

const owner = 1;
const peer = 2;

async function api(page: Page, actor: number, method: string, url: string, data?: unknown, headers: Record<string, string> = {}) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(actor), ...headers } });
}

test("foundation workspace persists governed revisions and keeps tenants isolated", async ({ page }) => {
  const stamp = Date.now();
  const spreadsheetContent = {
    version: 1,
    activeSheetId: "sheet_1",
    sheets: [{ id: "sheet_1", name: "Campaign", rowCount: 40, columnCount: 10, cells: { A1: { input: "Channel" }, B1: { input: "YouTube" } } }],
  };
  const createdResponse = await api(page, owner, "POST", "/api/foundation/instruments", {
    kind: "spreadsheet",
    title: `Campaign sheet ${stamp}`,
    content: spreadsheetContent,
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json() as { id: string; currentRevision: number };
  expect(created.currentRevision).toBe(1);

  expect((await api(page, peer, "GET", `/api/foundation/instruments/${created.id}`)).status()).toBe(404);
  expect((await api(page, owner, "POST", `/api/foundation/instruments/${created.id}/revisions`, {
    title: `Campaign sheet ${stamp}`,
    content: { ...spreadsheetContent, sheets: [{ ...spreadsheetContent.sheets[0], cells: { ...spreadsheetContent.sheets[0].cells, A2: { input: "Launch" } } }] },
    changeSummary: "Added launch row",
    baseRevision: 1,
  })).status()).toBe(200);
  expect((await api(page, owner, "POST", `/api/foundation/instruments/${created.id}/revisions`, {
    content: spreadsheetContent,
    changeSummary: "Stale overwrite",
    baseRevision: 1,
  })).status()).toBe(409);

  for (const command of ["request_review", "approve", "publish"] as const) {
    expect((await api(page, owner, "POST", `/api/foundation/instruments/${created.id}/commands`, { command, note: "Field qualification" })).status()).toBe(200);
  }
  const detail = await (await api(page, owner, "GET", `/api/foundation/instruments/${created.id}`)).json() as { status: string; currentRevision: number; history: unknown[]; events: Array<{ eventType: string }> };
  expect(detail.status).toBe("published");
  expect(detail.currentRevision).toBe(2);
  expect(detail.history).toHaveLength(2);
  expect(detail.events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["instrument.created", "instrument.revised", "instrument.publish"]));

  await page.context().setExtraHTTPHeaders({ "x-creativesos-demo-user": String(owner) });
  await page.goto("/sheets");
  await expect(page.getByRole("heading", { name: "Creative workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`Campaign sheet ${stamp}`) })).toBeVisible();
  await expect(page.getByLabel("Cell A2")).toHaveValue("Launch");
});

test("published forms accept idempotent submissions without exposing database reads", async ({ page }) => {
  const stamp = Date.now();
  const databaseResponse = await api(page, owner, "POST", "/api/foundation/instruments", {
    kind: "database",
    title: `Lead database ${stamp}`,
    content: {
      version: 1,
      fields: [{ id: "name", name: "Name", type: "text", required: true }, { id: "email", name: "Email", type: "email", required: true }],
      records: [],
      views: [{ id: "table", name: "Table", type: "table", configuration: {} }],
    },
  });
  expect(databaseResponse.status()).toBe(201);
  const database = await databaseResponse.json() as { id: string };
  const formResponse = await api(page, owner, "POST", "/api/foundation/instruments", {
    kind: "form",
    title: `Lead form ${stamp}`,
    content: {
      version: 1,
      databaseInstrumentId: database.id,
      public: true,
      submitLabel: "Join",
      successMessage: "Welcome",
      fields: [
        { id: "form_name", databaseFieldId: "name", label: "Name", required: true },
        { id: "form_email", databaseFieldId: "email", label: "Email", required: true },
      ],
    },
  });
  expect(formResponse.status()).toBe(201);
  const form = await formResponse.json() as { id: string };
  for (const command of ["request_review", "approve", "publish"] as const) {
    expect((await api(page, owner, "POST", `/api/foundation/instruments/${form.id}/commands`, { command })).status()).toBe(200);
  }

  await page.goto(`/f/${form.id}`);
  await expect(page.getByRole("heading", { name: `Lead form ${stamp}` })).toBeVisible();
  await page.getByLabel("Name").fill("Grace");
  await page.getByLabel("Email").fill("grace@example.com");
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("heading", { name: "Response received" })).toBeVisible();

  const idempotencyKey = `qualification-${stamp}`;
  const submission = await page.request.post(`/api/public/foundation/forms/${form.id}/submissions`, {
    headers: { "Idempotency-Key": idempotencyKey },
    data: { values: { name: "Ada", email: "ada@example.com" } },
  });
  expect(submission.status()).toBe(201);
  const submitted = await submission.json() as { id: string };
  const replay = await page.request.post(`/api/public/foundation/forms/${form.id}/submissions`, {
    headers: { "Idempotency-Key": idempotencyKey },
    data: { values: { name: "Ada", email: "ada@example.com" } },
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json() as { id: string }).id).toBe(submitted.id);
  expect((await page.request.post(`/api/public/foundation/forms/${form.id}/submissions`, {
    headers: { "Idempotency-Key": `${idempotencyKey}-unknown` },
    data: { values: { name: "Ada", email: "ada@example.com", private_notes: "must reject" } },
  })).status()).toBe(400);

  const databaseDetail = await (await api(page, owner, "GET", `/api/foundation/instruments/${database.id}`)).json() as { currentRevision: number; revision: { content: { records: Array<{ values: Record<string, unknown> }> } } };
  expect(databaseDetail.currentRevision).toBe(3);
  expect(databaseDetail.revision.content.records).toHaveLength(2);
  expect(databaseDetail.revision.content.records.map((record) => record.values)).toEqual(expect.arrayContaining([
    { name: "Grace", email: "grace@example.com" },
    { name: "Ada", email: "ada@example.com" },
  ]));
});

test("UMH can control bounded instrument commands while lifecycle authority stays local", async ({ page }) => {
  const businesses = await (await api(page, owner, "GET", "/api/businesses")).json() as Array<{ id: string; isDefault: boolean }>;
  const business = businesses.find((candidate) => candidate.isDefault)!;
  const sendCommand = async (commandType: string, payload: Record<string, unknown>) => {
    const envelope = {
      schemaVersion: "umh.command.v1",
      commandId: randomUUID(),
      commandType,
      idempotencyKey: `foundation-${randomUUID()}`,
      traceId: `trace-${randomUUID()}`,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      businessId: business.id,
      delegatedUserId: owner,
      payload,
    };
    const body = JSON.stringify(envelope);
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const signature = createHmac("sha256", "qualification-only-umh-command-secret").update(`${timestamp}.${nonce}.`).update(body).digest("hex");
    const response = await page.request.fetch("/api/umh/commands", { method: "POST", data: body, headers: { "content-type": "application/json", "x-umh-timestamp": timestamp, "x-umh-nonce": nonce, "x-umh-signature": signature } });
    return { response, envelope };
  };

  const created = await sendCommand("creativesos.instrument.create.v1", {
    kind: "document",
    title: "UMH-governed brief",
    content: { format: "markdown", body: "Locally authoritative." },
  });
  expect(created.response.status()).toBe(202);
  const createdBody = await created.response.json() as { status: string; payload: { instrumentId: string } };
  expect(createdBody.status).toBe("completed");

  const revised = await sendCommand("creativesos.instrument.revise.v1", {
    instrumentId: createdBody.payload.instrumentId,
    content: { format: "markdown", body: "Revised through a bounded command." },
    changeSummary: "UMH revision field test",
    baseRevision: 1,
  });
  expect((await revised.response.json() as { status: string }).status).toBe("completed");

  const lifecycle = await sendCommand("creativesos.instrument.lifecycle.v1", {
    instrumentId: createdBody.payload.instrumentId,
    command: "request_review",
    note: "UMH proposes review; CreativesOS decides.",
  });
  const lifecycleBody = await lifecycle.response.json() as { status: string };
  expect(lifecycleBody.status).toBe("awaiting_approval");
  expect((await api(page, peer, "POST", `/api/umh/approvals/${lifecycle.envelope.commandId}`, { decision: "approved" })).status()).toBe(403);
  const approved = await api(page, owner, "POST", `/api/umh/approvals/${lifecycle.envelope.commandId}`, { decision: "approved" });
  expect(approved.status()).toBe(200);
  expect((await approved.json() as { status: string }).status).toBe("completed");
  const detail = await (await api(page, owner, "GET", `/api/foundation/instruments/${createdBody.payload.instrumentId}`)).json() as { status: string; currentRevision: number };
  expect(detail.status).toBe("in_review");
  expect(detail.currentRevision).toBe(2);

  const designDocument = {
    version: 1,
    pages: [{
      id: "page-1",
      name: "Page 1",
      width: 1080,
      height: 1080,
      background: "#000000",
      elements: [{ id: "headline", type: "text", x: 80, y: 80, width: 920, height: 180, rotation: 0, opacity: 1, locked: false, zIndex: 1, text: "One governed canvas", fill: "#ffffff", fontSize: 72, fontFamily: "Arial", fontWeight: "bold", align: "left" }],
    }],
  };
  const designCreated = await sendCommand("creativesos.design.create.v1", {
    name: "UMH-governed canvas",
    kind: "social",
    width: 1080,
    height: 1080,
    brandKitId: null,
    document: designDocument,
  });
  expect(designCreated.response.status()).toBe(202);
  const designCreatedBody = await designCreated.response.json() as { status: string; payload: { designProjectId: string; revision: number } };
  expect(designCreatedBody).toMatchObject({ status: "completed", payload: { revision: 1 } });
  const designRevised = await sendCommand("creativesos.design.revise.v1", {
    projectId: designCreatedBody.payload.designProjectId,
    revision: 1,
    document: { ...designDocument, pages: [{ ...designDocument.pages[0], background: "#111111" }] },
  });
  expect((await designRevised.response.json() as { status: string }).status).toBe("completed");
  const designDetail = await (await api(page, owner, "GET", `/api/design/${designCreatedBody.payload.designProjectId}`)).json() as { project: { revision: number }; versions: unknown[]; events: Array<{ eventType: string; evidence: { source: string } }> };
  expect(designDetail.project.revision).toBe(2);
  expect(designDetail.versions).toHaveLength(2);
  expect(designDetail.events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["design.project.created", "design.project.revised"]));
  expect(designDetail.events.every((event) => event.evidence.source === "umh")).toBe(true);
});
