import { Mail, Phone } from 'lucide-react';
import { usePublicSettings } from '../shared/hooks/usePublicReservation';

function telephoneHref(value: string) {
  return `tel:${value.trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')}`;
}

export function PublicContactFooter() {
  const settings = usePublicSettings();
  const organizationName = settings.data?.organizationName?.trim();
  const email = settings.data?.adminContactEmail?.trim();
  const phone = settings.data?.adminContactPhone?.trim();

  if (!organizationName && !email && !phone) return null;

  return (
    <footer className="public-contact-footer" aria-label="기관 문의 정보" data-testid="public-contact-footer">
      <div className="public-contact-footer-inner">
        {organizationName ? <strong>{organizationName}</strong> : null}
        <div className="public-contact-links">
          {email ? (
            <a href={`mailto:${email}`}>
              <Mail size={16} aria-hidden="true" />
              <span>문의 이메일</span>
              <span>{email}</span>
            </a>
          ) : null}
          {phone ? (
            <a href={telephoneHref(phone)}>
              <Phone size={16} aria-hidden="true" />
              <span>문의 전화번호</span>
              <span>{phone}</span>
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
