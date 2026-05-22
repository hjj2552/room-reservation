import { Link, useNavigate } from 'react-router-dom';
import type { ReservationListItem } from '../api/types';
import { formatDateTime } from '../utils/date';
import { sourceLabels } from '../utils/labels';
import { timetableReservationUrl } from '../utils/timetable';
import { StatusBadge } from './StatusBadge';

interface ReservationTableProps {
  reservations: ReservationListItem[];
}

export function ReservationTable({ reservations }: ReservationTableProps) {
  const navigate = useNavigate();

  return (
    <div className="table-wrap">
      <table className="data-table" data-testid="reservations-table">
        <caption className="sr-only">예약 목록</caption>
        <thead>
          <tr>
            <th scope="col">상태</th>
            <th scope="col">강의실</th>
            <th scope="col">예약 시간</th>
            <th scope="col">신청자</th>
            <th scope="col">목적</th>
            <th scope="col">신청 경로</th>
            <th scope="col">시간표</th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((reservation) => (
            <tr
              key={reservation.id}
              tabIndex={0}
              className="clickable-row"
              onClick={() => navigate(`/reservations/${reservation.id}`)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter') navigate(`/reservations/${reservation.id}`);
              }}
            >
              <td>
                <StatusBadge status={reservation.status} />
              </td>
              <td>{reservation.roomName}</td>
              <td>
                {formatDateTime(reservation.startAt)}
                <br />
                <span className="muted">~ {formatDateTime(reservation.endAt)}</span>
              </td>
              <td>
                {reservation.applicantName}
                <br />
                <span className="muted">{reservation.applicantEmail}</span>
              </td>
              <td className="purpose-cell">{reservation.purpose}</td>
              <td>{sourceLabels[reservation.source]}</td>
              <td>
                <Link
                  className="text-link"
                  to={timetableReservationUrl({ startAt: reservation.startAt, roomId: reservation.roomId })}
                  onClick={(event) => event.stopPropagation()}
                  data-testid="reservation-row-timetable-link"
                >
                  시간표에서 보기
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
