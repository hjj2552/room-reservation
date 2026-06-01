import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../shared/api/http';
import { useAdminSession, useLogin } from '../../shared/hooks/useAuth';

export function LoginPage() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const session = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from?.pathname || '/admin/reservations';

  if (session.data) {
    return <Navigate to="/admin/reservations" replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate(
      { username, password },
      {
        onSuccess: () => navigate(from, { replace: true }),
      },
    );
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <h1 id="login-title">강의실 예약 운영 로그인</h1>
          <p className="muted">예약 승인, 수정, 반복 예약 관리를 처리합니다.</p>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            아이디
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {login.isError ? <div className="inline-error" role="alert">{errorMessage(login.error)}</div> : null}
          <button type="submit" className="primary-button" disabled={login.isPending}>
            {login.isPending ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </section>
    </main>
  );
}
