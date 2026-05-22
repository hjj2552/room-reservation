import type { AdminRoom } from '../api/types';

interface ReservationRoomTimetablePlaceholderProps {
  rooms: AdminRoom[];
  selectedRoomId: string;
}

export function ReservationRoomTimetablePlaceholder({ rooms, selectedRoomId }: ReservationRoomTimetablePlaceholderProps) {
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);

  return (
    <section className="panel" aria-labelledby="room-timetable-title" data-testid="reservation-room-placeholder">
      <div className="panel-header">
        <div>
          <h2 id="room-timetable-title">강의실별 뷰</h2>
          <p className="muted">
            {selectedRoom ? `${selectedRoom.name}의 여러 날짜 예약 흐름을 보여줄 예정입니다.` : '강의실을 선택하면 날짜 축 시간표로 확장할 예정입니다.'}
          </p>
        </div>
      </div>
      <div className="state-box empty">
        다음 단계에서 가로축을 날짜, 세로축을 시간으로 바꾸는 timetable 모델을 이 영역에 연결합니다.
      </div>
    </section>
  );
}
