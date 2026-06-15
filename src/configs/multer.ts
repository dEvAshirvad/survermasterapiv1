import type { FileFilterCallback, Multer } from 'multer';

import multer from 'multer';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

/** Default TTL for temporary uploads: 10 minutes (ms) */
const DEFAULT_TEMPORARY_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const LEADING_DOT_REGEX = /^\./;

/** Temp directory for uploads (deleted after processing or TTL) */
const UPLOAD_TEMP = path.join(process.cwd(), 'uploads', 'temp');
/** Persistent uploads directory (when not temporary) */
const UPLOAD_PERSIST = path.join(process.cwd(), 'uploads', 'persist');

/** Extension → allowed MIME types (lowercase). Add more as needed. */
const EXT_TO_MIMETYPES: Record<string, string[]> = {
  json: ['application/json', 'text/json', 'application/octet-stream', 'text/plain'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ],
  jpeg: ['image/jpeg'],
  jpg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
};

const FILE_SIGNATURES: Record<string, Array<{ offset?: number; bytes: number[] }>> = {
  pdf: [{ bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  png: [{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }],
  jpg: [{ bytes: [0xFF, 0xD8, 0xFF] }],
  jpeg: [{ bytes: [0xFF, 0xD8, 0xFF] }],
  gif: [{ bytes: [0x47, 0x49, 0x46, 0x38] }], // GIF8
  webp: [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }], // RIFF....WEBP
  xlsx: [{ bytes: [0x50, 0x4B, 0x03, 0x04] }], // ZIP container
};

export function ensureUploadDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** @deprecated Use ensureUploadDir(UPLOAD_TEMP) or createUploadMiddleware. */
export function ensureTempDir(): string {
  return ensureUploadDir(UPLOAD_TEMP);
}

/** Schedule a file to be deleted after `ttlMs`. Defaults to DEFAULT_TEMPORARY_TTL_MS. */
export function scheduleTempFileRemoval(
  filePath: string,
  ttlMs: number = DEFAULT_TEMPORARY_TTL_MS,
): void {
  if (!filePath)
    return;
  setTimeout(() => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    catch {
      // ignore cleanup errors
    }
  }, ttlMs);
}

function hasBytesAtOffset(buffer: Buffer, bytes: number[], offset: number = 0): boolean {
  if (buffer.length < offset + bytes.length)
    return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i])
      return false;
  }
  return true;
}

/**
 * Verifies uploaded file content against known signatures for selected extensions.
 * Returns true for extensions without strict signatures (e.g. csv/json).
 */
export function validateFileSignature(filePath: string, ext: string): boolean {
  const normalizedExt = ext.toLowerCase().replace(LEADING_DOT_REGEX, '');
  const signatures = FILE_SIGNATURES[normalizedExt];
  if (!signatures || signatures.length === 0)
    return true;

  try {
    const fileHandle = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(32);
    fs.readSync(fileHandle, header, 0, header.length, 0);
    fs.closeSync(fileHandle);
    return signatures.every(sig => hasBytesAtOffset(header, sig.bytes, sig.offset ?? 0));
  }
  catch {
    return false;
  }
}

/**
 * Removes expired temporary upload files. Files older than `ttlMs` are deleted.
 * Returns number of deleted files.
 */
export function sweepExpiredTempUploads(ttlMs: number = DEFAULT_TEMPORARY_TTL_MS): number {
  ensureUploadDir(UPLOAD_TEMP);
  const now = Date.now();
  let deletedCount = 0;
  for (const entry of fs.readdirSync(UPLOAD_TEMP, { withFileTypes: true })) {
    if (!entry.isFile())
      continue;
    const fullPath = path.join(UPLOAD_TEMP, entry.name);
    try {
      const stats = fs.statSync(fullPath);
      if (now - stats.mtimeMs > ttlMs) {
        fs.unlinkSync(fullPath);
        deletedCount += 1;
      }
    }
    catch {
      // ignore individual file cleanup errors
    }
  }
  return deletedCount;
}

/**
 * Starts a periodic sweeper for temporary uploads.
 */
export function startTempUploadSweeper(
  ttlMs: number = DEFAULT_TEMPORARY_TTL_MS,
  intervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
): NodeJS.Timeout {
  // Run one pass at startup so restarts don't accumulate stale files.
  sweepExpiredTempUploads(ttlMs);
  return setInterval(() => {
    sweepExpiredTempUploads(ttlMs);
  }, intervalMs);
}

