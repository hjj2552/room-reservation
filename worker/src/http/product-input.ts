import type {
  AdminReservationCommand,
  AvailabilityQuery,
  HistoryAction,
  HistoryListQuery,
  PageQuery,
  PublicReservationCommand,
  RecurrenceCreateCommand,
  RecurrenceListQuery,
  RecurrencePreviewCommand,
  ReservationFilterQuery,
  ReservationListQuery,
  RoomListQuery,
  SaveRoomCommand,
  SaveRoomOrderCommand,
  SaveTagCommand,
  TagListQuery,
  UpdateSettingsCommand,
} from "../application/product-contracts";
import {
  normalizeDays,
  normalizeApplicantPhone,
  optionalEmail,
  parseBooleanParameter,
  parseDate,
  parseEnumParameter,
  parseAdminReservationInput,
  parseInstant,
  parsePublicReservationInput,
  parseTime,
  parseUuid,
  requireBoolean,
  requireEmail,
  requireInteger,
  requireObject,
  requireString,
  requireUuid,
  type ConflictPolicy,
  type ReservationSource,
  type ReservationStatus,
} from "../core/domain";
import { validation } from "../core/errors";
import { isValidPublicPassword } from "../core/security";

const reservationStatuses = ["REQUESTED", "CONFIRMED", "CANCELLED"] as const;
const reservationSources = ["PUBLIC_FORM", "ADMIN_GRID", "ADMIN_MANUAL", "RECURRING_GENERATED"] as const;
const conflictPolicies = ["FAIL_ALL", "SKIP_CONFLICTS"] as const;
const historyActions = [
  "CREATED",
  "CREATED_BY_ADMIN",
  "UPDATED",
  "APPROVED",
  "CANCELLED",
  "DELETED",
  "RECURRENCE_GENERATED",
  "RECURRENCE_CANCELLED",
] as const;

function optionalText(
  object: Record<string, unknown>,
  field: string,
  options: { max?: number; allowBlank?: boolean } = {},
): string | null {
  return object[field] === null || object[field] === undefined
    ? null
    : requireString(object, field, options);
}

function pageQuery(params: URLSearchParams): PageQuery {
  const page = params.has("page") ? Number(params.get("page")) : 0;
  const requestedSize = params.has("size") ? Number(params.get("size")) : 20;
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(requestedSize) || requestedSize < 1) {
    validation("Page must be non-negative and size must be positive.");
  }
  const size = Math.min(100, requestedSize);
  return { page, size, offset: page * size };
}

function keyword(params: URLSearchParams): string | undefined {
  return params.get("keyword")?.trim().toLowerCase() || undefined;
}

function publicPassword(object: Record<string, unknown>): string {
  const password = object.cancelPassword;
  if (!isValidPublicPassword(password)) {
    validation("예약 비밀번호는 영문, 숫자, 특수문자를 사용해 4~64자로 입력해 주세요.", "cancelPassword");
  }
  return password;
}

function memo(body: unknown): string | null {
  const object = body === undefined || body === null ? {} : requireObject(body);
  return object.memo === undefined || object.memo === null
    ? null
    : requireString(object, "memo", { max: 1000, allowBlank: true });
}

function reservationStatus(value: unknown, fallback?: ReservationStatus): ReservationStatus {
  if (value === undefined || value === null || value === "") {
    if (fallback) return fallback;
    validation("must not be null", "status");
  }
  if (typeof value !== "string" || !reservationStatuses.includes(value as ReservationStatus)) {
    validation("Invalid reservation status.", "status");
  }
  return value as ReservationStatus;
}

