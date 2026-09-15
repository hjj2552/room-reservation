export const publicRequestInputStorageKey = 'public.reservation.request-input.v1';

interface PublicRequestInput {
  purpose: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
}

export function readPublicRequestInput(): PublicRequestInput | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(publicRequestInputStorageKey) || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!('purpose' in value) || typeof value.purpose !== 'string'
      || !('applicantName' in value) || typeof value.applicantName !== 'string'
      || !('applicantEmail' in value) || typeof value.applicantEmail !== 'string'
      || !('applicantPhone' in value) || typeof value.applicantPhone !== 'string') return null;
    return {
      purpose: value.purpose,
      applicantName: value.applicantName,
      applicantEmail: value.applicantEmail,
      applicantPhone: value.applicantPhone,
    };
  } catch {
    return null;
  }
}

export function savePublicRequestInput(value: PublicRequestInput) {
  try {
    window.sessionStorage.setItem(publicRequestInputStorageKey, JSON.stringify({
      purpose: value.purpose,
      applicantName: value.applicantName,
      applicantEmail: value.applicantEmail,
      applicantPhone: value.applicantPhone,
    }));
  } catch {
    // A successful reservation must remain successful when storage is unavailable.
  }
}
