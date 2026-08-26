import { describe, expect, it } from "vitest";
import { createDesignProjectSchema, designDocumentSchema, designResizeSchema } from "../shared/design-studio";

const document = { version: 1 as const, pages: [{ id: "page-1", name: "Page 1", width: 1280, height: 720, background: "#000000", elements: [{ id: "headline", type: "text" as const, x: 80, y: 80, width: 800, height: 120, rotation: 0, opacity: 1, locked: true, zIndex: 2, text: "A durable creative system", fill: "#ffffff", fontSize: 72, fontFamily: "Arial", fontWeight: "bold" as const, align: "left" as const }] }] };

describe("DesignStudio contract", () => {
  it("accepts a bounded multi-surface design document", () => { expect(designDocumentSchema.parse(document).pages[0].elements[0].locked).toBe(true); });
  it("rejects unsafe colors and oversized documents", () => { expect(designDocumentSchema.safeParse({ ...document, pages: [{ ...document.pages[0], background: "url(javascript:alert(1))" }] }).success).toBe(false); expect(designDocumentSchema.safeParse({ ...document, pages: [{ ...document.pages[0], width: 100_000 }] }).success).toBe(false); });
  it("requires known output families and controlled resize dimensions", () => { expect(createDesignProjectSchema.parse({ name: "Launch", kind: "thumbnail", width: 1280, height: 720, brandKitId: null, document }).kind).toBe("thumbnail"); expect(designResizeSchema.safeParse({ name: "Bad", width: 8, height: 8, mode: "fit" }).success).toBe(false); });
  it("requires stable unique page and element identities", () => {
    expect(designDocumentSchema.safeParse({ ...document, pages: [document.pages[0], { ...document.pages[0] }] }).success).toBe(false);
    expect(designDocumentSchema.safeParse({ ...document, pages: [{ ...document.pages[0], elements: [document.pages[0].elements[0], { ...document.pages[0].elements[0] }] }] }).success).toBe(false);
  });
});
