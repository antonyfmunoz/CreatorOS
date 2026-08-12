import { createRequire } from "node:module";

const roomName = process.argv[2];
const durationSeconds = Math.min(
  Math.max(Number(process.argv[3] ?? "75"), 15),
  180,
);

if (!roomName) throw new Error("Usage: node qualify-livekit-publisher.mjs <room-name> [seconds]");
if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET)
  throw new Error("LiveKit provider settings are required");

const appRequire = createRequire("/app/package.json");
const qualificationRequire = createRequire("/tmp/livekit-qual/package.json");
const { AccessToken } = appRequire("livekit-server-sdk");
const {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  Room,
  TrackPublishOptions,
  TrackSource,
  dispose,
} = qualificationRequire("@livekit/rtc-node");

const identity = `creativesos-qualification-publisher-${Date.now()}`;
const accessToken = new AccessToken(
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
  { identity, name: "CreativesOS recording qualification" },
);
accessToken.addGrant({
  room: roomName,
  roomJoin: true,
  canPublish: true,
  canSubscribe: false,
  canPublishData: false,
});

const room = new Room();
const sampleRate = 48_000;
const channels = 1;
const samplesPerFrame = 960;
const source = new AudioSource(sampleRate, channels);
const track = LocalAudioTrack.createAudioTrack("qualification-tone", source);
const publishOptions = new TrackPublishOptions();
publishOptions.source = TrackSource.SOURCE_MICROPHONE;

try {
  await room.connect(process.env.LIVEKIT_URL, await accessToken.toJwt(), {
    autoSubscribe: false,
  });
  await room.localParticipant.publishTrack(track, publishOptions);
  process.stdout.write("qualification_track_published\n");

  const frameCount = Math.ceil((durationSeconds * sampleRate) / samplesPerFrame);
  let sampleOffset = 0;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const samples = new Int16Array(samplesPerFrame);
    for (let index = 0; index < samples.length; index += 1)
      samples[index] = Math.round(
        Math.sin((2 * Math.PI * 440 * (sampleOffset + index)) / sampleRate) * 1_500,
      );
    sampleOffset += samples.length;
    await source.captureFrame(
      new AudioFrame(samples, sampleRate, channels, samplesPerFrame),
    );
  }
  process.stdout.write("qualification_track_complete\n");
} finally {
  await track.close().catch(() => undefined);
  await room.disconnect().catch(() => undefined);
  await dispose().catch(() => undefined);
}
