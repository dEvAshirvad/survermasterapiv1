import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import {
  createSessionEntry,
  deleteSessionEntry,
  getOrCreateSessionFormEntry,
  getSessionEntry,
  listSessionEntries,
  patchSessionEntry,
  submitSessionEntry,
} from '@/modules/session-entries/session-entries.controller';
import {
  createSessionEntryBodySchema,
  patchSessionEntryBodySchema,
  sessionEntriesListQuerySchema,
  sessionEntryParamsSchema,
  sessionFormParamsSchema,
  sessionParamsSchema,
  submitSessionEntryBodySchema,
} from '@/modules/session-entries/session-entries.schema';

const router = createRouter();

/**
 * @openapi
 * /api/v1/sessions/{id}/entries:
 *   get:
 *     tags:
 *       - SessionEntries
 *     summary: List session entries
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: formCode
 *         required: false
 *         schema:
 *           type: string
 *           pattern: "^[A-O]$"
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated entries list
 *       404:
 *         description: Session not found
 *   post:
 *     tags:
 *       - SessionEntries
 *     summary: Create empty draft entry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - formCode
 *             properties:
 *               formCode:
 *                 type: string
 *                 pattern: "^[A-O]$"
 *     responses:
 *       201:
 *         description: Draft entry created
 *       404:
 *         description: Session not found
 */
router.get(
  '/sessions/:id/entries',
  validateRequest({
    params: sessionParamsSchema,
    query: sessionEntriesListQuerySchema,
  }),
  listSessionEntries,
);

router.post(
  '/sessions/:id/entries',
  validateRequest({
    params: sessionParamsSchema,
    body: createSessionEntryBodySchema,
  }),
  createSessionEntry,
);

router.post(
  '/sessions/:id/forms/:formCode/entry',
  validateRequest({
    params: sessionFormParamsSchema,
  }),
  getOrCreateSessionFormEntry,
);

/**
 * @openapi
 * /api/v1/sessions/{id}/entries/{entryId}:
 *   get:
 *     tags:
 *       - SessionEntries
 *     summary: Get one session entry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session entry
 *       404:
 *         description: Session or entry not found
 *   patch:
 *     tags:
 *       - SessionEntries
 *     summary: Patch draft answers/progress
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expectedVersion
 *             properties:
 *               answers:
 *                 type: object
 *                 additionalProperties: true
 *               progress:
 *                 type: object
 *               expectedVersion:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Session entry updated
 *       409:
 *         description: Version conflict
 *   delete:
 *     tags:
 *       - SessionEntries
 *     summary: Soft delete entry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entry soft deleted
 *       404:
 *         description: Session or entry not found
 */
router.get(
  '/sessions/:id/entries/:entryId',
  validateRequest({ params: sessionEntryParamsSchema }),
  getSessionEntry,
);

router.patch(
  '/sessions/:id/entries/:entryId',
  validateRequest({
    params: sessionEntryParamsSchema,
    body: patchSessionEntryBodySchema,
  }),
  patchSessionEntry,
);

router.delete(
  '/sessions/:id/entries/:entryId',
  validateRequest({ params: sessionEntryParamsSchema }),
  deleteSessionEntry,
);

/**
 * @openapi
 * /api/v1/sessions/{id}/entries/{entryId}/submit:
 *   post:
 *     tags:
 *       - SessionEntries
 *     summary: Submit draft entry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - expectedVersion
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Entry submitted
 *       409:
 *         description: Version or status conflict
 */
router.post(
  '/sessions/:id/entries/:entryId/submit',
  validateRequest({
    params: sessionEntryParamsSchema,
    body: submitSessionEntryBodySchema,
  }),
  submitSessionEntry,
);

export default router;
