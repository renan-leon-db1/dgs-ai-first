import { describe, expect, it } from 'vitest';

import { verifySourceDocument } from '@/services/verification/source-verifier';
import type { QueryResponse } from '@/shared/schemas/query';

describe('verifySourceDocument', () => {
	it('returns valid and non-suspicious for a whitelisted source_document', () => {
		const response: QueryResponse = {
			answer: 'A política de devolução é de 30 dias.',
			source_document: 'POL-001',
			confidence: 0.95,
		};

		const result = verifySourceDocument(response);

		expect(result).toEqual({
			isValid: true,
			suspicious: false,
		});
	});

	it('returns invalid and suspicious for a non-whitelisted source_document', () => {
		const response: QueryResponse = {
			answer: 'Consulte o procedimento interno atualizado.',
			source_document: 'UNKNOWN-DOC',
			confidence: 0.7,
		};

		const result = verifySourceDocument(response);

		expect(result.isValid).toBe(false);
		expect(result.suspicious).toBe(true);
		expect(result.reason).toContain('not in the valid source list');
	});

	it('returns invalid and suspicious for empty or undefined source_document', () => {
		const emptySourceResponse: QueryResponse = {
			answer: 'Não há fonte associada.',
			source_document: '',
			confidence: 0.4,
		};

		const undefinedSourceResponse = {
			answer: 'Não há fonte associada.',
			source_document: undefined,
			confidence: 0.4,
		} as unknown as QueryResponse;

		const emptyResult = verifySourceDocument(emptySourceResponse);
		const undefinedResult = verifySourceDocument(undefinedSourceResponse);

		expect(emptyResult).toEqual({
			isValid: false,
			suspicious: true,
			reason: 'source_document is missing or empty',
		});

		expect(undefinedResult).toEqual({
			isValid: false,
			suspicious: true,
			reason: 'source_document is missing or empty',
		});
	});
});