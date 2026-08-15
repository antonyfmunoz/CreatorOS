# CreativesOS TypeScript SDK

Use a scoped API key or OAuth access token. The SDK defaults to
`https://creativesos.net/api/v1`, preserves opaque cursors and exposes request
IDs on typed errors. Webhook verification binds the timestamp and exact raw
request body and rejects signatures older than five minutes by default.

```ts
import { CreativesOSClient } from "@creativesos/sdk";
const client = new CreativesOSClient({ accessToken: process.env.CREATIVESOS_TOKEN! });
const firstPage = await client.assets({ limit: 25 });
```
