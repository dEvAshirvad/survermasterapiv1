import { createRouter } from '@/configs/serverConfig';
import sessionEntriesRouter from '@/modules/session-entries/session-entries.router';
import sessionsRouter from '@/modules/sessions/sessions.router';

const router = createRouter();

router.use('/', sessionEntriesRouter);
router.use('/sessions', sessionsRouter);

export default router;
