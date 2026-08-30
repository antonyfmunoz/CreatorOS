export const assetVisibilities = ["public", "private"] as const;
export type AssetVisibility = (typeof assetVisibilities)[number];

export type AssetUploadRequest = {
  kind: string;
  mimeType: string;
  sizeBytes: number;
  visibility: AssetVisibility;
};

const MEBIBYTE = 1024 * 1024;

const policies: Record<string, { maxBytes: number; mime: (value: string) => boolean }> = {
  profile: { maxBytes: 10 * MEBIBYTE, mime: (value) => /^image\/(jpeg|png|gif|webp)$/i.test(value) },
  photo: { maxBytes: 25 * MEBIBYTE, mime: (value) => /^image\/(jpeg|png|gif|webp)$/i.test(value) },
  story: { maxBytes: 50 * MEBIBYTE, mime: (value) => /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime))$/i.test(value) },
  audio: { maxBytes: 50 * MEBIBYTE, mime: (value) => /^(audio\/(mpeg|wav|ogg|webm)|application\/octet-stream)$/i.test(value) },
  video: { maxBytes: 250 * MEBIBYTE, mime: (value) => /^video\/(mp4|webm|quicktime)$/i.test(value) },
  document: { maxBytes: 100 * MEBIBYTE, mime: (value) => /^(application\/pdf|text\/(plain|markdown|csv))$/i.test(value) },
  "cut-lut": { maxBytes: 8 * MEBIBYTE, mime: (value) => /^(text\/plain|application\/(octet-stream|x-cube))$/i.test(value) },
  "cut-font": { maxBytes: 12 * MEBIBYTE, mime: (value) => /^(font\/(ttf|otf|sfnt)|application\/(font-sfnt|x-font-ttf|x-font-opentype|octet-stream))$/i.test(value) },
  "cut-lottie": { maxBytes: 5 * MEBIBYTE, mime: (value) => /^(application\/(json|lottie\+json)|text\/json)$/i.test(value) },
  download: { maxBytes: 500 * MEBIBYTE, mime: () => true },
};

export function normalizeAssetVisibility(value: unknown): AssetVisibility | null {
  return value === "public" || value === "private" ? value : null;
}

export function validateAssetUpload(request: AssetUploadRequest): string | null {
  const policy = policies[request.kind];
  if (!policy) return "Unsupported asset kind";
  if (!Number.isSafeInteger(request.sizeBytes) || request.sizeBytes <= 0) return "Asset size must be a positive integer";
  if (request.sizeBytes > policy.maxBytes) return `This ${request.kind} exceeds the ${Math.floor(policy.maxBytes / MEBIBYTE)} MB limit`;
  if (!policy.mime(request.mimeType)) return "This file type is not allowed for the selected asset kind";
  return null;
}

export function monthlyAssetQuotaFor(kind: string) {
  // Starter production limits remain bounded for spend control, but a normal
  // creator workstation must be able to produce several assets per day. Usage
  // is counted per asset kind so a LUT, image, or audio upload cannot consume a
  // creator's video allowance.
  if (kind === "video") return { maxBytes: 25 * 1024 * MEBIBYTE, maxAssets: 200 };
  if (kind === "download") return { maxBytes: 50 * 1024 * MEBIBYTE, maxAssets: 500 };
  if (kind === "cut-lut") return { maxBytes: 256 * MEBIBYTE, maxAssets: 500 };
  if (kind === "cut-font") return { maxBytes: 256 * MEBIBYTE, maxAssets: 200 };
  if (kind === "cut-lottie") return { maxBytes: 256 * MEBIBYTE, maxAssets: 500 };
  return { maxBytes: 10 * 1024 * MEBIBYTE, maxAssets: 2_000 };
}
