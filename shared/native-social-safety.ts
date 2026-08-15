import { z } from "zod";

export const userSafetyControlSchema = z
  .object({
    muted: z.boolean(),
    restricted: z.boolean(),
  })
  .strict();

export const commentModerationActionSchema = z
  .object({ action: z.enum(["approve", "remove"]) })
  .strict();

export type UserSafetyControlInput = z.infer<typeof userSafetyControlSchema>;
export type CommentModerationAction = z.infer<
  typeof commentModerationActionSchema
>["action"];
