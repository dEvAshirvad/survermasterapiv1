import request from 'supertest';
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

const sessionPayload = {
  context: {
    district: 'Korba',
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
  },
};

async function createSession(): Promise<string> {
  const response = await request(app)
    .post('/api/v1/sessions')
    .send({
      ...sessionPayload,
      context: {
        ...sessionPayload.context,
        district: `Korba-${Date.now()}`,
        block: `Kartala-${Date.now()}`,
        gramPanchayat: `Test GP-${Date.now()}`,
      },
    })
    .expect(201);
  return response.body.data.id as string;
}

describe('session entries API', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await SessionEntryModel.deleteMany({});
    await SessionModel.deleteMany({ title: /^Session Entries Test / });
    await disconnectDB();
  });

  it('creates draft entry, lists and reads by id', async () => {
    const sessionId = await createSession();

    const created = await request(app)
      .post(`/api/v1/sessions/${sessionId}/entries`)
      .send({ formCode: 'A' })
      .expect(201);

    expect(created.body.data.id).toBeTruthy();
    const entryId = created.body.data.id as string;

    const list = await request(app)
      .get(`/api/v1/sessions/${sessionId}/entries`)
      .query({ formCode: 'A', page: 1, limit: 10 })
      .expect(200);

    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.length).toBeGreaterThan(0);

    const detail = await request(app)
      .get(`/api/v1/sessions/${sessionId}/entries/${entryId}`)
      .expect(200);

    expect(detail.body.data.id).toBe(entryId);
    expect(detail.body.data.status).toBe('draft');
    expect(detail.body.data.formCode).toBe('A');
  });

  it('patches entry with dense answers array (no null slots)', async () => {
    const sessionId = await createSession();
    const created = await request(app)
      .post(`/api/v1/sessions/${sessionId}/entries`)
      .send({ formCode: 'A' })
      .expect(201);
    const entryId = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/sessions/${sessionId}/entries/${entryId}`)
      .send({
        expectedVersion: 0,
        answers: [
          {
            title: { en: 'Placeholder 1', hi: 'प्लेसहोल्डर 1' },
            uom: { en: 'N/A', hi: 'लागू नहीं' },
            answer: '',
          },
          {
            title: { en: 'Question 2', hi: 'प्रश्न 2' },
            uom: { en: 'Yes/No', hi: 'हां/नहीं' },
            answer: 'Yes',
          },
        ],
        progress: { answered: 1, totalVisible: 5, percent: 20 },
      })
      .expect(200);

    expect(updated.body.data.version).toBe(1);
    expect(updated.body.data.answers[1].answer).toBe('Yes');
  });

  it('rejects patch when answers array contains null slots', async () => {
    const sessionId = await createSession();
    const created = await request(app)
      .post(`/api/v1/sessions/${sessionId}/entries`)
      .send({ formCode: 'B' })
      .expect(201);
    const entryId = created.body.data.id as string;

    const response = await request(app)
      .patch(`/api/v1/sessions/${sessionId}/entries/${entryId}`)
      .send({
        expectedVersion: 0,
        answers: [
          null,
          {
            title: { en: 'Question 1', hi: 'प्रश्न 1' },
            uom: { en: 'Yes/No', hi: 'हां/नहीं' },
            answer: 'Yes',
          },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('patches entry with optimistic concurrency and returns 409 on stale version', async () => {
    const sessionId = await createSession();
    const created = await request(app)
      .post(`/api/v1/sessions/${sessionId}/entries`)
      .send({ formCode: 'B' })
      .expect(201);
    const entryId = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/sessions/${sessionId}/entries/${entryId}`)
      .send({
        expectedVersion: 0,
        answers: [
          {
            title: { en: 'Question 1', hi: 'प्रश्न 1' },
            uom: { en: 'Yes/No', hi: 'हां/नहीं' },
            answer: 'Yes',
          },
        ],
        progress: { answered: 1, totalVisible: 5, percent: 20 },
      })
      .expect(200);

    expect(updated.body.data.version).toBe(1);
    expect(updated.body.data.answers[0].answer).toBe('Yes');

    const conflict = await request(app)
      .patch(`/api/v1/sessions/${sessionId}/entries/${entryId}`)
      .send({
        expectedVersion: 0,
        answers: [
          {
            title: { en: 'Question 2', hi: 'प्रश्न 2' },
            uom: { en: 'Yes/No', hi: 'हां/नहीं' },
            answer: 'No',
          },
        ],
      })
      .expect(409);

    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('get-or-create by form returns same entry on repeated calls', async () => {
    const sessionId = await createSession();

    const first = await request(app)
      .post(`/api/v1/sessions/${sessionId}/forms/A/entry`)
      .expect(200);
    const second = await request(app)
      .post(`/api/v1/sessions/${sessionId}/forms/A/entry`)
      .expect(200);

    expect(first.body.data.id).toBeTruthy();
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it('patches contextSnapshot editable fields', async () => {
    const sessionId = await createSession();
    const created = await request(app)
      .post(`/api/v1/sessions/${sessionId}/forms/B/entry`)
      .expect(200);
    const entryId = created.body.data.id as string;

    const patched = await request(app)
      .patch(`/api/v1/sessions/${sessionId}/entries/${entryId}`)
      .send({
        expectedVersion: created.body.data.version,
        contextSnapshot: {
          surveyorName: 'Updated Sachiv',
          surveyDate: '2026-04-22',
        },
      })
      .expect(200);

    expect(patched.body.data.contextSnapshot.surveyorName).toBe('Updated Sachiv');
    expect(String(patched.body.data.contextSnapshot.surveyDate)).toContain('2026-04-22');
  });

  it('soft deletes entry', async () => {
    const sessionId = await createSession();
    const created = await request(app)
      .post(`/api/v1/sessions/${sessionId}/entries`)
      .send({ formCode: 'C' })
      .expect(201);
    const entryId = created.body.data.id as string;

    const deleted = await request(app)
      .delete(`/api/v1/sessions/${sessionId}/entries/${entryId}`)
      .expect(200);

    expect(deleted.body.data.deletedAt).toBeTruthy();
  });

  it('returns 404 when session does not exist', async () => {
    const response = await request(app)
      .get('/api/v1/sessions/665a1b2c3d4e5f6789012345/entries')
      .query({ formCode: 'A' })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
