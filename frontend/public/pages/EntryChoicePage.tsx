import { CalendarDays, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePublicSettings } from '../../shared/hooks/usePublicReservation';

export function EntryChoicePage() {
  const settings = usePublicSettings();
  const organizationName = settings.data?.organizationName || '강의실 예약';

  return (
    <main className="entry-page">
      <section className="entry-panel" aria-labelledby="entry-title">
        <div className="entry-heading">
          {settings.data?.logoUrl ? (
            <img className="entry-logo" src={settings.data.logoUrl} alt={`${organizationName} 로고`} />
          ) : null}
          <p className="eyebrow">{organizationName}</p>
          <h1 id="entry-title">이용할 메뉴를 선택해 주세요</h1>
          <p className="muted">예약 신청 또는 관리자 메뉴로 바로 이동할 수 있습니다.</p>
        </div>

        <div className="entry-options">
          <Link className="entry-option" to="/timetable" data-testid="entry-public-link">
            <span className="entry-option-icon" aria-hidden="true">
              <CalendarDays size={22} />
            </span>
            <span>
              <strong>일반 사용자</strong>
              <span>강의실 예약 신청 및 확인</span>
            </span>
          </Link>

          <Link className="entry-option" to="/admin/login" data-testid="entry-admin-link">
            <span className="entry-option-icon" aria-hidden="true">
              <ShieldCheck size={22} />
            </span>
            <span>
              <strong>관리자</strong>
              <span>로그인 후 예약/강의실/운영 설정 관리</span>
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
