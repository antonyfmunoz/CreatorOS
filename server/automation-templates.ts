export const automationTemplates = [
  {
    id: "content-brief-to-draft",
    name: "Content brief to draft",
    description: "Turn a brief into an editable post draft and notify you when it is ready.",
    triggerType: "manual" as const,
    steps: [
      { stepKey: "compose", name: "Compose draft", actionType: "text.compose", position: 0, approvalPolicy: "none" as const, retryLimit: 1, timeoutMs: 10_000, config: { template: "{{input.brief}}" } },
      { stepKey: "save", name: "Save draft", actionType: "content_draft.create", position: 1, approvalPolicy: "none" as const, retryLimit: 2, timeoutMs: 30_000, config: { kind: "post", audience: "public", content: "{{previous.content}}" } },
      { stepKey: "notify", name: "Notify owner", actionType: "notification.create", position: 2, approvalPolicy: "none" as const, retryLimit: 2, timeoutMs: 30_000, config: { message: "Your automation created a new content draft.", linkTo: "/studio" } },
    ],
  },
  {
    id: "campaign-kickoff",
    name: "Campaign kickoff",
    description: "Draft a campaign plan, pause for approval, then create it in your business workspace.",
    triggerType: "manual" as const,
    steps: [
      { stepKey: "plan", name: "Prepare plan", actionType: "text.compose", position: 0, approvalPolicy: "none" as const, retryLimit: 1, timeoutMs: 10_000, config: { template: "Campaign: {{input.name}} — {{input.description}}" } },
      { stepKey: "create", name: "Create campaign", actionType: "campaign.create", position: 1, approvalPolicy: "consequential" as const, retryLimit: 1, timeoutMs: 30_000, config: { name: "{{input.name}}", description: "{{previous.content}}", objective: "awareness", channel: "organic" } },
      { stepKey: "notify", name: "Notify owner", actionType: "notification.create", position: 2, approvalPolicy: "none" as const, retryLimit: 2, timeoutMs: 30_000, config: { message: "Campaign kickoff completed.", linkTo: "/campaigns" } },
    ],
  },
  {
    id: "meeting-follow-up",
    name: "Meeting follow-up",
    description: "Turn approved meeting notes into a follow-up draft without sending externally.",
    triggerType: "manual" as const,
    steps: [
      { stepKey: "compose", name: "Compose follow-up", actionType: "text.compose", position: 0, approvalPolicy: "none" as const, retryLimit: 1, timeoutMs: 10_000, config: { template: "Follow-up: {{input.notes}}" } },
      { stepKey: "save", name: "Save private draft", actionType: "content_draft.create", position: 1, approvalPolicy: "none" as const, retryLimit: 2, timeoutMs: 30_000, config: { kind: "article", audience: "private", content: "{{previous.content}}" } },
    ],
  },
];
