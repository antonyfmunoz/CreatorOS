export type NormalizedPostPoll = { question: string; options: string[] };

export function normalizePostPoll(value: unknown): NormalizedPostPoll | null {
  if (value === undefined || value === null || value === "") return null;
  let candidate: unknown = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value);
    } catch {
      throw new Error("Poll data must be valid JSON");
    }
  }
  if (typeof candidate !== "object" || candidate === null) throw new Error("Poll data is invalid");
  const record = candidate as { question?: unknown; options?: unknown };
  const question = typeof record.question === "string" ? record.question.replace(/\s+/g, " ").trim() : "";
  if (!question || question.length > 280) throw new Error("Poll question must be between 1 and 280 characters");
  if (!Array.isArray(record.options) || record.options.length < 2 || record.options.length > 4) throw new Error("Polls require between 2 and 4 options");
  const options = record.options.map((option) => typeof option === "string" ? option.replace(/\s+/g, " ").trim() : "");
  if (options.some((option) => !option || option.length > 120)) throw new Error("Poll options must be between 1 and 120 characters");
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) throw new Error("Poll options must be unique");
  return { question, options };
}
