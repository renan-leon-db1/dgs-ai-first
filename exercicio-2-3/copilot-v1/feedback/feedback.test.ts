import { describe, expect, it } from 'vitest';

import { handleFeedback } from './handler';

describe('handleFeedback', () => {
	it('returns registered feedback payload with generated metadata', async () => {
		const response = await handleFeedback(
			{
				sessionId: 'session-123',
				questionAsked: 'Qual o prazo de devolucao?',
				responseRating: 5,
				comment: 'Resposta clara',
			},
			{
				generateFeedbackId: () => '3d594650-b0d9-4ca8-9a0f-6b3a0c4bcb23',
				now: () => new Date('2026-07-08T12:00:00.000Z'),
			},
		);

		expect(response).toEqual({
			feedbackId: '3d594650-b0d9-4ca8-9a0f-6b3a0c4bcb23',
			status: 'registered',
			registeredAt: '2026-07-08T12:00:00.000Z',
			feedback: {
				sessionId: 'session-123',
				questionAsked: 'Qual o prazo de devolucao?',
				responseRating: 5,
				comment: 'Resposta clara',
			},
		});
	});

	it('omits optional comment when it is not provided', async () => {
		const response = await handleFeedback(
			{
				sessionId: 'session-456',
				questionAsked: 'A resposta ajudou?',
				responseRating: 4,
			},
			{
				generateFeedbackId: () => '4a35d6cf-9714-4f9e-b24b-1577ef1d1fd2',
				now: () => new Date('2026-07-08T12:30:00.000Z'),
			},
		);

		expect(response.feedback.comment).toBeUndefined();
		expect(response.status).toBe('registered');
	});
});