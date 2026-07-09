import { z } from 'zod';

export const FeedbackInputSchema = z.object({
	sessionId: z.string().trim().min(1),
	questionAsked: z.string().trim().min(1),
	responseRating: z.number().int().min(1).max(5),
	comment: z.string().trim().min(1).optional(),
});

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

export const FeedbackOutputSchema = z.object({
	feedbackId: z.string().uuid(),
	status: z.literal('registered'),
	registeredAt: z.string().datetime(),
	feedback: FeedbackInputSchema,
});

export type FeedbackOutput = z.infer<typeof FeedbackOutputSchema>;