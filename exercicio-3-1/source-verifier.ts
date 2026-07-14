import type { QueryResponse } from '@/shared/schemas/query';
import {
	ValidSourceDocumentSchema,
	type VerificationResult,
} from '@/shared/schemas/verification';

export function verifySourceDocument(response: QueryResponse): VerificationResult {
	const sourceValidation = ValidSourceDocumentSchema.safeParse(response.source_document);

	if (sourceValidation.success) {
		return {
			isValid: true,
			suspicious: false,
		};
	}

	const isMissingOrEmptySource =
		typeof response.source_document !== 'string' || response.source_document.trim().length === 0;

	if (isMissingOrEmptySource) {
		return {
			isValid: false,
			suspicious: true,
			reason: 'source_document is missing or empty',
		};
	}

	return {
		isValid: false,
		suspicious: true,
		reason: `source_document "${response.source_document}" is not in the valid source list`,
	};
}