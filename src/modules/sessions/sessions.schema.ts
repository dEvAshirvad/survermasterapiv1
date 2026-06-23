import type { InferSchemaType, Types } from 'mongoose';

import { model, Schema } from 'mongoose';
import { z } from 'zod';

function trimmedString(max: number) {
  return z.string().trim().min(1).max(max);
}

function defaultZeroCount() {
  return z.preprocess(
    value => (value === undefined || value === null || value === '' ? 0 : value),
    z.coerce.number().int().min(0),
  ).default(0);
}

export const sessionContextSchema = z.object({
  district: trimmedString(100),
  block: trimmedString(100),
  gramPanchayat: trimmedString(200),
  village: trimmedString(200),
  surveyDate: z.coerce.date(),
  distanceFromNearestMine: defaultZeroCount(),
  totalPopulation: defaultZeroCount(),
  totalHouseholds: defaultZeroCount(),
  scHouseholds: defaultZeroCount(),
  stHouseholds: defaultZeroCount(),
  miningAffectedArea: z.enum(['direct', 'indirect']),
  surveyorName: z.string().trim().min(1).max(100),
  surveyorNameNIT: z.string().trim().min(1).max(100),
});

export const createSessionBodySchema = z.object({
  context: sessionContextSchema,
});

export const updateSessionBodySchema = createSessionBodySchema;

export const sessionIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const sessionFilterString = z.string().trim().min(1).max(200);

export const sessionBlocksQuerySchema = z.object({
  district: sessionFilterString,
});

export const sessionGramPanchayatsQuerySchema = z.object({
  district: sessionFilterString,
  block: sessionFilterString,
});

export const sessionVillagesQuerySchema = z.object({
  district: sessionFilterString,
  block: sessionFilterString,
  gramPanchayat: sessionFilterString,
});

export const sessionSearchQuerySchema = z.object({
  district: sessionFilterString.optional(),
  block: sessionFilterString.optional(),
  gramPanchayat: sessionFilterString.optional(),
  village: sessionFilterString.optional(),
});

const sessionContextMongooseSchema = new Schema(
  {
    district: { type: String, required: true, trim: true },
    block: { type: String, required: true, trim: true },
    gramPanchayat: { type: String, required: true, trim: true },
    village: { type: String, required: true, trim: true },
    surveyDate: { type: Date, required: true },
    distanceFromNearestMine: { type: Number, required: true, min: 0, default: 0 },
    totalPopulation: { type: Number, required: true, min: 0, default: 0 },
    totalHouseholds: { type: Number, required: true, min: 0, default: 0 },
    scHouseholds: { type: Number, required: true, min: 0, default: 0 },
    stHouseholds: { type: Number, required: true, min: 0, default: 0 },
    miningAffectedArea: {
      type: String,
      required: true,
      enum: ['direct', 'indirect'],
    },
    surveyorName: { type: String, required: true, trim: true, maxlength: 100 },
    surveyorNameNIT: { type: String, required: true, trim: true, maxlength: 100 },
  },
  { _id: false },
);

const sessionMongooseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    context: { type: sessionContextMongooseSchema, required: true },
  },
  {
    timestamps: true,
    collection: 'sessions',
  },
);

sessionMongooseSchema.index({ createdAt: -1 });
sessionMongooseSchema.index({ 'context.village': 1, 'createdAt': -1 });
sessionMongooseSchema.index(
  {
    'context.district': 1,
    'context.block': 1,
    'context.gramPanchayat': 1,
  },
  { unique: true },
);

export type SessionDocument = InferSchemaType<typeof sessionMongooseSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionLean = SessionDocument;

export type SessionContextInput = z.infer<typeof sessionContextSchema>;
export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type UpdateSessionBody = z.infer<typeof updateSessionBodySchema>;

export type CreateSessionInput = CreateSessionBody & {
  title: string;
};

export type UpdateSessionInput = UpdateSessionBody & {
  title: string;
};

export interface SessionFormSummaryItem {
  formCode: string;
  total: number;
}

export interface SessionFormsSummaryResponse {
  sessionId: string;
  forms: SessionFormSummaryItem[];
}

export interface SessionSearchFilters {
  district?: string;
  block?: string;
  gramPanchayat?: string;
  village?: string;
}

export const SessionModel = model('Session', sessionMongooseSchema);
