import { z } from "zod";

export const communityRoles = ["owner", "admin", "moderator", "member"] as const;
export const communityMemberStatuses = ["active", "muted", "banned"] as const;

export type CommunityRole = (typeof communityRoles)[number];
export type CommunityMemberStatus = (typeof communityMemberStatuses)[number];

const managerRoles = new Set<CommunityRole>(["owner", "admin"]);
const moderatableRoles = new Set<CommunityRole>(["moderator", "member"]);

export const createCommunityInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(1_000),
    iconColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

export const createCommunityChannelInputSchema = z
  .object({
    communityId: z.number().int().positive(),
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const updateCommunityMemberInputSchema = z.union([
  z.object({ role: z.enum(communityRoles) }).strict(),
  z
    .object({
      status: z.enum(communityMemberStatuses),
      reason: z.string().trim().max(500).optional(),
    })
    .strict(),
]);

export function isCommunityRole(value: unknown): value is CommunityRole {
  return typeof value === "string" && communityRoles.includes(value as CommunityRole);
}

export function isCommunityMemberStatus(value: unknown): value is CommunityMemberStatus {
  return typeof value === "string" && communityMemberStatuses.includes(value as CommunityMemberStatus);
}

export function canManageCommunityMember(actor: { userId: number; role: string }, target: { userId: number; role: string }) {
  if (actor.userId === target.userId || !managerRoles.has(actor.role as CommunityRole)) return false;
  if (!isCommunityRole(target.role) || target.role === "owner") return false;
  return actor.role === "owner" || target.role === "moderator" || target.role === "member";
}

export function canAssignCommunityRole(actor: { userId: number; role: string }, target: { userId: number; role: string }, nextRole: unknown) {
  if (!canManageCommunityMember(actor, target) || !isCommunityRole(nextRole) || nextRole === "owner") return false;
  return actor.role === "owner" || nextRole === "moderator" || nextRole === "member";
}

export function canModerateCommunityMember(actor: { userId: number; role: string }, target: { userId: number; role: string }, nextStatus: unknown) {
  return canManageCommunityMember(actor, target)
    && moderatableRoles.has(target.role as CommunityRole)
    && isCommunityMemberStatus(nextStatus);
}

export function canContributeToCommunity(status: string | null | undefined) {
  return status !== "muted" && status !== "banned";
}
