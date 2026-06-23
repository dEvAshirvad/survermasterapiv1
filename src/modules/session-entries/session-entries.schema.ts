import type { InferSchemaType, Types } from 'mongoose';

import { model, Schema } from 'mongoose';
import { z } from 'zod';

const FORM_CODE_REGEX = /^[A-O]$/;

export const sessionEntryStatusSchema = z.enum(['draft', 'submitted']);

export const sessionEntriesListQuerySchema = z.object({
  formCode: z.string().regex(FORM_CODE_REGEX).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const sessionEntryParamsSchema = z.object({
  id: z.string().trim().min(1),
  entryId: z.string().trim().min(1),
});

export const sessionParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export const sessionFormParamsSchema = z.object({
  id: z.string().trim().min(1),
  formCode: z.string().regex(FORM_CODE_REGEX),
});

export const createSessionEntryBodySchema = z.object({
  formCode: z.string().regex(FORM_CODE_REGEX),
});

export const sessionEntryProgressSchema = z.object({
  answered: z.coerce.number().int().min(0),
  totalVisible: z.coerce.number().int().min(0),
  percent: z.coerce.number().min(0).max(100),
});

const bilingualValueSchema = z.object({
  en: z.string(),
  hi: z.string(),
});

const entryAnswerItemSchema = z.object({
  title: bilingualValueSchema,
  uom: bilingualValueSchema,
  answer: z.unknown(),
});

const contextSnapshotPatchSchema = z.object({
  surveyDate: z.coerce.date().optional(),
  surveyorName: z.string().trim().min(1).max(100).optional(),
  surveyorNameNIT: z.string().trim().min(1).max(100).optional(),
});

export const patchSessionEntryBodySchema = z
  .object({
    answers: z.array(entryAnswerItemSchema).optional(),
    progress: sessionEntryProgressSchema.optional(),
    contextSnapshot: contextSnapshotPatchSchema.optional(),
    expectedVersion: z.coerce.number().int().min(0),
  })
  .refine(
    value =>
      value.answers !== undefined
      || value.progress !== undefined
      || value.contextSnapshot !== undefined,
    {
      message: 'Either answers, progress, or contextSnapshot must be provided.',
      path: ['answers'],
    },
  )
  .refine(
    value =>
      value.contextSnapshot === undefined || Object.keys(value.contextSnapshot).length > 0,
    {
      message: 'contextSnapshot must include at least one editable field.',
      path: ['answers'],
    },
  );

const sessionEntryProgressMongooseSchema = new Schema(
  {
    answered: { type: Number, required: true, min: 0, default: 0 },
    totalVisible: { type: Number, required: true, min: 0, default: 0 },
    percent: { type: Number, required: true, min: 0, max: 100, default: 0 },
  },
  { _id: false },
);

const contextSnapshotMongooseSchema = new Schema(
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

const sessionEntryMongooseSchema = new Schema(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      index: true,
    },
    formCode: {
      type: String,
      required: true,
      uppercase: true,
      match: FORM_CODE_REGEX,
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'submitted'],
      default: 'draft',
    },
    answers: { type: [Schema.Types.Mixed], required: true, default: [] },
    progress: { type: sessionEntryProgressMongooseSchema, required: true, default: () => ({}) },
    contextSnapshot: { type: contextSnapshotMongooseSchema, required: true },
    version: { type: Number, required: true, min: 0, default: 0 },
    submittedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'session_entries',
  },
);

sessionEntryMongooseSchema.index({ sessionId: 1, formCode: 1, createdAt: -1 });
sessionEntryMongooseSchema.index({ sessionId: 1, status: 1, updatedAt: -1 });
sessionEntryMongooseSchema.index(
  { sessionId: 1, formCode: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

export type SessionEntryDocument = InferSchemaType<
  typeof sessionEntryMongooseSchema
> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionEntryLean = SessionEntryDocument;
export type CreateSessionEntryInput = z.infer<typeof createSessionEntryBodySchema>;
export type PatchSessionEntryInput = z.infer<typeof patchSessionEntryBodySchema>;

export const SessionEntryModel = model('SessionEntry', sessionEntryMongooseSchema);
