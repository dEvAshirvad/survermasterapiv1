import { z } from 'zod';

const FORM_CODE_REGEX = /^[A-O]$/;

export const exportSessionParamsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const exportFormParamsSchema = z.object({
  sessionId: z.string().trim().min(1),
  formCode: z.string().trim().toUpperCase().regex(FORM_CODE_REGEX),
});

export type ExportSessionParams = z.infer<typeof exportSessionParamsSchema>;
export type ExportFormParams = z.infer<typeof exportFormParamsSchema>;
