import {
  datesInRange,
  normalizeDays,
  paged,
  parseBooleanParameter,
  parseDate,
  parseEnumParameter,
  parseInstant,
  parsePage,
  parseReservationInput,
  parseTime,
  parseUuid,
  requireBoolean,
  requireEmail,
  requireInteger,
  requireObject,
  requireString,
  requireUuid,
  serviceOffsetDateTime,
  type ConflictPolicy,
  type OperationSettings,
  type ReservationInput,
  type ReservationSource,
  type ReservationStatus,
  validateReservationPolicy,
  weekdayCode,
} from "../core/domain";
import { AppError, conflict, notFound, policy, validation } from "../core/errors";
import { isValidPublicPassword } from "../core/security";
import type { Database, Queryable } from "../infra/database";

type Row = Record<string, unknown>;

interface RecurrencePreviewInput {
  object: Record<string, unknown>;
  roomId: string;
  startDate: string;
  endDate: string;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  applicantPhone: string;
  conflictPolicy: ConflictPolicy;
}

interface RecurrenceCreateInput extends RecurrencePreviewInput {
  applicantName: string;
  applicantEmail: string;
  purpose: string;
  tagId: string | null;
}

const activeStatuses = new Set<ReservationStatus>(["REQUESTED", "CONFIRMED"]);
const allStatuses = new Set<ReservationStatus>(["REQUESTED", "CONFIRMED", "CANCELLED"]);
const allSources = new Set<ReservationSource>(["PUBLIC_FORM", "ADMIN_GRID", "ADMIN_MANUAL", "RECURRING_GENERATED"]);
const conflictPolicies = new Set<ConflictPolicy>(["FAIL_ALL", "SKIP_CONFLICTS"]);
const recurrenceStatuses = ["ACTIVE", "CANCELLED"] as const;
const historyActions = ["CREATED", "CREATED_BY_ADMIN", "UPDATED", "APPROVED", "CANCELLED", "DELETED", "RECURRENCE_GENERATED", "RECURRENCE_CANCELLED"] as const;

function value(row: Row, key: string): unknown {
  return row[key];
}

function text(row: Row, key: string): string {
  return String(value(row, key));
}

function nullableText(row: Row, key: string): string | null {
  const result = value(row, key);
  return result === null || result === undefined ? null : String(result);
}

function bool(row: Row, key: string): boolean {
  return Boolean(value(row, key));
}

function number(row: Row, key: string): number {
  return Number(value(row, key));
}

function iso(input: unknown): string {
  if (input instanceof Date) return input.toISOString();
  return new Date(String(input)).toISOString();
}

function dateText(input: unknown): string {
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return String(input).slice(0, 10);
}

function timeText(input: unknown): string {
  return String(input).slice(0, 8);
}

function isDatabaseCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

function mapDatabaseError(error: unknown): never {
  if (isDatabaseCode(error, "23P01")) {
    conflict("TIME_SLOT_CONFLICT", "The selected time slot is already reserved.");
  }
  if (error instanceof AppError) throw error;
  throw error;
}

function parseStatus(value: unknown, fallback?: ReservationStatus): ReservationStatus {
  if (value === undefined || value === null || value === "") {
    if (fallback) return fallback;
    validation("must not be null", "status");
  }
  if (typeof value !== "string" || !allStatuses.has(value as ReservationStatus)) validation("Invalid reservation status.", "status");
  return value as ReservationStatus;
}

function mapSettings(row: Row): OperationSettings {
  return {
    organizationName: text(row, "organization_name"),
    publicNotice: nullableText(row, "public_notice"),
    reservationEnabled: bool(row, "reservation_enabled"),
    reservationDisabledMessage: nullableText(row, "reservation_disabled_message"),
    semesterStartDate: dateText(value(row, "semester_start_date")),
    semesterEndDate: dateText(value(row, "semester_end_date")),
    openTime: timeText(value(row, "open_time")),
    closeTime: timeText(value(row, "close_time")),
    slotMinutes: 5,
    availableDaysOfWeek: text(row, "available_days_of_week").split(",").filter(Boolean).sort(),
    minReservationMinutes: number(row, "min_reservation_minutes"),
    maxReservationMinutes: number(row, "max_reservation_minutes"),
    adminContactEmail: nullableText(row, "admin_contact_email"),
    adminContactPhone: nullableText(row, "admin_contact_phone"),
    completionMessage: nullableText(row, "completion_message"),
    version: number(row, "version"),
  };
}

function mapRoom(row: Row) {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    location: nullableText(row, "location"),
    capacity: number(row, "capacity"),
    description: nullableText(row, "description"),
    enabled: bool(row, "enabled"),
    deleted: value(row, "deleted_at") !== null,
    createdAt: iso(value(row, "created_at")),
    updatedAt: iso(value(row, "updated_at")),
    deletedAt: value(row, "deleted_at") === null ? null : iso(value(row, "deleted_at")),
  };
}

function mapTag(row: Row) {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    color: text(row, "color"),
    createdAt: iso(value(row, "created_at")),
    updatedAt: iso(value(row, "updated_at")),
  };
}

function publicSettings(settings: OperationSettings): Omit<OperationSettings, "version"> {
  const { version: _version, ...result } = settings;
  return result;
}

export class ProductService {
  constructor(
    private readonly database: Database,
    private readonly now: () => Date,
  ) {}

  async getSettings(queryable: Queryable = this.database): Promise<OperationSettings> {
    const result = await queryable.query("SELECT * FROM operation_settings WHERE id = 1");
    const row = result.rows[0];
    if (!row) notFound("Operation settings");
    return mapSettings(row);
  }

  async getPublicSettings() {
    return publicSettings(await this.getSettings());
  }

  async updateSettings(body: unknown, adminUsername: string) {
    const input = requireObject(body);
    const organizationName = requireString(input, "organizationName", { max: 150 });
    const publicNotice = input.publicNotice === null || input.publicNotice === undefined ? null : requireString(input, "publicNotice", { allowBlank: true });
    const reservationEnabled = requireBoolean(input, "reservationEnabled");
    const reservationDisabledMessage = input.reservationDisabledMessage === null || input.reservationDisabledMessage === undefined
      ? null
      : requireString(input, "reservationDisabledMessage", { allowBlank: true });
    const semesterStartDate = parseDate(requireString(input, "semesterStartDate"), "semesterStartDate");
    const semesterEndDate = parseDate(requireString(input, "semesterEndDate"), "semesterEndDate");
    const openTime = parseTime(requireString(input, "openTime"), "openTime");
    const closeTime = parseTime(requireString(input, "closeTime"), "closeTime");
    requireInteger(input, "slotMinutes");
    const availableDaysOfWeek = normalizeDays(input.availableDaysOfWeek);
    const minReservationMinutes = requireInteger(input, "minReservationMinutes", 30);
    const maxReservationMinutes = requireInteger(input, "maxReservationMinutes", 1);
    const adminContactEmail = input.adminContactEmail === null || input.adminContactEmail === "" || input.adminContactEmail === undefined
      ? null
      : requireEmail(input, "adminContactEmail");
    const adminContactPhone = input.adminContactPhone === null || input.adminContactPhone === undefined
      ? null
      : requireString(input, "adminContactPhone", { max: 50, allowBlank: true });
    const completionMessage = input.completionMessage === null || input.completionMessage === undefined
      ? null
      : requireString(input, "completionMessage", { allowBlank: true });
    const version = requireInteger(input, "version", 0);

    if (semesterStartDate > semesterEndDate) validation("Semester start date must be before or equal to end date.");
    if (openTime >= closeTime) validation("Open time must be before close time.");
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    if (minutes(openTime) % 30 !== 0 || minutes(closeTime) % 30 !== 0) {
      validation("Open and close time must align to 30-minute timetable boundaries.");
    }
    if (minReservationMinutes % 5 !== 0 || maxReservationMinutes % 5 !== 0) {
      validation("Min and max reservation minutes must be multiples of 5.");
    }
    if (maxReservationMinutes < minReservationMinutes) validation("Max reservation minutes must be greater than or equal to min.");
    if (minutes(closeTime) - minutes(openTime) < minReservationMinutes) validation("Min reservation minutes must fit within operating hours.");

    const result = await this.database.query(
      `UPDATE operation_settings SET
        organization_name = $1, public_notice = $2, reservation_enabled = $3,
        reservation_disabled_message = $4, semester_start_date = $5, semester_end_date = $6,
        open_time = $7, close_time = $8, available_days_of_week = $9,
        min_reservation_minutes = $10, max_reservation_minutes = $11,
        admin_contact_email = $12, admin_contact_phone = $13, completion_message = $14,
        updated_by = $15, updated_at = now(), version = version + 1
       WHERE id = 1 AND version = $16 RETURNING *`,
      [organizationName, publicNotice, reservationEnabled, reservationDisabledMessage,
        semesterStartDate, semesterEndDate, openTime, closeTime, availableDaysOfWeek.join(","),
        minReservationMinutes, maxReservationMinutes, adminContactEmail, adminContactPhone,
        completionMessage, adminUsername, version],
    );
    const row = result.rows[0];
    if (!row) conflict("VERSION_CONFLICT", "Settings were updated by another request.");
    return mapSettings(row);
  }

