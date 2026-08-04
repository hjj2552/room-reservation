import type { ReactNode } from 'react';
import type { ReservationStatus } from '../api/types';
import { formatDateTime } from '../utils/date';
import { StatusBadge } from './StatusBadge';

export interface DetailField {
  label: string;
  value?: ReactNode;
}

export interface DetailSection {
  title: string;
  fields: DetailField[];
}

interface ReservationDetailViewProps {
  status: ReservationStatus;
  sections: DetailSection[];
}

export function emptyValue(value?: ReactNode) {
  return value === undefined || value === null || value === '' ? '-' : value;
}

export function PublicVisibilityValue({
  value,
  isPublic,
  testId,
}: {
  value?: ReactNode;
  isPublic: boolean;
  testId?: string;
}) {
  return (
    <span className="public-visibility-value" data-testid={testId}>
      <span>{emptyValue(value)}</span>
      <span className={`public-visibility-label ${isPublic ? 'is-public' : ''}`}>
        ({isPublic ? '공개' : '비공개'})
      </span>
    </span>
  );
}

export function reservationCoreSections(detail: {
  room: { name: string; location?: string | null };
  startAt: string;
  endAt: string;
  applicantName: string;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  purpose: ReactNode;
  publicVisibility?: {
    showApplicantName: boolean;
  };
}): DetailSection[] {
  const roomLabel = detail.room.location ? `${detail.room.name} (${detail.room.location})` : detail.room.name;
  const applicantName = detail.publicVisibility ? (
    <PublicVisibilityValue
      value={detail.applicantName}
      isPublic={detail.publicVisibility.showApplicantName}
      testId="reservation-detail-applicant-name"
    />
  ) : detail.applicantName;
  const applicantEmail = detail.publicVisibility ? (
    <PublicVisibilityValue
      value={detail.applicantEmail}
      isPublic={false}
      testId="reservation-detail-applicant-email"
    />
  ) : detail.applicantEmail;
  const applicantPhone = detail.publicVisibility ? (
    <PublicVisibilityValue
      value={detail.applicantPhone}
      isPublic={false}
      testId="reservation-detail-applicant-phone"
    />
  ) : detail.applicantPhone;

  return [
    {
      title: '예약 정보',
      fields: [
        { label: '신청 목적', value: detail.purpose },
        { label: '공간', value: roomLabel },
        { label: '날짜/시간', value: `${formatDateTime(detail.startAt)} - ${formatDateTime(detail.endAt)}` },
        { label: '신청자 이름', value: applicantName },
        { label: '이메일', value: applicantEmail },
        { label: '전화번호', value: applicantPhone },
      ],
    },
  ];
}

export function ReservationDetailView({ status, sections }: ReservationDetailViewProps) {
  const primarySection = sections[0];

  return (
    <section className="panel reservation-detail-main" aria-labelledby="reservation-detail-info-title">
      <div className="panel-header reservation-detail-header">
        <h2 id="reservation-detail-info-title">{primarySection?.title || '예약 정보'}</h2>
        <StatusBadge status={status} />
      </div>
      <div className="reservation-detail-sections">
        {sections.map((section, index) => {
          const titleId = `detail-section-${index}`;
          return (
            <section
              key={section.title}
              className="reservation-detail-section"
              aria-labelledby={index === 0 ? 'reservation-detail-info-title' : titleId}
            >
              {index > 0 ? <h3 id={titleId}>{section.title}</h3> : null}
              <dl className="description-list">
                {section.fields.map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{emptyValue(field.value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </section>
  );
}
