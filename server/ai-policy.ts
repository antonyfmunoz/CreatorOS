import { z } from "zod";
import type { AIAgent } from "../shared/schema";

const aiAgentFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  icon: z.enum(["Pencil", "Code", "BarChart", "Image", "GraduationCap"]),
  iconColor: z.enum([
    "text-blue-600",
    "text-purple-600",
    "text-green-600",
    "text-pink-600",
    "text-amber-600",
  ]),
  backgroundColor: z.enum([
    "bg-blue-100",
    "bg-purple-100",
    "bg-green-100",
    "bg-pink-100",
    "bg-amber-100",
  ]),
  systemPrompt: z.string().trim().min(1).max(12_000),
};

export const createAiAgentInputSchema = z.object(aiAgentFields).strict();

export const updateAiAgentInputSchema = z
  .object(aiAgentFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one agent field is required",
  });

export const aiChatMessagesSchema = z
  .array(
    z
      .object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(20_000),
        timestamp: z.string().max(100),
      })
      .strict(),
  )
  .max(200);

export const createAiChatInputSchema = z
  .object({
    agentId: z.number().int().positive(),
    messages: aiChatMessagesSchema,
  })
  .strict();

export const aiChatMessageInputSchema = z
  .object({
    agentId: z.number().int().positive(),
    message: z.string().trim().min(1).max(20_000),
  })
  .strict();

export function canUseAiAgent(actorUserId: number, agent: AIAgent): boolean {
  return !agent.isCustom || agent.userId === actorUserId;
}

export function canManageAiAgent(actorUserId: number, agent: AIAgent): boolean {
  return agent.isCustom && agent.userId === actorUserId;
}
