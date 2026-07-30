import { Link } from 'react-router';
import { usePublicSettings } from '../../shared/hooks/usePublicReservation';

export function EntryChoicePage() {
  const settings = usePublicSettings();
  const organizationName = settings.data?.organizationName || '공간 예약';

  return (
    <main className="entry-page">
      <section className="entry-panel" aria-labelledby="entry-title">
        <div className="entry-heading">
          <p className="eyebrow entry-organization-name">{organizationName}</p>
          <h1 id="entry-title">이용할 메뉴를 선택해 주세요</h1>
        </div>

        <div className="entry-options">
          <Link className="entry-option" to="/timetable" data-testid="entry-public-link">
            <span>
              <strong>일반 사용자</strong>
              <span>공간 예약 신청 및 확인</span>
            </span>
          </Link>

          <Link className="entry-option" to="/admin/login" data-testid="entry-admin-link">
            <span>
              <strong>관리자</strong>
              <span>로그인 후 예약/공간/운영 설정 관리</span>
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