  async listPublicRooms() {
    const result = await this.database.query(
      `SELECT * FROM rooms
       WHERE enabled = true AND deleted_at IS NULL AND system_reserved = false
       ORDER BY name ASC`,
    );
    return result.rows.map((row) => {
      const room = mapRoom(row);
      return { id: room.id, name: room.name, location: room.location, capacity: room.capacity, description: room.description };
    });
  }

  async getPublicRoom(roomId: string) {
    parseUuid(roomId, "roomId");
    const result = await this.database.query(
      `SELECT * FROM rooms WHERE id = $1 AND enabled = true AND deleted_at IS NULL AND system_reserved = false`,
      [roomId],
    );
    const row = result.rows[0];
    if (!row) notFound("Room");
    const room = mapRoom(row);
    return { id: room.id, name: room.name, location: room.location, capacity: room.capacity, description: room.description };
  }

  async listRooms(url: URL) {
    const { page, size, offset } = parsePage(url);
    const conditions = ["system_reserved = false"];
    const values: unknown[] = [];
    const add = (condition: string, input: unknown) => { values.push(input); conditions.push(condition.replace("?", `$${values.length}`)); };
    if (!parseBooleanParameter(url.searchParams.get("includeDeleted"), "includeDeleted", false)) conditions.push("deleted_at IS NULL");
    if (url.searchParams.has("enabled")) add("enabled = ?", parseBooleanParameter(url.searchParams.get("enabled"), "enabled", false));
    const keyword = url.searchParams.get("keyword")?.trim();
    if (keyword) {
      const pattern = `%${keyword.toLowerCase()}%`;
      values.push(pattern, pattern, pattern);
      const base = values.length - 2;
      conditions.push(`(lower(name) LIKE $${base} OR lower(coalesce(location, '')) LIKE $${base + 1} OR lower(coalesce(description, '')) LIKE $${base + 2})`);
    }
    const where = conditions.join(" AND ");
    const count = await this.database.query(`SELECT count(*) AS total FROM rooms WHERE ${where}`, values);
    const rows = await this.database.query(
      `SELECT * FROM rooms WHERE ${where} ORDER BY name ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, size, offset],
    );
    return paged(rows.rows.map(mapRoom), page, size, Number(count.rows[0]?.total ?? 0));
  }

  async getAdminRoom(roomId: string, queryable: Queryable = this.database): Promise<Row> {
    parseUuid(roomId, "roomId");
    const result = await queryable.query("SELECT * FROM rooms WHERE id = $1 AND system_reserved = false", [roomId]);
    const row = result.rows[0];
    if (!row) notFound("Room");
    return row;
  }

  async getAdminRoomResponse(roomId: string) {
    return mapRoom(await this.getAdminRoom(roomId));
  }

  async createRoom(body: unknown) {
    const input = requireObject(body);
    const name = requireString(input, "name", { max: 100 });
    const location = input.location === undefined || input.location === null ? null : requireString(input, "location", { max: 150, allowBlank: true });
    const capacity = requireInteger(input, "capacity", 0);
    const description = input.description === undefined || input.description === null ? null : requireString(input, "description", { allowBlank: true });
    const enabled = requireBoolean(input, "enabled");
    try {
      const result = await this.database.query(
        `INSERT INTO rooms (name, location, capacity, description, enabled)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, location, capacity, description, enabled],
      );
      return mapRoom(result.rows[0]!);
    } catch (error) {
      if (isDatabaseCode(error, "23505")) conflict("ROOM_NAME_DUPLICATED", "Room name already exists.", { name });
      throw error;
    }
  }

  async updateRoom(roomId: string, body: unknown) {
    await this.getAdminRoom(roomId);
    const input = requireObject(body);
    const name = requireString(input, "name", { max: 100 });
    const location = input.location === undefined || input.location === null ? null : requireString(input, "location", { max: 150, allowBlank: true });
    const capacity = requireInteger(input, "capacity", 0);
    const description = input.description === undefined || input.description === null ? null : requireString(input, "description", { allowBlank: true });
    const enabled = requireBoolean(input, "enabled");
    try {
      const result = await this.database.query(
        `UPDATE rooms SET name=$2, location=$3, capacity=$4, description=$5, enabled=$6, updated_at=now()
         WHERE id=$1 AND deleted_at IS NULL AND system_reserved=false RETURNING *`,
        [roomId, name, location, capacity, description, enabled],
      );
      if (!result.rows[0]) notFound("Room");
      return mapRoom(result.rows[0]);
    } catch (error) {
      if (isDatabaseCode(error, "23505")) conflict("ROOM_NAME_DUPLICATED", "Room name already exists.", { name });
      throw error;
    }
  }

  async updateRoomEnabled(roomId: string, body: unknown) {
    const input = requireObject(body);
    const enabled = requireBoolean(input, "enabled");
    const result = await this.database.query(
      `UPDATE rooms SET enabled=$2, updated_at=now()
       WHERE id=$1 AND deleted_at IS NULL AND system_reserved=false RETURNING *`,
      [roomId, enabled],
    );
    if (!result.rows[0]) notFound("Room");
    return mapRoom(result.rows[0]);
  }

  async getRoomDeletionCheck(roomId: string) {
    const room = await this.getAdminRoom(roomId);
    const counts = await this.database.query(
      `SELECT
        (SELECT count(*) FROM reservations WHERE room_id=$1) AS reservations,
        (SELECT count(*) FROM reservation_recurrences WHERE room_id=$1) AS recurrences`,
      [roomId],
    );
    const reservationCount = Number(counts.rows[0]?.reservations ?? 0);
    const recurrenceCount = Number(counts.rows[0]?.recurrences ?? 0);
    return {
      roomId,
      roomName: text(room, "name"),
      deletable: true,
      checks: [
        { code: "RESERVATION_REFERENCES_REASSIGNED", label: "예약 기록 보존", description: "기존 예약은 삭제하지 않고 삭제된 공간 기록으로 연결됩니다.", passed: true, count: reservationCount },
        { code: "RECURRENCE_REFERENCES_REASSIGNED", label: "반복 예약 기록 보존", description: "기존 반복 예약은 삭제하지 않고 삭제된 공간 기록으로 연결됩니다.", passed: true, count: recurrenceCount },
      ],
      blockers: [],
    };
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const room = await this.getAdminRoom(roomId, client);
      if (value(room, "deleted_at") !== null) notFound("Room");
      const sentinel = await client.query("SELECT id FROM rooms WHERE system_reserved=true AND deleted_at IS NULL");
      const sentinelId = sentinel.rows[0]?.id;
      if (!sentinelId) throw new Error("Deleted room sentinel is missing.");
      const originalName = text(room, "name");
      await client.query("UPDATE reservations SET room_id=$2, original_room_name=$3 WHERE room_id=$1", [roomId, sentinelId, originalName]);
      await client.query("UPDATE reservation_recurrences SET room_id=$2, original_room_name=$3 WHERE room_id=$1", [roomId, sentinelId, originalName]);
      await client.query("DELETE FROM rooms WHERE id=$1", [roomId]);
    });
  }

  async listTags(url: URL) {
    const { page, size, offset } = parsePage(url);
    const keyword = url.searchParams.get("keyword")?.trim().toLowerCase();
    const where = keyword ? "WHERE lower(name) LIKE $1" : "";
    const values = keyword ? [`%${keyword}%`] : [];
    const count = await this.database.query(`SELECT count(*) AS total FROM tags ${where}`, values);
    const rows = await this.database.query(
      `SELECT * FROM tags ${where} ORDER BY name ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, size, offset],
    );
    return paged(rows.rows.map(mapTag), page, size, Number(count.rows[0]?.total ?? 0));
  }

  async createTag(body: unknown) {
    return this.saveTag(null, body);
  }

  async updateTag(tagId: string, body: unknown) {
    return this.saveTag(tagId, body);
  }

  private async saveTag(tagId: string | null, body: unknown) {
    const input = requireObject(body);
    const name = requireString(input, "name", { max: 100 }).trim();
    const color = requireString(input, "color");
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) validation("Tag color must be a hex color.", "color");
    try {
      const result = tagId
        ? await this.database.query("UPDATE tags SET name=$2,color=$3,updated_at=now() WHERE id=$1 RETURNING *", [tagId, name, color])
        : await this.database.query("INSERT INTO tags(name,color) VALUES($1,$2) RETURNING *", [name, color]);
      if (!result.rows[0]) notFound("Tag");
      return mapTag(result.rows[0]);
    } catch (error) {
      if (isDatabaseCode(error, "23505")) conflict("TAG_NAME_DUPLICATED", "Tag name already exists.", { name });
      throw error;
    }
  }

  async deleteTag(tagId: string): Promise<void> {
    const result = await this.database.query("DELETE FROM tags WHERE id=$1 RETURNING id", [tagId]);
    if (!result.rows[0]) notFound("Tag");
  }

  private async roomAndSettings(roomId: string, client: Queryable = this.database) {
    const [roomResult, settings] = await Promise.all([
      client.query("SELECT * FROM rooms WHERE id=$1 AND deleted_at IS NULL", [roomId]),
      this.getSettings(client),
    ]);
    const room = roomResult.rows[0];
    if (!room) notFound("Room");
    return { room, settings };
  }

  private async assertNoConflict(
    client: Queryable,
    roomId: string,
    startAt: string,
    endAt: string,
    excludingId: string | null = null,
  ): Promise<void> {
    const result = await client.query(
      `SELECT 1 FROM reservations
       WHERE room_id=$1 AND status IN ('REQUESTED','CONFIRMED')
         AND start_at < $3::timestamptz AND end_at > $2::timestamptz
         AND ($4::uuid IS NULL OR id <> $4::uuid)
       LIMIT 1`,
      [roomId, startAt, endAt, excludingId],
    );
    if (result.rows[0]) conflict("TIME_SLOT_CONFLICT", "The selected time slot is already reserved.", { roomId, startAt, endAt });
  }

  private parsePublicPassword(body: Record<string, unknown>): string {
    const password = body.cancelPassword;
    if (!isValidPublicPassword(password)) {
      validation("예약 비밀번호는 영문, 숫자, 특수문자를 사용해 4~64자로 입력해 주세요.", "cancelPassword");
    }
    return password;
  }

  async createPublicReservation(body: unknown) {
    const object = requireObject(body);
    const input = parseReservationInput(object);
    const password = this.parsePublicPassword(object);
    const { room, settings } = await this.roomAndSettings(input.roomId);
    validateReservationPolicy(
      bool(room, "enabled") && !bool(room, "system_reserved"),
      settings,
      input,
      "PUBLIC",
      this.now(),
    );
    try {
      const row = await this.database.transaction(async (client) => {
        await this.assertNoConflict(client, input.roomId, input.startAt, input.endAt);
        const inserted = await client.query(
          `INSERT INTO reservations (
            room_id, applicant_name, applicant_email, applicant_phone, purpose,
            start_at, end_at, status, source, created_by_actor_type, created_by_actor_id,
            cancel_password_hash
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,'REQUESTED','PUBLIC_FORM','PUBLIC_USER',$3,
             crypt($8, gen_salt('bf', 12)))
           RETURNING *`,
          [input.roomId, input.applicantName, input.applicantEmail, input.applicantPhone,
            input.purpose, input.startAt, input.endAt, password],
        );
        const reservation = inserted.rows[0]!;
        await this.insertHistory(client, reservation, "CREATED", null, null, "PUBLIC_USER", input.applicantEmail);
        return reservation;
      });
      return { id: text(row, "id"), status: text(row, "status"), message: settings.completionMessage };
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async createAdminReservation(body: unknown, adminUsername: string) {
    const object = requireObject(body);
    const input = parseReservationInput(object);
    const status = parseStatus(object.status, "CONFIRMED");
    const memo = object.memo === undefined || object.memo === null ? null : requireString(object, "memo", { max: 1000, allowBlank: true });
    const { room, settings } = await this.roomAndSettings(input.roomId);
    validateReservationPolicy(bool(room, "enabled") && !bool(room, "system_reserved"), settings, input, "ADMIN", this.now());
    try {
      const id = await this.database.transaction(async (client) => {
        await this.assertNoConflict(client, input.roomId, input.startAt, input.endAt);
        const inserted = await client.query(
          `INSERT INTO reservations (
            room_id, applicant_name, applicant_email, applicant_phone, purpose,
            start_at, end_at, status, source, created_by_actor_type, created_by_actor_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ADMIN_MANUAL','ADMIN',$9) RETURNING *`,
          [input.roomId, input.applicantName, input.applicantEmail, input.applicantPhone,
            input.purpose, input.startAt, input.endAt, status, adminUsername],
        );
        const reservation = inserted.rows[0]!;
        await this.insertHistory(client, reservation, "CREATED_BY_ADMIN", null, memo, "ADMIN", adminUsername);
        return text(reservation, "id");
      });
      return await this.getReservationDetail(id);
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  private reservationSelect = `
    SELECT r.*, rm.name AS current_room_name, rm.location AS room_location,
      rr.tag_id, t.name AS tag_name, t.color AS tag_color
    FROM reservations r
    JOIN rooms rm ON rm.id=r.room_id
    LEFT JOIN reservation_recurrences rr ON rr.id=r.recurrence_id
    LEFT JOIN tags t ON t.id=rr.tag_id`;

  private mapReservationList(row: Row) {
    return {
      id: text(row, "id"),
      roomId: text(row, "room_id"),
      roomName: nullableText(row, "original_room_name") || text(row, "current_room_name"),
      applicantName: text(row, "applicant_name"),
      applicantEmail: text(row, "applicant_email"),
      applicantPhone: nullableText(row, "applicant_phone"),
      purpose: text(row, "purpose"),
      recurrenceId: nullableText(row, "recurrence_id"),
      seriesLabel: nullableText(row, "tag_name"),
      seriesColor: nullableText(row, "tag_color"),
      recurrenceException: bool(row, "recurrence_exception"),
      startAt: iso(value(row, "start_at")),
      endAt: iso(value(row, "end_at")),
      status: text(row, "status"),
      source: text(row, "source"),
      createdAt: iso(value(row, "created_at")),
    };
  }

  private mapReservationDetail(row: Row) {
    const list = this.mapReservationList(row);
    return {
      id: list.id,
      room: { id: list.roomId, name: list.roomName, location: nullableText(row, "room_location") },
      recurrenceId: list.recurrenceId,
      series: list.recurrenceId ? { id: list.recurrenceId, label: list.seriesLabel, color: list.seriesColor } : null,
      recurrenceException: list.recurrenceException,
      applicantName: list.applicantName,
      applicantEmail: list.applicantEmail,
      applicantPhone: list.applicantPhone,
      purpose: list.purpose,
      startAt: list.startAt,
      endAt: list.endAt,
      status: list.status,
      source: list.source,
      createdAt: list.createdAt,
      updatedAt: iso(value(row, "updated_at")),
    };
  }

  async getReservationRow(reservationId: string, client: Queryable = this.database): Promise<Row> {
    parseUuid(reservationId, "reservationId");
    const result = await client.query(`${this.reservationSelect} WHERE r.id=$1`, [reservationId]);
    const row = result.rows[0];
    if (!row) notFound("Reservation");
    return row;
  }

  async getReservationDetail(reservationId: string) {
    return this.mapReservationDetail(await this.getReservationRow(reservationId));
  }

  private maskName(input: string): string {
    const chars = Array.from(input);
    if (chars.length === 0) return input;
    if (chars.length === 1) return "*";
    if (chars.length === 2) return `${chars[0]}*`;
    return `${chars[0]}*${chars.at(-1)}`;
  }

  private maskEmail(input: string): string {
    const at = input.indexOf("@");
    if (at <= 0) return this.maskName(input);
    const local = input.slice(0, at);
    return `${local.slice(0, Math.min(2, local.length))}${"*".repeat(Math.max(1, local.length - 2))}${input.slice(at)}`;
  }

  private maskPhone(input: string | null): string | null {
    if (!input) return input;
    const digits = input.replace(/\D/g, "");
    if (digits.length <= 1) return "*";
    if (digits.length <= 5) return `${digits[0]}${"*".repeat(Math.max(1, digits.length - 2))}${digits.at(-1)}`;
    return `${digits.slice(0, 4)}${"*".repeat(digits.length - 5)}${digits.at(-1)}`;
  }

  async getPublicReservation(reservationId: string) {
    const detail = this.mapReservationDetail(await this.getReservationRow(reservationId));
    const active = detail.status !== "CANCELLED";
    return {
      id: detail.id,
      room: detail.room,
      applicantName: this.maskName(detail.applicantName),
      applicantEmail: this.maskEmail(detail.applicantEmail),
      applicantPhone: this.maskPhone(detail.applicantPhone),
      purpose: detail.purpose,
      startAt: detail.startAt,
      endAt: detail.endAt,
      status: detail.status,
      cancellable: active,
      editable: active,
    };
  }

  private async verifyPublicPassword(client: Queryable, reservationId: string, password: string): Promise<Row> {
    const result = await client.query(
      `${this.reservationSelect}
       WHERE r.id=$1 AND r.cancel_password_hash IS NOT NULL
         AND r.cancel_password_hash = crypt($2, r.cancel_password_hash)`,
      [reservationId, password],
    );
    const row = result.rows[0];
    if (!row) {
      const exists = await client.query("SELECT 1 FROM reservations WHERE id=$1", [reservationId]);
      if (!exists.rows[0]) notFound("Reservation");
      throw new AppError(403, "PUBLIC_RESERVATION_PASSWORD_MISMATCH", "Reservation password does not match.");
    }
    return row;
  }

  async verifyPublicReservationForEdit(reservationId: string, body: unknown) {
    const object = requireObject(body);
    const password = this.parsePublicPassword(object);
    const row = await this.verifyPublicPassword(this.database, reservationId, password);
    if (text(row, "status") === "CANCELLED") validation("CANCELLED status reservations cannot be edited.");
    const detail = this.mapReservationDetail(row);
    return {
      id: detail.id,
      room: detail.room,
      applicantName: detail.applicantName,
      applicantEmail: detail.applicantEmail,
      applicantPhone: detail.applicantPhone,
      purpose: detail.purpose,
      startAt: detail.startAt,
      endAt: detail.endAt,
      status: detail.status,
      editable: true,
    };
  }

  async updatePublicReservation(reservationId: string, body: unknown) {
    const object = requireObject(body);
    const input = parseReservationInput(object);
    const password = this.parsePublicPassword(object);
    const { room, settings } = await this.roomAndSettings(input.roomId);
    validateReservationPolicy(bool(room, "enabled") && !bool(room, "system_reserved"), settings, input, "PUBLIC", this.now());
    try {
      await this.database.transaction(async (client) => {
        const before = await this.verifyPublicPassword(client, reservationId, password);
        if (text(before, "status") === "CANCELLED") validation("CANCELLED status reservations cannot be edited.");
        await this.assertNoConflict(client, input.roomId, input.startAt, input.endAt, reservationId);
        const result = await client.query(
          `UPDATE reservations SET room_id=$2, applicant_name=$3, applicant_email=$4,
            applicant_phone=$5, purpose=$6, start_at=$7, end_at=$8, status='REQUESTED',
            updated_by_actor_type='PUBLIC_USER', updated_by_actor_id=$4, updated_at=now(),
            recurrence_exception = recurrence_id IS NOT NULL
           WHERE id=$1 RETURNING *`,
          [reservationId, input.roomId, input.applicantName, input.applicantEmail,
            input.applicantPhone, input.purpose, input.startAt, input.endAt],
        );
        await this.insertHistory(client, result.rows[0]!, "UPDATED", before, null, "PUBLIC_USER", input.applicantEmail);
      });
      return await this.getPublicReservation(reservationId);
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async cancelPublicReservation(reservationId: string, body: unknown) {
    const object = requireObject(body);
    const password = this.parsePublicPassword(object);
    try {
      await this.database.transaction(async (client) => {
        const before = await this.verifyPublicPassword(client, reservationId, password);
        if (text(before, "status") === "CANCELLED") validation("CANCELLED status reservations cannot be cancelled again.");
        const result = await client.query(
          `UPDATE reservations SET status='CANCELLED', updated_by_actor_type='PUBLIC_USER',
            updated_by_actor_id=applicant_email, updated_at=now() WHERE id=$1 RETURNING *`,
          [reservationId],
        );
        await this.insertHistory(client, result.rows[0]!, "CANCELLED", before, null, "PUBLIC_USER", text(before, "applicant_email"));
      });
      return await this.getPublicReservation(reservationId);
    } catch (error) {
      if (error instanceof AppError && error.code === "PUBLIC_RESERVATION_PASSWORD_MISMATCH") {
        throw new AppError(403, "PUBLIC_CANCEL_PASSWORD_MISMATCH", "Cancel password does not match.");
      }
      throw error;
    }
  }

  async updateAdminReservation(reservationId: string, body: unknown, adminUsername: string) {
    const object = requireObject(body);
    const input = parseReservationInput(object);
    const status = parseStatus(object.status);
    const memo = object.memo === undefined || object.memo === null ? null : requireString(object, "memo", { max: 1000, allowBlank: true });
    const { room, settings } = await this.roomAndSettings(input.roomId);
    validateReservationPolicy(bool(room, "enabled") && !bool(room, "system_reserved"), settings, input, "ADMIN", this.now());
    try {
      await this.database.transaction(async (client) => {
        const before = await this.getReservationRow(reservationId, client);
        if (activeStatuses.has(status)) await this.assertNoConflict(client, input.roomId, input.startAt, input.endAt, reservationId);
        const result = await client.query(
          `UPDATE reservations SET room_id=$2, applicant_name=$3, applicant_email=$4,
            applicant_phone=$5, purpose=$6, start_at=$7, end_at=$8, status=$9,
            updated_by_actor_type='ADMIN', updated_by_actor_id=$10, updated_at=now(),
            recurrence_exception = recurrence_id IS NOT NULL
           WHERE id=$1 RETURNING *`,
          [reservationId, input.roomId, input.applicantName, input.applicantEmail,
            input.applicantPhone, input.purpose, input.startAt, input.endAt, status, adminUsername],
        );
        await this.insertHistory(client, result.rows[0]!, "UPDATED", before, memo, "ADMIN", adminUsername);
      });
      return await this.getReservationDetail(reservationId);
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async changeReservationStatus(
    reservationId: string,
    action: "APPROVED" | "CANCELLED",
    body: unknown,
    adminUsername: string,
  ) {
    const object = body === undefined || body === null ? {} : requireObject(body);
    const memo = object.memo === undefined || object.memo === null ? null : requireString(object, "memo", { max: 1000, allowBlank: true });
    const status: ReservationStatus = action === "APPROVED" ? "CONFIRMED" : "CANCELLED";
    try {
      await this.database.transaction(async (client) => {
        const before = await this.getReservationRow(reservationId, client);
        if (status === "CONFIRMED") {
          await this.assertNoConflict(client, text(before, "room_id"), iso(value(before, "start_at")), iso(value(before, "end_at")), reservationId);
        }
        const result = await client.query(
          `UPDATE reservations SET status=$2, updated_by_actor_type='ADMIN', updated_by_actor_id=$3, updated_at=now()
           WHERE id=$1 RETURNING *`,
          [reservationId, status, adminUsername],
        );
        await this.insertHistory(client, result.rows[0]!, action, before, memo, "ADMIN", adminUsername);
      });
      const row = await this.getReservationRow(reservationId);
      return this.mapReservationList(row);
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async deleteReservation(reservationId: string, body: unknown, adminUsername: string): Promise<void> {
    const object = body === undefined || body === null ? {} : requireObject(body);
    const memo = object.memo === undefined || object.memo === null ? null : requireString(object, "memo", { max: 1000, allowBlank: true });
    await this.database.transaction(async (client) => {
      const before = await this.getReservationRow(reservationId, client);
      await client.query(
        `UPDATE reservation_histories SET reservation_deleted_id=$1, reservation_id=NULL
         WHERE reservation_id=$1`,
        [reservationId],
      );
      await this.insertHistory(client, before, "DELETED", before, memo, "ADMIN", adminUsername, true);
      await client.query("DELETE FROM reservations WHERE id=$1", [reservationId]);
    });
  }

  private reservationFilter(url: URL): { where: string; values: unknown[] } {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (template: string, input: unknown) => {
      values.push(input);
      conditions.push(template.replace("?", `$${values.length}`));
    };
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const roomId = url.searchParams.get("roomId");
    const status = url.searchParams.get("status");
    const source = url.searchParams.get("source");
    const keyword = url.searchParams.get("keyword")?.trim().toLowerCase();
    if (from) { parseInstant(from, "from"); add("r.end_at > ?::timestamptz", from); }
    if (to) { parseInstant(to, "to"); add("r.start_at < ?::timestamptz", to); }
    if (roomId) add("r.room_id = ?::uuid", parseUuid(roomId, "roomId"));
    if (status) {
      if (!allStatuses.has(status as ReservationStatus)) validation("Invalid reservation status.");
      add("r.status = ?::reservation_status", status);
    } else if (parseBooleanParameter(url.searchParams.get("excludeCancelled"), "excludeCancelled", false)) {
      conditions.push("r.status <> 'CANCELLED'");
    }
    if (source) {
      if (!allSources.has(source as ReservationSource)) validation("Invalid reservation source.");
      add("r.source = ?::reservation_source", source);
    }
    if (keyword) {
      values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      const base = values.length - 2;
      conditions.push(`(lower(r.applicant_name) LIKE $${base} OR lower(r.applicant_email) LIKE $${base + 1} OR lower(r.purpose) LIKE $${base + 2})`);
    }
    return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
  }

  async listReservations(url: URL) {
    const { page, size, offset } = parsePage(url);
    const filter = this.reservationFilter(url);
    const count = await this.database.query(`SELECT count(*) AS total FROM reservations r ${filter.where}`, filter.values);
    const rows = await this.database.query(
      `${this.reservationSelect} ${filter.where} ORDER BY r.created_at DESC
       LIMIT $${filter.values.length + 1} OFFSET $${filter.values.length + 2}`,
      [...filter.values, size, offset],
    );
    return paged(rows.rows.map((row) => this.mapReservationList(row)), page, size, Number(count.rows[0]?.total ?? 0));
  }

  async getWeeklyReservations(roomId: string, weekStart: string) {
    parseUuid(roomId, "roomId");
    parseDate(weekStart, "weekStart");
    const room = await this.getPublicRoom(roomId);
    const start = serviceOffsetDateTime(weekStart, "00:00");
    const endDate = new Date(`${weekStart}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 7);
    const weekEnd = new Date(`${weekStart}T00:00:00Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const result = await this.database.query(
      `${this.reservationSelect}
       WHERE r.room_id=$1 AND r.status IN ('REQUESTED','CONFIRMED')
         AND r.start_at < $3::timestamptz AND r.end_at > $2::timestamptz
       ORDER BY r.start_at ASC`,
      [roomId, start, serviceOffsetDateTime(endDate.toISOString().slice(0, 10), "00:00")],
    );
    return {
      room: { id: room.id, name: room.name, location: room.location },
      weekStart,
      weekEnd: weekEnd.toISOString().slice(0, 10),
      reservations: result.rows.map((row) => {
        const item = this.mapReservationList(row);
        return {
          id: item.id, roomId: item.roomId, roomName: item.roomName,
          applicantName: item.applicantName, startAt: item.startAt, endAt: item.endAt,
          status: item.status, purpose: item.purpose, recurrenceId: item.recurrenceId,
          seriesLabel: item.seriesLabel, seriesColor: item.seriesColor,
        };
      }),
    };
  }

  async checkAvailability(url: URL) {
    const roomId = url.searchParams.get("roomId");
    const startAt = url.searchParams.get("startAt");
    const endAt = url.searchParams.get("endAt");
    if (!roomId || !startAt || !endAt) validation("roomId, startAt and endAt are required.");
    parseUuid(roomId, "roomId");
    parseInstant(startAt, "startAt");
    parseInstant(endAt, "endAt");
    const input: ReservationInput = {
      roomId,
      applicantName: "availability-check",
      applicantEmail: "availability@example.test",
      applicantPhone: "availability-check",
      purpose: "availability-check",
      startAt,
      endAt,
    };
    try {
      const { room, settings } = await this.roomAndSettings(roomId);
      validateReservationPolicy(bool(room, "enabled") && !bool(room, "system_reserved"), settings, input, "PUBLIC", this.now());
      const conflictResult = await this.database.query(
        `SELECT 1 FROM reservations WHERE room_id=$1 AND status IN ('REQUESTED','CONFIRMED')
         AND start_at < $3::timestamptz AND end_at > $2::timestamptz LIMIT 1`,
        [roomId, startAt, endAt],
      );
      return conflictResult.rows[0]
        ? { available: false, reason: "TIME_SLOT_CONFLICT", message: "The selected time slot is already reserved." }
        : { available: true, reason: null, message: null };
    } catch (error) {
      if (error instanceof AppError && (error.status === 422 || error.code === "VALIDATION_ERROR")) {
        return { available: false, reason: error.code, message: error.message };
      }
      throw error;
    }
  }

  private async insertHistory(
    client: Queryable,
    current: Row,
    action: string,
    before: Row | null,
    memo: string | null,
    actorType: "PUBLIC_USER" | "ADMIN" | "SYSTEM",
    actorId: string,
    deleted = false,
  ): Promise<void> {
    const roomName = nullableText(current, "original_room_name") || nullableText(current, "current_room_name")
      || nullableText(current, "room_name") || "삭제된 공간";
    const beforeRoomName = before
      ? nullableText(before, "original_room_name") || nullableText(before, "current_room_name") || nullableText(before, "room_name") || roomName
      : null;
    await client.query(
      `INSERT INTO reservation_histories (
        reservation_id, reservation_deleted_id, action, before_status, after_status, memo,
        actor_type, actor_id, reservation_room_id, before_reservation_room_id,
        reservation_purpose, before_reservation_purpose, reservation_room_name, before_reservation_room_name,
        reservation_start_at, before_reservation_start_at, reservation_end_at, before_reservation_end_at,
        reservation_applicant_name, before_reservation_applicant_name,
        reservation_applicant_email, before_reservation_applicant_email,
        reservation_applicant_phone, before_reservation_applicant_phone
       ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
       )`,
      [
        deleted ? null : value(current, "id"), deleted ? value(current, "id") : null, action,
        before ? value(before, "status") : null, action === "DELETED" ? null : value(current, "status"), memo,
        actorType, actorId, value(current, "room_id"), before ? value(before, "room_id") : null,
        value(current, "purpose"), before ? value(before, "purpose") : null, roomName, beforeRoomName,
        value(current, "start_at"), before ? value(before, "start_at") : null,
        value(current, "end_at"), before ? value(before, "end_at") : null,
        value(current, "applicant_name"), before ? value(before, "applicant_name") : null,
        value(current, "applicant_email"), before ? value(before, "applicant_email") : null,
        value(current, "applicant_phone"), before ? value(before, "applicant_phone") : null,
      ],
    );
  }

  private mapHistory(row: Row) {
    return {
      id: text(row, "id"),
      reservationId: text(row, value(row, "reservation_id") === null ? "reservation_deleted_id" : "reservation_id"),
      action: text(row, "action"),
      beforeStatus: nullableText(row, "before_status"),
      afterStatus: nullableText(row, "after_status"),
      memo: nullableText(row, "memo"),
      reservationRoomId: nullableText(row, "reservation_room_id"),
      beforeReservationRoomId: nullableText(row, "before_reservation_room_id"),
      reservationPurpose: nullableText(row, "reservation_purpose"),
      beforeReservationPurpose: nullableText(row, "before_reservation_purpose"),
      reservationRoomName: nullableText(row, "reservation_room_name"),
      beforeReservationRoomName: nullableText(row, "before_reservation_room_name"),
      reservationStartAt: value(row, "reservation_start_at") === null ? null : iso(value(row, "reservation_start_at")),
      beforeReservationStartAt: value(row, "before_reservation_start_at") === null ? null : iso(value(row, "before_reservation_start_at")),
      reservationEndAt: value(row, "reservation_end_at") === null ? null : iso(value(row, "reservation_end_at")),
      beforeReservationEndAt: value(row, "before_reservation_end_at") === null ? null : iso(value(row, "before_reservation_end_at")),
      reservationApplicantName: nullableText(row, "reservation_applicant_name"),
      beforeReservationApplicantName: nullableText(row, "before_reservation_applicant_name"),
      reservationApplicantEmail: nullableText(row, "reservation_applicant_email"),
      beforeReservationApplicantEmail: nullableText(row, "before_reservation_applicant_email"),
      reservationApplicantPhone: nullableText(row, "reservation_applicant_phone"),
      beforeReservationApplicantPhone: nullableText(row, "before_reservation_applicant_phone"),
      actorType: text(row, "actor_type"),
      actorId: nullableText(row, "actor_id") || "",
      createdAt: iso(value(row, "created_at")),
    };
  }

  async getReservationHistories(reservationId: string) {
    parseUuid(reservationId, "reservationId");
    await this.getReservationRow(reservationId);
    const result = await this.database.query(
      "SELECT * FROM reservation_histories WHERE reservation_id=$1 OR reservation_deleted_id=$1 ORDER BY created_at DESC",
      [reservationId],
    );
    return result.rows.map((row) => this.mapHistory(row));
  }

  async listHistories(url: URL) {
    const { page, size, offset } = parsePage(url);
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (condition: string, input: unknown) => { values.push(input); conditions.push(condition.replace("?", `$${values.length}`)); };
    const reservationId = url.searchParams.get("reservationId");
    const roomId = url.searchParams.get("roomId");
    const action = url.searchParams.get("action");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (reservationId) add("coalesce(reservation_id,reservation_deleted_id)=?::uuid", parseUuid(reservationId, "reservationId"));
    if (roomId) add("(reservation_room_id=?::uuid OR before_reservation_room_id=?::uuid)", parseUuid(roomId, "roomId"));
    if (roomId) {
      const last = values.length;
      conditions[conditions.length - 1] = `(reservation_room_id=$${last}::uuid OR before_reservation_room_id=$${last}::uuid)`;
    }
    if (action) add("action=?", parseEnumParameter(action, "action", historyActions));
    if (from) { parseInstant(from, "from"); add("created_at>=?::timestamptz", from); }
    if (to) { parseInstant(to, "to"); add("created_at<=?::timestamptz", to); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const count = await this.database.query(`SELECT count(*) AS total FROM reservation_histories ${where}`, values);
    const result = await this.database.query(
      `SELECT * FROM reservation_histories ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, size, offset],
    );
    return paged(result.rows.map((row) => this.mapHistory(row)), page, size, Number(count.rows[0]?.total ?? 0));
  }

  private parseRecurrence(body: unknown, requireApplicant: true): RecurrenceCreateInput;
  private parseRecurrence(body: unknown, requireApplicant: false): RecurrencePreviewInput;
  private parseRecurrence(body: unknown, requireApplicant: boolean): RecurrencePreviewInput | RecurrenceCreateInput {
    const object = requireObject(body);
    const roomId = requireUuid(object, "roomId");
    const startDate = parseDate(requireString(object, "startDate"), "startDate");
    const endDate = parseDate(requireString(object, "endDate"), "endDate");
    const daysOfWeek = normalizeDays(object.daysOfWeek);
    const startTime = parseTime(requireString(object, "startTime"), "startTime");
    const endTime = parseTime(requireString(object, "endTime"), "endTime");
    const applicantPhone = requireString(object, "applicantPhone", { max: 50 });
    const conflictPolicy = requireString(object, "conflictPolicy") as ConflictPolicy;
    if (!conflictPolicies.has(conflictPolicy)) validation("Invalid conflict policy.", "conflictPolicy");
    if (startTime >= endTime) {
      validation("Start time must be before end time.");
    }
    const common = { object, roomId, startDate, endDate, daysOfWeek, startTime, endTime, applicantPhone, conflictPolicy };
    if (!requireApplicant) return common;
    return {
      ...common,
      applicantName: requireString(object, "applicantName", { max: 100 }),
      applicantEmail: requireEmail(object, "applicantEmail"),
      purpose: requireString(object, "purpose", { max: 500 }),
      tagId: object.tagId === undefined || object.tagId === null || object.tagId === "" ? null : requireUuid(object, "tagId"),
    };
  }

  async previewRecurrence(body: unknown) {
    const input = this.parseRecurrence(body, false);
    const { room, settings } = await this.roomAndSettings(input.roomId);
    const candidates = datesInRange(input.startDate, input.endDate)
      .filter((date) => input.daysOfWeek.includes(weekdayCode(date)))
      .map((date) => ({ date, startAt: serviceOffsetDateTime(date, input.startTime), endAt: serviceOffsetDateTime(date, input.endTime) }));
    const items = [];
    for (const candidate of candidates) {
      const policyInput: ReservationInput = {
        roomId: input.roomId, applicantName: "recurrence-preview", applicantEmail: "preview@example.test",
        applicantPhone: input.applicantPhone, purpose: "recurrence-preview",
        startAt: candidate.startAt, endAt: candidate.endAt,
      };
      try {
        validateReservationPolicy(bool(room, "enabled") && !bool(room, "system_reserved"), settings, policyInput, "ADMIN", this.now());
        const overlap = await this.database.query(
          `SELECT 1 FROM reservations WHERE room_id=$1 AND status IN ('REQUESTED','CONFIRMED')
           AND start_at < $3::timestamptz AND end_at > $2::timestamptz LIMIT 1`,
          [input.roomId, candidate.startAt, candidate.endAt],
        );
        items.push(overlap.rows[0]
          ? { ...candidate, available: false, reason: "TIME_SLOT_CONFLICT", message: "Time slot is already reserved." }
          : { ...candidate, available: true, reason: null, message: null });
      } catch (error) {
        if (error instanceof AppError) items.push({ ...candidate, available: false, reason: error.code, message: error.message });
        else throw error;
      }
    }
    const availableCount = items.filter((item) => item.available).length;
    const conflictCount = items.length - availableCount;
    return {
      conflictPolicy: input.conflictPolicy,
      totalCandidates: items.length,
      availableCount,
      conflictCount,
      createAllowed: input.conflictPolicy === "FAIL_ALL" ? items.length > 0 && conflictCount === 0 : availableCount > 0,
      items,
    };
  }

  async createRecurrence(body: unknown, adminUsername: string) {
    const input = this.parseRecurrence(body, true);
    const preview = await this.previewRecurrence(body);
    if (input.conflictPolicy === "FAIL_ALL" && preview.conflictCount > 0) {
      conflict("RECURRENCE_CONFLICT", "One or more recurrence slots cannot be created.", { failedCount: preview.conflictCount });
    }
    try {
      return await this.database.transaction(async (client) => {
        if (input.tagId) {
          const tag = await client.query("SELECT 1 FROM tags WHERE id=$1", [input.tagId]);
          if (!tag.rows[0]) notFound("Tag");
        }
        const recurrenceResult = await client.query(
          `INSERT INTO reservation_recurrences (
            room_id, applicant_name, applicant_email, applicant_phone, purpose, tag_id,
            start_date, end_date, days_of_week, start_time, end_time, conflict_policy, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [input.roomId, input.applicantName, input.applicantEmail, input.applicantPhone, input.purpose,
            input.tagId, input.startDate, input.endDate, input.daysOfWeek.join(","), input.startTime,
            input.endTime, input.conflictPolicy, adminUsername],
        );
        const recurrence = recurrenceResult.rows[0]!;
        const resultItems: Array<{ date: string; status: string; reason: string | null }> = [];
        let createdCount = 0;
        let skippedCount = 0;
        for (let index = 0; index < preview.items.length; index += 1) {
          const item = preview.items[index]!;
          if (!item.available) {
            skippedCount += 1;
            resultItems.push({ date: item.date, status: "SKIPPED", reason: item.reason });
            continue;
          }
          const savepoint = `recurrence_candidate_${index}`;
          await client.query(`SAVEPOINT ${savepoint}`);
          try {
            const inserted = await client.query(
              `INSERT INTO reservations (
                room_id, recurrence_id, applicant_name, applicant_email, applicant_phone, purpose,
                start_at, end_at, status, source, created_by_actor_type, created_by_actor_id
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CONFIRMED','RECURRING_GENERATED','ADMIN',$9) RETURNING *`,
              [input.roomId, value(recurrence, "id"), input.applicantName, input.applicantEmail,
                input.applicantPhone, input.purpose, item.startAt, item.endAt, adminUsername],
            );
            await this.insertHistory(client, inserted.rows[0]!, "RECURRENCE_GENERATED", null, null, "ADMIN", adminUsername);
            await client.query(`RELEASE SAVEPOINT ${savepoint}`);
            createdCount += 1;
            resultItems.push({ date: item.date, status: "CREATED", reason: null });
          } catch (error) {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            if (input.conflictPolicy === "SKIP_CONFLICTS" && isDatabaseCode(error, "23P01")) {
              skippedCount += 1;
              resultItems.push({ date: item.date, status: "SKIPPED", reason: "TIME_SLOT_CONFLICT" });
              continue;
            }
            throw error;
          }
        }
        const tag = input.tagId ? (await client.query("SELECT * FROM tags WHERE id=$1", [input.tagId])).rows[0] : null;
        return {
          recurrenceId: text(recurrence, "id"),
          tagId: input.tagId,
          tagName: tag ? text(tag, "name") : null,
          tagColor: tag ? text(tag, "color") : null,
          conflictPolicy: input.conflictPolicy,
          totalCandidates: preview.totalCandidates,
          createdCount,
          skippedCount,
          failedCount: 0,
          items: resultItems,
        };
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  private recurrenceSelect = `
    SELECT rr.*, rm.name AS current_room_name, rm.location AS room_location,
      t.name AS tag_name, t.color AS tag_color
    FROM reservation_recurrences rr
    JOIN rooms rm ON rm.id=rr.room_id
    LEFT JOIN tags t ON t.id=rr.tag_id`;

  private mapRecurrenceList(row: Row) {
    return {
      id: text(row, "id"),
      roomId: text(row, "room_id"),
      roomName: nullableText(row, "original_room_name") || text(row, "current_room_name"),
      purpose: text(row, "purpose"),
      tagId: nullableText(row, "tag_id"),
      tagName: nullableText(row, "tag_name"),
      tagColor: nullableText(row, "tag_color"),
      startDate: dateText(value(row, "start_date")),
      endDate: dateText(value(row, "end_date")),
      daysOfWeek: text(row, "days_of_week"),
      startTime: timeText(value(row, "start_time")),
      endTime: timeText(value(row, "end_time")),
      conflictPolicy: text(row, "conflict_policy"),
      deleted: value(row, "deleted_at") !== null,
      createdAt: iso(value(row, "created_at")),
    };
  }

  async listRecurrences(url: URL) {
    const { page, size, offset } = parsePage(url);
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (condition: string, input: unknown) => { values.push(input); conditions.push(condition.replace("?", `$${values.length}`)); };
    const rawStatus = url.searchParams.get("status");
    const status = parseEnumParameter(rawStatus?.toUpperCase(), "status", recurrenceStatuses);
    const includeDeleted = parseBooleanParameter(url.searchParams.get("includeDeleted"), "includeDeleted", false) || status === "CANCELLED";
    if (!includeDeleted) conditions.push("rr.deleted_at IS NULL");
    if (status === "ACTIVE") conditions.push("rr.deleted_at IS NULL");
    if (status === "CANCELLED") conditions.push("rr.deleted_at IS NOT NULL");
    const roomId = url.searchParams.get("roomId");
    const fromDate = url.searchParams.get("fromDate");
    const toDate = url.searchParams.get("toDate");
    const keyword = url.searchParams.get("keyword")?.trim().toLowerCase();
    if (roomId) add("rr.room_id=?::uuid", parseUuid(roomId, "roomId"));
    if (fromDate) add("rr.end_date>=?::date", parseDate(fromDate, "fromDate"));
    if (toDate) add("rr.start_date<=?::date", parseDate(toDate, "toDate"));
    if (keyword) {
      values.push(`%${keyword}%`);
      const parameter = values.length;
      conditions.push(`(lower(rr.purpose) LIKE $${parameter} OR lower(rr.applicant_name) LIKE $${parameter} OR lower(rm.name) LIKE $${parameter} OR lower(coalesce(t.name,'')) LIKE $${parameter})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const recurrenceFrom = "FROM reservation_recurrences rr JOIN rooms rm ON rm.id=rr.room_id LEFT JOIN tags t ON t.id=rr.tag_id";
    const count = await this.database.query(`SELECT count(*) AS total ${recurrenceFrom} ${where}`, values);
    const result = await this.database.query(
      `${this.recurrenceSelect} ${where} ORDER BY rr.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, size, offset],
    );
    return paged(result.rows.map((row) => this.mapRecurrenceList(row)), page, size, Number(count.rows[0]?.total ?? 0));
  }

  async getRecurrence(recurrenceId: string) {
    parseUuid(recurrenceId, "recurrenceId");
    const result = await this.database.query(`${this.recurrenceSelect} WHERE rr.id=$1`, [recurrenceId]);
    const row = result.rows[0];
    if (!row) notFound("Recurrence");
    const list = this.mapRecurrenceList(row);
    const reservations = await this.database.query(
      `${this.reservationSelect} WHERE r.recurrence_id=$1 ORDER BY r.start_at ASC`,
      [recurrenceId],
    );
    return {
      id: list.id,
      room: { id: list.roomId, name: list.roomName, location: nullableText(row, "room_location") },
      applicantName: text(row, "applicant_name"),
      applicantEmail: text(row, "applicant_email"),
      applicantPhone: nullableText(row, "applicant_phone"),
      purpose: list.purpose,
      tagId: list.tagId,
      tagName: list.tagName,
      tagColor: list.tagColor,
      startDate: list.startDate,
      endDate: list.endDate,
      daysOfWeek: list.daysOfWeek,
      startTime: list.startTime,
      endTime: list.endTime,
      conflictPolicy: list.conflictPolicy,
      deleted: list.deleted,
      createdAt: list.createdAt,
      reservations: reservations.rows.map((reservation) => {
        const item = this.mapReservationList(reservation);
        return {
          id: item.id, roomId: item.roomId, roomName: item.roomName, purpose: item.purpose,
          startAt: item.startAt, endAt: item.endAt, status: item.status, exception: item.recurrenceException,
        };
      }),
    };
  }

  async cancelRecurrence(recurrenceId: string, body: unknown, adminUsername: string): Promise<void> {
    parseUuid(recurrenceId, "recurrenceId");
    const object = body === undefined || body === null ? {} : requireObject(body);
    const memo = object.memo === undefined || object.memo === null ? null : requireString(object, "memo", { max: 1000, allowBlank: true });
    await this.database.transaction(async (client) => {
      const recurrence = await client.query("UPDATE reservation_recurrences SET deleted_at=now(),updated_at=now(),updated_by=$2 WHERE id=$1 RETURNING id", [recurrenceId, adminUsername]);
      if (!recurrence.rows[0]) notFound("Recurrence");
      const reservations = await client.query(
        `${this.reservationSelect} WHERE r.recurrence_id=$1 AND r.status IN ('REQUESTED','CONFIRMED') FOR UPDATE OF r`,
        [recurrenceId],
      );
      for (const before of reservations.rows) {
        const updated = await client.query(
          "UPDATE reservations SET status='CANCELLED',updated_by_actor_type='ADMIN',updated_by_actor_id=$2,updated_at=now() WHERE id=$1 RETURNING *",
          [value(before, "id"), adminUsername],
        );
        await this.insertHistory(client, updated.rows[0]!, "RECURRENCE_CANCELLED", before, memo, "ADMIN", adminUsername);
      }
    });
  }

  async exportReservationsCsv(url: URL): Promise<string> {
    const filter = this.reservationFilter(url);
    const result = await this.database.query(
      `${this.reservationSelect} ${filter.where} ORDER BY r.start_at ASC`,
      filter.values,
    );
    const header = ["reservationId", "roomName", "applicantName", "applicantEmail", "applicantPhone", "purpose", "startAt", "endAt", "status", "source", "recurrenceId", "createdAt"];
    const formatKst = (input: unknown) => new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).format(new Date(input instanceof Date ? input : String(input)));
    const escape = (input: unknown) => {
      const string = input === null || input === undefined ? "" : String(input);
      return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
    };
    const lines = result.rows.map((row) => {
      const item = this.mapReservationList(row);
      return [item.id, item.roomName, item.applicantName, item.applicantEmail, item.applicantPhone,
        item.purpose, formatKst(value(row, "start_at")), formatKst(value(row, "end_at")),
        item.status, item.source, item.recurrenceId, formatKst(value(row, "created_at"))]
        .map(escape).join(",");
    });
    return `\uFEFF${header.join(",")}\r\n${lines.join("\r\n")}${lines.length ? "\r\n" : ""}`;
  }

  async cleanupE2e(prefix: string, dryRun: boolean) {
    const normalizedPrefix = prefix.trim().toLowerCase() || "testing-";
    if (!normalizedPrefix.startsWith("testing-") || normalizedPrefix.includes("%") || normalizedPrefix.includes("_")) {
      validation("E2E cleanup prefix must start with testing- and cannot contain SQL wildcards.");
    }
    return this.database.transaction(async (client) => {
      const pattern = `${normalizedPrefix}%`;
      const ids = async (sql: string, values: unknown[]): Promise<string[]> => {
        const result = await client.query(sql, values);
        return result.rows.map((row) => text(row, "id"));
      };
      const roomIds = await ids(
        "SELECT id FROM rooms WHERE system_reserved=false AND lower(name) LIKE $1",
        [pattern],
      );
      const tagIds = await ids("SELECT id FROM tags WHERE lower(name) LIKE $1", [pattern]);
      const recurrenceIds = await ids(
        `SELECT id FROM reservation_recurrences
         WHERE lower(purpose) LIKE $1 OR lower(applicant_name) LIKE $1 OR lower(applicant_email) LIKE $1
           OR room_id=ANY($2::uuid[])`,
        [pattern, roomIds],
      );
      const reservationIds = await ids(
        `SELECT id FROM reservations
         WHERE lower(purpose) LIKE $1 OR lower(applicant_name) LIKE $1 OR lower(applicant_email) LIKE $1
           OR room_id=ANY($2::uuid[]) OR recurrence_id=ANY($3::uuid[])`,
        [pattern, roomIds, recurrenceIds],
      );
      const historyIds = await ids(
        `SELECT id FROM reservation_histories
         WHERE reservation_id=ANY($2::uuid[]) OR reservation_deleted_id=ANY($2::uuid[])
           OR lower(coalesce(reservation_purpose,'')) LIKE $1
           OR lower(coalesce(reservation_room_name,'')) LIKE $1`,
        [pattern, reservationIds],
      );
      const deletableTagIds = await ids(
        `SELECT t.id FROM tags t WHERE t.id=ANY($1::uuid[])
           AND NOT EXISTS (
             SELECT 1 FROM reservation_recurrences rr
             WHERE rr.tag_id=t.id AND NOT (rr.id=ANY($2::uuid[]))
           )`,
        [tagIds, recurrenceIds],
      );
      const deletableRoomIds = await ids(
        `SELECT rm.id FROM rooms rm WHERE rm.id=ANY($1::uuid[]) AND rm.system_reserved=false
           AND NOT EXISTS (
             SELECT 1 FROM reservations r
             WHERE r.room_id=rm.id AND NOT (r.id=ANY($2::uuid[]))
           )
           AND NOT EXISTS (
             SELECT 1 FROM reservation_recurrences rr
             WHERE rr.room_id=rm.id AND NOT (rr.id=ANY($3::uuid[]))
           )`,
        [roomIds, reservationIds, recurrenceIds],
      );
      const summary = {
        prefix: normalizedPrefix,
        dryRun,
        reservationHistoriesDeleted: historyIds.length,
        reservationsDeleted: reservationIds.length,
        recurrencesDeleted: recurrenceIds.length,
        tagsDeleted: deletableTagIds.length,
        tagsSkipped: tagIds.length - deletableTagIds.length,
        roomsDeleted: deletableRoomIds.length,
        roomsSkipped: roomIds.length - deletableRoomIds.length,
      };
      if (dryRun) return summary;
      const historiesDeleted = await client.query("DELETE FROM reservation_histories WHERE id=ANY($1::uuid[])", [historyIds]);
      const reservationsDeleted = await client.query("DELETE FROM reservations WHERE id=ANY($1::uuid[])", [reservationIds]);
      const recurrencesDeleted = await client.query("DELETE FROM reservation_recurrences WHERE id=ANY($1::uuid[])", [recurrenceIds]);
      const tagsDeleted = await client.query(
        `DELETE FROM tags t WHERE t.id=ANY($1::uuid[])
           AND NOT EXISTS (SELECT 1 FROM reservation_recurrences rr WHERE rr.tag_id=t.id)`,
        [deletableTagIds],
      );
      const roomsDeleted = await client.query(
        `DELETE FROM rooms rm WHERE rm.id=ANY($1::uuid[]) AND rm.system_reserved=false
           AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.room_id=rm.id)
           AND NOT EXISTS (SELECT 1 FROM reservation_recurrences rr WHERE rr.room_id=rm.id)`,
        [deletableRoomIds],
      );
      return {
        ...summary,
        reservationHistoriesDeleted: historiesDeleted.rowCount,
        reservationsDeleted: reservationsDeleted.rowCount,
        recurrencesDeleted: recurrencesDeleted.rowCount,
        tagsDeleted: tagsDeleted.rowCount,
        tagsSkipped: tagIds.length - tagsDeleted.rowCount,
        roomsDeleted: roomsDeleted.rowCount,
        roomsSkipped: roomIds.length - roomsDeleted.rowCount,
      };
    });
  }
}
