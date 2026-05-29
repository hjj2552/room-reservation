import { useQuery } from '@tanstack/react-query';
import { listReservationHistories, type AuditFilters } from '../api/audit';

export const auditKeys = {
  all: ['audit'] as const,
  reservationHistories: (filters: AuditFilters) => ['audit', 'reservation-histories', filters] as const,
};

export function useReservationHistoryAudit(filters: AuditFilters) {
  return useQuery({
    queryKey: auditKeys.reservationHistories(filters),
    queryFn: () => listReservationHistories(filters),
  });
}
