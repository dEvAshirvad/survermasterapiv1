import { createRouter } from '@/configs/serverConfig';
import { validateRequest } from '@/middlewares/zod-validate-request';
import {
  createSession,
  getSessionDetail,
  getSessionFormsSummary,
  listSessionBlockOptions,
  listSessionDistrictOptions,
  listSessionGramPanchayatOptions,
  listSessions,
  searchSessions,
  updateSession,
} from '@/modules/sessions/sessions.controller';
import {
  createSessionBodySchema,
  listSessionsQuerySchema,
  sessionBlocksQuerySchema,
  sessionGramPanchayatsQuerySchema,
  sessionIdParamsSchema,
  sessionSearchQuerySchema,
  updateSessionBodySchema,
} from '@/modules/sessions/sessions.schema';

const router = createRouter();

/**
 * @openapi
 * /api/v1/sessions:
 *   post:
 *     tags:
 *       - Sessions
 *     summary: Create a survey session
 *     description: |
 *       Creates a new field survey session with geographic context.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - context
 *             properties:
 *               title:
 *                 type: string
 *                 example: Korba Block 3 — March 2026
 *               context:
 *                 type: object
 *                 required:
 *                   - district
 *                   - block
 *                   - gramPanchayat
 *                   - village
 *                   - surveyDate
 *                   - totalPopulation
 *                   - totalHouseholds
 *                   - scHouseholds
 *                   - stHouseholds
 *                   - miningAffectedArea
 *                   - surveyorName
 *                   - surveyorNameNIT
 *                 properties:
 *                   district:
 *                     type: string
 *                     example: Korba
 *                   block:
 *                     type: string
 *                     example: Kartala
 *                   gramPanchayat:
 *                     type: string
 *                     example: GP Name
 *                   village:
 *                     type: string
 *                     example: Village Name
 *                   surveyDate:
 *                     type: string
 *                     format: date
 *                     example: 2026-03-15
 *                   totalPopulation:
 *                     type: integer
 *                     minimum: 1
 *                     example: 1200
 *                   totalHouseholds:
 *                     type: integer
 *                     minimum: 1
 *                     example: 250
 *                   scHouseholds:
 *                     type: integer
 *                     minimum: 1
 *                     example: 40
 *                   stHouseholds:
 *                     type: integer
 *                     minimum: 1
 *                     example: 60
 *                   miningAffectedArea:
 *                     type: string
 *                     enum: [direct, indirect]
 *                     example: direct
 *                   surveyorName:
 *                     type: string
 *                     example: Rajesh Kumar
 *                   surveyorNameNIT:
 *                     type: string
 *                     example: Priya Sharma
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: integer
 *                   example: 201
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  validateRequest({ body: createSessionBodySchema }),
  createSession,
);

/**
 * @openapi
 * /api/v1/sessions:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: List survey sessions
 *     description: Returns paginated session metadata.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated session list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       context:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/',
  validateRequest({ query: listSessionsQuerySchema }),
  listSessions,
);

router.get('/search', validateRequest({ query: sessionSearchQuerySchema }), searchSessions);
router.get('/options/districts', listSessionDistrictOptions);
router.get(
  '/options/blocks',
  validateRequest({ query: sessionBlocksQuerySchema }),
  listSessionBlockOptions,
);
router.get(
  '/options/gram-panchayats',
  validateRequest({ query: sessionGramPanchayatsQuerySchema }),
  listSessionGramPanchayatOptions,
);

/**
 * @openapi
 * /api/v1/sessions/{id}:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: Get session detail
 *     description: |
 *       Returns one session with entries placeholders and summary counts.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     context:
 *                       type: object
 *                     forms:
 *                       type: array
 *                       items:
 *                         type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         formCount:
 *                           type: integer
 *                           example: 0
 *                         entryCount:
 *                           type: integer
 *                           example: 0
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   patch:
 *     tags:
 *       - Sessions
 *     summary: Update session metadata
 *     description: |
 *       Updates session title and context fields.
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
 *               - title
 *               - context
 *             properties:
 *               title:
 *                 type: string
 *               context:
 *                 type: object
 *     responses:
 *       200:
 *         description: Session updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Session not found
 */
router.get(
  '/:id',
  validateRequest({ params: sessionIdParamsSchema }),
  getSessionDetail,
);

router.patch(
  '/:id',
  validateRequest({
    params: sessionIdParamsSchema,
    body: updateSessionBodySchema,
  }),
  updateSession,
);

router.get(
  '/:id/forms-summary',
  validateRequest({ params: sessionIdParamsSchema }),
  getSessionFormsSummary,
);

export default router;
