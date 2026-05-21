import type { ConflictPolicy, ReservationSource, ReservationStatus } from '../api/types';

export const statusLabels: Record<ReservationStatus, string> = {
  REQUESTED: '승인 대기',
  CONFIRMED: '확정',
  CANCELLED: '취소',
};

export const sourceLabels: Record<ReservationSource, string> = {
  PUBLIC_FORM: '공개 신청',
  ADMIN_GRID: '관리자 화면',
  ADMIN_MANUAL: '관리자 등록',
  RECURRING_GENERATED: '반복 생성',
};

export const conflictPolicyLabels: Record<ConflictPolicy, string> = {
  FAIL_ALL: '충돌이 있으면 전체 중단',
  SKIP_CONFLICTS: '충돌 건은 건너뛰기',
  CREATE_AVAILABLE_ONLY: '가능한 예약만 생성',
};

export const dayLabels: Record<string, string> = {
  MON: '월',
  TUE: '화',
  WED: '수',
  THU: '목',
  FRI: '금',
  SAT: '토',
  SUN: '일',
};

export function historyActionLabel(action: string) {
  const labels: Record<string, string> = {
    CREATED: '생성',
    CREATED_BY_ADMIN: '관리자 생성',
    CREATED_BY_PUBLIC: '공개 신청 생성',
    RECURRENCE_CREATED: '반복 예약 생성',
    RECURRENCE_GENERATED: '반복 예약 생성',
    UPDATED: '수정',
    APPROVED: '승인',
    CANCELLED: '취소',
    RECURRENCE_CANCELLED: '반복 예약 취소',
  };
  return labels[action] || action;
}
