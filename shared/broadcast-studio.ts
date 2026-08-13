import { z } from "zod";

const safeId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

export const broadcastTransformSchema = z.object({
  x: z.number().finite().min(0).max(1).default(0),
  y: z.number().finite().min(0).max(1).default(0),
  width: z.number().finite().positive().max(1).default(1),
  height: z.number().finite().positive().max(1).default(1),
  rotation: z.number().finite().min(-360).max(360).default(0),
  opacity: z.number().finite().min(0).max(1).default(1),
  cropTop: z.number().finite().min(0).max(0.45).default(0),
  cropRight: z.number().finite().min(0).max(0.45).default(0),
  cropBottom: z.number().finite().min(0).max(0.45).default(0),
  cropLeft: z.number().finite().min(0).max(0.45).default(0),
});

export const broadcastSourceSchema = z.object({
  id: safeId,
  name: z.string().trim().min(1).max(80),
  type: z.enum([
    "test_pattern",
    "camera",
    "screen",
    "microphone",
    "media",
    "image",
    "text",
    "color",
  ]),
  assetId: z.string().uuid().nullable().default(null),
  text: z.string().max(500).nullable().default(null),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  transform: broadcastTransformSchema,
  zOrder: z.number().int().min(0).max(100).default(0),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  muted: z.boolean().default(false),
  volume: z.number().finite().min(0).max(2).default(1),
  blendMode: z
    .enum(["source-over", "screen", "multiply", "overlay"])
    .default("source-over"),
  filters: z.object({
    brightness: z.number().finite().min(0).max(2).default(1),
    contrast: z.number().finite().min(0).max(2).default(1),
    saturation: z.number().finite().min(0).max(2).default(1),
    blurPx: z.number().finite().min(0).max(20).default(0),
  }),
  presentation: z.object({
    style: z.enum(["plain", "lower_third", "ticker", "countdown"]).default("plain"),
    secondaryText: z.string().max(300).nullable().default(null),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
    fontScale: z.number().finite().min(0.25).max(2).default(1),
    align: z.enum(["left", "center", "right"]).default("center"),
    scrollSpeed: z.number().finite().min(10).max(400).default(90),
    countdownEndsAt: z.number().finite().nullable().default(null),
  }).optional(),
});

export const broadcastSceneSchema = z.object({
  id: safeId,
  name: z.string().trim().min(1).max(80),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#000000"),
  sources: z.array(broadcastSourceSchema).max(32).default([]),
});

export const broadcastStudioConfigSchema = z.object({
  version: z.literal(1),
  canvas: z.object({
    width: z.union([z.literal(720), z.literal(1080), z.literal(1280), z.literal(1920)]).default(1280),
    height: z.union([z.literal(720), z.literal(1080), z.literal(1280), z.literal(1920)]).default(720),
    fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
  }),
  output: z
    .object({
      videoBitrateKbps: z.number().int().min(500).max(12_000).default(4_500),
      audioBitrateKbps: z.number().int().min(64).max(320).default(128),
    })
    .default({ videoBitrateKbps: 4_500, audioBitrateKbps: 128 }),
  scenes: z.array(broadcastSceneSchema).min(1).max(20),
  previewSceneId: safeId,
  programSceneId: safeId,
  studioMode: z.boolean().default(true),
  transition: z.object({
    type: z.enum(["cut", "fade"]).default("cut"),
    durationMs: z.number().int().min(0).max(3000).default(300),
  }),
  masterMuted: z.boolean().default(false),
  masterVolume: z.number().finite().min(0).max(2).default(1),
  replayBufferSeconds: z.number().int().min(0).max(120).default(30),
  brandKit: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1d9bf0"),
    surfaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#101014"),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
    logoAssetId: z.string().uuid().nullable().default(null),
  }).default({ primaryColor: "#1d9bf0", surfaceColor: "#101014", textColor: "#ffffff", logoAssetId: null }),
});

export const broadcastDestinationInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  protocol: z.enum(["rtmp", "rtmps", "srt"]),
  ingestUrl: z.string().trim().url().max(1_000),
  streamKey: z.string().trim().min(1).max(500),
});

