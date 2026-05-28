export type ReservationStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED';
export type ReservationSource = 'PUBLIC_FORM' | 'ADMIN_GRID' | 'ADMIN_MANUAL' | 'RECURRING_GENERATED';
export type ConflictPolicy = 'FAIL_ALL' | 'SKIP_CONFLICTS' | 'CREATE_AVAILABLE_ONLY';

export interface PagedResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiErrorResponse {
  code?: string;
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
  requirePhone: boolean;
  adminContactName: string | null;
  adminContactEmail: string | null;
  adminContactPhone: string | null;
  completionMessage: string | null;
  version: number;
}

export type PublicSettings = Omit<
  OperationSettings,
  'adminContactName' | 'adminContactPhone' | 'version'
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
  status: Extract<ReservationStatus, 'REQUESTED' | 'CONFIRMED'>;
  purpose: string;
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
  applicantPhone?: string;
  purpose: string;
  startAt: string;
  endAt: string;
  cancelPassword: string;
}

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
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  purpose: string;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  cancellable: boolean;
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
  reservationPurpose: string | null;
  reservationRoomName: string | null;
  reservationStartAt: string | null;
  reservationEndAt: string | null;
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
  page?: number;
  size?: number;
}

export interface ReservationPayload {
  roomId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
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
}

export interface RecurrenceCreatePayload extends RecurrencePreviewPayload {
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  purpose: string;
  conflictPolicy: ConflictPolicy;
}

export interface RecurrencePreview {
  totalCandidates: number;
  availableCount: number;
  conflictCount: number;
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
  startDate: string;
  endDate: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  conflictPolicy: ConflictPolicy;
  deleted: boolean;
  createdAt: string;
}
