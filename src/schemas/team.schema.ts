import { z } from 'zod';

export const inviteMemberSchema = z.object({
  memberNim: z.string().min(1),
});

export const respondInvitationSchema = z.object({
  accept: z.boolean(),
});
