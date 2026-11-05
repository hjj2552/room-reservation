import { Menu } from 'lucide-react';
import { createContext, useContext, type ComponentProps, type ReactNode, type RefObject } from 'react';

export const AdminMenuContext = createContext({
  open: false,
  pendingCount: 0,
  openMenu: () => {},
  triggerRef: undefined as RefObject<HTMLButtonElement | null> | undefined,
});

export function AdminPageTitle({ children, ...props }: ComponentProps<'h1'>) {
  const menu = useContext(AdminMenuContext);
  return (
    <div className="admin-page-title">
      <button
        ref={menu.triggerRef}
        type="button"
        className="ghost-button icon-button admin-menu-toggle"
        aria-label="관리자 메뉴 열기"
        aria-expanded={menu.open}
        aria-controls="admin-mobile-menu"
        aria-describedby={menu.pendingCount > 0 ? 'admin-menu-pending' : undefined}
        onClick={menu.openMenu}
      >
        <Menu size={22} aria-hidden="true" />
        {menu.pendingCount > 0 ? (
          <>
            <span className="admin-menu-pending-dot" aria-hidden="true" />
            <span id="admin-menu-pending" className="sr-only">
              승인 대기 예약 {menu.pendingCount.toLocaleString('ko-KR')}건
            </span>
          </>
        ) : null}
      </button>
      <h1 {...props}>{children}</h1>
    </div>
  );
}

export function AdminPageState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="page-section">
      <div className="page-header"><AdminPageTitle>{title}</AdminPageTitle></div>
      {children}
    </section>
  );
}
