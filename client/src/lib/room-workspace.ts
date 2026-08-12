export function roomDueDateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getUTCFullYear() === new Date().getFullYear() ? undefined : "numeric",
    // A due date is a calendar day, not a moment in the viewer's timezone.
    // The server stores date-only input at UTC midnight, so render it in UTC
    // to prevent the selected day shifting backward in western timezones.
    timeZone: "UTC",
  }).format(date);
}
