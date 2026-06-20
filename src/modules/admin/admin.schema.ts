import { z } from 'zod';

const FORM_CODE_REGEX = /^[A-O]$/;
const filterString = z.string().trim().min(1).max(200);

export const adminFiltersQuerySchema = z.object({
  district: filterString.optional(),
  block: filterString.optional(),
  gramPanchayat: filterString.optional(),
  formCode: z.string().regex(FORM_CODE_REGEX).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const adminSessionsQuerySchema = adminFiltersQuerySchema.extend({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const adminSessionIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export type AdminFiltersInput = z.infer<typeof adminFiltersQuerySchema>;
export type AdminSessionsQueryInput = z.infer<typeof adminSessionsQuerySchema>;
