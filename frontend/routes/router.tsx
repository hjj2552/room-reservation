import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useRouteError } from 'react-router';
import { AdminLayout } from '../admin/AdminLayout';
import { ProtectedRoute } from '../admin/ProtectedRoute';
import { PublicLayout } from '../public/PublicLayout';
import { ErrorState, LoadingState } from '../shared/components/StateViews';

const EntryChoicePage = lazy(() => import('../public/pages/EntryChoicePage').then((module) => ({
  default: module.EntryChoicePage,
})));
const PublicReservationPage = lazy(() => import('../public/pages/PublicReservationPage').then((module) => ({
  default: module.PublicReservationPage,
})));
const PublicReservationDetailPage = lazy(() => import('../public/pages/PublicReservationDetailPage').then((module) => ({
  default: module.PublicReservationDetailPage,
})));
const PublicReservationEditPage = lazy(() => import('../public/pages/PublicReservationEditPage').then((module) => ({
  default: module.PublicReservationEditPage,
})));
const AdminLoginPage = lazy(() => import('../admin/pages/AdminLoginPage').then((module) => ({
  default: module.AdminLoginPage,
})));
const AdminReservationsPage = lazy(() => import('../admin/pages/AdminReservationsPage').then((module) => ({
  default: module.AdminReservationsPage,
})));
const AdminTimetablePage = lazy(() => import('../admin/pages/AdminTimetablePage').then((module) => ({
  default: module.AdminTimetablePage,
})));
const AdminReservationDetailPage = lazy(() => import('../admin/pages/AdminReservationDetailPage').then((module) => ({
  default: module.AdminReservationDetailPage,
})));
const AdminReservationFormPage = lazy(() => import('../admin/pages/AdminReservationFormPage').then((module) => ({
  default: module.AdminReservationFormPage,
})));
const AdminRecurrencesPage = lazy(() => import('../admin/pages/AdminRecurrencesPage').then((module) => ({
  default: module.AdminRecurrencesPage,
})));
const AdminRecurrenceDetailPage = lazy(() => import('../admin/pages/AdminRecurrenceDetailPage').then((module) => ({
  default: module.AdminRecurrenceDetailPage,
})));
const AdminRoomsPage = lazy(() => import('../admin/pages/AdminRoomsPage').then((module) => ({
  default: module.AdminRoomsPage,
})));
const AdminSettingsPage = lazy(() => import('../admin/pages/AdminSettingsPage').then((module) => ({
  default: module.AdminSettingsPage,
})));
const AdminTagSettingsPage = lazy(() => import('../admin/pages/AdminTagSettingsPage').then((module) => ({
  default: module.AdminTagSettingsPage,
})));
const AdminAuditPage = lazy(() => import('../admin/pages/AdminAuditPage').then((module) => ({
  default: module.AdminAuditPage,
})));

type RouteSurface = 'entry' | 'public' | 'login' | 'admin';

function routePage(element: ReactNode, surface: RouteSurface) {
  return {
    element: <Suspense fallback={<RouteState surface={surface} loading />}>{element}</Suspense>,
    errorElement: <RouteErrorState surface={surface} />,
  };
}

function RouteErrorState({ surface }: { surface: RouteSurface }) {
  return <RouteState surface={surface} error={useRouteError()} />;
}

function RouteState({
  surface,
  loading = false,
  error,
}: {
  surface: RouteSurface;
  loading?: boolean;
  error?: unknown;
}) {
  const content = loading
    ? <LoadingState message="화면을 불러오는 중입니다." />
    : <ErrorState error={error} />;

  if (surface === 'entry') {
    return <main className="entry-page" aria-busy={loading}>{content}</main>;
  }
  if (surface === 'public') {
    return <main className="public-shell" aria-busy={loading}>{content}</main>;
  }
  if (surface === 'login') {
    return <main className="login-page" aria-busy={loading}>{content}</main>;
  }
  return <section className="page-section" aria-busy={loading}>{content}</section>;
}

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', ...routePage(<EntryChoicePage />, 'entry') },
      { path: '/timetable', ...routePage(<PublicReservationPage />, 'public') },
      { path: '/reservations/:reservationId', ...routePage(<PublicReservationDetailPage />, 'public') },
      { path: '/reservations/:reservationId/edit', ...routePage(<PublicReservationEditPage />, 'public') },
    ],
  },
  { path: '/admin/login', ...routePage(<AdminLoginPage />, 'login') },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/reservations', ...routePage(<AdminReservationsPage />, 'admin') },
          { path: '/admin/timetable', ...routePage(<AdminTimetablePage />, 'admin') },
          { path: '/admin/reservations/:reservationId', ...routePage(<AdminReservationDetailPage />, 'admin') },
          { path: '/admin/reservations/:reservationId/edit', ...routePage(<AdminReservationFormPage />, 'admin') },
          { path: '/admin/recurrences', ...routePage(<AdminRecurrencesPage />, 'admin') },
          { path: '/admin/recurrences/:recurrenceId', ...routePage(<AdminRecurrenceDetailPage />, 'admin') },
          { path: '/admin/rooms', ...routePage(<AdminRoomsPage />, 'admin') },
          { path: '/admin/settings', ...routePage(<AdminSettingsPage />, 'admin') },
          { path: '/admin/settings/tags', ...routePage(<AdminTagSettingsPage />, 'admin') },
          { path: '/admin/audit', ...routePage(<AdminAuditPage />, 'admin') },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
