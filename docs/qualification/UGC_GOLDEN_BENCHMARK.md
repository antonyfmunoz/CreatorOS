# CreativesOS native UGC golden benchmark

Last reviewed: 2026-08-14

## Target outcome

A brand publishes a bounded creative brief. A creator with a shareable portfolio
discovers it, applies, is selected, discusses the work, submits private creative,
receives actionable feedback, completes revisions, earns approval, and sees
performance-attributed compensation without losing the asset, terms, or evidence
lineage between separate tools.

## Current comparison baseline

Trybe's current creator description explicitly includes partnership discovery,
direct content submission, revisions and status, brand feedback and chat,
performance analytics, commission and payout breakdowns, and a shareable creator
portfolio. Its creator portal exposes Home, Analytics, Payouts, Chat, and Profile.
These are job-to-be-done references, not UI or code-copying instructions:

- [Trybe Creators App Store description](https://apps.apple.com/us/app/trybe-creators/id6759299465)
- [Trybe creator portal](https://jointrybe.com/creator)

## Native acceptance checklist

| Stage | Required evidence |
| --- | --- |
| Creator presence | Niche, languages, availability, starting rate, public work samples, and a shareable public profile using only public assets |
| Brand brief | Deliverables, platforms, eligibility, deadlines, disclosure, revision limit, and explicit organic/paid usage rights |
| Compensation | Fixed, commission, hybrid, and gifted models validate consistently; accepted terms are immutable snapshots |
| Discovery and application | Search, open/deadline filtering, portfolio proof, one application per creator, no self-application, withdrawal, shortlist, selection, and rejection |
| Workroom | A selected creator and authorized brand team receive one bounded chat and production workspace; unrelated accounts are denied |
| Creative review | Private media, version history, creator-only submission, brand-only decisions, specific feedback, and enforced revision limits |
| Performance | Manual evidence is usable without providers; connected attribution can append provider receipts later |
| Earnings | Fixed and commission entries remain distinct from platform revenue, retry-safe, visible to the creator, and explicitly unsettled until a payment rail confirms settlement |
| Portability | Approved creative can continue into CutStudio, Distribution, Campaigns, Relationship Hub, and creator earnings without reconstructing identity or lineage |

## Current functional state

The provider-independent lifecycle is implemented and locally qualified across
mobile and desktop with opposite seeded accounts acting as brand and creator.
The field path covers profile, portfolio, brief, publish, discovery, application,
shortlist, selection, tenant denial, private version, revision, approval,
performance, commission, idempotent replay, earnings, chat creation, and the UGC
Studio route. This is `verified_complete` for the bounded native workflow after
production deployment and a signed-in production smoke test; it remains
`not_benchmarked` competitively until an authorized operator completes the
side-by-side protocol below.

## Side-by-side protocol

Use the same brand brief, source product, creator, two vertical deliverables,
one revision, 30-day paid usage term, fixed-plus-commission agreement, and
performance dataset in both products. Record:

1. setup time from blank account to published brief;
2. creator time from discovery to valid application;
3. brand time from application review through selection;
4. uploads, exports, duplicated fields, and external handoffs;
5. time to find the current approved version and its governing usage rights;
6. time to answer how much the creator has earned and why;
7. permission, retry, mobile, accessibility, and recovery failures;
8. output quality and reviewer confidence.

Competitive parity requires no material normal-workflow deficit. Connected
superiority requires at least 25% less active operator time or 50% fewer manual
cross-application handoffs without weaker quality, control, or evidence.

## External gates

- authorized ad-account attribution and live provider receipts;
- funded creator settlement and payout confirmation;
- tax, contractor, contest, disclosure, usage-rights, dispute, and legal terms
  approved by the responsible operator and counsel;
- an authorized Trybe account and human side-by-side benchmark.
