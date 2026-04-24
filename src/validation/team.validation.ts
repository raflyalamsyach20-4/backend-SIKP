import { z } from 'zod';
import { ValidationRules } from '@/constants';

/**
 * Create Team Schema
 */
export const createTeamSchema = z.object({
  namaTeam: z.string()
    .min(ValidationRules.TEAM_NAME_MIN_LENGTH, 
      `Team name must be at least ${ValidationRules.TEAM_NAME_MIN_LENGTH} characters`)
    .max(ValidationRules.TEAM_NAME_MAX_LENGTH,
      `Team name must not exceed ${ValidationRules.TEAM_NAME_MAX_LENGTH} characters`),
  description: z.string().optional(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

/**
 * Invite Member Schema
 */
export const inviteMemberSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * Respond to Invitation Schema
 */
export const respondToInvitationSchema = z.object({
  accept: z.boolean(),
});

export type RespondToInvitationInput = z.infer<typeof respondToInvitationSchema>;

/**
 * Join Team Schema
 */
export const joinTeamSchema = z.object({
  teamCode: z.string()
    .length(ValidationRules.TEAM_CODE_LENGTH, 
      `Team code must be exactly ${ValidationRules.TEAM_CODE_LENGTH} characters`),
});

export type JoinTeamInput = z.infer<typeof joinTeamSchema>;

/**
 * Team ID Parameter Schema
 */
export const teamIdParamSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required'),
});

export type TeamIdParam = z.infer<typeof teamIdParamSchema>;

/**
 * Member ID Parameter Schema
 */
export const memberIdParamSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
});

export type MemberIdParam = z.infer<typeof memberIdParamSchema>;

/**
 * Team Code Parameter Schema
 */
export const teamCodeParamSchema = z.object({
  teamCode: z.string()
    .length(ValidationRules.TEAM_CODE_LENGTH,
      `Team code must be exactly ${ValidationRules.TEAM_CODE_LENGTH} characters`),
});

export type TeamCodeParam = z.infer<typeof teamCodeParamSchema>;
