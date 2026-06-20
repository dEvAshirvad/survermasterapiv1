import request from 'supertest';
import { Types } from 'mongoose';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import connectDB, { disconnectDB } from '@/configs/db/mongodb';
import createApp from '@/configs/serverConfig';
import { SessionEntryModel } from '@/modules/session-entries/session-entries.schema';
import { SessionModel } from '@/modules/sessions/sessions.schema';

const app = createApp();

function makeContext(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    district: `AdminDistrict-${suffix}`,
    block: `AdminBlock-${suffix}`,
    gramPanchayat: `AdminGP-${suffix}`,
    village: 'Admin Test Village',
    surveyDate: new Date('2026-03-15'),
    distanceFromNearestMine: 5,
    totalPopulation: 1200,
    totalHouseholds: 250,
    scHouseholds: 40,
    stHouseholds: 60,
    miningAffectedArea: 'direct' as const,
    surveyorName: 'Rajesh Kumar',
    surveyorNameNIT: 'Priya Sharma',
    ...overrides,
  };
}

async function seedSession(title: string, context: ReturnType<typeof makeContext>) {
  const session = await SessionModel.create({ title, context });
  return session._id as Types.ObjectId;
}

async function seedEntry(
  sessionId: Types.ObjectId,
  formCode: string,
  percent: number,
  context: ReturnType<typeof makeContext>,
) {
  return SessionEntryModel.create({
    sessionId,
    formCode,
    contextSnapshot: context,
    progress: {
      answered: percent,
      totalVisible: 100,
      percent,
    },
  });
}

describe('admin analytics API', () => {
  let sessionIdA: Types.ObjectId;
  let sessionIdB: Types.ObjectId;
  let contextA: ReturnType<typeof makeContext>;
  let contextB: ReturnType<typeof makeContext>;

  beforeAll(async () => {
    await connectDB();

    const suffix = String(Date.now());
    contextA = makeContext(`${suffix}-a`);
    contextB = makeContext(`${suffix}-b`, {
      district: `AdminDistrict-${suffix}-b`,
      block: `AdminBlock-${suffix}-b`,
      gramPanchayat: `AdminGP-${suffix}-b`,
      miningAffectedArea: 'indirect',
    });

    sessionIdA = await seedSession(`Admin Analytics A ${suffix}`, contextA);
    sessionIdB = await seedSession(`Admin Analytics B ${suffix}`, contextB);

    await Promise.all([
      seedEntry(sessionIdA, 'A', 0, contextA),
      seedEntry(sessionIdA, 'B', 50, contextA),
      seedEntry(sessionIdA, 'C', 100, contextA),
      seedEntry(sessionIdB, 'A', 25, contextB),
      seedEntry(sessionIdB, 'D', 75, contextB),
    ]);
  });

  afterAll(async () => {
    await SessionEntryModel.deleteMany({});
    await SessionModel.deleteMany({ title: /^Admin Analytics / });
    await disconnectDB();
  });

  it('returns dashboard KPIs and chart datasets', async () => {
    const response = await request(app)
      .get('/api/v1/admin/dashboard')
      .expect(200);

    expect(response.body.success).toBe(true);
    const { kpis, formProgress, progressBuckets } = response.body.data;

    expect(kpis.totalSessions).toBe(2);
    expect(kpis.totalEntries).toBe(5);
    expect(kpis.totalForms).toBe(15);
    expect(kpis.formsTouched).toBe(4);
    expect(kpis.avgProgressPercent).toBeGreaterThan(0);

    expect(formProgress).toHaveLength(15);
    expect(formProgress[0].formCode).toBe('A');
    expect(formProgress[1].formCode).toBe('B');
    expect(formProgress[2].formCode).toBe('C');

    const formA = formProgress.find((row: { formCode: string }) => row.formCode === 'A');
    expect(formA.entryCount).toBe(2);
    expect(formA.notStartedCount).toBe(1);
    expect(formA.inProgressCount).toBe(1);

    const formC = formProgress.find((row: { formCode: string }) => row.formCode === 'C');
    expect(formC.completedCount).toBe(1);

    const bucketTotal = progressBuckets.reduce(
      (sum: number, row: { count: number }) => sum + row.count,
      0,
    );
    expect(bucketTotal).toBe(5);
  });

  it('filters dashboard by district', async () => {
    const response = await request(app)
      .get('/api/v1/admin/dashboard')
      .query({ district: contextB.district })
      .expect(200);

    expect(response.body.data.kpis.totalSessions).toBe(1);
    expect(response.body.data.kpis.totalEntries).toBe(2);
  });

  it('returns paginated session progress rows', async () => {
    const response = await request(app)
      .get('/api/v1/admin/sessions')
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBe(2);
    expect(response.body.pagination.total).toBe(2);

    const row = response.body.data.find(
      (item: { sessionId: string }) => item.sessionId === sessionIdA.toString(),
    );
    expect(row.entryCount).toBe(3);
    expect(row.formsTouched).toBe(3);
  });

  it('returns session drill-down with per-form progress', async () => {
    const response = await request(app)
      .get(`/api/v1/admin/sessions/${sessionIdA.toString()}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    const { kpis, formProgress, entries } = response.body.data;

    expect(kpis.entryCount).toBe(3);
    expect(kpis.formsTouched).toBe(3);
    expect(formProgress).toHaveLength(15);

    const formB = formProgress.find((row: { formCode: string }) => row.formCode === 'B');
    expect(formB.avgPercent).toBe(50);
    expect(formB.entryCount).toBe(1);

    expect(entries.length).toBe(3);
    expect(entries.every((entry: { id: string }) => Boolean(entry.id))).toBe(true);
  });

  it('returns 404 for unknown session drill-down', async () => {
    await request(app)
      .get('/api/v1/admin/sessions/000000000000000000000000')
      .expect(404);
  });
});
