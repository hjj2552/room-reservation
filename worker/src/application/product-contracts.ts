import type {
  AdminReservationInput,
  ConflictPolicy,
  PublicReservationInput,
  ReservationSource,
  ReservationStatus,
} from "../core/domain";

export interface PageQuery {
  page: number;
  size: number;
  offset: number;
}

export interface UpdateSettingsCommand {
  organizationName: string;
  publicNotice: string | null;
  reservationEnabled: boolean;
  reservationDisabledMessage: string | null;
  semesterStartDate: string;
  semesterEndDate: string;
  openTime: string;
  closeTime: string;
  publicOpenTime: string;
  publicCloseTime: string;
  slotMinutes: number;
  availableDaysOfWeek: string[];
  publicAvailableDaysOfWeek: string[];
  minReservationMinutes: number;
  maxReservationMinutes: number;
  adminContactEmail: string | null;
  adminContactPhone: string | null;
  completionMessage: string | null;
  version: number;
}

export interface RoomListQuery extends PageQuery {
  includeDeleted: boolean;
  enabled?: boolean | undefined;
  keyword?: string | undefined;
}

export interface SaveRoomCommand {
  name: string;
  location: string | null;
  capacity: number;
  description: string | null;
  enabled: boolean;
}

export interface SaveRoomOrderCommand {
  orderVersion: number;
  roomIds: string[];
}

export interface SaveTagCommand {
  name: string;
  color: string;
}

export interface TagListQuery extends PageQuery {
  keyword?: string | undefined;
}

export interface PublicReservationCommand {
  reservation: PublicReservationInput;
  password: string;
}

export interface AdminReservationCommand {
  reservation: AdminReservationInput;
  status: ReservationStatus;
  memo: string | null;
}

export interface ReservationFilterQuery {
  from?: string | undefined;
  to?: string | undefined;
  roomId?: string | undefined;
  status?: ReservationStatus | undefined;
  source?: ReservationSource | undefined;
  excludeCancelled: boolean;
  keyword?: string | undefined;
  phoneKeyword?: string | undefined;
}

export interface ReservationListQuery extends ReservationFilterQuery, PageQuery {}

export interface AvailabilityQuery {
  roomId: string;
  startAt: string;
  endAt: string;
}

export type HistoryAction =
  | "CREATED"
  | "CREATED_BY_ADMIN"
  | "UPDATED"
  | "APPROVED"
  | "CANCELLED"
  | "DELETED"
  | "RECURRENCE_GENERATED"
  | "RECURRENCE_CANCELLED";

export interface HistoryListQuery extends PageQuery {
  reservationId?: string | undefined;
  roomId?: string | undefined;
  action?: HistoryAction | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface RecurrencePreviewCommand {
  roomId: string;
  startDate: string;
  endDate: string;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  applicantPhone: string | null;
  conflictPolicy: ConflictPolicy;
}

export interface RecurrenceCreateCommand extends RecurrencePreviewCommand {
  applicantName: string;
  applicantEmail: string | null;
  purpose: string;
  tagId: string | null;
  showApplicantName: boolean;
}

export interface RecurrenceListQuery extends PageQuery {
  roomId?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  keyword?: string | undefined;
}
