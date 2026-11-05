import { apiRequest, buildQuery } from '../../shared/api/http';
import type { AuditSearchField, PagedResponse, ReservationHistory } from '../../shared/api/types';

export interface AuditFilters {
  searchField?: AuditSearchField;
  reservationId?: string;
  roomId?: string;
  action?: string;
  from?: string;
  to?: string;
  keyword?: string;
  page?: number;
  size?: number;
}

export function listReservationHistories(filters: AuditFilters = {}) {
  return apiRequest<PagedResponse<ReservationHistory>>(
    `/api/admin/audit/reservation-histories${buildQuery({
      reservationId: filters.reservationId,
      roomId: filters.roomId,
      action: filters.action,
      from: filters.from,
      to: filters.to,
      keyword: filters.keyword,
      searchField: filters.searchField,
      page: filters.page ?? 0,
      size: filters.size ?? 20,
    })}`,
  );
}
