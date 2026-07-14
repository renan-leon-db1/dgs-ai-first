import { z } from 'zod';

export const VALID_SOURCE_DOCUMENTS = ['POL-001', 'PROC-042', 'PROC-042-v2', 'SLA-2024', 'FAQ-Atendimento'] as const;

export const ValidSourceDocumentSchema = z.enum(VALID_SOURCE_DOCUMENTS);

export const VerificationResultSchema = z.object({
	isValid: z.boolean(),
	suspicious: z.boolean(),
	reason: z.string().optional(),
});

export type ValidSourceDocument = z.infer<typeof ValidSourceDocumentSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;