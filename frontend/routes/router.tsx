import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminLayout } from '../admin/AdminLayout';
import { ProtectedRoute } from '../admin/ProtectedRoute';
import { AuditPage } from '../admin/pages/AuditPage';
import { LoginPage } from '../admin/pages/LoginPage';
import { RecurrenceDetailPage } from '../admin/pages/RecurrenceDetailPage';
import { ReservationDetailPage } from '../admin/pages/ReservationDetailPage';
import { ReservationFormPage } from '../admin/pages/ReservationFormPage';
import { ReservationsPage } from '../admin/pages/ReservationsPage';
import { RecurrencesPage } from '../admin/pages/RecurrencesPage';
import { RoomsPage } from '../admin/pages/RoomsPage';
import { SettingsPage } from '../admin/pages/SettingsPage';
import { TagSettingsPage } from '../admin/pages/TagSettingsPage';
import { TimetablePage } from '../admin/pages/TimetablePage';
import { PublicReservationDetailPage } from '../public/pages/PublicReservationDetailPage';
import { PublicReservationEditPage } from '../public/pages/PublicReservationEditPage';
import { EntryChoicePage } from '../public/pages/EntryChoicePage';
import { PublicReservationPage } from '../public/pages/PublicReservationPage';

export const router = createBrowserRouter([
  { path: '/', element: <EntryChoicePage /> },
  { path: '/timetable', element: <PublicReservationPage /> },
  { path: '/reserve', element: <PublicReservationPage /> },
  { path: '/reservations/:reservationId', element: <PublicReservationDetailPage /> },
  { path: '/reservations/:reservationId/edit', element: <PublicReservationEditPage /> },
  { path: '/cancel', element: <Navigate to="/timetable" replace /> },
  { path: '/cancel/:reservationId', element: <PublicReservationDetailPage /> },
  { path: '/public', element: <Navigate to="/timetable" replace /> },
  { path: '/request', element: <Navigate to="/reserve" replace /> },
  { path: '/public/reservations/new', element: <Navigate to="/reserve" replace /> },
  { path: '/public/reservations/:reservationId/edit', element: <NavigateToPublicReservationEdit /> },
  { path: '/public/reservations/:reservationId', element: <NavigateToPublicReservationDetail /> },
  { path: '/login', element: <Navigate to="/admin/login" replace /> },
  { path: '/admin/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/reservations', element: <ReservationsPage /> },
          { path: '/admin/timetable', element: <TimetablePage /> },
          { path: '/admin/reservations/new', element: <ReservationFormPage mode="create" /> },
          { path: '/admin/reservations/:reservationId', element: <ReservationDetailPage /> },
          { path: '/admin/reservations/:reservationId/edit', element: <ReservationFormPage mode="edit" /> },
          { path: '/admin/recurrences', element: <RecurrencesPage /> },
          { path: '/admin/recurrences/:recurrenceId', element: <RecurrenceDetailPage /> },
          { path: '/admin/rooms', element: <RoomsPage /> },
          { path: '/admin/settings', element: <SettingsPage /> },
          { path: '/admin/settings/tags', element: <TagSettingsPage /> },
          { path: '/admin/audit', element: <AuditPage /> },
        ],
      },
    ],
  },
  { path: '/reservations', element: <Navigate to="/admin/reservations" replace /> },
  { path: '/reservations/new', element: <Navigate to="/admin/timetable" replace /> },
  { path: '/recurrences', element: <Navigate to="/admin/recurrences" replace /> },
  { path: '/recurrences/:recurrenceId', element: <NavigateToAdminRecurrenceDetail /> },
  { path: '/rooms', element: <Navigate to="/admin/rooms" replace /> },
  { path: '/settings', element: <Navigate to="/admin/settings" replace /> },
  { path: '/audit', element: <NavigateToAdminAudit /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

function NavigateToPublicReservationDetail() {
  return <Navigate to={window.location.pathname.replace('/public/reservations', '/reservations')} replace />;
}

function NavigateToPublicReservationEdit() {
  return <Navigate to={window.location.pathname.replace('/public/reservations', '/reservations')} replace />;
}

function NavigateToAdminRecurrenceDetail() {
  return <Navigate to={`/admin${window.location.pathname}`} replace />;
}

function NavigateToAdminAudit() {
  return <Navigate to={`/admin/audit${window.location.search}`} replace />;
}