function recurrence(body: unknown, requireApplicant: false): RecurrencePreviewCommand;
function recurrence(body: unknown, requireApplicant: true): RecurrenceCreateCommand;
function recurrence(
  body: unknown,
  requireApplicant: boolean,
): RecurrencePreviewCommand | RecurrenceCreateCommand {
  const object = requireObject(body);
  const conflictPolicy = parseEnumParameter(
    requireString(object, "conflictPolicy"),
    "conflictPolicy",
    conflictPolicies,
  ) as ConflictPolicy;
  const common: RecurrencePreviewCommand = {
    roomId: requireUuid(object, "roomId"),
    startDate: parseDate(requireString(object, "startDate"), "startDate"),
    endDate: parseDate(requireString(object, "endDate"), "endDate"),
    daysOfWeek: normalizeDays(object.daysOfWeek),
    startTime: parseTime(requireString(object, "startTime"), "startTime"),
    endTime: parseTime(requireString(object, "endTime"), "endTime"),
    applicantPhone: normalizeApplicantPhone(object, false),
    conflictPolicy,
  };
  if (!requireApplicant) return common;
  return {
    ...common,
    applicantName: requireString(object, "applicantName", { max: 100 }),
    applicantEmail: optionalEmail(object, "applicantEmail"),
    purpose: requireString(object, "purpose", { max: 500 }),
    showApplicantName: object.showApplicantName === undefined
      ? false
      : requireBoolean(object, "showApplicantName"),
    tagId: object.tagId === undefined || object.tagId === null || object.tagId === ""
      ? null
      : requireUuid(object, "tagId"),
  };
}

export function parseUpdateSettings(body: unknown): UpdateSettingsCommand {
  const input = requireObject(body);
  return {
    organizationName: requireString(input, "organizationName", { max: 150 }),
    publicNotice: optionalText(input, "publicNotice", { allowBlank: true }),
    reservationEnabled: requireBoolean(input, "reservationEnabled"),
    reservationDisabledMessage: optionalText(input, "reservationDisabledMessage", { allowBlank: true }),
    semesterStartDate: parseDate(requireString(input, "semesterStartDate"), "semesterStartDate"),
    semesterEndDate: parseDate(requireString(input, "semesterEndDate"), "semesterEndDate"),
    openTime: parseTime(requireString(input, "openTime"), "openTime"),
    closeTime: parseTime(requireString(input, "closeTime"), "closeTime"),
    publicOpenTime: parseTime(requireString(input, "publicOpenTime"), "publicOpenTime"),
    publicCloseTime: parseTime(requireString(input, "publicCloseTime"), "publicCloseTime"),
    slotMinutes: requireInteger(input, "slotMinutes"),
    availableDaysOfWeek: normalizeDays(input.availableDaysOfWeek, "availableDaysOfWeek"),
    publicAvailableDaysOfWeek: normalizeDays(input.publicAvailableDaysOfWeek, "publicAvailableDaysOfWeek"),
    minReservationMinutes: requireInteger(input, "minReservationMinutes", 30),
    maxReservationMinutes: requireInteger(input, "maxReservationMinutes", 1),
    adminContactEmail: input.adminContactEmail === null || input.adminContactEmail === "" || input.adminContactEmail === undefined
      ? null
      : requireEmail(input, "adminContactEmail"),
    adminContactPhone: optionalText(input, "adminContactPhone", { max: 50, allowBlank: true }),
    completionMessage: optionalText(input, "completionMessage", { allowBlank: true }),
    version: requireInteger(input, "version", 0),
  };
}

export function parseRoomList(params: URLSearchParams): RoomListQuery {
  return {
    ...pageQuery(params),
    includeDeleted: parseBooleanParameter(params.get("includeDeleted"), "includeDeleted", false),
    enabled: params.has("enabled")
      ? parseBooleanParameter(params.get("enabled"), "enabled", false)
      : undefined,
    keyword: keyword(params),
  };
}

export function parseSaveRoom(body: unknown): SaveRoomCommand {
  const input = requireObject(body);
  const name = typeof input.name === "string" ? input.name.trim() : input.name;
  return {
    name: requireString({ name }, "name", { max: 100 }),
    location: optionalText(input, "location", { max: 150, allowBlank: true }),
    capacity: requireInteger(input, "capacity", 0),
    description: optionalText(input, "description", { allowBlank: true }),
    enabled: requireBoolean(input, "enabled"),
  };
}

export function parseRoomEnabled(body: unknown): boolean {
  return requireBoolean(requireObject(body), "enabled");
}

export function parseSaveRoomOrder(body: unknown): SaveRoomOrderCommand {
  const input = requireObject(body);
  const orderVersion = requireInteger(input, "orderVersion", 0);
  if (!Array.isArray(input.roomIds)) validation("roomIds must be an array.", "roomIds");
  if (input.roomIds.length > 10_000) validation("roomIds is too large.", "roomIds");
  const roomIds = input.roomIds.map((roomId, index) => {
    if (typeof roomId !== "string") validation("roomIds must contain UUID strings.", `roomIds[${index}]`);
    return parseUuid(roomId, `roomIds[${index}]`);
  });
  if (new Set(roomIds).size !== roomIds.length) {
    validation("roomIds must not contain duplicates.", "roomIds");
  }
  return { orderVersion, roomIds };
}

