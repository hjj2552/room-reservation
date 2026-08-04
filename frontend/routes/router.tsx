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
const LoginPage = lazy(() => import('../admin/pages/LoginPage').then((module) => ({
  default: module.LoginPage,
})));
const ReservationsPage = lazy(() => import('../admin/pages/ReservationsPage').then((module) => ({
  default: module.ReservationsPage,
})));
const TimetablePage = lazy(() => import('../admin/pages/TimetablePage').then((module) => ({
  default: module.TimetablePage,
})));
const ReservationDetailPage = lazy(() => import('../admin/pages/ReservationDetailPage').then((module) => ({
  default: module.ReservationDetailPage,
})));
const ReservationFormPage = lazy(() => import('../admin/pages/ReservationFormPage').then((module) => ({
  default: module.ReservationFormPage,
})));
const RecurrencesPage = lazy(() => import('../admin/pages/RecurrencesPage').then((module) => ({
  default: module.RecurrencesPage,
})));
const RecurrenceDetailPage = lazy(() => import('../admin/pages/RecurrenceDetailPage').then((module) => ({
  default: module.RecurrenceDetailPage,
})));
const RoomsPage = lazy(() => import('../admin/pages/RoomsPage').then((module) => ({
  default: module.RoomsPage,
})));
const SettingsPage = lazy(() => import('../admin/pages/SettingsPage').then((module) => ({
  default: module.SettingsPage,
})));
const TagSettingsPage = lazy(() => import('../admin/pages/TagSettingsPage').then((module) => ({
  default: module.TagSettingsPage,
})));
const AuditPage = lazy(() => import('../admin/pages/AuditPage').then((module) => ({
  default: module.AuditPage,
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
  { path: '/admin/login', ...routePage(<LoginPage />, 'login') },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/reservations', ...routePage(<ReservationsPage />, 'admin') },
          { path: '/admin/timetable', ...routePage(<TimetablePage />, 'admin') },
          { path: '/admin/reservations/:reservationId', ...routePage(<ReservationDetailPage />, 'admin') },
          { path: '/admin/reservations/:reservationId/edit', ...routePage(<ReservationFormPage />, 'admin') },
          { path: '/admin/recurrences', ...routePage(<RecurrencesPage />, 'admin') },
          { path: '/admin/recurrences/:recurrenceId', ...routePage(<RecurrenceDetailPage />, 'admin') },
          { path: '/admin/rooms', ...routePage(<RoomsPage />, 'admin') },
          { path: '/admin/settings', ...routePage(<SettingsPage />, 'admin') },
          { path: '/admin/settings/tags', ...routePage(<TagSettingsPage />, 'admin') },
          { path: '/admin/audit', ...routePage(<AuditPage />, 'admin') },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
