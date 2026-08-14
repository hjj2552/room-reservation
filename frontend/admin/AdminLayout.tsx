import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAdminSession, useLogout } from '../shared/hooks/useAuth';

const timetablePath = '/admin/timetable';
const timetableContextKey = 'admin-timetable-context';
const timetableContextParams = ['view', 'date', 'weekStart', 'roomId', 'roomViewRoomId'] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isActualDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTimetableContextValue(name: (typeof timetableContextParams)[number], value: string) {
  if (name === 'view') return value === 'date' || value === 'room';
  if (name === 'date' || name === 'weekStart') return isActualDate(value);
  return uuidPattern.test(value);
}

function timetableSearch(search: string) {
  const current = new URLSearchParams(search);
  const saved = new URLSearchParams();
  for (const name of timetableContextParams) {
    const value = current.get(name);
    if (value && isTimetableContextValue(name, value)) saved.set(name, value);
  }
  return saved.toString();
}

function normalizedTimetableSearch(search: string) {
  const current = new URLSearchParams(search);
  let changed = false;
  for (const name of timetableContextParams) {
    const value = current.get(name);
    if (value !== null && !isTimetableContextValue(name, value)) {
      current.delete(name);
      changed = true;
    }
  }
  return changed ? current.toString() : null;
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
  const normalizedSearch = location.pathname === timetablePath
    ? normalizedTimetableSearch(location.search)
    : null;

  useEffect(() => {
    if (location.pathname !== timetablePath) return;
    const nextSearch = timetableSearch(location.search);
    setSavedTimetableSearch(saveTimetableSearch(nextSearch) ? nextSearch : '');
  }, [location.pathname, location.search]);

  if (normalizedSearch !== null) {
    return <Navigate to={{ pathname: timetablePath, search: normalizedSearch, hash: location.hash }} replace />;
  }

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