export function parseTagList(params: URLSearchParams): TagListQuery {
  return { ...pageQuery(params), keyword: keyword(params) };
}

export function parseSaveTag(body: unknown): SaveTagCommand {
  const input = requireObject(body);
  const color = requireString(input, "color");
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) validation("Tag color must be a hex color.", "color");
  return { name: requireString(input, "name", { max: 100 }).trim(), color };
}

export function parsePublicReservation(body: unknown): PublicReservationCommand {
  const input = requireObject(body);
  return { reservation: parsePublicReservationInput(input), password: publicPassword(input) };
}

export function parsePublicPassword(body: unknown): string {
  return publicPassword(requireObject(body));
}

export function parseAdminReservation(body: unknown, fallbackStatus?: ReservationStatus): AdminReservationCommand {
  const input = requireObject(body);
  return {
    reservation: parseAdminReservationInput(input),
    status: reservationStatus(input.status, fallbackStatus),
    memo: input.memo === undefined || input.memo === null
      ? null
      : requireString(input, "memo", { max: 1000, allowBlank: true }),
  };
}

export function parseMemo(body: unknown): string | null {
  return memo(body);
}

export function parseReservationFilter(params: URLSearchParams): ReservationFilterQuery {
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  const roomId = params.get("roomId") || undefined;
  if (from) parseInstant(from, "from");
  if (to) parseInstant(to, "to");
  return {
    from,
    to,
    roomId: roomId ? parseUuid(roomId, "roomId") : undefined,
    status: parseEnumParameter(params.get("status"), "status", reservationStatuses),
    source: parseEnumParameter(params.get("source"), "source", reservationSources),
    excludeCancelled: parseBooleanParameter(params.get("excludeCancelled"), "excludeCancelled", false),
    keyword: keyword(params),
  };
}

export function parseReservationList(params: URLSearchParams): ReservationListQuery {
  return { ...pageQuery(params), ...parseReservationFilter(params) };
}

export function parseAvailability(params: URLSearchParams): AvailabilityQuery {
  const roomId = params.get("roomId");
  const startAt = params.get("startAt");
  const endAt = params.get("endAt");
  if (!roomId || !startAt || !endAt) validation("roomId, startAt and endAt are required.");
  parseInstant(startAt, "startAt");
  parseInstant(endAt, "endAt");
  return { roomId: parseUuid(roomId, "roomId"), startAt, endAt };
}

export function parseHistoryList(params: URLSearchParams): HistoryListQuery {
  const reservationId = params.get("reservationId") || undefined;
  const roomId = params.get("roomId") || undefined;
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  if (from) parseInstant(from, "from");
  if (to) parseInstant(to, "to");
  return {
    ...pageQuery(params),
    reservationId: reservationId ? parseUuid(reservationId, "reservationId") : undefined,
    roomId: roomId ? parseUuid(roomId, "roomId") : undefined,
    action: parseEnumParameter(params.get("action"), "action", historyActions) as HistoryAction | undefined,
    from,
    to,
  };
}

export function parseRecurrencePreview(body: unknown): RecurrencePreviewCommand {
  return recurrence(body, false);
}

export function parseRecurrenceCreate(body: unknown): RecurrenceCreateCommand {
  return recurrence(body, true);
}

export function parseRecurrenceList(params: URLSearchParams): RecurrenceListQuery {
  const roomId = params.get("roomId") || undefined;
  const fromDate = params.get("fromDate") || undefined;
  const toDate = params.get("toDate") || undefined;
  return {
    ...pageQuery(params),
    roomId: roomId ? parseUuid(roomId, "roomId") : undefined,
    fromDate: fromDate ? parseDate(fromDate, "fromDate") : undefined,
    toDate: toDate ? parseDate(toDate, "toDate") : undefined,
    keyword: keyword(params),
  };
}

export function parseUuidPath(value: string | undefined, field: string): string {
  return parseUuid(value, field);
}

export function parseDateQuery(value: string | undefined, field: string): string {
  if (!value) validation(`${field} is required.`);
  return parseDate(value, field);
}
