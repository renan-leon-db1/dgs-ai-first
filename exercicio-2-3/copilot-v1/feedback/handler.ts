import type { FeedbackInput, FeedbackOutput } from './schema';

export type FeedbackDeps = {
	generateFeedbackId?: () => string;
	now?: () => Date;
};

export async function handleFeedback(
	input: FeedbackInput,
	deps: FeedbackDeps = {},
): Promise<FeedbackOutput> {
	const generateFeedbackId = deps.generateFeedbackId ?? (() => globalThis.crypto.randomUUID());
	const now = deps.now ?? (() => new Date());

	return {
		feedbackId: generateFeedbackId(),
		status: 'registered',
		registeredAt: now().toISOString(),
		feedback: input,
	};
}
