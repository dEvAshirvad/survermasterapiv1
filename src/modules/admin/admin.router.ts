import { createRouter } from '@/configs/serverConfig';
import { requireInternalAccess } from '@/middlewares/require-internal-access';
import { validateRequest } from '@/middlewares/zod-validate-request';
import {
  getAdminDashboard,
  getAdminSessionDetail,
  listAdminSessions,
} from '@/modules/admin/admin.controller';
import {
  adminFiltersQuerySchema,
  adminSessionIdParamsSchema,
  adminSessionsQuerySchema,
} from '@/modules/admin/admin.schema';

const router = createRouter();

router.use(requireInternalAccess);

router.get(
  '/dashboard',
  validateRequest({ query: adminFiltersQuerySchema }),
  getAdminDashboard,
);

router.get(
  '/sessions',
  validateRequest({ query: adminSessionsQuerySchema }),
  listAdminSessions,
);

router.get(
  '/sessions/:id',
  validateRequest({ params: adminSessionIdParamsSchema }),
  getAdminSessionDetail,
);

export default router;
