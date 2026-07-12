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
  { path: '/reservations/:reservationId', element: <PublicReservationDetailPage /> },
  { path: '/reservations/:reservationId/edit', element: <PublicReservationEditPage /> },
  { path: '/admin/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/reservations', element: <ReservationsPage /> },
          { path: '/admin/timetable', element: <TimetablePage /> },
          { path: '/admin/reservations/:reservationId', element: <ReservationDetailPage /> },
          { path: '/admin/reservations/:reservationId/edit', element: <ReservationFormPage /> },
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
  { path: '*', element: <Navigate to="/" replace /> },
]);
