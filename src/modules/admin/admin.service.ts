import type { AdminFiltersInput } from '@/modules/admin/admin.schema';
import {
  adminAnalyticsRepository,
} from '@/modules/admin/admin-analytics.repository';

export class AdminService {
  getDashboard(filters: AdminFiltersInput) {
    return adminAnalyticsRepository.getDashboard(filters);
  }

  listSessions(filters: AdminFiltersInput, page: number, limit: number) {
    return adminAnalyticsRepository.listSessionsProgress(filters, page, limit);
  }

  getSessionDrillDown(sessionId: string) {
    return adminAnalyticsRepository.getSessionDrillDown(sessionId);
  }
}

export const adminService = new AdminService();
