import * as archiver from 'archiver';
import { Buffer } from 'node:buffer';
import { PassThrough } from 'node:stream';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

import type { SessionEntryLean } from '@/modules/session-entries/session-entries.schema';
import type { SessionLean } from '@/modules/sessions/sessions.schema';

import APIError from '@/configs/errors/APIError';
import { CORE_ERRORS } from '@/configs/errors/CORE_ERRORS';
import { sessionEntriesRepository } from '@/modules/session-entries/session-entries.repository';
import { sessionsRepository } from '@/modules/sessions/sessions.repository';
import { HttpErrorStatusCode } from '@/types/errors/errors.types';

type ExportKind = 'pdf' | 'csv' | 'xlsx';
type AnswerScalar = string | number | boolean | null;
type QuestionExportRow = Record<string, AnswerScalar> & {
  'Session ID': string;
  'Form Code': string;
  'Entry ID': string;
  'Question(english)': string;
  'Question(hindi)': string;
  'UOM(en)': string;
  'UOM(hi)': string;
  'Answer': AnswerScalar;
};

const ALL_FORM_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'] as const;
const BASE_COLUMNS = [
  'Session ID',
  'Form Code',
  'Entry ID',
  'Question(hindi)',
  'Question(english)',
  'UOM(hi)',
  'UOM(en)',
  'Answer',
] as const;

/**
 * Reference object for analytics-friendly coercion and answer expansion.
 * This mirrors how frontend forms store answers (string/object/mixed) and
 * guarantees deterministic columns for CSV/XLSX.
 */
const ANSWER_ANALYTICS_REFERENCE = {
  booleanLike: new Set(['yes', 'no', 'true', 'false']),
  numericRegex: /^-?\d+(?:\.\d+)?$/,
  commonStructuredKeys: [
    'primary',
    'detail',
    'hours',
    'minutes',
    'available',
    'distanceKm',
    'managementType',
  ],
};

function normalizeScalar(value: unknown): AnswerScalar {
  if (value === null || value === undefined)
    return null;
  if (typeof value === 'boolean')
    return value;
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null;
  if (value instanceof Date)
    return value.toISOString();

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed)
      return null;

    const lowered = trimmed.toLowerCase();
    if (ANSWER_ANALYTICS_REFERENCE.booleanLike.has(lowered)) {
      return lowered === 'yes' || lowered === 'true';
    }
    if (ANSWER_ANALYTICS_REFERENCE.numericRegex.test(trimmed)) {
      const number = Number(trimmed);
      return Number.isFinite(number) ? number : trimmed;
    }
    return trimmed;
  }

  return JSON.stringify(value);
}

function displayAnswer(value: unknown): string {
  if (value === null || value === undefined)
    return '';
  if (typeof value === 'string')
    return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return JSON.stringify(value);
}

function flattenAnswer(value: unknown, prefix: string, output: Record<string, AnswerScalar>) {
  if (
    value === null
    || value === undefined
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value instanceof Date
  ) {
    output[prefix] = normalizeScalar(value);
    return;
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      output[prefix] = null;
      return;
    }
    value.forEach((item, index) => flattenAnswer(item, `${prefix}.${index + 1}`, output));
    return;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (!keys.length) {
      output[prefix] = null;
      return;
    }
    for (const key of keys) {
      flattenAnswer(obj[key], `${prefix}.${key}`, output);
    }
  }
}

function extractStructuredColumns(answer: unknown): Record<string, AnswerScalar> {
  const extra: Record<string, AnswerScalar> = {};
  if (!answer || typeof answer !== 'object' || Array.isArray(answer))
    return extra;
  const answerObj = answer as Record<string, unknown>;

  for (const key of ANSWER_ANALYTICS_REFERENCE.commonStructuredKeys) {
    if (key in answerObj) {
      extra[`Answer.${key}`] = normalizeScalar(answerObj[key]);
    }
  }
  return extra;
}