export interface CreateUploadOptions {
  /** If true, files go to temp dir and can be removed after temporaryTTL. Default: true */
  isTemporary?: boolean;
  /** TTL in ms for temporary files before auto-removal. Default: 10 minutes */
  temporaryTTL?: number;
  /** Allowed file extensions (e.g. ['csv', 'jpeg']). No leading dot. Default: ['csv'] */
  fileextacceptArr?: string[];
  /** Max file size in bytes. Default: 5MB */
  fileSizeLimit?: number;
  /** Prefix for stored filename. Default: 'upload' */
  filePrefix?: string;
  /** Maximum number of files accepted per request. Default: 5 */
  maxFiles?: number;
}

export interface CreateUploadResult {
  /** Multer middleware to use in routes (e.g. .single('file'), .array('files')) */
  middleware: Multer;
  /** Call after handling the request to schedule removal of temp file(s). No-op if not temporary. */
  scheduleRemoval: (filePathOrPaths: string | string[]) => void;
  /** Validate uploaded file signatures for selected extensions. Returns invalid file paths. */
  validateSignatures: (filePathOrPaths: string | string[]) => string[];
}

/**
 * Single factory for multer upload config. Use in every upload endpoint.
 *
 * @example
 * const { middleware, scheduleRemoval } = createUploadMiddleware({
 *   isTemporary: true,
 *   temporaryTTL: 10 * 60 * 1000,
 *   fileextacceptArr: ['csv', 'jpeg'],
 * });
 * router.post('/import', middleware.single('file'), (req, res) => {
 *   // ... process req.file ...
 *   if (req.file?.path) scheduleRemoval(req.file.path);
 * });
 */
export function createUploadMiddleware(
  options: CreateUploadOptions = {},
): CreateUploadResult {
  const {
    isTemporary = true,
    temporaryTTL = DEFAULT_TEMPORARY_TTL_MS,
    fileextacceptArr = ['csv'],
    fileSizeLimit = 5 * 1024 * 1024,
    filePrefix = 'upload',
    maxFiles = 5,
  } = options;

  const destinationDir = isTemporary ? UPLOAD_TEMP : UPLOAD_PERSIST;
  const normalizedExts = fileextacceptArr.map(e =>
    e.toLowerCase().replace(LEADING_DOT_REGEX, ''),
  );

  const storage = multer.diskStorage({
    destination: (
      _req: unknown,
      _file: unknown,
      cb: (error: Error | null, destination: string) => void,
    ) => {
      cb(null, ensureUploadDir(destinationDir));
    },
    filename: (
      _req: unknown,
      file: { originalname: string },
      cb: (error: Error | null, filename: string) => void,
    ) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const ext
        = path.extname(file.originalname).toLowerCase()
          || `.${normalizedExts[0] ?? 'bin'}`;
      cb(null, `${filePrefix}-${unique}${ext}`);
    },
  });

  const allowedMimes = new Set<string>();
  for (const ext of normalizedExts) {
    const mimes = EXT_TO_MIMETYPES[ext];
    if (mimes)
      mimes.forEach(m => allowedMimes.add(m));
  }

  const fileFilter = (
    _req: unknown,
    file: { mimetype: string; originalname: string },
    cb: FileFilterCallback,
  ) => {
    const ext
      = path.extname(file.originalname).toLowerCase().replace(LEADING_DOT_REGEX, '') || '';
    const extAllowed = normalizedExts.includes(ext);
    const mimeAllowed
      = allowedMimes.size === 0 || allowedMimes.has(file.mimetype?.toLowerCase());
    const ok = extAllowed && (allowedMimes.size === 0 || mimeAllowed);
    if (!ok) {
      cb(
        new Error(
          `Unsupported file type. Allowed extensions: ${normalizedExts.join(', ')}`,
        ),
      );
      return;
    }
    cb(null, true);
  };

  const middleware = multer({
    storage,
    limits: { fileSize: fileSizeLimit, files: maxFiles },
    fileFilter,
  });

  const scheduleRemoval = (filePathOrPaths: string | string[]) => {
    if (!isTemporary)
      return;
    const paths = Array.isArray(filePathOrPaths)
      ? filePathOrPaths
      : [filePathOrPaths];
    paths.forEach(p => scheduleTempFileRemoval(p, temporaryTTL));
  };

  const validateSignatures = (filePathOrPaths: string | string[]) => {
    const paths = Array.isArray(filePathOrPaths)
      ? filePathOrPaths
      : [filePathOrPaths];
    return paths.filter((filePath) => {
      const ext = path.extname(filePath).replace(LEADING_DOT_REGEX, '');
      return !validateFileSignature(filePath, ext);
    });
  };

  return { middleware, scheduleRemoval, validateSignatures };
}
