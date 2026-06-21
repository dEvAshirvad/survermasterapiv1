import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import {
  downloadSessionArchive,
  downloadSessionFormCsv,
  downloadSessionFormPdf,
  downloadSessionFormXlsx,
} from '@/modules/exports/exports.controller';
import {
  exportFormParamsSchema,
  exportSessionParamsSchema,
} from '@/modules/exports/exports.schema';

const router = createRouter();

router.get(
  '/sessions/:sessionId/archive.zip',
  validateRequest({ params: exportSessionParamsSchema }),
  downloadSessionArchive,
);

router.get(
  '/sessions/:sessionId/forms/:formCode.pdf',
  validateRequest({ params: exportFormParamsSchema }),
  downloadSessionFormPdf,
);

router.get(
  '/sessions/:sessionId/forms/:formCode.csv',
  validateRequest({ params: exportFormParamsSchema }),
  downloadSessionFormCsv,
);

router.get(
  '/sessions/:sessionId/forms/:formCode.xlsx',
  validateRequest({ params: exportFormParamsSchema }),
  downloadSessionFormXlsx,
);

export default router;
