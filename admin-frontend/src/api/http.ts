import type { ApiErrorResponse } from './types';

export class ApiError extends Error {
  status: number;
  body?: ApiErrorResponse;

  constructor(status: number, body?: ApiErrorResponse) {
    super(body?.message || `요청에 실패했습니다. (${status})`);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let body: ApiErrorResponse | undefined;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return response.text() as Promise<T>;
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return apiErrorMessage(error);
  }
  if (error instanceof Error) {
    if (isNetworkError(error)) {
      return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    }
    return error.message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  return '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

function apiErrorMessage(error: ApiError) {
  if (error.body?.fieldErrors?.length) {
    return unique(error.body.fieldErrors.map((fieldError) => fieldErrorMessage(fieldError.field, fieldError.message)))
      .join(' ');
  }

  const code = error.body?.code;
  if (code) {
    const mapped = messageByCode(code, error);
    if (mapped) return mapped;
  }

  if (error.status === 400 && error.body?.message) {
    return validationErrorMessage(error.body.message);
  }

  if (error.status === 404 && error.body?.message) {
    return notFoundMessage(error.body.message);
  }

  return messageByStatus(error.status) || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function messageByCode(code: string, error: ApiError) {
  const messages: Record<string, string> = {
    ADMIN_UNAUTHORIZED: '로그인이 필요합니다. 다시 로그인해 주세요.',
    TIME_SLOT_CONFLICT: '같은 강의실의 같은 시간대에 이미 예약이 있습니다.',
    RECURRENCE_CONFLICT: '반복 예약 후보 중 충돌이 있습니다. 미리보기 결과를 확인해 주세요.',
    VERSION_CONFLICT: '다른 사용자가 먼저 수정했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.',
    ROOM_DISABLED: '선택한 강의실은 현재 예약할 수 없습니다.',
    RESERVATION_DISABLED: '현재 예약 접수가 중지되어 있습니다.',
    POLICY_NOT_CONFIGURED: '운영 설정이 아직 준비되지 않았습니다. 운영 설정을 확인해 주세요.',
    OUTSIDE_SEMESTER_PERIOD: '운영 설정의 예약 가능 기간 밖입니다.',
    OUTSIDE_OPERATING_DAYS: '예약 가능한 요일이 아닙니다. 운영 설정의 예약 가능 요일을 확인해 주세요.',
    OUTSIDE_OPERATING_HOURS: '운영 시간 안에서만 예약할 수 있습니다.',
    INVALID_DURATION: '예약 시간이 허용된 최소/최대 예약 시간을 벗어났습니다.',
    INVALID_SLOT_UNIT: '예약 시간이 설정된 예약 단위와 맞지 않습니다.',
    ROOM_NAME_DUPLICATED: '같은 이름의 강의실이 이미 있습니다.',
    ROOM_DELETE_BLOCKED: '강의실 삭제 조건을 충족하지 못했습니다. 삭제 가능 조건과 차단 사유를 확인하세요.',
    DATA_INTEGRITY_VIOLATION: '입력한 내용이 시스템 제약 조건과 맞지 않습니다. 값을 다시 확인해 주세요.',
  };

  if (code === 'VALIDATION_ERROR') return validationErrorMessage(error.body?.message);
  if (code === 'NOT_FOUND') return notFoundMessage(error.body?.message);
  return messages[code];
}

function messageByStatus(status: number) {
  if (status === 400) return '입력값을 다시 확인해 주세요.';
  if (status === 401) return '로그인이 필요합니다. 다시 로그인해 주세요.';
  if (status === 403) return '이 작업을 수행할 권한이 없습니다.';
  if (status === 404) return '요청한 대상을 찾을 수 없습니다. 목록을 새로고침해 주세요.';
  if (status === 409) return '다른 작업과 충돌했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.';
  if (status === 422) return '운영 정책에 맞지 않는 요청입니다. 입력값과 운영 설정을 확인해 주세요.';
  if (status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  return undefined;
}

function validationErrorMessage(message?: string) {
  const normalized = (message || '').toLowerCase();
  if (normalized.includes('start time') && normalized.includes('before end time')) {
    return '시작 시간은 종료 시간보다 빨라야 합니다.';
  }
  if (normalized.includes('start date') && normalized.includes('before or equal to end date')) {
    return '시작일은 종료일보다 늦을 수 없습니다.';
  }
  if (normalized.includes('phone number')) {
    return '전화번호를 입력해 주세요.';
  }
  if (normalized.includes('invalid day of week')) {
    return '반복 요일 값을 다시 확인해 주세요.';
  }
  if (normalized.includes('parse') || normalized.includes('format')) {
    return '날짜 또는 시간 형식을 다시 확인해 주세요.';
  }
  return '입력값을 다시 확인해 주세요.';
}

function notFoundMessage(message?: string) {
  const normalized = (message || '').toLowerCase();
  if (normalized.includes('room')) return '강의실을 찾을 수 없습니다. 목록을 새로고침해 주세요.';
  if (normalized.includes('reservation')) return '예약을 찾을 수 없습니다. 목록을 새로고침해 주세요.';
  if (normalized.includes('recurrence')) return '반복 예약을 찾을 수 없습니다. 목록을 새로고침해 주세요.';
  if (normalized.includes('settings')) return '운영 설정을 찾을 수 없습니다. 관리자에게 확인해 주세요.';
  return '요청한 대상을 찾을 수 없습니다. 목록을 새로고침해 주세요.';
}

function fieldErrorMessage(field: string, message?: string) {
  const label = fieldLabels[field] || '입력값';
  const normalized = (message || '').toLowerCase();

  if (normalized.includes('must not be blank') || normalized.includes('must not be null') || normalized.includes('must not be empty')) {
    return `${label}을(를) 입력해 주세요.`;
  }
  if (normalized.includes('well-formed email')) {
    return `${label} 형식을 다시 확인해 주세요.`;
  }
  if (normalized.includes('must be greater than or equal to')) {
    return `${label}은(는) 허용 범위보다 작을 수 없습니다.`;
  }
  if (normalized.includes('size must be between') || normalized.includes('length must be between')) {
    return `${label}이(가) 너무 깁니다.`;
  }

  return `${label}을(를) 다시 확인해 주세요.`;
}

const fieldLabels: Record<string, string> = {
  roomId: '강의실',
  name: '강의실명',
  location: '위치',
  capacity: '정원',
  applicantName: '신청자 이름',
  applicantEmail: '이메일',
  applicantPhone: '전화번호',
  purpose: '예약 목적',
  startAt: '시작 시간',
  endAt: '종료 시간',
  startDate: '시작일',
  endDate: '종료일',
  startTime: '시작 시간',
  endTime: '종료 시간',
  daysOfWeek: '반복 요일',
  conflictPolicy: '등록 정책',
  status: '상태',
  memo: '메모',
  organizationName: '기관명',
  publicNotice: '공개 안내',
  reservationDisabledMessage: '접수 중지 안내',
  semesterStartDate: '학기 시작일',
  semesterEndDate: '학기 종료일',
  openTime: '운영 시작 시간',
  closeTime: '운영 종료 시간',
  slotMinutes: '예약 단위',
  availableDaysOfWeek: '예약 가능 요일',
  minReservationMinutes: '최소 예약 시간',
  maxReservationMinutes: '최대 예약 시간',
  adminContactName: '담당자 이름',
  adminContactEmail: '담당자 이메일',
  adminContactPhone: '담당자 전화번호',
  completionMessage: '예약 완료 안내',
  version: '현재 버전',
};

function isNetworkError(error: Error) {
  const message = error.message.toLowerCase();
  return error instanceof TypeError
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network error')
    || message.includes('load failed');
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
