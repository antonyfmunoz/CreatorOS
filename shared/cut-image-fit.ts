export const CUT_IMAGE_FITS = ["cover", "contain", "fill"] as const;
export type CutImageFit = typeof CUT_IMAGE_FITS[number];

/** Composition images historically previewed with cover; retain that default. */
export function cutImageFit(value: unknown): CutImageFit {
  if (value === undefined || value === null) return "cover";
  if (value === "cover" || value === "contain" || value === "fill") return value;
  throw new Error("Image framing must be cover, contain or fill.");
}
