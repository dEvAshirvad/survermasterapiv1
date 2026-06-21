import type { PipelineStage } from 'mongoose';

import { Types } from 'mongoose';

import type { AdminFiltersInput } from '@/modules/admin/admin.schema';

import {
  calculateSkip,
  createPaginationResult,
} from '@/lib/paginator';
import { SessionEntryModel } from '@/modules/session-entries/session-entries.schema';
import { SessionModel } from '@/modules/sessions/sessions.schema';

export const TOTAL_FORMS = 15;
export const FORM_CODES = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
] as const;

export interface AdminDashboardKpis {
  totalSessions: number;
  totalEntries: number;
  avgProgressPercent: number;
  formsTouched: number;
  totalForms: number;
  entriesUpdatedLast7Days: number;
}

export interface AdminFormProgressItem {
  formCode: string;
  entryCount: number;
  avgPercent: number;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
}

export interface AdminProgressBucket {
  bucket: string;
  count: number;
}

export interface AdminGeographyItem {
  district: string;
  block: string;
  sessionCount: number;
  entryCount: number;
  avgPercent: number;
}

export interface AdminTimelineItem {
  date: string;
  entriesCreated: number;
  entriesUpdated: number;
}

export interface AdminMiningSplitItem {
  area: 'direct' | 'indirect';
  entryCount: number;
  avgPercent: number;
}

export interface AdminDashboardData {
  kpis: AdminDashboardKpis;
  formProgress: AdminFormProgressItem[];
  progressBuckets: AdminProgressBucket[];
  geography: AdminGeographyItem[];
  timeline: AdminTimelineItem[];
  miningSplit: AdminMiningSplitItem[];
}

export interface AdminSessionProgressRow {
  sessionId: string;
  title: string;
  district: string;
  block: string;
  gramPanchayat: string;
  village: string;
  surveyDate: string;
  entryCount: number;
  formsTouched: number;
  avgProgressPercent: number;
  lastUpdatedAt: string;
}

export interface AdminSessionDrillDownEntry {
  id: string;
  formCode: string;
  percent: number;
  surveyorName: string;
  updatedAt: string;
}

export interface AdminSessionFormProgress {
  formCode: string;
  entryCount: number;
  avgPercent: number;
  latestUpdatedAt: string | null;
}

