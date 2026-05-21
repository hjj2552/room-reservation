import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '../components/StateViews';
import { isUnauthorized, useAdminSession } from '../hooks/useAuth';

export function ProtectedRoute() {
  const location = useLocation();
  const session = useAdminSession();

  if (session.isLoading) {
    return <LoadingState message="관리자 세션을 확인하는 중입니다." />;
  }

  if (session.isError && isUnauthorized(session.error)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!session.data) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
