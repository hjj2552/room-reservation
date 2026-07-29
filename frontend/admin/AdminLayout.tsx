import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAdminSession, useLogout } from '../shared/hooks/useAuth';

export function AdminLayout() {
  const { data: session } = useAdminSession();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="관리자 메뉴">
        <div className="brand">
          <strong>공간 예약</strong>
          <span>관리자</span>
        </div>
        <nav className="nav-list">
          <NavLink to="/admin/reservations" end>
            예약 목록
          </NavLink>
          <NavLink to="/admin/timetable">
            시간표
          </NavLink>
          <NavLink to="/admin/recurrences">
            반복 예약
          </NavLink>
          <NavLink to="/admin/rooms">
            공간 관리
          </NavLink>
          <NavLink to="/admin/settings" end>
            운영 설정
          </NavLink>
          <NavLink to="/admin/settings/tags">
            태그 설정
          </NavLink>
          <NavLink to="/admin/audit">
            감사 이력
          </NavLink>
          <a href="/api/admin/exports/reservations.csv">
            CSV 내보내기
          </a>
        </nav>
        <div className="sidebar-footer">
          <span className="session-name">{session?.username || '관리자'}</span>
          <button
            type="button"
            className="ghost-button full-width"
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => navigate('/admin/login', { replace: true }),
              })
            }
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="content" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
