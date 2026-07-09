import {
	app,
	type HttpRequest,
	type HttpResponseInit,
	type InvocationContext,
} from '@azure/functions';

import { ValidationError, mapErrorToResponse } from '@/shared/errors';
import { logger } from '@/shared/logger';

import { handleFeedback } from './handler';
import { FeedbackInputSchema, FeedbackOutputSchema } from './schema';

export async function feedback(
	request: HttpRequest,
	_context: InvocationContext,
): Promise<HttpResponseInit> {
	const requestId = request.headers.get('x-request-id') ?? globalThis.crypto.randomUUID();
	const log = logger.child({ requestId, function: 'feedback' });
	const startedAt = Date.now();

	log.info({ method: request.method, url: request.url }, 'request started');

	try {
		const rawBody: unknown = await request.json().catch((error: unknown) => {
			throw new ValidationError('Request body must be valid JSON', { cause: error });
		});

		const parsedInput = FeedbackInputSchema.safeParse(rawBody);
		if (!parsedInput.success) {
			throw new ValidationError('Feedback payload is invalid', {
				details: parsedInput.error.flatten(),
			});
		}

		const result = await handleFeedback(parsedInput.data);
		const output = FeedbackOutputSchema.parse(result);

		log.info(
			{
				sessionId: output.feedback.sessionId,
				feedbackId: output.feedbackId,
				durationMs: Date.now() - startedAt,
			},
			'request completed',
		);

		return {
			status: 201,
			headers: {
				'Content-Type': 'application/json',
				'x-request-id': requestId,
			},
			jsonBody: output,
		};
	} catch (error) {
		log.error({ err: error, durationMs: Date.now() - startedAt }, 'request failed');

		const errorResponse = mapErrorToResponse(error, requestId);
		return {
			status: errorResponse.status,
			headers: {
				'Content-Type': 'application/json',
				'x-request-id': requestId,
			},
			jsonBody: errorResponse.jsonBody,
		};
	}
}

app.http('feedback', {
	route: 'feedback',
	methods: ['POST'],
	authLevel: 'function',
	handler: feedback,
});