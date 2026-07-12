import { Outlet } from 'react-router-dom';
import { PublicContactFooter } from './PublicContactFooter';

export function PublicLayout() {
  return (
    <div className="public-site">
      <div className="public-site-content">
        <Outlet />
      </div>
      <PublicContactFooter />
    </div>
  );
}
