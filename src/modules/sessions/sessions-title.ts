import type { z } from 'zod';

import type { sessionContextSchema } from '@/modules/sessions/sessions.schema';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

type SessionContext = z.infer<typeof sessionContextSchema>;

export function buildSessionTitle(
  context: Pick<SessionContext, 'district' | 'block' | 'gramPanchayat' | 'village' | 'surveyDate'>,
) {
  const surveyDate = context.surveyDate instanceof Date
    ? context.surveyDate
    : new Date(context.surveyDate);
  const month = MONTH_NAMES[surveyDate.getMonth()] ?? 'Unknown';
  const year = surveyDate.getFullYear();
  const title = `${context.district} ${context.block} ${context.gramPanchayat} ${context.village} - ${month} ${year}`;

  return title.slice(0, 200);
}