function buildQuestionRows(entries: SessionEntryLean[]): QuestionExportRow[] {
  const rows: QuestionExportRow[] = [];
  for (const entry of entries) {
    const sessionId = String(entry.sessionId);
    const entryId = String(entry._id);
    const answers = Array.isArray(entry.answers) ? entry.answers : [];

    answers.forEach((item, index) => {
      const answerValue = item?.answer;
      const row: QuestionExportRow = {
        'Session ID': sessionId,
        'Form Code': entry.formCode,
        'Entry ID': entryId,
        'Question(english)': item?.title?.en ?? `Q${index + 1}`,
        'Question(hindi)': item?.title?.hi ?? '',
        'UOM(en)': item?.uom?.en ?? '',
        'UOM(hi)': item?.uom?.hi ?? '',
        'Answer': normalizeScalar(answerValue),
      };

      Object.assign(row, extractStructuredColumns(answerValue));
      flattenAnswer(answerValue, 'Answer.expanded', row);
      row['Answer.raw_json'] = typeof answerValue === 'object'
        ? JSON.stringify(answerValue)
        : displayAnswer(answerValue);

      rows.push(row);
    });
  }
  return rows;
}

function collectColumns(rows: QuestionExportRow[]) {
  const dynamic = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!BASE_COLUMNS.includes(key as (typeof BASE_COLUMNS)[number])) {
        dynamic.add(key);
      }
    });
  });
  return [...BASE_COLUMNS, ...Array.from(dynamic).sort((a, b) => a.localeCompare(b))];
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined)
    return '';
  const raw = String(value);
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n'))
    return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function rowsToCsv(rows: QuestionExportRow[]) {
  const columns = collectColumns(rows);
  const header = columns.join(',');
  const body = rows.map(row => columns.map(column => escapeCsvCell(row[column])).join(',')).join('\n');
  return body ? `${header}\n${body}` : `${header}\n`;
}

function rowsToXlsxBuffer(rows: QuestionExportRow[]) {
  const columns = collectColumns(rows);
  const orderedRows = rows.map((row) => {
    const result: Record<string, unknown> = {};
    columns.forEach((column) => {
      result[column] = row[column] ?? null;
    });
    return result;
  });
  const sheet = XLSX.utils.json_to_sheet(orderedRows, { header: columns });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'analysis');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function parseQuestionCode(question: string) {
  const trimmed = question.trim();
  if (trimmed.length < 2 || !/[a-z]/i.test(trimmed[0])) {
    return {
      groupCode: null as string | null,
      displayCode: '',
      titleText: trimmed,
    };
  }

  let cursor = 1;
  while (cursor < trimmed.length && /\d/.test(trimmed[cursor] ?? '')) {
    cursor += 1;
  }

  if (cursor === 1) {
    return {
      groupCode: null as string | null,
      displayCode: '',
      titleText: trimmed,
    };
  }

  const groupCode = `${trimmed[0].toUpperCase()}${trimmed.slice(1, cursor)}`;
  let displayCode = groupCode;
  if (trimmed[cursor] === '.') {
    const subStart = cursor + 1;
    let subEnd = subStart;
    while (subEnd < trimmed.length && /\d/.test(trimmed[subEnd] ?? '')) {
      subEnd += 1;
    }
    if (subEnd > subStart) {
      displayCode = `${groupCode}.${trimmed.slice(subStart, subEnd)}`;
      cursor = subEnd;
    }
  }

  while (cursor < trimmed.length && ' :.)-'.includes(trimmed[cursor] ?? '')) {
    cursor += 1;
  }

  const titleText = trimmed.slice(cursor).trim() || trimmed;
  return { groupCode, displayCode, titleText };
}

