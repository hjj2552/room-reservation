import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAdminSession, useLogout } from './hooks/useAuth';
import { usePendingReservationCount } from './hooks/useReservations';
import {
  adminListContextForPath,
  adminListContexts,
  clearAdminListSearches,
  readAdminListSearches,
  saveAdminListSearch,
} from './utils/listContext';

import { SidePanel } from '../shared/components/SidePanel';
import { AdminMenuContext } from './components/AdminPageTitle';

const mobileMenuQuery = '(max-width: 980px)';
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
  const pendingReservations = usePendingReservationCount();
  const pendingReservationCount = pendingReservations.isSuccess ? pendingReservations.data : 0;
  const [savedTimetableSearch, setSavedTimetableSearch] = useState(readTimetableSearch);
  const [savedListSearches, setSavedListSearches] = useState(readAdminListSearches);
  const [mobile, setMobile] = useState(() => window.matchMedia(mobileMenuQuery).matches);
  const [menuLocationKey, setMenuLocationKey] = useState<string | null>(null);
  const restoreMenuFocus = useRef(true);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const currentLocationKey = useRef(location.key);
  currentLocationKey.current = location.key;
  const menuOpen = mobile && menuLocationKey === location.key;

  function closeForNavigation() {
    restoreMenuFocus.current = false;
    setMenuLocationKey(null);
  }

  useEffect(() => {
    const query = window.matchMedia(mobileMenuQuery);
    const update = () => {
      restoreMenuFocus.current = false;
      setMenuLocationKey(null);
      setMobile(query.matches);
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setMenuLocationKey(null);
  }, [location.key]);

  const normalizedSearch = location.pathname === timetablePath
    ? normalizedTimetableSearch(location.search)
    : null;

  useEffect(() => {
    if (location.pathname !== timetablePath) return;
    const nextSearch = timetableSearch(location.search);
    setSavedTimetableSearch(saveTimetableSearch(nextSearch) ? nextSearch : '');
  }, [location.pathname, location.search]);

  useEffect(() => {
    const context = adminListContextForPath(location.pathname);
    if (!context) return;
    const nextSearch = saveAdminListSearch(context, location.search);
    setSavedListSearches((current) => (
      current[context] === nextSearch ? current : { ...current, [context]: nextSearch }
    ));
  }, [location.pathname, location.search]);

  if (normalizedSearch !== null) {
    return <Navigate to={{ pathname: timetablePath, search: normalizedSearch, hash: location.hash }} replace />;
  }

  const menu = (
    <>
        <nav className="nav-list" onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) closeForNavigation();
        }}>
          <div className="nav-item-with-badge">
            <NavLink
              className="nav-item-label"
              to={{
                pathname: adminListContexts.reservations.path,
                search: savedListSearches.reservations,
              }}
              end
            >
              예약 목록
            </NavLink>
            {pendingReservationCount > 0 ? (
              <Link
                className="pending-reservation-link"
                to="/admin/reservations?status=REQUESTED&page=0"
                aria-label={`승인 대기 예약 ${pendingReservationCount.toLocaleString('ko-KR')}건 보기`}
              >
                <span className="pending-reservation-badge" aria-hidden="true">
                  {pendingReservationCount >= 100 ? '99+' : pendingReservationCount}
                </span>
              </Link>
            ) : null}
          </div>
          <NavLink to={{ pathname: timetablePath, search: savedTimetableSearch }}>
            시간표
          </NavLink>
          <NavLink to={{
            pathname: adminListContexts.recurrences.path,
            search: savedListSearches.recurrences,
          }}>
            반복 예약
          </NavLink>
          <NavLink to={{ pathname: adminListContexts.rooms.path, search: savedListSearches.rooms }}>
            공간 관리
          </NavLink>
          <NavLink to="/admin/settings" end>
            운영 설정
          </NavLink>
          <NavLink to="/admin/settings/tags">
            태그 설정
          </NavLink>
          <NavLink to={{ pathname: adminListContexts.audit.path, search: savedListSearches.audit }}>
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
                  clearAdminListSearches();
                  setSavedTimetableSearch('');
                  setSavedListSearches(readAdminListSearches());
                  closeForNavigation();
                  navigate('/admin/login', { replace: true });
                },
              })
            }
          >
            로그아웃
          </button>
        </div>
    </>
  );

  return (
    <AdminMenuContext.Provider value={{
      open: menuOpen,
      pendingCount: pendingReservationCount,
      triggerRef: menuTriggerRef,
      openMenu: () => {
        restoreMenuFocus.current = true;
        setMenuLocationKey(location.key);
      },
    }}>
      <div className="app-shell">
        {!mobile ? (
          <aside className="sidebar" aria-label="관리자 메뉴">
            <div className="brand"><strong>관리자 메뉴</strong></div>
            {menu}
          </aside>
        ) : null}
        <main className="content" id="main-content" inert={menuOpen}>
          <Outlet />
        </main>
        {menuOpen ? (
          <SidePanel
            id="admin-mobile-menu"
            title="관리자 메뉴"
            className="admin-menu-drawer"
            closeButtonLabel="관리자 메뉴 닫기"
            backdropTestId="admin-menu-backdrop"
            closeOnBackdrop
            returnFocusTarget={menuTriggerRef}
            onClose={() => setMenuLocationKey(null)}
            shouldRestoreFocus={() => restoreMenuFocus.current
              && currentLocationKey.current === menuLocationKey
              && window.matchMedia(mobileMenuQuery).matches}
          >
            {menu}
          </SidePanel>
        ) : null}
      </div>
    </AdminMenuContext.Provider>
  );
}
