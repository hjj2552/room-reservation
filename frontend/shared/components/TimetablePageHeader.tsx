import { Plus } from 'lucide-react';

interface TimetablePageHeaderProps {
  eyebrow: string;
  helperText?: string;
  buttonTestId: string;
  buttonDisabled?: boolean;
  onNewRequest: () => void;
}

export const timetableCopy = {
  title: '시간표',
  description: '빈 슬롯을 누르면 해당 날짜, 시간, 공간으로 예약 신청 패널이 열립니다.',
  adminHelper: '관리자는 신청을 바로 승인 상태로 저장할 수 있습니다.',
  dateTitle: '날짜별 보기',
  dateDescription: '선택한 날짜의 공간 예약 현황을 시간순으로 보여줍니다.',
  roomTitle: '공간별 보기',
  roomDescription: '선택한 공간의 예약 현황을 날짜와 시간 기준으로 보여줍니다.',
};

export function TimetablePageHeader({
  eyebrow,
  helperText,
  buttonTestId,
  buttonDisabled = false,
  onNewRequest,
}: TimetablePageHeaderProps) {
  return (
    <div className="page-header timetable-entry-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="timetable-title">{timetableCopy.title}</h1>
        <p className="muted">{timetableCopy.description}</p>
        {helperText ? <p className="muted timetable-helper-text">{helperText}</p> : null}
      </div>
      <div className="header-actions">
        <button
          type="button"
          className="primary-button"
          onClick={onNewRequest}
          disabled={buttonDisabled}
          data-testid={buttonTestId}
        >
          <Plus size={16} aria-hidden="true" />
          예약 신청
        </button>
      </div>
    </div>
  );
}
