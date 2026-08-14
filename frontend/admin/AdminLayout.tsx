import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAdminSession, useLogout } from '../shared/hooks/useAuth';

const timetablePath = '/admin/timetable';
const timetableContextKey = 'admin-timetable-context';
const timetableContextParams = ['view', 'date', 'weekStart', 'roomId', 'roomViewRoomId'] as const;

function timetableSearch(search: string) {
  const current = new URLSearchParams(search);
  const saved = new URLSearchParams();
  for (const name of timetableContextParams) {
    const value = current.get(name);
    if (value) saved.set(name, value);
  }
  return saved.toString();
}

function readTimetableSearch() {
  try {
    return timetableSearch(window.sessionStorage.getItem(timetableContextKey) || '');
  } catch {
    return '';
  }
}

function saveTimetableSearch(search: string) {
  try {
    window.sessionStorage.setItem(timetableContextKey, search);
    return true;
  } catch {
    return false;
  }
}

function clearTimetableSearch() {
  try {
    window.sessionStorage.removeItem(timetableContextKey);
  } catch {
    // The default timetable route remains available when storage is blocked.
  }
}

export function AdminLayout() {
  const { data: session } = useAdminSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [savedTimetableSearch, setSavedTimetableSearch] = useState(readTimetableSearch);

  useEffect(() => {
    if (location.pathname !== timetablePath) return;
    const nextSearch = timetableSearch(location.search);
    setSavedTimetableSearch(saveTimetableSearch(nextSearch) ? nextSearch : '');
  }, [location.pathname, location.search]);

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
          <NavLink to={{ pathname: timetablePath, search: savedTimetableSearch }}>
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
        </nav>
        <div className="sidebar-footer">
          <span className="session-name">{session?.username || '관리자'}</span>
          <button
            type="button"
            className="ghost-button full-width"
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => {
                  clearTimetableSearch();
                  setSavedTimetableSearch('');
                  navigate('/admin/login', { replace: true });
                },
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
