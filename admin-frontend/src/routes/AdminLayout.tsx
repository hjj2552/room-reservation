import {
  Building2,
  CalendarDays,
  FileClock,
  FileText,
  LogOut,
  Plus,
  Repeat,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminSession, useLogout } from '../hooks/useAuth';

export function AdminLayout() {
  const { data: session } = useAdminSession();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="관리자 메뉴">
        <div className="brand">
          <strong>강의실 예약</strong>
          <span>관리자</span>
        </div>
        <nav className="nav-list">
          <NavLink to="/reservations" end>
            <CalendarDays size={18} aria-hidden="true" />
            예약 목록
          </NavLink>
          <NavLink to="/timetable">
            <Table2 size={18} aria-hidden="true" />
            시간표
          </NavLink>
          <NavLink to="/reservations/new">
            <Plus size={18} aria-hidden="true" />
            예약 등록
          </NavLink>
          <NavLink to="/recurrences">
            <Repeat size={18} aria-hidden="true" />
            반복 예약
          </NavLink>
          <NavLink to="/rooms">
            <Building2 size={18} aria-hidden="true" />
            강의실 관리
          </NavLink>
          <NavLink to="/settings">
            <SlidersHorizontal size={18} aria-hidden="true" />
            운영 설정
          </NavLink>
          <NavLink to="/audit">
            <FileClock size={18} aria-hidden="true" />
            감사 이력
          </NavLink>
          <a href="/api/admin/exports/reservations.csv">
            <FileText size={18} aria-hidden="true" />
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
                onSettled: () => navigate('/login', { replace: true }),
              })
            }
          >
            <LogOut size={16} aria-hidden="true" />
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