export interface AdminSessionDrillDown {
  session: {
    id: string;
    title: string;
    context: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  kpis: {
    entryCount: number;
    formsTouched: number;
    avgProgressPercent: number;
    totalForms: number;
  };
  formProgress: AdminSessionFormProgress[];
  entries: AdminSessionDrillDownEntry[];
}

function buildBasePipeline(filters: AdminFiltersInput): PipelineStage[] {
  const stages: PipelineStage[] = [
    { $match: { deletedAt: null } },
  ];

  if (filters.formCode) {
    stages.push({ $match: { formCode: filters.formCode } });
  }

  const dateMatch: Record<string, Date> = {};
  if (filters.from) {
    dateMatch.$gte = filters.from;
  }
  if (filters.to) {
    dateMatch.$lte = filters.to;
  }
  if (Object.keys(dateMatch).length > 0) {
    stages.push({ $match: { updatedAt: dateMatch } });
  }

  stages.push(
    {
      $lookup: {
        from: 'sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
  );

  const geoMatch: Record<string, string> = {};
  if (filters.district) {
    geoMatch['session.context.district'] = filters.district;
  }
  if (filters.block) {
    geoMatch['session.context.block'] = filters.block;
  }
  if (filters.gramPanchayat) {
    geoMatch['session.context.gramPanchayat'] = filters.gramPanchayat;
  }
  if (Object.keys(geoMatch).length > 0) {
    stages.push({ $match: geoMatch });
  }

  return stages;
}

type FormProgressAggregateRow = Omit<AdminFormProgressItem, 'formCode'> & {
  formCode?: string;
};

function normalizeFormProgress(
  rows: FormProgressAggregateRow[],
): AdminFormProgressItem[] {
  const byCode = new Map<string, AdminFormProgressItem>();
  for (const row of rows) {
    if (row.formCode) {
      byCode.set(row.formCode, { ...row, formCode: row.formCode });
    }
  }

  return FORM_CODES.map((formCode) => {
    const existing = byCode.get(formCode);
    if (existing) {
      return existing;
    }
    return {
      formCode,
      entryCount: 0,
      avgPercent: 0,
      completedCount: 0,
      inProgressCount: 0,
      notStartedCount: 0,
    };
  });
}

function bucketForPercent(percent: number): string {
  if (percent >= 100) {
    return '100';
  }
  if (percent >= 76) {
    return '76-99';
  }
  if (percent >= 51) {
    return '51-75';
  }
  if (percent >= 26) {
    return '26-50';
  }
  return '0-25';
}

const BUCKET_ORDER = ['0-25', '26-50', '51-75', '76-99', '100'];

function normalizeBuckets(rows: AdminProgressBucket[]): AdminProgressBucket[] {
  const byBucket = new Map(rows.map(row => [row.bucket, row.count]));
  return BUCKET_ORDER.map(bucket => ({
    bucket,
    count: byBucket.get(bucket) ?? 0,
  }));
}

function mergeTimeline(
  created: Array<{ _id: string; count: number }>,
  updated: Array<{ _id: string; count: number }>,
): AdminTimelineItem[] {
  const dates = new Set<string>();
  for (const row of created) {
    dates.add(row._id);
  }
  for (const row of updated) {
    dates.add(row._id);
  }

  const createdMap = new Map(created.map(row => [row._id, row.count]));
  const updatedMap = new Map(updated.map(row => [row._id, row.count]));

  return [...dates]
    .sort()
    .map(date => ({
      date,
      entriesCreated: createdMap.get(date) ?? 0,
      entriesUpdated: updatedMap.get(date) ?? 0,
    }));
}

export class AdminAnalyticsRepository {
  async getDashboard(filters: AdminFiltersInput): Promise<AdminDashboardData> {
    const basePipeline = buildBasePipeline(filters);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [facetResult] = await SessionEntryModel.aggregate<{
      kpis: Array<{
        totalEntries: number;
        totalSessions: number;
        avgProgressPercent: number;
        formsTouched: number;
        entriesUpdatedLast7Days: number;
      }>;
      formProgress: AdminFormProgressItem[];
      progressBuckets: Array<{ bucket: string; count: number }>;
      geography: AdminGeographyItem[];
      miningSplit: AdminMiningSplitItem[];
      timelineCreated: Array<{ _id: string; count: number }>;
      timelineUpdated: Array<{ _id: string; count: number }>;
    }>([
      ...basePipeline,
      {
        $facet: {
          kpis: [
            {
              $group: {
                _id: null,
                totalEntries: { $sum: 1 },
                sessionIds: { $addToSet: '$sessionId' },
                formCodes: { $addToSet: '$formCode' },
                avgProgressPercent: { $avg: '$progress.percent' },
                entriesUpdatedLast7Days: {
                  $sum: {
                    $cond: [{ $gte: ['$updatedAt', sevenDaysAgo] }, 1, 0],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                totalEntries: 1,
                totalSessions: { $size: '$sessionIds' },
                formsTouched: { $size: '$formCodes' },
                avgProgressPercent: {
                  $round: [{ $ifNull: ['$avgProgressPercent', 0] }, 1],
                },
                entriesUpdatedLast7Days: 1,
              },
            },
          ],
          formProgress: [
            {
              $group: {
                _id: '$formCode',
                entryCount: { $sum: 1 },
                avgPercent: { $avg: '$progress.percent' },
                completedCount: {
                  $sum: {
                    $cond: [{ $gte: ['$progress.percent', 100] }, 1, 0],
                  },
                },
                inProgressCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gt: ['$progress.percent', 0] },
                          { $lt: ['$progress.percent', 100] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                notStartedCount: {
                  $sum: {
                    $cond: [{ $eq: ['$progress.percent', 0] }, 1, 0],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                formCode: '$_id',
                entryCount: 1,
                avgPercent: { $round: [{ $ifNull: ['$avgPercent', 0] }, 1] },
                completedCount: 1,
                inProgressCount: 1,
                notStartedCount: 1,
              },
            },
            { $sort: { formCode: 1 } },
          ],
          progressBuckets: [
            {
              $group: {
                _id: {
                  $switch: {
                    branches: [
                      {
                        case: { $gte: ['$progress.percent', 100] },
                        then: '100',
                      },
                      {
                        case: { $gte: ['$progress.percent', 76] },
                        then: '76-99',
                      },
                      {
                        case: { $gte: ['$progress.percent', 51] },
                        then: '51-75',
                      },
                      {
                        case: { $gte: ['$progress.percent', 26] },
                        then: '26-50',
                      },
                    ],
                    default: '0-25',
                  },
                },
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                bucket: '$_id',
                count: 1,
              },
            },
          ],
          geography: [
            {
              $group: {
                _id: {
                  district: '$session.context.district',
                  block: '$session.context.block',
                },
                sessionIds: { $addToSet: '$sessionId' },
                entryCount: { $sum: 1 },
                avgPercent: { $avg: '$progress.percent' },
              },
            },
            {
              $project: {
                _id: 0,
                district: '$_id.district',
                block: '$_id.block',
                sessionCount: { $size: '$sessionIds' },
                entryCount: 1,
                avgPercent: { $round: [{ $ifNull: ['$avgPercent', 0] }, 1] },
              },
            },
            { $sort: { entryCount: -1 } },
            { $limit: 20 },
          ],
          miningSplit: [
            {
              $group: {
                _id: '$session.context.miningAffectedArea',
                entryCount: { $sum: 1 },
                avgPercent: { $avg: '$progress.percent' },
              },
            },
            {
              $project: {
                _id: 0,
                area: '$_id',
                entryCount: 1,
                avgPercent: { $round: [{ $ifNull: ['$avgPercent', 0] }, 1] },
              },
            },
          ],
          timelineCreated: [
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          timelineUpdated: [
            { $match: { updatedAt: { $gte: thirtyDaysAgo } } },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const kpiRow = facetResult?.kpis[0];

    return {
      kpis: {
        totalSessions: kpiRow?.totalSessions ?? 0,
        totalEntries: kpiRow?.totalEntries ?? 0,
        avgProgressPercent: kpiRow?.avgProgressPercent ?? 0,
        formsTouched: kpiRow?.formsTouched ?? 0,
        totalForms: TOTAL_FORMS,
        entriesUpdatedLast7Days: kpiRow?.entriesUpdatedLast7Days ?? 0,
      },
      formProgress: normalizeFormProgress(facetResult?.formProgress ?? []),
      progressBuckets: normalizeBuckets(facetResult?.progressBuckets ?? []),
      geography: facetResult?.geography ?? [],
      timeline: mergeTimeline(
        facetResult?.timelineCreated ?? [],
        facetResult?.timelineUpdated ?? [],
      ),
      miningSplit: (facetResult?.miningSplit ?? []).map(row => ({
        area: row.area as 'direct' | 'indirect',
        entryCount: row.entryCount,
        avgPercent: row.avgPercent,
      })),
    };
  }

  async listSessionsProgress(
    filters: AdminFiltersInput,
    page: number,
    limit: number,
  ) {
    const basePipeline = buildBasePipeline(filters);
    const skip = calculateSkip(page, limit);

    const [facetResult] = await SessionEntryModel.aggregate<{
      data: Array<{
        sessionId: Types.ObjectId;
        title: string;
        district: string;
        block: string;
        gramPanchayat: string;
        village: string;
        surveyDate: Date;
        entryCount: number;
        formsTouched: string[];
        avgProgressPercent: number;
        lastUpdatedAt: Date;
      }>;
      total: Array<{ count: number }>;
    }>([
      ...basePipeline,
      {
        $group: {
          _id: '$sessionId',
          title: { $first: '$session.title' },
          district: { $first: '$session.context.district' },
          block: { $first: '$session.context.block' },
          gramPanchayat: { $first: '$session.context.gramPanchayat' },
          village: { $first: '$session.context.village' },
          surveyDate: { $first: '$session.context.surveyDate' },
          entryCount: { $sum: 1 },
          formsTouched: { $addToSet: '$formCode' },
          avgProgressPercent: { $avg: '$progress.percent' },
          lastUpdatedAt: { $max: '$updatedAt' },
        },
      },
      { $sort: { lastUpdatedAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                sessionId: { $toString: '$_id' },
                title: 1,
                district: 1,
                block: 1,
                gramPanchayat: 1,
                village: 1,
                surveyDate: {
                  $dateToString: { format: '%Y-%m-%d', date: '$surveyDate' },
                },
                entryCount: 1,
                formsTouched: { $size: '$formsTouched' },
                avgProgressPercent: {
                  $round: [{ $ifNull: ['$avgProgressPercent', 0] }, 1],
                },
                lastUpdatedAt: 1,
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    const rows = (facetResult?.data ?? []).map(row => ({
      sessionId: row.sessionId,
      title: row.title,
      district: row.district,
      block: row.block,
      gramPanchayat: row.gramPanchayat,
      village: row.village,
      surveyDate: row.surveyDate,
      entryCount: row.entryCount,
      formsTouched: row.formsTouched,
      avgProgressPercent: row.avgProgressPercent,
      lastUpdatedAt: row.lastUpdatedAt.toISOString(),
    }));

    const total = facetResult?.total[0]?.count ?? 0;
    return createPaginationResult(rows, total, page, limit);
  }

  async getSessionDrillDown(sessionId: string): Promise<AdminSessionDrillDown | null> {
    const session = await SessionModel.findById(sessionId).lean().exec();
    if (!session) {
      return null;
    }

    const objectId = new Types.ObjectId(sessionId);

    const [formProgressRows, entries, kpiRow] = await Promise.all([
      SessionEntryModel.aggregate<AdminSessionFormProgress>([
        {
          $match: {
            sessionId: objectId,
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: '$formCode',
            entryCount: { $sum: 1 },
            avgPercent: { $avg: '$progress.percent' },
            latestUpdatedAt: { $max: '$updatedAt' },
          },
        },
        {
          $project: {
            _id: 0,
            formCode: '$_id',
            entryCount: 1,
            avgPercent: { $round: [{ $ifNull: ['$avgPercent', 0] }, 1] },
            latestUpdatedAt: 1,
          },
        },
        { $sort: { formCode: 1 } },
      ]),
      SessionEntryModel.find({
        sessionId: objectId,
        deletedAt: null,
      })
        .sort({ updatedAt: -1 })
        .select('formCode progress contextSnapshot updatedAt')
        .lean()
        .exec(),
      SessionEntryModel.aggregate<{
        entryCount: number;
        formsTouched: number;
        avgProgressPercent: number;
      }>([
        {
          $match: {
            sessionId: objectId,
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: null,
            entryCount: { $sum: 1 },
            formCodes: { $addToSet: '$formCode' },
            avgProgressPercent: { $avg: '$progress.percent' },
          },
        },
        {
          $project: {
            _id: 0,
            entryCount: 1,
            formsTouched: { $size: '$formCodes' },
            avgProgressPercent: {
              $round: [{ $ifNull: ['$avgProgressPercent', 0] }, 1],
            },
          },
        },
      ]),
    ]);

    const formByCode = new Map(
      formProgressRows.map(row => [
        row.formCode,
        {
          ...row,
          latestUpdatedAt: row.latestUpdatedAt
            ? new Date(row.latestUpdatedAt).toISOString()
            : null,
        },
      ]),
    );

    const formProgress = FORM_CODES.map((formCode) => {
      const existing = formByCode.get(formCode);
      if (existing) {
        return existing;
      }
      return {
        formCode,
        entryCount: 0,
        avgPercent: 0,
        latestUpdatedAt: null,
      };
    });

    const context = session.context as Record<string, unknown>;
    if (context.surveyDate instanceof Date) {
      context.surveyDate = context.surveyDate.toISOString().slice(0, 10);
    }

    const kpi = kpiRow[0];

    return {
      session: {
        id: String(session._id),
        title: session.title,
        context,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      kpis: {
        entryCount: kpi?.entryCount ?? 0,
        formsTouched: kpi?.formsTouched ?? 0,
        avgProgressPercent: kpi?.avgProgressPercent ?? 0,
        totalForms: TOTAL_FORMS,
      },
      formProgress,
      entries: entries.map(entry => ({
        id: String(entry._id),
        formCode: entry.formCode,
        percent: entry.progress?.percent ?? 0,
        surveyorName: entry.contextSnapshot?.surveyorName ?? '',
        updatedAt: entry.updatedAt.toISOString(),
      })),
    };
  }
}

export const adminAnalyticsRepository = new AdminAnalyticsRepository();

// Exported for tests
export { bucketForPercent };
