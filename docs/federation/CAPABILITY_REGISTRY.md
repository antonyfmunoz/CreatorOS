# CreativesOS capability registry baseline

This is the projection-side declaration model. UMH will eventually discover and
reconcile the runtime version; this document is the policy source until the
shared registry contract is qualified.

| Capability | Kind | Local authority | State | Approval | Provider / dependency | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `content.draft.create` | native projection | business operator | implemented | no | CreativesOS DB | command outcome + outbox event |
| `campaign.create` | native projection | business operator | implemented | no | CreativesOS DB | command outcome + outbox event |
| `post.publish` | native projection | author/business policy | implemented | yes | CreativesOS DB | local approval + publication event |
| `community.room.schedule` | native projection | community manager | implemented | n/a until shared contract qualifies it | optional Meet/Zoom/manual link/LiveKit | local room record + room lifecycle event |
| `community.room.live_media` | provider-backed native capability | room host + active community member | implemented and production-verified | host starts room; membership controls publishing | LiveKit | short-lived scoped token + attendance check-in |
| `community.room.recording` | provider-backed | room host + participant consent | implemented and production-verified, including no-media rejection, active capture, finalization, private MP4 storage, compatibility reconciliation, retention, and authorized download | explicit, recorded consent from every current participant | LiveKit Egress + private R2 | consent + provider egress ID + private object lineage + duration/size + terminal status/error |
| `community.room.transcription` | provider-backed/native kernel | room host + participant consent | live caption UI, session-bound signed final-segment ingress, replay window, provenance, retention, recovery, and dispatch lifecycle implemented; external transcription agent runtime not connected | explicit, recorded consent from every current participant | approved LiveKit transcription agent | signed final-segment provenance + exact provider session |
| `community.room.intelligence_policy` | native projection | room host/community manager | implemented | explicit host policy + per-capability participant consent | provider-neutral kernel | policy version + consent decision + role-scoped access |
| `community.room.guest_briefs` | native projection | room host/community manager/moderator | implemented verified-facts path | host policy | CreativesOS member/attendance data | attributable profile, RSVP, and room-history fields |
| `community.room.ai_participant` | provider-backed | room host/community manager | role/policy, disclosed roster, role-scoped dispatch/session lifecycle, and stop-on-consent-withdrawal implemented; external realtime agent runtime not connected | explicit AI policy + participant AI consent | approved LiveKit realtime agent | labeled AI profile + audience role + provider dispatch/session proof |
| `community.room.summary_actions` | native intelligence + provider optional | authorized room members; managers review suggestions | shared notes/actions workspace, transactional human-review conversion, and portable recap implemented and production-verified; AI generation deferred | explicit AI/room policy | model/provider selected later | durable note, timezone-stable due date, validated member assignment, completion state, source insight, reviewer/time, accepted artifact link or dismissal, attributed recap output |
| `commerce.cart` | native projection | authenticated buyer | account-backed persistence implemented and production-verified; checkout routing groups implemented | no | CreativesOS DB | server-authoritative catalog snapshot, guest merge, reload persistence, buyer-scoped mutation, payment-route grouping |
| `commerce.checkout` | provider-backed | buyer/seller/payment policy | implemented sandbox path | payment confirmation | Stripe | order, entitlement, webhook evidence |
| `asset.private_delivery` | native projection + storage | asset owner/product entitlement | implemented and production-verified | no | R2 private bucket | signed access record + entitlement-gated delivery |
| `relationship.inbox.native` | native projection | business owner/operator | implemented and locally qualified | no | CreativesOS DB | normalized message + delivery receipt + audit record |
| `relationship.inbox.instagram` | provider-backed native capability | connected professional-account owner | adapter implemented; production activation pending Meta credentials and review | OAuth connection + provider policy | Instagram API with Instagram Login | signed webhook event + normalized message + provider receipt |
| `relationship.automation.keyword` | native projection | business owner/operator | implemented and locally qualified across native and normalized provider events | configured rule authority; outbound channel consent | CreativesOS automation kernel | trigger event + run + action receipt + delivery job |
| `relationship.ai.suggest` | provider-backed native capability | business owner/operator | implemented; provider-configured environments can qualify it | human review for external effects | OpenAI | evidence-linked proposal + reviewer + audit record |
| `relationship.voice_message` | provider-backed native capability | verified voice owner | consent, generation, approval, private storage, and native delivery implemented; production provider activation pending | explicit owner attestation and approval for AI-authored scripts | ElevenLabs + private R2 | consent + provenance + generation job + delivery receipt |
| `relationship.identity.merge` | native projection | business owner/operator | implemented and locally qualified | explicit human review | CreativesOS DB | merge candidate + transaction + audit record |

## Selection rule

For every workflow, UMH may select a native CreativesOS capability, an external
adapter, or a composed route. The selected route must record availability,
authority, consent, cost/latency class, risk, and proof status. “Provider
available” never overrides a disabled consent or local policy.
