export const NATIVE_COMMENT_CREATED_EVENT = "native.comment.created";
export const NATIVE_DM_RECEIVED_EVENT = "native.dm.received";

export const NATIVE_SOCIAL_EVENT_TYPES = [
  NATIVE_COMMENT_CREATED_EVENT,
  NATIVE_DM_RECEIVED_EVENT,
] as const;

export type NativeKeywordMatchMode = "exact" | "contains" | "starts_with";

const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "cancel", "end", "quit"]);
const OPT_IN_WORDS = new Set(["start", "subscribe", "resume", "unstop"]);

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizedCommand(value: unknown) {
  return normalizedText(value).toLocaleLowerCase().replace(/[.!?,;:]+$/g, "");
}

export function messagingConsentCommand(content: unknown): "opt_out" | "opt_in" | null {
  const command = normalizedCommand(content);
  if (OPT_OUT_WORDS.has(command)) return "opt_out";
  if (OPT_IN_WORDS.has(command)) return "opt_in";
  return null;
}

export function matchesNativeSocialTrigger(
  triggerConfig: Record<string, unknown>,
  eventType: string,
  payload: Record<string, unknown>,
) {
  if (triggerConfig.eventType !== eventType) return false;
  if (!NATIVE_SOCIAL_EVENT_TYPES.includes(eventType as (typeof NATIVE_SOCIAL_EVENT_TYPES)[number])) return true;
  if (payload.automated === true || payload.optedOut === true) return false;

  const content = normalizedText(payload.content);
  if (!content) return false;

  const configuredKeywords = Array.isArray(triggerConfig.keywords)
    ? triggerConfig.keywords
    : typeof triggerConfig.keyword === "string"
      ? [triggerConfig.keyword]
      : [];
  const keywords = configuredKeywords
    .filter((keyword): keyword is string => typeof keyword === "string")
    .map(normalizedText)
    .filter(Boolean)
    .slice(0, 20);
  if (keywords.length === 0) return false;

  if (eventType === NATIVE_COMMENT_CREATED_EVENT) {
    if (triggerConfig.topLevelOnly !== false && payload.parentId != null) return false;
    if (typeof triggerConfig.postId === "number" && payload.postId !== triggerConfig.postId) return false;
  }

  const caseSensitive = triggerConfig.caseSensitive === true;
  const haystack = caseSensitive ? content : content.toLocaleLowerCase();
  const mode: NativeKeywordMatchMode = triggerConfig.matchMode === "contains" || triggerConfig.matchMode === "starts_with"
    ? triggerConfig.matchMode
    : "exact";

  return keywords.some((keyword) => {
    const needle = caseSensitive ? keyword : keyword.toLocaleLowerCase();
    if (mode === "contains") return haystack.includes(needle);
    if (mode === "starts_with") return haystack.startsWith(needle);
    return haystack === needle;
  });
}

export function validateNativeSocialTriggerConfig(triggerConfig: Record<string, unknown>) {
  const eventType = triggerConfig.eventType;
  if (!NATIVE_SOCIAL_EVENT_TYPES.includes(eventType as (typeof NATIVE_SOCIAL_EVENT_TYPES)[number])) return;
  const keywords = Array.isArray(triggerConfig.keywords) ? triggerConfig.keywords : [];
  if (keywords.length < 1 || keywords.length > 20 || keywords.some((keyword) => typeof keyword !== "string" || keyword.trim().length < 1 || keyword.trim().length > 100)) {
    throw new Error("Native social automations need between 1 and 20 keywords");
  }
  if (triggerConfig.matchMode != null && !["exact", "contains", "starts_with"].includes(String(triggerConfig.matchMode))) {
    throw new Error("Native social automations need exact, contains, or starts_with matching");
  }
  if (triggerConfig.postId != null && (typeof triggerConfig.postId !== "number" || !Number.isInteger(triggerConfig.postId) || triggerConfig.postId <= 0)) {
    throw new Error("Native comment automation postId must be a positive integer");
  }
}
