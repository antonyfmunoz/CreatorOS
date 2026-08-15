import type {
  CaptureCapabilities,
  CaptureNodeConfiguration,
  CaptureTelemetry,
} from "@shared/broadcast-field";

export const FIELD_SESSION_KEY = "creativesos:field-capture:session";
const RECOVERY_DATABASE = "creativesos-field-recovery";
const RECOVERY_STORE = "segments";

export type FieldCaptureSession = {
  nodeId: string;
  telemetryUrl: string;
  sequence: number;
};

export type RecoverySegment = {
  id: string;
  nodeId: string;
  createdAt: string;
  mimeType: string;
  durationMs: number;
  bytes: number;
  blob: Blob;
};

export function captureNodeKind(userAgent: string): "android" | "ios" | "desktop" {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "desktop";
}

export function browserCaptureCapabilities(): CaptureCapabilities {
  const mediaDevices = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices);
  const supports = (mimeType: string) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType);
  const codecs: CaptureCapabilities["videoCodecs"] = [];
  if (supports("video/webm;codecs=vp9,opus")) codecs.push("vp9");
  if (supports("video/webm;codecs=vp8,opus")) codecs.push("vp8");
  if (supports("video/mp4;codecs=avc1.42E01E,mp4a.40.2")) codecs.push("h264");
  if (!codecs.length) codecs.push("vp8");
  return {
    transports: ["webrtc"],
    videoCodecs: codecs,
    maxWidth: 3840,
    maxHeight: 2160,
    maxFps: 60,
    cameraCount: mediaDevices ? 1 : 0,
    audioInputCount: mediaDevices ? 1 : 0,
    hardwareEncoding: false,
    localRecording: typeof MediaRecorder !== "undefined",
    backgroundCapture: false,
    screenCapture: Boolean(navigator.mediaDevices?.getDisplayMedia),
    adaptiveBitrate: true,
    connectionBonding: false,
    talkback: false,
    remoteControl: true,
    cameraControls: true,
    locationMetadata: "geolocation" in navigator,
  };
}

