import type { ReservationStatus } from '../api/types';
import { statusLabels } from '../utils/labels';

interface StatusBadgeProps {
  status: ReservationStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span aria-hidden="true" className="status-dot" />
      {statusLabels[status]}
    </span>
  );
}
