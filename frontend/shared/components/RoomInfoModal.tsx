import { useId } from 'react';
import { ModalDialog } from './ModalDialog';

export interface RoomInfoRoom {
  id: string;
  name: string;
  location?: string | null;
  capacity?: number | null;
  description?: string | null;
}

interface RoomInfoModalProps {
  room: RoomInfoRoom | null;
  onClose: () => void;
}

export function hasRoomDescription(description?: string | null) {
  return Boolean(description?.trim());
}

export function RoomInfoModal({
  room,
  onClose,
}: RoomInfoModalProps) {
  const descriptionId = useId();

  if (!room || !hasRoomDescription(room.description)) return null;

  return (
    <ModalDialog
      title="공간 정보"
      onClose={onClose}
      className="room-info-modal"
      ariaDescribedBy={descriptionId}
      showCloseButton
      closeButtonLabel="공간 정보 닫기"
      closeOnBackdrop
      testId="room-info-modal"
      backdropTestId="room-info-backdrop"
    >
      <div className="room-info-modal-body">
        <div className="room-info-heading">
          <strong>{room.name}</strong>
          <span>{room.location?.trim() || '위치 정보 없음'}</span>
          <span>수용 인원 {room.capacity ?? 0}명</span>
        </div>
        <p id={descriptionId} className="room-info-description">{room.description?.trim()}</p>
      </div>
    </ModalDialog>
  );
}
