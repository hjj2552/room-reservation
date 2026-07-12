export type ReservationStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED';
export type ReservationSource = 'PUBLIC_FORM' | 'ADMIN_GRID' | 'ADMIN_MANUAL' | 'RECURRING_GENERATED';
export type ConflictPolicy = 'FAIL_ALL' | 'SKIP_CONFLICTS';
export type RecurrenceStatus = 'ACTIVE' | 'CANCELLED';
export type ApiErrorCode =
  | 'ADMIN_UNAUTHORIZED'
  | 'DATA_INTEGRITY_VIOLATION'
  | 'INVALID_DURATION'
  | 'INVALID_SLOT_UNIT'
  | 'NOT_FOUND'
  | 'OUTSIDE_OPERATING_DAYS'
  | 'OUTSIDE_OPERATING_HOURS'
  | 'OUTSIDE_SEMESTER_PERIOD'
  | 'POLICY_NOT_CONFIGURED'
  | 'PUBLIC_CANCEL_PASSWORD_MISMATCH'
  | 'PUBLIC_RESERVATION_PASSWORD_MISMATCH'
  | 'RATE_LIMIT_EXCEEDED'
  | 'RECURRENCE_CONFLICT'
  | 'RESERVATION_DISABLED'
  | 'ROOM_DELETE_BLOCKED'
  | 'ROOM_DISABLED'
  | 'ROOM_NAME_DUPLICATED'
  | 'SYSTEM_ROOM_PROTECTED'
  | 'TAG_NAME_DUPLICATED'
  | 'TIME_SLOT_CONFLICT'
  | 'VALIDATION_ERROR'
  | 'VERSION_CONFLICT';

export interface PagedResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiErrorResponse {
  code?: ApiErrorCode | (string & {});
  message?: string;
  details?: Record<string, unknown>;
  fieldErrors?: Array<{ field: string; message: string }>;
}

export interface AdminSession {
  id: string;
  username: string;
  role: string;
}

