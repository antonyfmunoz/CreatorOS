import type { Express, Response } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  createFoundationInstrumentSchema,
  databaseContentSchema,
  formContentSchema,
  foundationCommandSchema,
  foundationInstrumentKindSchema,
  foundationInstrumentStatusSchema,
  nextFoundationStatus,
  parseFoundationContent,
  reviseFoundationInstrumentSchema,
  type FoundationInstrumentKind,
} from "@shared/foundation-instruments";
import {
  foundationFormSubmissions,
  foundationInstrumentEvents,
  foundationInstrumentRevisions,
  foundationInstruments,
} from "@shared/schema";
import { attachUser } from "./auth";
import {
  ensureDefaultBusiness,
  userCanAdminBusiness,
  userCanManageBusiness,
} from "./businesses";
import { db } from "./db";
import { emitProjectionEvent } from "./umh";

const uuidSchema = z.string().uuid();

async function accessibleInstrument(userId: number, id: string) {
  const [instrument] = await db
    .select()
    .from(foundationInstruments)
    .where(eq(foundationInstruments.id, id))
    .limit(1);
  if (!instrument || !(await userCanManageBusiness(userId, instrument.businessId))) return null;
  return instrument;
}

async function currentRevision(id: string, revision: number) {
  const [snapshot] = await db
    .select()
    .from(foundationInstrumentRevisions)
    .where(and(
      eq(foundationInstrumentRevisions.instrumentId, id),
      eq(foundationInstrumentRevisions.revision, revision),
    ))
    .limit(1);
  return snapshot ?? null;
}

function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({ message: error.issues[0]?.message ?? "Invalid instrument request", issues: error.issues });
}

