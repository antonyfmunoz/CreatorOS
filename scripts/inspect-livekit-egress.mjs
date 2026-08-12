import { EgressClient } from "livekit-server-sdk";

const egressId = process.argv[2];
if (!egressId) throw new Error("Usage: node scripts/inspect-livekit-egress.mjs <egress-id>");
if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET)
  throw new Error("LiveKit provider settings are required");

const apiUrl = process.env.LIVEKIT_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
const client = new EgressClient(
  apiUrl,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);
const recordings = await client.listEgress({ egressId });
process.stdout.write(
  `${JSON.stringify(
    recordings,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  )}\n`,
);