export interface AdminRoom {
  id: string;
  name: string;
  location: string | null;
  capacity: number | null;
  description: string | null;
  enabled: boolean;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RoomDeletionCheck {
  roomId: string;
  roomName: string;
  deletable: boolean;
  checks: Array<{
    code: string;
    label: string;
    description: string;
    passed: boolean;
    count: number;
  }>;
  blockers: Array<{
    code: string;
    message: string;
    count: number;
  }>;
}

export interface RoomPayload {
  name: string;
  location?: string;
  capacity: number;
  description?: string;
  enabled: boolean;
}

export interface OperationSettings {
  organizationName: string;
  publicNotice: string | null;
  reservationEnabled: boolean;
  reservationDisabledMessage: string | null;
  semesterStartDate: string;
  semesterEndDate: string;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  availableDaysOfWeek: string[];
  minReservationMinutes: number;
  maxReservationMinutes: number;
  adminContactEmail: string | null;
  adminContactPhone: string | null;
  completionMessage: string | null;
  logoUrl: string | null;
  version: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagFilters {
  keyword?: string;
  page?: number;
  size?: number;
}

export interface TagPayload {
  name: string;
  color: string;
}

export type PublicSettings = Omit<
  OperationSettings,
  'version'
>;

export interface PublicRoom {
  id: string;
  name: string;
  location: string | null;
  capacity: number | null;
  description: string | null;
}

export interface PublicReservationBlock {
  id: string;
  roomId: string;
  roomName: string;
  applicantName: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  purpose: string;
  recurrenceId: string | null;
  seriesLabel: string | null;
  seriesColor: string | null;
}

export interface PublicWeeklyReservations {
  room: {
    id: string;
    name: string;
    location: string | null;
  };
  weekStart: string;
  weekEnd: string;
  reservations: PublicReservationBlock[];
}

export interface PublicReservationPayload {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  startAt: string;
  endAt: string;
  cancelPassword: string;
}

export type PublicReservationUpdatePayload = PublicReservationPayload;

export interface PublicReservationResult {
  id: string;
  status: ReservationStatus;
  message: string | null;
}

export interface PublicReservationDetail {
  id: string;
  room: {
    id: string;
    name: string;
    location: string | null;
  };
  applicantName: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
  purpose: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  cancellable: boolean;
  editable: boolean;
}

export interface PublicReservationEditDetail extends PublicReservationDetail {
  applicantEmail: string;
  applicantPhone: string;
}

export interface ReservationListItem {
  id: string;
  roomId: string;
  roomName: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string | null;
  purpose: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  source: ReservationSource;
  recurrenceId: string | null;
  seriesLabel: string | null;
  seriesColor: string | null;
  recurrenceException: boolean;
  createdAt: string;
}

export interface ReservationDetail {
  id: string;
  room: {
    id: string;
    name: string;
    location: string | null;
  };
  recurrenceId: string | null;
  series: {
    id: string;
    label: string | null;
    color: string | null;
  } | null;
  recurrenceException: boolean;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string | null;
  purpose: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  source: ReservationSource;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationHistory {
  id: string;
  reservationId: string;
  action: string;
  beforeStatus: ReservationStatus | null;
  afterStatus: ReservationStatus | null;
  memo: string | null;
  reservationRoomId: string | null;
  beforeReservationRoomId: string | null;
  reservationPurpose: string | null;
  beforeReservationPurpose: string | null;
  reservationRoomName: string | null;
  beforeReservationRoomName: string | null;
  reservationStartAt: string | null;
  beforeReservationStartAt: string | null;
  reservationEndAt: string | null;
  beforeReservationEndAt: string | null;
  reservationApplicantName: string | null;
  beforeReservationApplicantName: string | null;
  reservationApplicantEmail: string | null;
  beforeReservationApplicantEmail: string | null;
  reservationApplicantPhone: string | null;
  beforeReservationApplicantPhone: string | null;
  actorType: string;
  actorId: string;
  createdAt: string;
}

export interface ReservationFilters {
  status?: ReservationStatus | '';
  roomId?: string;
  from?: string;
  to?: string;
  keyword?: string;
  excludeCancelled?: boolean;
  page?: number;
  size?: number;
}

export interface ReservationPayload {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  memo?: string;
}

export interface RecurrencePreviewPayload {
  roomId: string;
  startDate: string;
  endDate: string;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  applicantPhone: string;
  conflictPolicy: ConflictPolicy;
}

export interface RecurrenceFilters {
  status?: RecurrenceStatus | '';
  roomId?: string;
  fromDate?: string;
  toDate?: string;
  keyword?: string;
  includeDeleted?: boolean;
  page?: number;
  size?: number;
}

export interface RecurrenceCreatePayload extends RecurrencePreviewPayload {
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  purpose: string;
  tagId?: string | null;
}

export interface RecurrencePreview {
  conflictPolicy: ConflictPolicy;
  totalCandidates: number;
  availableCount: number;
  conflictCount: number;
  createAllowed: boolean;
  items: Array<{
    date: string;
    startAt: string;
    endAt: string;
    available: boolean;
    reason: string | null;
    message: string | null;
  }>;
}

export interface RecurrenceCreateResult {
  recurrenceId: string;
  tagId: string | null;
  tagName: string | null;
  tagColor: string | null;
  conflictPolicy: ConflictPolicy;
  totalCandidates: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  items: Array<{
    date: string;
    status: string;
    reason: string | null;
  }>;
}

export interface RecurrenceListItem {
  id: string;
  roomId: string;
  roomName: string;
  purpose: string;
  tagId: string | null;
  tagName: string | null;
  tagColor: string | null;
  startDate: string;
  endDate: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  conflictPolicy: ConflictPolicy;
  deleted: boolean;
  createdAt: string;
}

export interface RecurrenceDetail {
  id: string;
  room: {
    id: string;
    name: string;
    location: string | null;
  };
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string | null;
  purpose: string;
  tagId: string | null;
  tagName: string | null;
  tagColor: string | null;
  startDate: string;
  endDate: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  conflictPolicy: ConflictPolicy;
  deleted: boolean;
  createdAt: string;
  reservations: Array<{
    id: string;
    roomId: string;
    roomName: string;
    purpose: string;
    startAt: string;
    endAt: string;
    status: ReservationStatus;
    exception: boolean;
  }>;
}
