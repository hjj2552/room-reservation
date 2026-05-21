import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { AuditPage } from '../pages/AuditPage';
import { LoginPage } from '../pages/LoginPage';
import { RecurrenceDetailPage } from '../pages/RecurrenceDetailPage';
import { ReservationDetailPage } from '../pages/ReservationDetailPage';
import { ReservationFormPage } from '../pages/ReservationFormPage';
import { ReservationsPage } from '../pages/ReservationsPage';
import { RecurrencesPage } from '../pages/RecurrencesPage';
import { RoomsPage } from '../pages/RoomsPage';
import { SettingsPage } from '../pages/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="/reservations" replace /> },
          { path: '/reservations', element: <ReservationsPage /> },
          { path: '/reservations/new', element: <ReservationFormPage mode="create" /> },
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
    element: <Navigate to="/reservations" replace />,
  },
]);
