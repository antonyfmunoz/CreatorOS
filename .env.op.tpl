# Managed by 1Password (WP-P4-SECRETS-001). Load with: op run --env-file=.env.op.tpl -- <cmd>
# Real secrets live in the 'CreativesOS' 1Password vault. NO plaintext values here.
DATABASE_URL=op://CreativesOS/Development/DATABASE_URL
CLERK_SECRET_KEY=op://CreativesOS/Development/CLERK_SECRET_KEY
# Clerk middleware needs this server-side alias as well as Vite's browser key.
CLERK_PUBLISHABLE_KEY=op://CreativesOS/Development/VITE_CLERK_PUBLISHABLE_KEY
VITE_CLERK_PUBLISHABLE_KEY=op://CreativesOS/Development/VITE_CLERK_PUBLISHABLE_KEY
# Optional: add this field only when AI provider access is intentionally enabled.
# OPENAI_API_KEY=op://CreativesOS/Development/OPENAI_API_KEY
# Stripe Checkout. The secret key is server-only; the webhook secret belongs
# to the endpoint https://creativesos.net/api/stripe/webhook.
STRIPE_SECRET_KEY=op://CreativesOS/Development/STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=op://CreativesOS/Development/STRIPE_WEBHOOK_SECRET
STRIPE_CONNECT_CLIENT_ID=op://CreativesOS/Development/STRIPE_CONNECT_CLIENT_ID
PUBLIC_APP_URL=http://localhost:3000
# Media storage. Keep local development on disk. Production R2 values are
# imported directly from 1Password by scripts/export-r2-secrets-from-onepassword.cjs
# so Windows shell encoding cannot corrupt a multi-secret environment file.
ASSET_STORAGE_PROVIDER=local
# R2_ACCOUNT_ID=op://CreativesOS/Development/R2_ACCOUNT_ID
# R2_ACCESS_KEY_ID=op://CreativesOS/Development/R2_ACCESS_KEY_ID
# R2_SECRET_ACCESS_KEY=op://CreativesOS/Development/R2_SECRET_ACCESS_KEY
# R2_BUCKET_NAME=op://CreativesOS/Development/R2_BUCKET_NAME
# R2_PUBLIC_BASE_URL=op://CreativesOS/Development/R2_PUBLIC_BASE_URL
# R2_PRIVATE_BUCKET_NAME=op://CreativesOS/Development/R2_PRIVATE_BUCKET_NAME
# Optional UMH federation. Provision independent inbound/outbound signing
# secrets and an ingest URL before enabling the adapter in any environment.
# UMH_COMMAND_SIGNING_SECRET=op://CreativesOS/Development/UMH_COMMAND_SIGNING_SECRET
# UMH_EVENT_SIGNING_SECRET=op://CreativesOS/Development/UMH_EVENT_SIGNING_SECRET
# UMH_EVENT_INGEST_URL=https://umh.example/api/v1/ingest/creativesos
# Social distribution OAuth. Tokens are encrypted server-side before they ever
# reach the database. Add provider values only after the relevant app review.
# YOUTUBE_CLIENT_ID=op://CreativesOS/Development/YOUTUBE_CLIENT_ID
# YOUTUBE_CLIENT_SECRET=op://CreativesOS/Development/YOUTUBE_CLIENT_SECRET
# SOCIAL_TOKEN_ENCRYPTION_KEY=op://CreativesOS/Development/SOCIAL_TOKEN_ENCRYPTION_KEY
# Unified Relationship Hub providers. The native inbox works without these.
# Instagram remains fail-closed until every setting is present and the Meta app
# has the approved messaging/comment permissions.
# INSTAGRAM_APP_ID=op://CreativesOS/Development/INSTAGRAM_APP_ID
# INSTAGRAM_APP_SECRET=op://CreativesOS/Development/INSTAGRAM_APP_SECRET
# META_GRAPH_API_VERSION=v24.0
# RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN=op://CreativesOS/Development/RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN
# ELEVENLABS_API_KEY=op://CreativesOS/Development/ELEVENLABS_API_KEY
# Relationship payloads are minimized after 30 days by default; durable audit
# evidence is retained for one year unless policy overrides these values.
# RELATIONSHIP_PROVIDER_PAYLOAD_RETENTION_DAYS=30
# RELATIONSHIP_AUDIT_RETENTION_DAYS=365

# Native community conferencing. Tokens are minted only by the authenticated
# CreativesOS server and are scoped to one community room for 15 minutes.
# LIVEKIT_URL=op://CreativesOS/Development/LIVEKIT_URL
# LIVEKIT_API_KEY=op://CreativesOS/Development/LIVEKIT_API_KEY
# LIVEKIT_API_SECRET=op://CreativesOS/Development/LIVEKIT_API_SECRET
# External LiveKit agent workers remain optional and fail closed until all
# corresponding settings are present. Keep ingest signing independent from
# LiveKit API credentials.
# LIVEKIT_TRANSCRIPTION_AGENT_NAME=op://CreativesOS/Development/LIVEKIT_TRANSCRIPTION_AGENT_NAME
# LIVEKIT_ROOM_AGENT_NAME=op://CreativesOS/Development/LIVEKIT_ROOM_AGENT_NAME
# ROOM_MEDIA_INGEST_SECRET=op://CreativesOS/Development/ROOM_MEDIA_INGEST_SECRET