export function registerFoundationInstrumentRoutes(app: Express) {
  app.get("/api/foundation/instruments", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const kind = req.query.kind
      ? foundationInstrumentKindSchema.safeParse(req.query.kind)
      : null;
    if (kind && !kind.success) return invalid(res, kind.error);
    const status = req.query.status
      ? foundationInstrumentStatusSchema.safeParse(req.query.status)
      : null;
    if (status && !status.success) return invalid(res, status.error);
    const filters = [eq(foundationInstruments.businessId, business.id)];
    if (kind?.success) filters.push(eq(foundationInstruments.kind, kind.data));
    if (status?.success) filters.push(eq(foundationInstruments.status, status.data));
    const rows = await db
      .select()
      .from(foundationInstruments)
      .where(and(...filters))
      .orderBy(desc(foundationInstruments.updatedAt));
    return res.json(rows);
  });

  app.post("/api/foundation/instruments", attachUser, async (req, res) => {
    const parsed = createFoundationInstrumentSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const business = await ensureDefaultBusiness(req.dbUser!);
    const content = parseFoundationContent(parsed.data.kind, parsed.data.content);

    if (parsed.data.kind === "form") {
      const form = formContentSchema.parse(content);
      const [database] = await db
        .select({ id: foundationInstruments.id, kind: foundationInstruments.kind })
        .from(foundationInstruments)
        .where(and(
          eq(foundationInstruments.id, form.databaseInstrumentId),
          eq(foundationInstruments.businessId, business.id),
        ))
        .limit(1);
      if (!database || database.kind !== "database") {
        return res.status(400).json({ message: "Forms must bind to a database in the same business." });
      }
    }

    const result = await db.transaction(async (tx) => {
      const [instrument] = await tx.insert(foundationInstruments).values({
        businessId: business.id,
        kind: parsed.data.kind,
        title: parsed.data.title,
        ownerUserId: req.dbUser!.id,
        authorityScope: parsed.data.authorityScope,
        extension: parsed.data.extension,
      }).returning();
      const [revision] = await tx.insert(foundationInstrumentRevisions).values({
        instrumentId: instrument.id,
        revision: 1,
        title: instrument.title,
        content,
        actorUserId: req.dbUser!.id,
        changeSummary: "Created instrument",
        baseRevision: null,
        evidence: { source: "native", schemaVersion: 1 },
      }).returning();
      await tx.insert(foundationInstrumentEvents).values({
        instrumentId: instrument.id,
        businessId: business.id,
        eventType: "instrument.created",
        toStatus: "draft",
        actorUserId: req.dbUser!.id,
        payload: { kind: instrument.kind, revision: 1 },
      });
      await emitProjectionEvent({
        aggregateType: "foundation_instrument",
        aggregateId: instrument.id,
        eventType: "instrument.created",
        actorUserId: req.dbUser!.id,
        payload: { businessId: business.id, kind: instrument.kind, revision: 1, status: "draft" },
        idempotencyKey: `instrument:${instrument.id}:created`,
      }, tx);
      return { ...instrument, revision };
    });
    return res.status(201).json(result);
  });

  app.get("/api/foundation/instruments/:id", attachUser, async (req, res) => {
    const id = uuidSchema.safeParse(req.params.id);
    if (!id.success) return invalid(res, id.error);
    const instrument = await accessibleInstrument(req.dbUser!.id, id.data);
    if (!instrument) return res.status(404).json({ message: "Instrument not found" });
    const [revision, history, events] = await Promise.all([
      currentRevision(instrument.id, instrument.currentRevision),
      db.select().from(foundationInstrumentRevisions)
        .where(eq(foundationInstrumentRevisions.instrumentId, instrument.id))
        .orderBy(desc(foundationInstrumentRevisions.revision)),
      db.select().from(foundationInstrumentEvents)
        .where(eq(foundationInstrumentEvents.instrumentId, instrument.id))
        .orderBy(asc(foundationInstrumentEvents.createdAt)),
    ]);
    return res.json({ ...instrument, revision, history, events });
  });

  app.post("/api/foundation/instruments/:id/revisions", attachUser, async (req, res) => {
    const id = uuidSchema.safeParse(req.params.id);
    if (!id.success) return invalid(res, id.error);
    const body = reviseFoundationInstrumentSchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const instrument = await accessibleInstrument(req.dbUser!.id, id.data);
    if (!instrument) return res.status(404).json({ message: "Instrument not found" });
    if (instrument.status === "archived") return res.status(409).json({ message: "Restore this instrument before revising it." });
    if (body.data.baseRevision !== instrument.currentRevision) {
      return res.status(409).json({ message: "This instrument changed after you opened it.", currentRevision: instrument.currentRevision });
    }
    const content = parseFoundationContent(instrument.kind as FoundationInstrumentKind, body.data.content);
    const title = body.data.title ?? instrument.title;
    const nextRevision = instrument.currentRevision + 1;
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(foundationInstruments).set({
        title,
        currentRevision: nextRevision,
        status: instrument.status === "approved" || instrument.status === "published" ? "draft" : instrument.status,
        updatedAt: new Date(),
      }).where(and(
        eq(foundationInstruments.id, instrument.id),
        eq(foundationInstruments.currentRevision, body.data.baseRevision),
      )).returning();
      if (!updated) return null;
      const [revision] = await tx.insert(foundationInstrumentRevisions).values({
        instrumentId: instrument.id,
        revision: nextRevision,
        title,
        content,
        actorUserId: req.dbUser!.id,
        changeSummary: body.data.changeSummary,
        baseRevision: body.data.baseRevision,
        evidence: { source: "native", schemaVersion: instrument.schemaVersion },
      }).returning();
      await tx.insert(foundationInstrumentEvents).values({
        instrumentId: instrument.id,
        businessId: instrument.businessId,
        eventType: "instrument.revised",
        fromStatus: instrument.status,
        toStatus: updated.status,
        actorUserId: req.dbUser!.id,
        payload: { revision: nextRevision, baseRevision: body.data.baseRevision, changeSummary: body.data.changeSummary },
      });
      await emitProjectionEvent({
        aggregateType: "foundation_instrument",
        aggregateId: instrument.id,
        eventType: "instrument.revised",
        actorUserId: req.dbUser!.id,
        payload: { businessId: instrument.businessId, kind: instrument.kind, revision: nextRevision, status: updated.status },
        idempotencyKey: `instrument:${instrument.id}:revision:${nextRevision}`,
      }, tx);
      return { ...updated, revision };
    });
    if (!result) return res.status(409).json({ message: "A newer revision won the save race. Reload before trying again." });
    return res.json(result);
  });

  app.post("/api/foundation/instruments/:id/commands", attachUser, async (req, res) => {
    const id = uuidSchema.safeParse(req.params.id);
    if (!id.success) return invalid(res, id.error);
    const body = foundationCommandSchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const instrument = await accessibleInstrument(req.dbUser!.id, id.data);
    if (!instrument) return res.status(404).json({ message: "Instrument not found" });
    if (["approve", "publish"].includes(body.data.command) && !(await userCanAdminBusiness(req.dbUser!.id, instrument.businessId))) {
      return res.status(403).json({ message: "Only a business owner or admin can approve or publish." });
    }
    let nextStatus: ReturnType<typeof nextFoundationStatus>;
    try {
      nextStatus = nextFoundationStatus(foundationInstrumentStatusSchema.parse(instrument.status), body.data.command);
    } catch (error) {
      return res.status(409).json({ message: error instanceof Error ? error.message : "Invalid lifecycle transition" });
    }
    const updated = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(foundationInstruments).set({
        status: nextStatus,
        updatedAt: new Date(),
        archivedAt: nextStatus === "archived" ? new Date() : null,
      }).where(and(eq(foundationInstruments.id, instrument.id), eq(foundationInstruments.status, instrument.status))).returning();
      if (!claimed) return null;
      await tx.insert(foundationInstrumentEvents).values({
        instrumentId: instrument.id,
        businessId: instrument.businessId,
        eventType: `instrument.${body.data.command}`,
        fromStatus: instrument.status,
        toStatus: nextStatus,
        actorUserId: req.dbUser!.id,
        payload: { note: body.data.note, revision: instrument.currentRevision },
      });
      await emitProjectionEvent({
        aggregateType: "foundation_instrument",
        aggregateId: instrument.id,
        eventType: `instrument.${body.data.command}`,
        actorUserId: req.dbUser!.id,
        payload: { businessId: instrument.businessId, kind: instrument.kind, revision: instrument.currentRevision, fromStatus: instrument.status, toStatus: nextStatus },
        idempotencyKey: `instrument:${instrument.id}:${body.data.command}:${instrument.currentRevision}:${nextStatus}`,
      }, tx);
      return claimed;
    });
    if (!updated) return res.status(409).json({ message: "The lifecycle changed before this command completed." });
    return res.json(updated);
  });

  app.get("/api/public/foundation/forms/:id", async (req, res) => {
    const id = uuidSchema.safeParse(req.params.id);
    if (!id.success) return invalid(res, id.error);
    const [formInstrument] = await db.select().from(foundationInstruments)
      .where(and(eq(foundationInstruments.id, id.data), eq(foundationInstruments.kind, "form"), eq(foundationInstruments.status, "published")))
      .limit(1);
    if (!formInstrument) return res.status(404).json({ message: "Published form not found" });
    const formRevision = await currentRevision(formInstrument.id, formInstrument.currentRevision);
    if (!formRevision) return res.status(404).json({ message: "Published form not found" });
    const form = formContentSchema.parse(formRevision.content);
    if (!form.public) return res.status(404).json({ message: "Published form not found" });
    const [databaseInstrument] = await db.select().from(foundationInstruments)
      .where(and(eq(foundationInstruments.id, form.databaseInstrumentId), eq(foundationInstruments.businessId, formInstrument.businessId), eq(foundationInstruments.kind, "database")))
      .limit(1);
    if (!databaseInstrument) return res.status(404).json({ message: "Published form not found" });
    const databaseRevision = await currentRevision(databaseInstrument.id, databaseInstrument.currentRevision);
    if (!databaseRevision) return res.status(404).json({ message: "Published form not found" });
    const database = databaseContentSchema.parse(databaseRevision.content);
    const types = new Map(database.fields.map((field) => [field.id, field.type]));
    return res.json({
      id: formInstrument.id,
      title: formInstrument.title,
      submitLabel: form.submitLabel,
      successMessage: form.successMessage,
      fields: form.fields.map((field) => ({ ...field, type: types.get(field.databaseFieldId) ?? "text" })),
    });
  });

  // This endpoint deliberately returns no form or database contents. A public
  // form grant permits submission only, never database read access.
  app.post("/api/public/foundation/forms/:id/submissions", async (req, res) => {
    const id = uuidSchema.safeParse(req.params.id);
    if (!id.success) return invalid(res, id.error);
    const idempotencyKey = z.string().trim().min(8).max(200).safeParse(req.get("idempotency-key"));
    if (!idempotencyKey.success) return res.status(400).json({ message: "An Idempotency-Key header is required." });
    const [formInstrument] = await db.select().from(foundationInstruments)
      .where(and(eq(foundationInstruments.id, id.data), eq(foundationInstruments.kind, "form"), eq(foundationInstruments.status, "published")))
      .limit(1);
    if (!formInstrument) return res.status(404).json({ message: "Published form not found" });
    const formRevision = await currentRevision(formInstrument.id, formInstrument.currentRevision);
    if (!formRevision) return res.status(409).json({ message: "The form has no current revision." });
    const form = formContentSchema.parse(formRevision.content);
    if (!form.public) return res.status(404).json({ message: "Published form not found" });
    const values = z.record(z.string(), z.unknown()).safeParse(req.body?.values);
    if (!values.success) return invalid(res, values.error);
    const allowed = new Set(form.fields.map((field) => field.databaseFieldId));
    if (Object.keys(values.data).some((field) => !allowed.has(field))) return res.status(400).json({ message: "The submission includes a field this form does not expose." });
    for (const field of form.fields) if (field.required && (values.data[field.databaseFieldId] === undefined || values.data[field.databaseFieldId] === "")) return res.status(400).json({ message: `${field.label} is required.` });

    const [databaseInstrument] = await db.select().from(foundationInstruments)
      .where(and(eq(foundationInstruments.id, form.databaseInstrumentId), eq(foundationInstruments.businessId, formInstrument.businessId), eq(foundationInstruments.kind, "database")))
      .limit(1);
    if (!databaseInstrument) return res.status(409).json({ message: "The bound database is unavailable." });
    const databaseRevision = await currentRevision(databaseInstrument.id, databaseInstrument.currentRevision);
    if (!databaseRevision) return res.status(409).json({ message: "The bound database has no current revision." });
    const database = databaseContentSchema.parse(databaseRevision.content);
    const knownFields = new Set(database.fields.map((field) => field.id));
    if (Object.keys(values.data).some((field) => !knownFields.has(field))) return res.status(409).json({ message: "The form schema no longer matches its database." });

    try {
      const submission = await db.transaction(async (tx) => {
        const [created] = await tx.insert(foundationFormSubmissions).values({
          formInstrumentId: formInstrument.id,
          databaseInstrumentId: databaseInstrument.id,
          idempotencyKey: idempotencyKey.data,
          values: values.data,
        }).returning();
        const now = new Date().toISOString();
        const nextContent = databaseContentSchema.parse({ ...database, records: [...database.records, { id: `submission_${created.id.replaceAll("-", "")}`, values: values.data, createdAt: now, updatedAt: now }] });
        const nextRevision = databaseInstrument.currentRevision + 1;
        const [updated] = await tx.update(foundationInstruments).set({ currentRevision: nextRevision, updatedAt: new Date() })
          .where(and(eq(foundationInstruments.id, databaseInstrument.id), eq(foundationInstruments.currentRevision, databaseInstrument.currentRevision))).returning();
        if (!updated) throw new Error("FORM_DATABASE_CONFLICT");
        await tx.insert(foundationInstrumentRevisions).values({
          instrumentId: databaseInstrument.id,
          revision: nextRevision,
          title: databaseInstrument.title,
          content: nextContent,
          actorUserId: databaseInstrument.ownerUserId,
          changeSummary: `Form submission ${created.id}`,
          baseRevision: databaseInstrument.currentRevision,
          evidence: { source: "public_form", formInstrumentId: formInstrument.id, submissionId: created.id },
        });
        await tx.insert(foundationInstrumentEvents).values({
          instrumentId: databaseInstrument.id,
          businessId: databaseInstrument.businessId,
          eventType: "database.record_created_from_form",
          actorUserId: databaseInstrument.ownerUserId,
          payload: { formInstrumentId: formInstrument.id, submissionId: created.id, revision: nextRevision },
        });
        await emitProjectionEvent({
          aggregateType: "foundation_instrument",
          aggregateId: databaseInstrument.id,
          eventType: "database.record_created_from_form",
          actorUserId: databaseInstrument.ownerUserId,
          payload: { businessId: databaseInstrument.businessId, formInstrumentId: formInstrument.id, submissionId: created.id, revision: nextRevision },
          idempotencyKey: `instrument:${databaseInstrument.id}:form-submission:${created.id}`,
        }, tx);
        return created;
      });
      return res.status(201).json({ id: submission.id, receivedAt: submission.createdAt });
    } catch (error) {
      const [existing] = await db.select().from(foundationFormSubmissions).where(and(
        eq(foundationFormSubmissions.formInstrumentId, formInstrument.id),
        eq(foundationFormSubmissions.idempotencyKey, idempotencyKey.data),
      )).limit(1);
      if (existing) return res.status(200).json({ id: existing.id, receivedAt: existing.createdAt, replayed: true });
      if (error instanceof Error && error.message === "FORM_DATABASE_CONFLICT") return res.status(409).json({ message: "The database changed while the form was submitted. Retry with the same idempotency key." });
      throw error;
    }
  });
}