export function loadFieldSession(): FieldCaptureSession | null {
  try {
    const raw = sessionStorage.getItem(FIELD_SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FieldCaptureSession>;
    if (!value.nodeId || !value.telemetryUrl) return null;
    return { nodeId: value.nodeId, telemetryUrl: value.telemetryUrl, sequence: Number(value.sequence) || 0 };
  } catch {
    return null;
  }
}

export function saveFieldSession(session: FieldCaptureSession) {
  sessionStorage.setItem(FIELD_SESSION_KEY, JSON.stringify(session));
}

export function clearFieldSession() {
  sessionStorage.removeItem(FIELD_SESSION_KEY);
}

function recoveryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECOVERY_DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECOVERY_STORE)) {
        const store = database.createObjectStore(RECOVERY_STORE, { keyPath: "id" });
        store.createIndex("nodeId", "nodeId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeRecoverySegment(segment: RecoverySegment) {
  const database = await recoveryDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RECOVERY_STORE, "readwrite");
    transaction.objectStore(RECOVERY_STORE).put(segment);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function listRecoverySegments(nodeId: string): Promise<RecoverySegment[]> {
  const database = await recoveryDatabase();
  const segments = await new Promise<RecoverySegment[]>((resolve, reject) => {
    const request = database.transaction(RECOVERY_STORE).objectStore(RECOVERY_STORE).index("nodeId").getAll(nodeId);
    request.onsuccess = () => resolve((request.result as RecoverySegment[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error);
  });
  database.close();
  return segments;
}

export async function deleteRecoverySegment(id: string) {
  const database = await recoveryDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RECOVERY_STORE, "readwrite");
    transaction.objectStore(RECOVERY_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

type NetworkInformation = { type?: string; effectiveType?: string; rtt?: number };
type BatteryManager = { level: number; charging: boolean };

export type FieldSenderStat = {
  id: string;
  kind: "audio" | "video";
  timestamp: number;
  bytesSent?: number;
  packetsSent?: number;
  packetsLost?: number;
  roundTripTime?: number;
  jitter?: number;
  framesPerSecond?: number;
  framesSent?: number;
};

export type FieldSenderSnapshot = {
  sampledAtMs: number;
  stats: FieldSenderStat[];
};

export type FieldTransportMeasurement = {
  uplinkKbps: number;
  rttMs: number;
  jitterMs: number;
  packetLossPct: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  fps: number;
  encodedFrames: number;
};

function finiteNonNegative(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function measureFieldSenderTransport(
  current: FieldSenderSnapshot,
  previous: FieldSenderSnapshot | null,
): FieldTransportMeasurement {
  const previousById = new Map(previous?.stats.map((stat) => [stat.id, stat]) ?? []);
  const elapsedSeconds = previous ? Math.max(0.001, (current.sampledAtMs - previous.sampledAtMs) / 1_000) : 0;
  let audioBytes = 0;
  let videoBytes = 0;
  let sentPackets = 0;
  let lostPackets = 0;
  let encodedFrames = 0;
  let fps = 0;
  let rttSeconds = 0;
  let jitterSeconds = 0;

  for (const stat of current.stats) {
    const prior = previousById.get(stat.id);
    const bytesDelta = prior && elapsedSeconds
      ? Math.max(0, finiteNonNegative(stat.bytesSent) - finiteNonNegative(prior.bytesSent))
      : 0;
    if (stat.kind === "video") videoBytes += bytesDelta;
    else audioBytes += bytesDelta;
    if (prior && elapsedSeconds) {
      sentPackets += Math.max(0, finiteNonNegative(stat.packetsSent) - finiteNonNegative(prior.packetsSent));
      lostPackets += Math.max(0, finiteNonNegative(stat.packetsLost) - finiteNonNegative(prior.packetsLost));
    }
    encodedFrames += finiteNonNegative(stat.framesSent);
    fps = Math.max(fps, finiteNonNegative(stat.framesPerSecond));
    rttSeconds = Math.max(rttSeconds, finiteNonNegative(stat.roundTripTime));
    jitterSeconds = Math.max(jitterSeconds, finiteNonNegative(stat.jitter));
  }

  const bitrate = (bytes: number) => elapsedSeconds ? Math.round((bytes * 8) / elapsedSeconds / 1_000) : 0;
  const totalPackets = sentPackets + lostPackets;
  return {
    uplinkKbps: bitrate(audioBytes + videoBytes),
    rttMs: Math.round(rttSeconds * 1_000),
    jitterMs: Math.round(jitterSeconds * 1_000),
    packetLossPct: totalPackets ? Math.round((lostPackets / totalPackets) * 10_000) / 100 : 0,
    videoBitrateKbps: bitrate(videoBytes),
    audioBitrateKbps: bitrate(audioBytes),
    fps: Math.round(fps * 10) / 10,
    encodedFrames: Math.round(encodedFrames),
  };
}

export async function buildCaptureTelemetry(input: {
  sequence: number;
  configuration: CaptureNodeConfiguration;
  stream: MediaStream | null;
  recording: { active: boolean; pendingSegments: number; durationMs: number };
  transport?: FieldTransportMeasurement | null;
}): Promise<CaptureTelemetry> {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  const battery = await (navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }).getBattery?.().catch(() => null) ?? null;
  const storage = await navigator.storage?.estimate?.().catch(() => null);
  const videoTrack = input.stream?.getVideoTracks()[0];
  const settings = videoTrack?.getSettings();
  const requested = input.configuration.requestedState;
  const state: CaptureTelemetry["state"] = requested === "live"
    ? input.stream ? "live" : "connecting"
    : requested;
  const connectionType = connection?.type === "wifi" || connection?.type === "cellular" || connection?.type === "ethernet"
    ? connection.type
    : "unknown";
  return {
    sequence: input.sequence,
    capturedAt: new Date().toISOString(),
    state,
    links: [{
      id: connectionType,
      type: connectionType,
      active: navigator.onLine,
      // The LiveKit sender adapter supplies measured outbound deltas without
      // exposing ICE candidates or network addresses. Before it has two
      // samples, zero is intentionally reported rather than a fabricated rate.
      uplinkKbps: input.transport?.uplinkKbps ?? 0,
      rttMs: input.transport?.rttMs || Math.max(0, Math.round(connection?.rtt ?? 0)),
      jitterMs: input.transport?.jitterMs ?? 0,
      packetLossPct: input.transport?.packetLossPct ?? 0,
    }],
    encoder: {
      videoBitrateKbps: input.transport?.videoBitrateKbps ?? 0,
      audioBitrateKbps: input.transport?.audioBitrateKbps ?? 0,
      fps: input.transport?.fps || settings?.frameRate || 0,
      droppedFrames: 0,
      encodedFrames: input.transport?.encodedFrames ?? 0,
      queueMs: 0,
    },
    device: {
      batteryPct: battery ? Math.round(battery.level * 100) : null,
      charging: battery?.charging ?? null,
      thermalState: "unknown",
      availableStorageMb: storage?.quota && storage?.usage ? Math.max(0, Math.floor((storage.quota - storage.usage) / 1_048_576)) : null,
    },
    recording: input.recording,
  };
}
