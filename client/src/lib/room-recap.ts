import { roomDueDateLabel } from "./room-workspace";

export type RoomRecapNote = {
  content: string;
  authorDisplayName?: string | null;
  authorUsername?: string | null;
};

export type RoomRecapAction = {
  body: string;
  dueAt?: string | null;
  completedAt?: string | null;
  assigneeDisplayName?: string | null;
  assigneeUsername?: string | null;
};

export function buildRoomRecap({
  title,
  description,
  startsAt,
  notes,
  actions,
}: {
  title: string;
  description?: string | null;
  startsAt: string;
  notes: RoomRecapNote[];
  actions: RoomRecapAction[];
}) {
  const scheduledAt = new Date(startsAt);
  const scheduleLabel = Number.isNaN(scheduledAt.getTime())
    ? startsAt
    : scheduledAt.toLocaleString();
  const lines = [
    `# ${title}`,
    "",
    `Scheduled: ${scheduleLabel}`,
    ...(description?.trim() ? ["", description.trim()] : []),
    "",
    "## Notes and decisions",
    ...(notes.length
      ? notes.map((note) => {
          const author =
            note.authorDisplayName || note.authorUsername || "Room member";
          return `- ${note.content.trim()} — ${author}`;
        })
      : ["- No notes captured."]),
    "",
    "## Action items",
    ...(actions.length
      ? actions.map((action) => {
          const details = [
            action.completedAt ? "completed" : "open",
            action.assigneeDisplayName || action.assigneeUsername
              ? `owner: ${action.assigneeDisplayName || action.assigneeUsername}`
              : null,
            roomDueDateLabel(action.dueAt ?? null)
              ? `due: ${roomDueDateLabel(action.dueAt ?? null)}`
              : null,
          ].filter(Boolean);
          return `- [${action.completedAt ? "x" : " "}] ${action.body.trim()} (${details.join(", ")})`;
        })
      : ["- No action items captured."]),
    "",
    "Generated from the private CreativesOS room workspace.",
  ];
  return lines.join("\n");
}