async function rowsToPdfBuffer(rows: QuestionExportRow[], title: string, session: SessionLean): Promise<Buffer> {
  try {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 30,
      bufferPages: true,
      info: {
        Title: title,
        Author: 'DMFT Survey Platform',
        Subject: 'Section export report',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    const complete = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageBottom = doc.page.height - doc.page.margins.bottom - 20;
    const startX = doc.page.margins.left;
    const formatDate = (() => {
      const raw = session.context.surveyDate;
      if (!raw)
        return '-';
      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? String(raw) : date.toISOString().slice(0, 10);
    })();

    const entryCount = new Set(rows.map(r => r['Entry ID'])).size;
    const breadcrumb = `${session.context.district} > ${session.context.block} > GP ${session.context.gramPanchayat} > Village ${session.context.village}`;

    const colors = {
      border: '#d9dee8',
      navy: '#1a3a5c',
      navyDark: '#15324f',
      blueLite: '#dbeafe',
      panel: '#eff4ff',
      noteBg: '#fff7ed',
      noteBorder: '#f0d9b8',
      noteAccent: '#c2410c',
      text: '#0d1c2f',
      muted: '#4b5563',
      white: '#ffffff',
    };

    const columnNo = 54;
    const columnQuestion = 252;
    const columnUom = 94;
    const columnAnswer = pageWidth - columnNo - columnQuestion - columnUom;

    function writeContextField(label: string, value: string, x: number, y: number, width: number) {
      doc.rect(x, y, width, 28).fillAndStroke(colors.white, colors.border);
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(6.5).text(label.toUpperCase(), x + 6, y + 4, { width: width - 12 });
      doc.fillColor(colors.text).font('Helvetica').fontSize(8).text(value || '-', x + 6, y + 14, { width: width - 12 });
    }

    function drawTableHeader() {
      const y = doc.y;
      doc.rect(startX, y, pageWidth, 20).fill(colors.navy);
      doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(8);
      doc.text('Q.No.', startX + 6, y + 6, { width: columnNo - 12, align: 'center' });
      doc.text('Question & DMFT Eligible Activity', startX + columnNo + 6, y + 6, { width: columnQuestion - 12 });
      doc.text('Response Type', startX + columnNo + columnQuestion + 6, y + 6, { width: columnUom - 12 });
      doc.text('Response', startX + columnNo + columnQuestion + columnUom + 6, y + 6, { width: columnAnswer - 12 });
      doc.y = y + 20;
    }

    function drawPageHeader() {
      const y = doc.page.margins.top;
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(7.5).text(breadcrumb, startX, y, { width: pageWidth - 90 });
      doc
        .font('Helvetica')
        .text(`${Math.min(rows.length, entryCount)} / ${rows.length} answered`, startX, y, {
          width: pageWidth - 40,
          align: 'right',
        });

      const bannerY = y + 16;
      doc.rect(startX, bannerY, pageWidth, 52).fill(colors.navy);
      doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(12).text(title.replace(/\s+EXPORT$/i, '').trim(), startX + 10, bannerY + 11);
      doc.fontSize(9).font('Helvetica').text('(फॉर्म आईडी)', startX + 10, bannerY + 27);
      doc.fontSize(7).text('Rule 22(2)(a) — High Priority | Chhattisgarh DMFT Rules 2015', startX + 10, bannerY + 39);

      const contextY = bannerY + 60;
      doc.rect(startX, contextY, pageWidth, 38).fillAndStroke(colors.panel, colors.border);
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(7).text('SESSION CONTEXT SEARCH', startX + 8, contextY + 5);
      const fieldTop = contextY + 14;
      const gap = 8;
      const fieldWidth = (pageWidth - (gap * 2)) / 3;
      writeContextField('District', session.context.district, startX, fieldTop, fieldWidth);
      writeContextField('Block', session.context.block, startX + fieldWidth + gap, fieldTop, fieldWidth);
      writeContextField('Gram Panchayat', session.context.gramPanchayat, startX + ((fieldWidth + gap) * 2), fieldTop, fieldWidth);

      const metaY = contextY + 43;
      doc.rect(startX, metaY, pageWidth, 38).fillAndStroke(colors.panel, colors.border);
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(7).text('SESSION CONTEXT', startX + 8, metaY + 5);
      const surveyFieldTop = metaY + 14;
      writeContextField('Surveyor Name', session.context.surveyorName, startX, surveyFieldTop, fieldWidth);
      writeContextField('NIT Team Member', session.context.surveyorNameNIT, startX + fieldWidth + gap, surveyFieldTop, fieldWidth);
      writeContextField('Survey Date', formatDate, startX + ((fieldWidth + gap) * 2), surveyFieldTop, fieldWidth);

      const noteY = metaY + 45;
      doc.rect(startX, noteY, pageWidth, 30).fillAndStroke(colors.noteBg, colors.noteBorder);
      doc.rect(startX, noteY, 3, 30).fill(colors.noteAccent);
      doc.fillColor(colors.noteAccent).font('Helvetica-Bold').fontSize(8).text('Note:', startX + 8, noteY + 4);
      doc
        .fillColor('#7c2d12')
        .font('Helvetica')
        .fontSize(7)
        .text(
          'Eligible: Export mirrors form fill layout (question, response type, and captured responses) for audit-ready section reporting.',
          startX + 8,
          noteY + 14,
          { width: pageWidth - 14 },
        );

      doc.y = noteY + 36;
    }

    function drawPageFrame() {
      drawPageHeader();
      drawTableHeader();
    }

    function drawSectionBand(label: string) {
      const bandHeight = 20;
      if (doc.y + bandHeight > pageBottom) {
        doc.addPage();
        drawPageFrame();
      }
      const y = doc.y;
      doc.rect(startX, y, pageWidth, bandHeight).fill(colors.blueLite);
      doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(8.5).text(label, startX + 8, y + 5);
      doc.y = y + bandHeight;
    }

    function drawRow(row: QuestionExportRow, rowIndex: number) {
      const parsed = parseQuestionCode(String(row['Question(english)'] ?? ''));
      const questionEn = parsed.titleText || String(row['Question(english)'] ?? '');
      const questionHi = String(row['Question(hindi)'] ?? '');
      const questionText = `${questionEn}\n${questionHi}`.trim();
      const uomText = `${String(row['UOM(en)'] ?? '')}\n${String(row['UOM(hi)'] ?? '')}`.trim();
      const answerText = displayAnswer(row.Answer) || '-';

      doc.fontSize(8).font('Helvetica');
      const qHeight = doc.heightOfString(questionText || '-', { width: columnQuestion - 12, lineGap: 1.4 });
      const uHeight = doc.heightOfString(uomText || '-', { width: columnUom - 12, lineGap: 1.4 });
      const aHeight = doc.heightOfString(answerText, { width: columnAnswer - 12, lineGap: 1.4 });
      const rowHeight = Math.max(26, qHeight + 8, uHeight + 8, aHeight + 8);

      if (doc.y + rowHeight > pageBottom) {
        doc.addPage();
        drawPageFrame();
      }

      const y = doc.y;
      doc.rect(startX, y, pageWidth, rowHeight).fillAndStroke(rowIndex % 2 === 0 ? '#f8fbff' : colors.white, colors.border);

      const xNo = startX;
      const xQ = xNo + columnNo;
      const xU = xQ + columnQuestion;
      const xA = xU + columnUom;
      doc.moveTo(xQ, y).lineTo(xQ, y + rowHeight).strokeColor(colors.border).stroke();
      doc.moveTo(xU, y).lineTo(xU, y + rowHeight).strokeColor(colors.border).stroke();
      doc.moveTo(xA, y).lineTo(xA, y + rowHeight).strokeColor(colors.border).stroke();

      doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(8).text(parsed.displayCode || String(rowIndex + 1), xNo + 6, y + 8, {
        width: columnNo - 12,
        align: 'center',
      });
      doc.fillColor(colors.text).font('Helvetica').fontSize(7.8).text(questionText || '-', xQ + 6, y + 4, {
        width: columnQuestion - 12,
        lineGap: 1.3,
      });
      doc.fillColor(colors.muted).text(uomText || '-', xU + 6, y + 4, {
        width: columnUom - 12,
        lineGap: 1.3,
      });
      doc.fillColor(colors.text).text(answerText, xA + 6, y + 4, {
        width: columnAnswer - 12,
        lineGap: 1.3,
      });

      doc.y = y + rowHeight;
    }

    drawPageFrame();
    if (!rows.length) {
      drawRow(
        {
          'Session ID': String(session._id),
          'Form Code': '',
          'Entry ID': '',
          'Question(english)': 'No responses available.',
          'Question(hindi)': '',
          'UOM(en)': '',
          'UOM(hi)': '',
          'Answer': null,
        },
        0,
      );
    }
    else {
      let activeGroup: string | null = null;
      rows.forEach((row, index) => {
        const parsed = parseQuestionCode(String(row['Question(english)'] ?? ''));
        if (parsed.groupCode && parsed.groupCode !== activeGroup) {
          activeGroup = parsed.groupCode;
          drawSectionBand(`${activeGroup}. ${parsed.titleText || 'Section Questions'}`);
        }
        drawRow(row, index);
      });
    }

    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i += 1) {
      doc.switchToPage(i);
      doc
        .fillColor('#64748b')
        .font('Helvetica')
        .fontSize(8)
        .text(`Page ${i + 1} of ${pageRange.count}`, startX, doc.page.height - doc.page.margins.bottom + 3, {
          width: pageWidth,
          align: 'right',
        });
    }

    doc.end();
    return await complete;
  }
  catch (error) {
    throw new APIError({
      STATUS: HttpErrorStatusCode.INTERNAL_SERVER,
      CODE: 'PDF_RENDER_FAILED',
      TITLE: 'PDF_RENDER_FAILED',
      MESSAGE: 'Could not render PDF export.',
      META: {
        details: error instanceof Error ? error.message : 'Unknown renderer error',
      },
    });
  }
}

