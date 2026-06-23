import { Buffer } from 'node:buffer';
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

function binaryParser(
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', error => callback(error, Buffer.alloc(0)));
}

const sessionPayload = {
  context: {
    district: 'Korba',
    block: 'Kartala',
    gramPanchayat: 'Export GP',
    village: 'Export Village',
    surveyDate: '2026-03-15',
    distanceFromNearestMine: 3,
    totalPopulation: 1200,
    totalHouseholds: 250,
    scHouseholds: 40,
    stHouseholds: 60,
    miningAffectedArea: 'direct' as const,
    surveyorName: 'Rajesh Kumar',
    surveyorNameNIT: 'Priya Sharma',
  },
};

async function createSessionAndEntry() {
  const nonce = `${Date.now()}-${Math.round(Math.random() * 100000)}`;
  const context = {
    ...sessionPayload.context,
    gramPanchayat: `Export GP ${nonce}`,
  };
  const sessionResponse = await request(app)
    .post('/api/v1/sessions')
    .send({
      context,
    })
    .expect(201);

  const sessionId = sessionResponse.body.data.id as string;
  const entryResponse = await request(app)
    .post(`/api/v1/sessions/${sessionId}/forms/A/entry`)
    .expect(200);

  const entryId = entryResponse.body.data.id as string;
  await request(app)
    .patch(`/api/v1/sessions/${sessionId}/entries/${entryId}`)
    .send({
      expectedVersion: entryResponse.body.data.version,
      answers: [
        {
          title: { en: 'Has Water Supply', hi: 'पानी की आपूर्ति' },
          uom: { en: 'Yes/No', hi: 'हां/नहीं' },
          answer: 'Yes',
        },
        {
          title: { en: 'Coverage Percentage', hi: 'कवरेज प्रतिशत' },
          uom: { en: 'Percent', hi: 'प्रतिशत' },
          answer: '70',
        },
        {
          title: { en: 'Facility Matrix', hi: 'मैट्रिक्स' },
          uom: { en: 'mixed', hi: 'मिश्रित' },
          answer: {
            primary: 'Yes',
            detail: ['Piped', 'Treatment'],
          },
        },
      ],
      progress: { answered: 3, totalVisible: 3, percent: 100 },
    })
    .expect(200);

  return { sessionId };
}

describe('exports API', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await SessionEntryModel.deleteMany({});
    await SessionModel.deleteMany({ title: /^Exports Test / });
    await disconnectDB();
  });

  it('downloads analytics-friendly CSV for a form', async () => {
    const { sessionId } = await createSessionAndEntry();
    const response = await request(app)
      .get(`/api/v1/exports/sessions/${sessionId}/forms/A.csv`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('.csv');
    expect(response.text).toContain('Question(english)');
    expect(response.text).toContain('Question(hindi)');
    expect(response.text).toContain('UOM(en)');
    expect(response.text).toContain(',true,');
    expect(response.text).toContain(',70,');
  });

  it('downloads XLSX and PDF for a form', async () => {
    const { sessionId } = await createSessionAndEntry();

    const xlsxResponse = await request(app)
      .get(`/api/v1/exports/sessions/${sessionId}/forms/A.xlsx`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(xlsxResponse.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(Buffer.byteLength(xlsxResponse.body)).toBeGreaterThan(100);

    const pdfResponse = await request(app)
      .get(`/api/v1/exports/sessions/${sessionId}/forms/A.pdf`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(pdfResponse.headers['content-type']).toContain('application/pdf');
    expect(Buffer.byteLength(pdfResponse.body)).toBeGreaterThan(100);
  });

  it('downloads all forms archive ZIP', async () => {
    const { sessionId } = await createSessionAndEntry();
    const response = await request(app)
      .get(`/api/v1/exports/sessions/${sessionId}/archive.zip`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.headers['content-disposition']).toContain('.zip');
    expect(Buffer.byteLength(response.body)).toBeGreaterThan(100);
  });
});
