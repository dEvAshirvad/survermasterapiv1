import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import connectDB, { disconnectDB } from '@/configs/db/mongodb';
import createApp from '@/configs/serverConfig';
import { SessionEntryModel } from '@/modules/session-entries/session-entries.schema';
import { buildSessionTitle } from '@/modules/sessions/sessions-title';
import { SessionModel } from '@/modules/sessions/sessions.schema';

const app = createApp();

const validContext = {
  district: 'SessionsTest-Korba',
  block: 'Kartala',
  gramPanchayat: 'Test GP',
  village: 'Test Village',
  surveyDate: '2026-03-15',
  distanceFromNearestMine: 0,
  totalPopulation: 1200,
  totalHouseholds: 250,
  scHouseholds: 40,
  stHouseholds: 60,
  miningAffectedArea: 'direct' as const,
  surveyorName: 'Rajesh Kumar',
  surveyorNameNIT: 'Priya Sharma',
};

let contextCounter = 0;

function makeSessionPayload(contextOverrides: Partial<typeof validContext> = {}) {
  contextCounter += 1;
  const context = {
    ...validContext,
    district: `SessionsTest-Korba-${contextCounter}`,
    block: `Kartala-${contextCounter}`,
    gramPanchayat: `Test GP-${contextCounter}`,
    ...contextOverrides,
  };

  return { context };
}

function expectedTitleFromPayloadContext(
  context: Pick<typeof validContext, 'district' | 'block' | 'gramPanchayat' | 'village' | 'surveyDate'>,
) {
  return buildSessionTitle({
    district: context.district,
    block: context.block,
    gramPanchayat: context.gramPanchayat,
    village: context.village,
    surveyDate: new Date(context.surveyDate),
  });
}

async function cleanupSessionsTestData() {
  const sessions = await SessionModel.find({ 'context.district': /^SessionsTest-/ }).select('_id').lean();
  const sessionIds = sessions.map(session => session._id);
  if (sessionIds.length > 0) {
    await SessionEntryModel.deleteMany({ sessionId: { $in: sessionIds } });
    await SessionModel.deleteMany({ _id: { $in: sessionIds } });
  }
}