async function streamToBuffer(stream: PassThrough) {
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    stream.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function baseFileStem(sessionId: string, formCode?: string) {
  return formCode
    ? `session-${sessionId}-form-${formCode}`
    : `session-${sessionId}-all-forms`;
}

export class ExportsService {
  private async getSessionOrThrow(sessionId: string): Promise<SessionLean> {
    const session = await sessionsRepository.findById(sessionId);
    if (!session) {
      throw new APIError({
        ...CORE_ERRORS.NOT_FOUND,
        META: { resource: 'session', sessionId },
      });
    }
    return session;
  }

  private async getRowsByForm(sessionId: string, formCode: string): Promise<QuestionExportRow[]> {
    const entries = await sessionEntriesRepository.listAllBySessionAndForm(sessionId, formCode);
    return buildQuestionRows(entries);
  }

  async buildFormExport(
    sessionId: string,
    formCode: string,
    kind: ExportKind,
  ): Promise<{ fileName: string; contentType: string; data: Buffer }> {
    const session = await this.getSessionOrThrow(sessionId);
    const rows = await this.getRowsByForm(sessionId, formCode);
    const stem = baseFileStem(sessionId, formCode);

    if (kind === 'csv') {
      return {
        fileName: `${stem}.csv`,
        contentType: 'text/csv; charset=utf-8',
        data: Buffer.from(rowsToCsv(rows), 'utf-8'),
      };
    }

    if (kind === 'xlsx') {
      return {
        fileName: `${stem}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data: rowsToXlsxBuffer(rows),
      };
    }

    return {
      fileName: `${stem}.pdf`,
      contentType: 'application/pdf',
      data: await rowsToPdfBuffer(rows, `SECTION ${formCode} Export`, session),
    };
  }

  async buildSessionArchive(sessionId: string): Promise<{ fileName: string; contentType: string; data: Buffer }> {
    const session = await this.getSessionOrThrow(sessionId);
    const entries = await sessionEntriesRepository.listAllBySession(sessionId);
    const entriesByForm = new Map<string, SessionEntryLean[]>();
    for (const entry of entries) {
      const list = entriesByForm.get(entry.formCode) ?? [];
      list.push(entry);
      entriesByForm.set(entry.formCode, list);
    }

    const output = new PassThrough();
    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
    archive.pipe(output);

    for (const formCode of ALL_FORM_CODES) {
      const rows = buildQuestionRows(entriesByForm.get(formCode) ?? []);
      const stem = baseFileStem(sessionId, formCode);
      const folder = `form-${formCode}`;
      archive.append(rowsToCsv(rows), { name: `${folder}/${stem}.csv` });
      archive.append(rowsToXlsxBuffer(rows), { name: `${folder}/${stem}.xlsx` });
      archive.append(await rowsToPdfBuffer(rows, `SECTION ${formCode} Export`, session), {
        name: `${folder}/${stem}.pdf`,
      });
    }

    await archive.finalize();
    const data = await streamToBuffer(output);
    return {
      fileName: `${baseFileStem(sessionId)}.zip`,
      contentType: 'application/zip',
      data,
    };
  }
}

export const exportsService = new ExportsService();