export const broadcastSessionStartSchema = z.object({
  destinationId: z.string().uuid().nullable().default(null),
  destinationIds: z.array(z.string().uuid()).max(8).default([]),
  outputMode: z.enum(["stream", "recording"]),
  sourceMode: z.enum(["browser", "test_pattern"]).default("browser"),
  videoBitrateKbps: z.number().int().min(500).max(12_000).default(4_500),
  audioBitrateKbps: z.number().int().min(64).max(320).default(128),
});

export type BroadcastSource = z.infer<typeof broadcastSourceSchema>;
export type BroadcastScene = z.infer<typeof broadcastSceneSchema>;
export type BroadcastStudioConfig = z.infer<typeof broadcastStudioConfigSchema>;
export type BroadcastSceneTemplate = "solo" | "interview" | "presentation" | "countdown";

export function defaultBroadcastStudioConfig(): BroadcastStudioConfig {
  const sceneId = "scene_main";
  return {
    version: 1,
    canvas: { width: 1280, height: 720, fps: 30 },
    output: { videoBitrateKbps: 4_500, audioBitrateKbps: 128 },
    scenes: [
      {
        id: sceneId,
        name: "Main",
        background: "#09090b",
        sources: [
          {
            id: "source_title",
            name: "Welcome title",
            type: "text",
            assetId: null,
            text: "CreativesOS Live",
            color: "#ffffff",
            transform: {
              x: 0.1,
              y: 0.72,
              width: 0.8,
              height: 0.15,
              rotation: 0,
              opacity: 1,
              cropTop: 0,
              cropRight: 0,
              cropBottom: 0,
              cropLeft: 0,
            },
            zOrder: 1,
            visible: true,
            locked: false,
            muted: true,
            volume: 0,
            blendMode: "source-over",
            filters: { brightness: 1, contrast: 1, saturation: 1, blurPx: 0 },
          },
        ],
      },
    ],
    previewSceneId: sceneId,
    programSceneId: sceneId,
    studioMode: true,
    transition: { type: "cut", durationMs: 300 },
    masterMuted: false,
    masterVolume: 1,
    replayBufferSeconds: 30,
    brandKit: { primaryColor: "#1d9bf0", surfaceColor: "#101014", textColor: "#ffffff", logoAssetId: null },
  };
}

export function validateBroadcastStudioConfig(
  value: unknown,
): BroadcastStudioConfig {
  const config = broadcastStudioConfigSchema.parse(value);
  const dimensions = `${config.canvas.width}x${config.canvas.height}`;
  if (!["1280x720", "1920x1080", "720x1280", "1080x1920", "1080x1080"].includes(dimensions)) {
    throw new Error("Canvas must use a supported landscape, portrait, or square production profile");
  }
  const sceneIds = new Set(config.scenes.map((scene) => scene.id));
  if (
    !sceneIds.has(config.previewSceneId) ||
    !sceneIds.has(config.programSceneId)
  ) {
    throw new Error("Preview and program must reference an existing scene");
  }
  for (const scene of config.scenes) {
    const sourceIds = new Set<string>();
    for (const source of scene.sources) {
      if (sourceIds.has(source.id))
        throw new Error(`Duplicate source id in ${scene.name}`);
      sourceIds.add(source.id);
      if (
        source.transform.x + source.transform.width > 1.01 ||
        source.transform.y + source.transform.height > 1.01
      ) {
        throw new Error(`${source.name} must remain inside the canvas`);
      }
    }
  }
  return config;
}

export function transitionBroadcastScene(
  config: BroadcastStudioConfig,
): BroadcastStudioConfig {
  return validateBroadcastStudioConfig({
    ...config,
    programSceneId: config.previewSceneId,
  });
}

export function duplicateBroadcastScene(
  config: BroadcastStudioConfig,
  sceneId: string,
  nextId: string,
): BroadcastStudioConfig {
  const source = config.scenes.find((scene) => scene.id === sceneId);
  if (!source) throw new Error("Scene not found");
  return validateBroadcastStudioConfig({
    ...config,
    scenes: [
      ...config.scenes,
      {
        ...source,
        id: nextId,
        name: `${source.name} copy`,
        sources: source.sources.map((item, index) => ({
          ...item,
          id: `${nextId}_${index}`.slice(0, 32),
        })),
      },
    ],
    previewSceneId: nextId,
  });
}