describe('sessions API', () => {
  beforeAll(async () => {
    await connectDB();
    await cleanupSessionsTestData();
    await SessionModel.syncIndexes();
  });

  afterEach(async () => {
    await cleanupSessionsTestData();
  });

  afterAll(async () => {
    await cleanupSessionsTestData();
    await disconnectDB();
  });

  it('pOST /api/v1/sessions creates a session with auto-generated title', async () => {
    const payload = makeSessionPayload();
    const res = await request(app)
      .post('/api/v1/sessions')
      .send(payload)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeTruthy();

    const stored = await SessionModel.findById(res.body.data.id)
      .lean()
      .exec();

    expect(stored).toBeTruthy();
    expect(stored?.title).toBe(expectedTitleFromPayloadContext(payload.context));
    expect(stored?.context.surveyDate).toBeInstanceOf(Date);
    expect(stored?.context).toMatchObject({
      district: payload.context.district,
      block: payload.context.block,
      gramPanchayat: payload.context.gramPanchayat,
      village: payload.context.village,
      totalPopulation: payload.context.totalPopulation,
      totalHouseholds: payload.context.totalHouseholds,
      scHouseholds: payload.context.scHouseholds,
      stHouseholds: payload.context.stHouseholds,
      miningAffectedArea: payload.context.miningAffectedArea,
      surveyorName: payload.context.surveyorName,
      surveyorNameNIT: payload.context.surveyorNameNIT,
    });
  });

  it('pOST /api/v1/sessions defaults omitted household counts to zero', async () => {
    const payload = makeSessionPayload({
      totalPopulation: undefined,
      totalHouseholds: undefined,
      scHouseholds: undefined,
      stHouseholds: undefined,
    });

    const res = await request(app)
      .post('/api/v1/sessions')
      .send(payload)
      .expect(201);

    const stored = await SessionModel.findById(res.body.data.id)
      .lean()
      .exec();

    expect(stored?.context.totalPopulation).toBe(0);
    expect(stored?.context.totalHouseholds).toBe(0);
    expect(stored?.context.scHouseholds).toBe(0);
    expect(stored?.context.stHouseholds).toBe(0);
  });

  it('pOST /api/v1/sessions rejects invalid body with 400', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .send({ context: { district: 'Only district' } })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('gET /api/v1/sessions returns paginated list', async () => {
    await request(app).post('/api/v1/sessions').send(makeSessionPayload());

    const res = await request(app)
      .get('/api/v1/sessions')
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toBeTruthy();

    for (const item of res.body.data) {
      expect(item.id).toBeTruthy();
    }
  });

  it('gET /api/v1/sessions/:id returns detail without auth header', async () => {
    const payload = makeSessionPayload();
    const created = await request(app)
      .post('/api/v1/sessions')
      .send(payload)
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/sessions/${created.body.data.id}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(created.body.data.id);
    expect(res.body.data.title).toBe(expectedTitleFromPayloadContext(payload.context));
    expect(res.body.data.forms).toEqual([]);
    expect(res.body.data.summary).toEqual({
      formCount: 0,
      entryCount: 0,
    });
  });

  it('gET /api/v1/sessions/:id returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/v1/sessions/665a1b2c3d4e5f6789012345')
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('pATCH /api/v1/sessions/:id updates session fields and regenerates title', async () => {
    const payload = makeSessionPayload();
    const created = await request(app)
      .post('/api/v1/sessions')
      .send(payload)
      .expect(201);

    const updatedContext = {
      ...payload.context,
      village: 'Updated Village',
      miningAffectedArea: 'indirect' as const,
      surveyDate: '2026-06-20',
    };

    const res = await request(app)
      .patch(`/api/v1/sessions/${created.body.data.id}`)
      .send({ context: updatedContext })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(created.body.data.id);
    expect(res.body.data.title).toBe(expectedTitleFromPayloadContext(updatedContext));
    expect(res.body.data.context.village).toBe('Updated Village');
    expect(res.body.data.context.miningAffectedArea).toBe('indirect');
  });

  it('gET /api/v1/sessions/:id/forms-summary returns empty forms for new session', async () => {
    const created = await request(app)
      .post('/api/v1/sessions')
      .send(makeSessionPayload())
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/sessions/${created.body.data.id}/forms-summary`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBe(created.body.data.id);
    expect(res.body.data.forms).toEqual([]);
  });

  it('gET /api/v1/sessions/:id/forms-summary returns grouped form counts', async () => {
    const created = await request(app)
      .post('/api/v1/sessions')
      .send(makeSessionPayload())
      .expect(201);
    const sessionId = created.body.data.id as string;

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/entries`)
      .send({ formCode: 'A' })
      .expect(201);

    const formAEntry2 = await request(app)
      .post(`/api/v1/sessions/${sessionId}/forms/A/entry`)
      .expect(200);

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/entries`)
      .send({ formCode: 'B' })
      .expect(201);

    await request(app)
      .get(`/api/v1/sessions/${sessionId}/entries/${formAEntry2.body.data.id}`)
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/forms-summary`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBe(sessionId);
    expect(res.body.data.forms).toEqual([
      { formCode: 'A', total: 1 },
      { formCode: 'B', total: 1 },
    ]);
  });

  it('lists district/block/gram-panchayat options and supports filtered search', async () => {
    await request(app)
      .post('/api/v1/sessions')
      .send(makeSessionPayload({
        district: 'SessionsTest-D1',
        block: 'B1',
        gramPanchayat: 'GP1',
        village: 'V1',
      }))
      .expect(201);

    await request(app)
      .post('/api/v1/sessions')
      .send(makeSessionPayload({
        district: 'SessionsTest-D1',
        block: 'B2',
        gramPanchayat: 'GP2',
        village: 'V2',
      }))
      .expect(201);

    const districts = await request(app)
      .get('/api/v1/sessions/options/districts')
      .expect(200);
    expect(districts.body.data).toContain('SessionsTest-D1');

    const blocks = await request(app)
      .get('/api/v1/sessions/options/blocks')
      .query({ district: 'SessionsTest-D1' })
      .expect(200);
    expect(blocks.body.data).toEqual(expect.arrayContaining(['B1', 'B2']));

    const gps = await request(app)
      .get('/api/v1/sessions/options/gram-panchayats')
      .query({ district: 'SessionsTest-D1', block: 'B1' })
      .expect(200);
    expect(gps.body.data).toContain('GP1');
    expect(gps.body.data).not.toContain('GP2');

    const villages = await request(app)
      .get('/api/v1/sessions/options/villages')
      .query({ district: 'SessionsTest-D1', block: 'B1', gramPanchayat: 'GP1' })
      .expect(200);
    expect(villages.body.data).toContain('V1');
    expect(villages.body.data).not.toContain('V2');

    const search = await request(app)
      .get('/api/v1/sessions/search')
      .query({
        district: 'SessionsTest-D1',
        block: 'B1',
        gramPanchayat: 'GP1',
        village: 'V1',
      })
      .expect(200);
    expect(search.body.success).toBe(true);
    expect(search.body.data.length).toBeGreaterThan(0);
    expect(search.body.data.every((item: { context: { district: string; block: string; gramPanchayat: string; village: string } }) =>
      item.context.district === 'SessionsTest-D1'
      && item.context.block === 'B1'
      && item.context.gramPanchayat === 'GP1'
      && item.context.village === 'V1',
    )).toBe(true);
  });

  it('returns 409 for duplicate district-block-gramPanchayat composite key', async () => {
    const payload = makeSessionPayload({
      district: 'SessionsTest-UNIQUE_D',
      block: 'UNIQUE_B',
      gramPanchayat: 'UNIQUE_GP',
    });

    await request(app)
      .post('/api/v1/sessions')
      .send(payload)
      .expect(201);

    const duplicate = await request(app)
      .post('/api/v1/sessions')
      .send({
        context: {
          ...payload.context,
          village: 'Another village',
        },
      })
      .expect(409);

    expect(duplicate.body.error.code).toBe('SESSION_CONTEXT_CONFLICT');
  });

  it('dELETE /api/v1/sessions/:id deletes session and all entries', async () => {
    const created = await request(app)
      .post('/api/v1/sessions')
      .send(makeSessionPayload())
      .expect(201);
    const sessionId = created.body.data.id as string;

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/entries`)
      .send({ formCode: 'A' })
      .expect(201);
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/entries`)
      .send({ formCode: 'B' })
      .expect(201);

    const deleted = await request(app)
      .delete(`/api/v1/sessions/${sessionId}`)
      .expect(200);

    expect(deleted.body.success).toBe(true);
    expect(deleted.body.data.id).toBe(sessionId);
    expect(deleted.body.data.deletedEntryCount).toBeGreaterThanOrEqual(2);

    const sessionDoc = await SessionModel.findById(sessionId).lean().exec();
    expect(sessionDoc).toBeNull();

    const entries = await SessionEntryModel.find({ sessionId }).lean().exec();
    expect(entries).toHaveLength(0);
  });
});
