import type { ReservationStatus } from '../api/types';
import { statusLabels } from '../utils/labels';

interface StatusBadgeProps {
  status: ReservationStatus;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span aria-hidden="true" className="status-dot" />
      {label || statusLabels[status]}
    </span>
  );
}
