# Federated Product Constitution — CreativesOS

## Purpose

CreativesOS is the creator distribution product: social presence, audience,
community, offers, commerce, learning, campaigns, and distribution. It must be
useful when operated entirely on its own. UMH is the private coordination plane,
not a dependency or an alternative owner of CreativesOS data.

## Constitutional rules

1. **Local authority first.** CreativesOS alone writes its own transactional
   database. UMH issues signed requests to a CreativesOS-owned ingress; it never
   receives database credentials or direct-write authority.
2. **Business is the operating tenant.** A public profile is a social identity.
   A business owns operating work, commercial records, and governed
   distribution. A public audience is never silently converted into business
   intelligence.
3. **Public visibility is an explicit policy.** Public posts, profiles, and
   marketplace metadata may be publicly visible. Drafts, buyer records, direct
   messages, private assets, room notes, recordings, transcripts, and earnings
   are private unless an explicit product policy permits broader visibility.
4. **Federation is optional at runtime.** If UMH is unavailable, local user
   workflows continue. Events remain in a durable local outbox for later
   delivery; no UI waits on UMH to complete a local action.
5. **Consent is operation-specific.** Recording, transcription, AI listening,
   cross-product learning, provider synchronization, and external publication
   each require their own informed, revocable policy. A live room does not
   imply recording or AI participation.
6. **Provider neutrality is intentional.** Zoom, Google Meet, LiveKit,
   Fireflies, Discord, Stripe, social networks, and future providers sit behind
   product-owned adapters. Provider availability and cost cannot silently alter
   local authority or privacy.
7. **Evidence is part of completion.** Governed work must preserve an intent,
   correlation/trace identifier, local decision/action, durable event or
   outcome, and measurable result.

## Canonical hierarchy

```text
person/principal → portfolio → organization/company → business tenant
→ workspace/community/program → role → governed action
```

- A `person/principal` authenticates through the product identity system.
- A `business tenant` is the unit for commerce, campaign operations, and
  federated authority.
- A `community` is a member-governed social workspace. Its commercial or
  federated binding must be explicit; membership alone does not grant business
  authority.
- A `room`, channel, campaign, offer, course, and distribution job inherit
  scope from their owning aggregate and cannot widen it implicitly.

## Intelligence and data use

CreativesOS may provide domain intelligence in its own interface. UMH may
coordinate approved workflows across products. Neither may use private product
content for cross-product learning unless the relevant policy and consent record
allow it. Derived recommendations must retain source lineage and are not a
substitute for a user-authorized action.

## Federation contract requirements

Every governed message must carry a version, product/installation identity,
command or event ID, idempotency key, correlation/trace ID, principal,
business tenant, optional workspace/community scope, authority basis, issued and
expiry times, and a signed body. Replay prevention and outcomes are durable.

New command types are blocked until the shared portfolio contract suite
qualifies them across UMH, LyfeOS, EOS, and CreativesOS.
