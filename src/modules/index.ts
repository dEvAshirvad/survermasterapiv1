import { createRouter } from '@/configs/serverConfig';
import adminRouter from '@/modules/admin/admin.router';
import sessionEntriesRouter from '@/modules/session-entries/session-entries.router';
import sessionsRouter from '@/modules/sessions/sessions.router';

const router = createRouter();

router.use('/admin', adminRouter);
router.use('/', sessionEntriesRouter);
router.use('/sessions', sessionsRouter);

export default router;