function templateSource(id: string, name: string, type: BroadcastSource["type"], transform: BroadcastSource["transform"], zOrder: number, overrides: Partial<BroadcastSource> = {}): BroadcastSource {
  return {
    id,
    name,
    type,
    assetId: null,
    text: null,
    color: null,
    transform,
    zOrder,
    visible: true,
    locked: false,
    muted: type === "text" || type === "image" || type === "color" || type === "test_pattern",
    volume: 1,
    blendMode: "source-over",
    filters: { brightness: 1, contrast: 1, saturation: 1, blurPx: 0 },
    presentation: { style: "plain", secondaryText: null, backgroundColor: null, fontScale: 1, align: "center", scrollSpeed: 90, countdownEndsAt: null },
    ...overrides,
  };
}

export function createBroadcastSceneFromTemplate(config: BroadcastStudioConfig, template: BroadcastSceneTemplate, sceneId: string): BroadcastStudioConfig {
  const kit = config.brandKit;
  const full = { x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 };
  const lowerThird = templateSource(`${sceneId}_lower`.slice(0, 32), "Lower third", "text", { ...full, x: 0.05, y: 0.78, width: 0.62, height: 0.16 }, 10, { text: "Guest or headline", color: kit.textColor, presentation: { style: "lower_third", secondaryText: "Role or call to action", backgroundColor: kit.surfaceColor, fontScale: 1, align: "left", scrollSpeed: 90, countdownEndsAt: null } });
  let name = "Solo creator";
  let sources: BroadcastSource[] = [];
  if (template === "solo") {
    sources = [templateSource(`${sceneId}_cam`.slice(0, 32), "Host camera", "camera", { ...full, x: 0.08, y: 0.05, width: 0.84, height: 0.88 }, 0), lowerThird];
  } else if (template === "interview") {
    name = "Two-person interview";
    sources = [
      templateSource(`${sceneId}_host`.slice(0, 32), "Host camera", "camera", { ...full, x: 0.03, y: 0.08, width: 0.46, height: 0.78 }, 0),
      templateSource(`${sceneId}_guest`.slice(0, 32), "Guest camera", "camera", { ...full, x: 0.51, y: 0.08, width: 0.46, height: 0.78 }, 1),
      lowerThird,
    ];
  } else if (template === "presentation") {
    name = "Screen presentation";
    sources = [
      templateSource(`${sceneId}_screen`.slice(0, 32), "Screen share", "screen", { ...full, x: 0.02, y: 0.03, width: 0.96, height: 0.94 }, 0),
      templateSource(`${sceneId}_pip`.slice(0, 32), "Presenter camera", "camera", { ...full, x: 0.72, y: 0.64, width: 0.25, height: 0.31 }, 1),
      lowerThird,
    ];
  } else {
    name = "Countdown opener";
    sources = [templateSource(`${sceneId}_count`.slice(0, 32), "Countdown", "text", { ...full, x: 0.15, y: 0.25, width: 0.7, height: 0.5 }, 0, { text: "Starting soon", color: kit.textColor, presentation: { style: "countdown", secondaryText: null, backgroundColor: kit.surfaceColor, fontScale: 1.5, align: "center", scrollSpeed: 90, countdownEndsAt: Date.now() + 300_000 } })];
  }
  if (kit.logoAssetId) sources.push(templateSource(`${sceneId}_logo`.slice(0, 32), "Brand logo", "image", { ...full, x: 0.82, y: 0.04, width: 0.14, height: 0.14 }, 20, { assetId: kit.logoAssetId }));
  return validateBroadcastStudioConfig({ ...config, scenes: [...config.scenes, { id: sceneId, name, background: "#09090b", sources }], previewSceneId: sceneId });
}

export function applyBroadcastBrandKit(config: BroadcastStudioConfig): BroadcastStudioConfig {
  const kit = config.brandKit;
  return validateBroadcastStudioConfig({
    ...config,
    scenes: config.scenes.map((scene) => ({
      ...scene,
      sources: scene.sources.map((source) => source.type === "text" && source.presentation && source.presentation.style !== "plain" ? {
        ...source,
        color: kit.textColor,
        presentation: { ...source.presentation, backgroundColor: kit.surfaceColor },
      } : source),
    })),
  });
}
