import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { AuditPage } from '../pages/AuditPage';
import { EntryChoicePage } from '../pages/EntryChoicePage';
import { LoginPage } from '../pages/LoginPage';
import { PublicReservationPage } from '../pages/PublicReservationPage';
import { RecurrenceDetailPage } from '../pages/RecurrenceDetailPage';
import { ReservationDetailPage } from '../pages/ReservationDetailPage';
import { ReservationFormPage } from '../pages/ReservationFormPage';
import { ReservationsPage } from '../pages/ReservationsPage';
import { RecurrencesPage } from '../pages/RecurrencesPage';
import { RoomsPage } from '../pages/RoomsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TimetablePage } from '../pages/TimetablePage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <EntryChoicePage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/public',
    element: <Navigate to="/public/reservations/new" replace />,
  },
  {
    path: '/request',
    element: <Navigate to="/public/reservations/new" replace />,
  },
  {
    path: '/public/reservations/new',
    element: <PublicReservationPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/reservations', element: <ReservationsPage /> },
          { path: '/timetable', element: <TimetablePage /> },
          { path: '/reservations/new', element: <Navigate to="/timetable" replace /> },
          { path: '/reservations/:reservationId', element: <ReservationDetailPage /> },
          { path: '/reservations/:reservationId/edit', element: <ReservationFormPage mode="edit" /> },
          { path: '/recurrences', element: <RecurrencesPage /> },
          { path: '/recurrences/:recurrenceId', element: <RecurrenceDetailPage /> },
          { path: '/rooms', element: <RoomsPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/audit', element: <AuditPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
