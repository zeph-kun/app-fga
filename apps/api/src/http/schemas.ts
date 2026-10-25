import { z } from 'zod';
import { SHARED_ROLES } from '../authorization/authorizer.js';

/**
 * A Keycloak username as typed by another user to share with. Trimmed so that
 * whitespace-only input is rejected with 400 instead of reaching the Authorizer,
 * which rejects it as a malformed subject.
 */
export const usernameSchema = z.string().trim().min(1, 'Enter a username.');

/** Who a Share is for: a User by username, or every member of a Team by id. */
export const subjectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), id: usernameSchema }),
  z.object({ type: z.literal('team'), id: z.string().uuid() }),
]);

/** The body of a Share request: who, which role, and for how long (never, if omitted). */
export const shareSchema = z.object({
  subject: subjectSchema,
  role: z.enum(SHARED_ROLES),
  expiresInHours: z.number().positive().max(24 * 365).optional(),
});

/** The body of a Share link request: which role it gives, and for how long it works (forever, if omitted). */
export const shareLinkSchema = z.object({
  role: z.enum(SHARED_ROLES),
  expiresInHours: z.number().positive().max(24 * 365).optional(),
});

/** The body of a comment: 1 to 2,000 characters once trimmed. */
export const commentSchema = z.object({ text: z.string().trim().min(1, 'Write a comment.').max(2000, '2,000 characters at most.') });
