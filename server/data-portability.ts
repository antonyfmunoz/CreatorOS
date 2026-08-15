import crypto from "node:crypto";
import type { Express } from "express";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { attachUser } from "./auth";
import { ensureDefaultBusiness } from "./businesses";
import { db } from "./db";
import { getAutomationAction } from "./automation-actions";
import {
  automationConfigContainsSecret,
  automationDefinitionInputSchema,
} from "./automation-policy";
import {
  assets,
  automationDefinitions,
  automationSteps,
  contacts,
  courseAssessments,
  courseLessons,
  courseModules,
  dataImportJobs,
  dataImportRecords,
  products,
} from "../shared/schema";
import {
  portabilityImportRequestSchema,
  portabilityPackageSchema,
  type PortabilityPackage,
} from "../shared/portability";

function digest(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateAutomation(record: PortabilityPackage["automations"][number]) {
  const parsed = automationDefinitionInputSchema.safeParse({
    businessId: null,
    name: record.name,
    description: record.description,
    triggerType: record.triggerType,
    triggerConfig: record.triggerConfig,
    maxRunsPerHour: record.maxRunsPerHour,
    maxStepsPerRun: record.maxStepsPerRun,
    retentionDays: record.retentionDays,
    steps: record.steps,
  });
  if (!parsed.success) return parsed.error.issues.map((issue) => issue.message);
  const errors: string[] = [];
  if (automationConfigContainsSecret(record.triggerConfig)) errors.push("Trigger configuration contains secret-like data");
  if (new Set(record.steps.map((step) => step.stepKey)).size !== record.steps.length) errors.push("Step keys must be unique");
  if (new Set(record.steps.map((step) => step.position)).size !== record.steps.length) errors.push("Step positions must be unique");
  for (const step of record.steps) {
    if (!getAutomationAction(step.actionType)) errors.push(`Unsupported action: ${step.actionType}`);
    if (automationConfigContainsSecret(step.config)) errors.push(`Step ${step.stepKey} contains secret-like data`);
  }
  return errors;
}

function packageSummary(input: PortabilityPackage) {
  const automationErrors = input.automations.flatMap((record, index) =>
    validateAutomation(record).map((message) => ({ domain: "automations", sourceId: record.sourceId, index, message })),
  );
  return {
    valid: automationErrors.length === 0,
    counts: {
      products: input.products.length,
      courses: input.courses.length,
      contacts: input.contacts.length,
      automations: input.automations.length,
      total: input.products.length + input.courses.length + input.contacts.length + input.automations.length,
    },
    errors: automationErrors,
    guarantees: {
      atomic: true,
      tenantScoped: true,
      idempotent: true,
      importedAutomationsInactive: true,
      importedOffersDraft: true,
      secretConfigurationsRejected: true,
    },
  };
}

export function registerDataPortabilityRoutes(app: Express) {
  app.get("/api/portability/export", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [productRows, contactRows, definitionRows, assetRows] = await Promise.all([
      db.select().from(products).where(eq(products.businessId, business.id)).orderBy(asc(products.createdAt)),
      db.select().from(contacts).where(eq(contacts.userId, req.dbUser!.id)).orderBy(asc(contacts.createdAt)),
      db.select().from(automationDefinitions).where(or(eq(automationDefinitions.ownerUserId, req.dbUser!.id), eq(automationDefinitions.businessId, business.id))).orderBy(asc(automationDefinitions.createdAt)),
      db.select().from(assets).where(and(eq(assets.ownerUserId, req.dbUser!.id), eq(assets.businessId, business.id))).orderBy(asc(assets.createdAt)),
    ]);
    const productIds = productRows.map((row) => row.id);
    const definitionIds = definitionRows.map((row) => row.id);
    const modules = productIds.length ? await db.select().from(courseModules).where(inArray(courseModules.productId, productIds)).orderBy(asc(courseModules.sortOrder)) : [];
    const moduleIds = modules.map((row) => row.id);
    const lessons = moduleIds.length ? await db.select().from(courseLessons).where(inArray(courseLessons.moduleId, moduleIds)).orderBy(asc(courseLessons.sortOrder)) : [];
    const lessonIds = lessons.map((row) => row.id);
    const assessments = lessonIds.length ? await db.select().from(courseAssessments).where(inArray(courseAssessments.lessonId, lessonIds)) : [];
    const steps = definitionIds.length ? await db.select().from(automationSteps).where(inArray(automationSteps.definitionId, definitionIds)).orderBy(asc(automationSteps.position)) : [];
    const courseIds = new Set(modules.map((module) => module.productId));
    const packageData = {
      schemaVersion: "creativesos.portability.v1" as const,
      sourceSystem: "creativesos",
      exportedAt: new Date().toISOString(),
      products: productRows.filter((product) => !courseIds.has(product.id) && product.productType !== "course").map((product) => ({ sourceId: `product:${product.id}`, title: product.title, description: product.description, price: product.price, category: product.category, imageUrl: product.imageUrl, productType: product.productType, billingModel: product.billingModel, billingInterval: product.billingInterval, status: product.status })),
      courses: productRows.filter((product) => courseIds.has(product.id) || product.productType === "course").map((product) => ({ sourceId: `course:${product.id}`, title: product.title, description: product.description, price: product.price, category: product.category, imageUrl: product.imageUrl, productType: "course" as const, billingModel: product.billingModel, billingInterval: product.billingInterval, status: product.status, modules: modules.filter((module) => module.productId === product.id).map((module) => ({ sourceId: `module:${module.id}`, title: module.title, description: module.description, lessons: lessons.filter((lesson) => lesson.moduleId === module.id).map((lesson) => { const assessment = assessments.find((candidate) => candidate.lessonId === lesson.id); return { sourceId: `lesson:${lesson.id}`, title: lesson.title, body: lesson.body, videoUrl: lesson.videoUrl, resourceUrls: lesson.resourceUrls, durationSeconds: lesson.durationSeconds, availableAfterDays: lesson.availableAfterDays, published: lesson.isPublished, assessment: assessment ? { passingScorePercent: assessment.passingScorePercent, questions: assessment.questions } : null }; }) })) })),
      contacts: contactRows.map((contact) => ({ sourceId: `contact:${contact.id}`, name: contact.contactName, imageUrl: contact.contactImage, purchaseInfo: contact.purchaseInfo })),
      automations: definitionRows.map((definition) => ({ sourceId: `automation:${definition.id}`, name: definition.name, description: definition.description, triggerType: definition.triggerType, triggerConfig: definition.triggerConfig, maxRunsPerHour: definition.maxRunsPerHour, maxStepsPerRun: definition.maxStepsPerRun, retentionDays: definition.retentionDays, status: definition.status === "paused" ? "paused" as const : "draft" as const, steps: steps.filter((step) => step.definitionId === definition.id).map((step) => ({ stepKey: step.stepKey, name: step.name, actionType: step.actionType, config: step.config, position: step.position, approvalPolicy: step.approvalPolicy, retryLimit: step.retryLimit, timeoutMs: step.timeoutMs })) })),
    };
    const validated = portabilityPackageSchema.parse(packageData);
    res.setHeader("Content-Disposition", `attachment; filename="creativesos-portability-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({
      ...validated,
      mediaManifest: assetRows.map((asset) => ({ sourceId: `asset:${asset.id}`, kind: asset.kind, filename: asset.originalFilename, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, sha256: asset.sha256, visibility: asset.visibility, status: asset.status, publicUrl: asset.visibility === "public" ? asset.publicUrl : null, migrationMethod: "upload_through_media_library" })),
      companionImports: { audience: "/business/audience?tab=import", podcasts: "/business/podcasts", media: "/library" },
    });
  });

  app.post("/api/portability/import/validate", attachUser, async (req, res) => {
    const parsed = portabilityPackageSchema.safeParse(req.body?.package ?? req.body);
    if (!parsed.success) return res.status(400).json({ valid: false, errors: parsed.error.issues });
    return res.json(packageSummary(parsed.data));
  });

  app.get("/api/portability/imports", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    return res.json(await db.select().from(dataImportJobs).where(eq(dataImportJobs.businessId, business.id)).orderBy(asc(dataImportJobs.createdAt)));
  });

  app.post("/api/portability/import", attachUser, async (req, res) => {
    const parsed = portabilityImportRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid portability package", issues: parsed.error.issues });
    const validation = packageSummary(parsed.data.package);
    if (!validation.valid) return res.status(400).json(validation);
    const business = await ensureDefaultBusiness(req.dbUser!);
    const payloadHash = digest(parsed.data.package);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${business.id}:${parsed.data.package.sourceSystem}`}, 0))`);
      const [prior] = await tx.select().from(dataImportJobs).where(and(eq(dataImportJobs.businessId, business.id), eq(dataImportJobs.idempotencyKey, parsed.data.idempotencyKey))).limit(1);
      if (prior) return { job: prior, replayed: true, conflict: prior.payloadHash !== payloadHash };
      const [job] = await tx.insert(dataImportJobs).values({ businessId: business.id, requestedByUserId: req.dbUser!.id, sourceSystem: parsed.data.package.sourceSystem, idempotencyKey: parsed.data.idempotencyKey, payloadHash, schemaVersion: parsed.data.package.schemaVersion, status: "processing" }).returning();
      const imported = { products: 0, courses: 0, contacts: 0, automations: 0 };
      const skipped = { products: 0, courses: 0, contacts: 0, automations: 0 };
      const mapped = async (domain: string, sourceIdValue: string) => (await tx.select({ id: dataImportRecords.id }).from(dataImportRecords).where(and(eq(dataImportRecords.businessId, business.id), eq(dataImportRecords.sourceSystem, parsed.data.package.sourceSystem), eq(dataImportRecords.domain, domain), eq(dataImportRecords.sourceId, sourceIdValue))).limit(1))[0];
      const record = async (domain: string, sourceIdValue: string, targetType: string, targetId: string, value: unknown) => { await tx.insert(dataImportRecords).values({ jobId: job.id, businessId: business.id, sourceSystem: parsed.data.package.sourceSystem, domain, sourceId: sourceIdValue, targetType, targetId, checksum: digest(value) }); };

      for (const product of parsed.data.package.products) {
        if (await mapped("products", product.sourceId)) { skipped.products += 1; continue; }
        const [created] = await tx.insert(products).values({ userId: req.dbUser!.id, businessId: business.id, payoutMode: "platform", status: "draft", productType: product.productType, billingModel: product.billingModel, billingInterval: product.billingModel === "recurring" ? product.billingInterval ?? "month" : null, title: product.title, description: product.description, price: product.price, category: product.category, imageUrl: product.imageUrl ?? null }).returning({ id: products.id });
        await record("products", product.sourceId, "product", String(created.id), product);
        imported.products += 1;
      }

      for (const course of parsed.data.package.courses) {
        if (await mapped("courses", course.sourceId)) { skipped.courses += 1; continue; }
        const [created] = await tx.insert(products).values({ userId: req.dbUser!.id, businessId: business.id, payoutMode: "platform", status: "draft", productType: "course", billingModel: course.billingModel, billingInterval: course.billingModel === "recurring" ? course.billingInterval ?? "month" : null, title: course.title, description: course.description, price: course.price, category: course.category, imageUrl: course.imageUrl ?? null }).returning({ id: products.id });
        for (let moduleIndex = 0; moduleIndex < course.modules.length; moduleIndex += 1) {
          const moduleInput = course.modules[moduleIndex];
          const [moduleRow] = await tx.insert(courseModules).values({ productId: created.id, title: moduleInput.title, description: moduleInput.description, sortOrder: moduleIndex }).returning({ id: courseModules.id });
          for (let lessonIndex = 0; lessonIndex < moduleInput.lessons.length; lessonIndex += 1) {
            const lesson = moduleInput.lessons[lessonIndex];
            const [lessonRow] = await tx.insert(courseLessons).values({ moduleId: moduleRow.id, title: lesson.title, body: lesson.body, videoUrl: lesson.videoUrl ?? null, resourceUrls: lesson.resourceUrls, durationSeconds: lesson.durationSeconds, availableAfterDays: lesson.availableAfterDays, sortOrder: lessonIndex, isPublished: lesson.published }).returning({ id: courseLessons.id });
            if (lesson.assessment) await tx.insert(courseAssessments).values({ lessonId: lessonRow.id, passingScorePercent: lesson.assessment.passingScorePercent, questions: lesson.assessment.questions });
          }
        }
        await record("courses", course.sourceId, "product", String(created.id), course);
        imported.courses += 1;
      }

      for (const contact of parsed.data.package.contacts) {
        if (await mapped("contacts", contact.sourceId)) { skipped.contacts += 1; continue; }
        const [created] = await tx.insert(contacts).values({ userId: req.dbUser!.id, contactName: contact.name, contactImage: contact.imageUrl ?? null, purchaseInfo: contact.purchaseInfo ?? null }).returning({ id: contacts.id });
        await record("contacts", contact.sourceId, "contact", String(created.id), contact);
        imported.contacts += 1;
      }

      for (const automation of parsed.data.package.automations) {
        if (await mapped("automations", automation.sourceId)) { skipped.automations += 1; continue; }
        const [created] = await tx.insert(automationDefinitions).values({ ownerUserId: req.dbUser!.id, businessId: business.id, name: automation.name, description: automation.description, status: automation.status, triggerType: automation.triggerType, triggerConfig: automation.triggerConfig, maxRunsPerHour: automation.maxRunsPerHour, maxStepsPerRun: automation.maxStepsPerRun, retentionDays: automation.retentionDays }).returning({ id: automationDefinitions.id });
        await tx.insert(automationSteps).values(automation.steps.map((step) => ({ ...step, definitionId: created.id })));
        await record("automations", automation.sourceId, "automation", created.id, automation);
        imported.automations += 1;
      }
      const summary = { imported, skipped, totalImported: Object.values(imported).reduce((sum, count) => sum + count, 0), totalSkipped: Object.values(skipped).reduce((sum, count) => sum + count, 0) };
      const [completed] = await tx.update(dataImportJobs).set({ status: "completed", summary, completedAt: new Date() }).where(eq(dataImportJobs.id, job.id)).returning();
      return { job: completed, replayed: false, conflict: false };
    });
    if (result.conflict) return res.status(409).json({ message: "Idempotency key was already used for a different package" });
    return res.status(result.replayed ? 200 : 201).json({ job: result.job, replayed: result.replayed });
  });
}
