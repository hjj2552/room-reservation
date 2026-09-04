import {
  datesInRange,
  normalizeDays,
  paged,
  parseInstant,
  serviceOffsetDateTime,
  type OperationSettings,
  type ReservationInput,
  type ReservationStatus,
  validateReservationPolicy,
  weekdayCode,
} from "../core/domain";
import {
  AppError,
  conflict,
  credentialMismatch,
  notFound,
  policy,
  validation,
} from "../core/errors";
import type { Database, Queryable } from "../infra/database";
import type {
  AdminReservationCommand,
  AvailabilityQuery,
  HistoryListQuery,
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

type Row = Record<string, unknown>;

const activeStatuses = new Set<ReservationStatus>(["REQUESTED", "CONFIRMED"]);

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

function sameReservationValues(
  row: Row,
  input: ReservationInput,
  status: ReservationStatus,
  showApplicantName: boolean,
): boolean {
  return text(row, "room_id") === input.roomId
    && text(row, "applicant_name") === input.applicantName
    && nullableText(row, "applicant_email") === input.applicantEmail
    && nullableText(row, "applicant_phone") === input.applicantPhone
    && text(row, "purpose") === input.purpose
    && iso(value(row, "start_at")) === parseInstant(input.startAt).toISOString()
    && iso(value(row, "end_at")) === parseInstant(input.endAt).toISOString()
    && text(row, "status") === status
    && bool(row, "show_applicant_name") === showApplicantName;
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
    publicOpenTime: timeText(value(row, "public_open_time")),
    publicCloseTime: timeText(value(row, "public_close_time")),
    slotMinutes: 5,
    availableDaysOfWeek: normalizeDays(text(row, "available_days_of_week").split(",")),
    publicAvailableDaysOfWeek: normalizeDays(text(row, "public_available_days_of_week").split(",")),
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
    displayOrder: value(row, "display_order") === null ? null : number(row, "display_order"),
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

  async updateSettings(command: UpdateSettingsCommand, adminUsername: string) {
    const {
      organizationName,
      publicNotice,
      reservationEnabled,
      reservationDisabledMessage,
      semesterStartDate,
      semesterEndDate,
      openTime,
      closeTime,
      publicOpenTime,
      publicCloseTime,
      availableDaysOfWeek,
      publicAvailableDaysOfWeek,
      minReservationMinutes,
      maxReservationMinutes,
      adminContactEmail,
      adminContactPhone,
      completionMessage,
      version,
    } = command;

    if (semesterStartDate > semesterEndDate) validation("Semester start date must be before or equal to end date.");
    if (openTime >= closeTime) validation("Open time must be before close time.");
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    if (
      minutes(openTime) % 30 !== 0
      || minutes(closeTime) % 30 !== 0
      || minutes(publicOpenTime) % 30 !== 0
      || minutes(publicCloseTime) % 30 !== 0
    ) {
      validation("Operating and public reservation times must align to 30-minute timetable boundaries.");
    }
    if (minReservationMinutes % 5 !== 0 || maxReservationMinutes % 5 !== 0) {
      validation("Min and max reservation minutes must be multiples of 5.");
    }
    if (maxReservationMinutes < minReservationMinutes) validation("Max reservation minutes must be greater than or equal to min.");
    if (minutes(closeTime) - minutes(openTime) < minReservationMinutes) validation("Min reservation minutes must fit within operating hours.");
    if (publicOpenTime < openTime || publicCloseTime > closeTime || publicOpenTime >= publicCloseTime) {
      validation("Public reservation time must be within operating hours.", "publicOpenTime");
    }
    if (minutes(publicCloseTime) - minutes(publicOpenTime) < minReservationMinutes) {
      validation("Min reservation minutes must fit within public reservation hours.", "publicCloseTime");
    }
    if (publicAvailableDaysOfWeek.some((day) => !availableDaysOfWeek.includes(day))) {
      validation("Public reservation days must be included in operating days.", "publicAvailableDaysOfWeek");
    }

    const result = await this.database.query(
      `UPDATE operation_settings SET
        organization_name = $1, public_notice = $2, reservation_enabled = $3,
        reservation_disabled_message = $4, semester_start_date = $5, semester_end_date = $6,
        open_time = $7, close_time = $8, available_days_of_week = $9,
        public_open_time = $10, public_close_time = $11, public_available_days_of_week = $12,
        min_reservation_minutes = $13, max_reservation_minutes = $14,
        admin_contact_email = $15, admin_contact_phone = $16, completion_message = $17,
        updated_by = $18, updated_at = now(), version = version + 1
       WHERE id = 1 AND version = $19 RETURNING *`,
      [organizationName, publicNotice, reservationEnabled, reservationDisabledMessage,
        semesterStartDate, semesterEndDate, openTime, closeTime, availableDaysOfWeek.join(","),
        publicOpenTime, publicCloseTime, publicAvailableDaysOfWeek.join(","),
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
       ORDER BY display_order ASC`,
    );
    return result.rows.map((row) => {
      const room = mapRoom(row);
      return { id: room.id, name: room.name, location: room.location, capacity: room.capacity, description: room.description };
    });
  }

  async getPublicRoom(roomId: string) {
    const result = await this.database.query(
      `SELECT * FROM rooms WHERE id = $1 AND enabled = true AND deleted_at IS NULL AND system_reserved = false`,
      [roomId],
    );
    const row = result.rows[0];
    if (!row) notFound("Room");
    const room = mapRoom(row);
    return { id: room.id, name: room.name, location: room.location, capacity: room.capacity, description: room.description };
  }

  async listRooms(query: RoomListQuery) {
    const { page, size, offset } = query;
    const conditions = ["system_reserved = false"];
    const values: unknown[] = [];
    const add = (condition: string, input: unknown) => { values.push(input); conditions.push(condition.replace("?", `$${values.length}`)); };
    if (!query.includeDeleted) conditions.push("deleted_at IS NULL");
    if (query.enabled !== undefined) add("enabled = ?", query.enabled);
    if (query.keyword) {
      const pattern = `%${query.keyword}%`;
      values.push(pattern, pattern, pattern);
      const base = values.length - 2;
      conditions.push(`(lower(name) LIKE $${base} OR lower(coalesce(location, '')) LIKE $${base + 1} OR lower(coalesce(description, '')) LIKE $${base + 2})`);
    }
    const where = conditions.join(" AND ");
    const count = await this.database.query(`SELECT count(*) AS total FROM rooms WHERE ${where}`, values);
    const rows = await this.database.query(
      `SELECT * FROM rooms WHERE ${where} ORDER BY display_order ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, size, offset],
    );
    return paged(rows.rows.map(mapRoom), page, size, Number(count.rows[0]?.total ?? 0));
  }

  private async lockRoomOrderState(client: Queryable): Promise<number> {
    const result = await client.query(
      "SELECT version FROM room_order_state WHERE id=1 FOR UPDATE",
    );
    const row = result.rows[0];
    if (!row) throw new Error("Room order state is missing.");
    return number(row, "version");
  }

  private async incrementRoomOrderVersion(client: Queryable): Promise<number> {
    const result = await client.query(
      "UPDATE room_order_state SET version=version+1 WHERE id=1 RETURNING version",
    );
    const row = result.rows[0];
    if (!row) throw new Error("Room order state is missing.");
    return number(row, "version");
  }

  async getRoomOrder(queryable?: Queryable): Promise<{
    orderVersion: number;
    items: Array<{
      id: string;
      name: string;
      location: string | null;
      capacity: number;
      description: string | null;
      enabled: boolean;
      displayOrder: number;
    }>;
  }> {
    if (!queryable) {
      return this.database.transaction((client) => this.getRoomOrder(client));
    }

    const state = await queryable.query(
      "SELECT version FROM room_order_state WHERE id=1 FOR SHARE",
    );
    const rooms = await queryable.query(
      `SELECT id, name, location, capacity, description, enabled, display_order
       FROM rooms
       WHERE system_reserved=false AND deleted_at IS NULL
       ORDER BY display_order ASC`,
    );
    const stateRow = state.rows[0];
    if (!stateRow) throw new Error("Room order state is missing.");
    return {
      orderVersion: number(stateRow, "version"),
      items: rooms.rows.map((row) => ({
        id: text(row, "id"),
        name: text(row, "name"),
        location: nullableText(row, "location"),
        capacity: number(row, "capacity"),
        description: nullableText(row, "description"),
        enabled: bool(row, "enabled"),
        displayOrder: number(row, "display_order"),
      })),
    };
  }

  async saveRoomOrder(command: SaveRoomOrderCommand) {
    return this.database.transaction(async (client) => {
      const currentVersion = await this.lockRoomOrderState(client);
      if (command.orderVersion !== currentVersion) {
        conflict(
          "ROOM_ORDER_CONFLICT",
          "The room list changed. Reload the room order and try again.",
          { currentOrderVersion: currentVersion },
        );
      }

      const current = await client.query(
        `SELECT id, display_order
         FROM rooms
         WHERE system_reserved=false AND deleted_at IS NULL
         ORDER BY display_order ASC
         FOR UPDATE`,
      );
      const currentIds = current.rows.map((row) => text(row, "id"));
      const submitted = new Set(command.roomIds);
      const currentSet = new Set(currentIds);
      const missingRoomIds = currentIds.filter((id) => !submitted.has(id));
      const unknownRoomIds = command.roomIds.filter((id) => !currentSet.has(id));
      if (
        command.roomIds.length !== currentIds.length
        || missingRoomIds.length > 0
        || unknownRoomIds.length > 0
      ) {
        conflict(
          "ROOM_ORDER_CONFLICT",
          "The submitted room list does not match the current room list.",
          { missingRoomIds, unknownRoomIds },
        );
      }

      if (currentIds.length > 0) {
        const maxOrder = current.rows.reduce(
          (maximum, row) => Math.max(maximum, number(row, "display_order")),
          0,
        );
        const temporaryStart = maxOrder + currentIds.length + 1;
        await client.query(
          `WITH temporary_order AS (
             SELECT id, $1::bigint + row_number() OVER (ORDER BY display_order ASC) AS next_order
             FROM rooms
             WHERE system_reserved=false AND deleted_at IS NULL
           )
           UPDATE rooms
           SET display_order=temporary_order.next_order
           FROM temporary_order
           WHERE rooms.id=temporary_order.id`,
          [temporaryStart],
        );
        await client.query(
          `WITH desired_order AS (
             SELECT room_id, ordinality::bigint AS next_order
             FROM unnest($1::uuid[]) WITH ORDINALITY AS submitted(room_id, ordinality)
           )
           UPDATE rooms
           SET display_order=desired_order.next_order
           FROM desired_order
           WHERE rooms.id=desired_order.room_id`,
          [command.roomIds],
        );
      }

      await this.incrementRoomOrderVersion(client);
      return this.getRoomOrder(client);
    });
  }

  async getAdminRoom(roomId: string, queryable: Queryable = this.database): Promise<Row> {
    const result = await queryable.query("SELECT * FROM rooms WHERE id = $1 AND system_reserved = false", [roomId]);
    const row = result.rows[0];
    if (!row) notFound("Room");
    return row;
  }

  async getAdminRoomResponse(roomId: string) {
    return mapRoom(await this.getAdminRoom(roomId));
  }

  async createRoom(command: SaveRoomCommand) {
    const { name, location, capacity, description, enabled } = command;
    try {
      return await this.database.transaction(async (client) => {
        await this.lockRoomOrderState(client);
        const result = await client.query(
          `INSERT INTO rooms (name, location, capacity, description, enabled, display_order)
           SELECT $1, $2, $3, $4, $5, COALESCE(MAX(display_order), 0) + 1
           FROM rooms
           WHERE system_reserved=false AND deleted_at IS NULL
           RETURNING *`,
          [name, location, capacity, description, enabled],
        );
        await this.incrementRoomOrderVersion(client);
        return mapRoom(result.rows[0]!);
      });
    } catch (error) {
      if (isDatabaseCode(error, "23505")) conflict("ROOM_NAME_DUPLICATED", "Room name already exists.", { name });
      throw error;
    }
  }

  async updateRoom(roomId: string, command: SaveRoomCommand) {
    await this.getAdminRoom(roomId);
    const { name, location, capacity, description, enabled } = command;
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

  async updateRoomEnabled(roomId: string, enabled: boolean) {
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
      await this.lockRoomOrderState(client);
      const room = await this.getAdminRoom(roomId, client);
      if (value(room, "deleted_at") !== null) notFound("Room");
      const sentinel = await client.query("SELECT id FROM rooms WHERE system_reserved=true AND deleted_at IS NULL");
      const sentinelId = sentinel.rows[0]?.id;
      if (!sentinelId) throw new Error("Deleted room sentinel is missing.");
      const originalName = text(room, "name");
      await client.query(
        "SELECT id FROM reservation_recurrences WHERE room_id=$1 ORDER BY id ASC FOR UPDATE",
        [roomId],
      );
      await client.query(
        "SELECT id FROM reservations WHERE room_id=$1 ORDER BY id ASC FOR UPDATE",
        [roomId],
      );
      await client.query("UPDATE reservation_recurrences SET room_id=$2, original_room_name=$3 WHERE room_id=$1", [roomId, sentinelId, originalName]);
      await client.query("UPDATE reservations SET room_id=$2, original_room_name=$3 WHERE room_id=$1", [roomId, sentinelId, originalName]);
      await client.query("DELETE FROM rooms WHERE id=$1", [roomId]);
      await this.incrementRoomOrderVersion(client);
    });
  }

  async listTags(query: TagListQuery) {
    const { page, size, offset } = query;
    const where = query.keyword ? "WHERE lower(name) LIKE $1" : "";
    const values = query.keyword ? [`%${query.keyword}%`] : [];
    const count = await this.database.query(`SELECT count(*) AS total FROM tags ${where}`, values);
    const rows = await this.database.query(
      `SELECT * FROM tags ${where} ORDER BY name ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, size, offset],
    );
    return paged(rows.rows.map(mapTag), page, size, Number(count.rows[0]?.total ?? 0));
  }

  async createTag(command: SaveTagCommand) {
    return this.saveTag(null, command);
  }

  async updateTag(tagId: string, command: SaveTagCommand) {
    return this.saveTag(tagId, command);
  }

  private async saveTag(tagId: string | null, command: SaveTagCommand) {
    const { name, color } = command;
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

  async createPublicReservation(command: PublicReservationCommand) {
    const { reservation: input, password } = command;
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

  async createAdminReservation(command: AdminReservationCommand, adminUsername: string) {
    const { reservation: input, status, memo } = command;
    const { room, settings } = await this.roomAndSettings(input.roomId);
    validateReservationPolicy(bool(room, "enabled") && !bool(room, "system_reserved"), settings, input, "ADMIN", this.now());
    try {
      const id = await this.database.transaction(async (client) => {
        await this.assertNoConflict(client, input.roomId, input.startAt, input.endAt);
        const inserted = await client.query(
          `INSERT INTO reservations (
            room_id, applicant_name, applicant_email, applicant_phone, purpose,
            start_at, end_at, status, source, created_by_actor_type, created_by_actor_id,
            show_applicant_name
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ADMIN_MANUAL','ADMIN',$9,$10) RETURNING *`,
          [input.roomId, input.applicantName, input.applicantEmail, input.applicantPhone,
            input.purpose, input.startAt, input.endAt, status, adminUsername, input.showApplicantName],
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
      applicantEmail: nullableText(row, "applicant_email"),
      applicantPhone: nullableText(row, "applicant_phone"),
      showApplicantName: bool(row, "show_applicant_name"),
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
      showApplicantName: list.showApplicantName,
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

  private maskEmail(input: string | null): string | null {
    if (!input) return input;
    const at = input.indexOf("@");
    if (at <= 0) return this.maskName(input);
    const local = input.slice(0, at);
    if (local.length === 1) return `*${input.slice(at)}`;
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
      applicantName: detail.showApplicantName ? detail.applicantName : this.maskName(detail.applicantName),
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

  private async verifyPublicPassword(client: Queryable, reservationId: string, password: string, lock = false): Promise<Row> {
    const result = await client.query(
      `${this.reservationSelect}
       WHERE r.id=$1 AND r.cancel_password_hash IS NOT NULL
         AND r.cancel_password_hash = crypt($2, r.cancel_password_hash)
       ${lock ? "FOR UPDATE OF r" : ""}`,
      [reservationId, password],
    );
    const row = result.rows[0];
    if (!row) {
      const exists = await client.query("SELECT 1 FROM reservations WHERE id=$1", [reservationId]);
      if (!exists.rows[0]) notFound("Reservation");
      credentialMismatch(
        "PUBLIC_RESERVATION_PASSWORD_MISMATCH",
        "Reservation password does not match.",
      );
    }
    return row;
  }

  async verifyPublicReservationForEdit(reservationId: string, password: string) {
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

  async updatePublicReservation(reservationId: string, command: PublicReservationCommand) {
    const { reservation: input, password } = command;
    try {
      await this.database.transaction(async (client) => {
        const before = await this.verifyPublicPassword(client, reservationId, password, true);
        if (text(before, "status") === "CANCELLED") validation("CANCELLED status reservations cannot be edited.");
        const roomChanged = text(before, "room_id") !== input.roomId;
        const timeChanged = iso(value(before, "start_at")) !== parseInstant(input.startAt).toISOString()
          || iso(value(before, "end_at")) !== parseInstant(input.endAt).toISOString();
        if (roomChanged || timeChanged) {
          const { room, settings } = await this.roomAndSettings(input.roomId, client);
          validateReservationPolicy(bool(room, "enabled") && !bool(room, "system_reserved"), settings, input, "PUBLIC", this.now());
        }
        await this.assertNoConflict(client, input.roomId, input.startAt, input.endAt, reservationId);
        if (sameReservationValues(before, input, "REQUESTED", false)) return;
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

  async cancelPublicReservation(reservationId: string, password: string) {
    try {
      await this.database.transaction(async (client) => {
        const before = await this.verifyPublicPassword(client, reservationId, password, true);
        if (text(before, "status") === "CANCELLED") validation("CANCELLED status reservations cannot be cancelled again.");
        const result = await client.query(
          `UPDATE reservations SET status='CANCELLED', updated_by_actor_type='PUBLIC_USER',
            updated_by_actor_id=applicant_email, updated_at=now() WHERE id=$1 RETURNING *`,
          [reservationId],
        );
        await this.insertHistory(client, result.rows[0]!, "CANCELLED", before, null, "PUBLIC_USER", nullableText(before, "applicant_email"));
      });
      return await this.getPublicReservation(reservationId);
    } catch (error) {
      if (error instanceof AppError && error.code === "PUBLIC_RESERVATION_PASSWORD_MISMATCH") {
        credentialMismatch("PUBLIC_CANCEL_PASSWORD_MISMATCH", "Cancel password does not match.");
      }
      throw error;
    }
  }

  async updateAdminReservation(reservationId: string, command: AdminReservationCommand, adminUsername: string) {
    const { reservation: input, status, memo } = command;
    const { room, settings } = await this.roomAndSettings(input.roomId);
    validateReservationPolicy(bool(room, "enabled") && !bool(room, "system_reserved"), settings, input, "ADMIN", this.now());
    try {
      await this.database.transaction(async (client) => {
        const before = await this.getReservationRow(reservationId, client);
        const showApplicantName = text(before, "source") === "PUBLIC_FORM"
          ? false
          : input.showApplicantName;
        if (activeStatuses.has(status)) await this.assertNoConflict(client, input.roomId, input.startAt, input.endAt, reservationId);
        if (sameReservationValues(before, input, status, showApplicantName) && !memo?.trim()) return;
        const result = await client.query(
          `UPDATE reservations SET room_id=$2, applicant_name=$3, applicant_email=$4,
            applicant_phone=$5, purpose=$6, start_at=$7, end_at=$8, status=$9,
            show_applicant_name=$10,
            updated_by_actor_type='ADMIN', updated_by_actor_id=$11, updated_at=now(),
            recurrence_exception = recurrence_id IS NOT NULL
           WHERE id=$1 RETURNING *`,
          [reservationId, input.roomId, input.applicantName, input.applicantEmail,
            input.applicantPhone, input.purpose, input.startAt, input.endAt, status,
            showApplicantName, adminUsername],
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
    memo: string | null,
    adminUsername: string,
  ) {
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

  async deleteReservation(reservationId: string, memo: string | null, adminUsername: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const locked = await client.query(
        `${this.reservationSelect} WHERE r.id=$1 FOR UPDATE OF r`,
        [reservationId],
      );
      const before = locked.rows[0];
      if (!before) notFound("Reservation");
      await this.hardDeleteReservation(client, before, memo, adminUsername);
    });
  }

  private async hardDeleteReservation(
    client: Queryable,
    before: Row,
    memo: string | null,
    adminUsername: string,
  ): Promise<void> {
    const reservationId = text(before, "id");
    await client.query(
      `UPDATE reservation_histories SET reservation_deleted_id=$1, reservation_id=NULL
       WHERE reservation_id=$1`,
      [reservationId],
    );
    await this.insertHistory(client, before, "DELETED", before, memo, "ADMIN", adminUsername, true);
    await client.query("DELETE FROM reservations WHERE id=$1", [reservationId]);
  }

  private reservationFilter(query: ReservationFilterQuery): { where: string; values: unknown[] } {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (template: string, input: unknown) => {
      values.push(input);
      conditions.push(template.replace("?", `$${values.length}`));
    };
    if (query.from) add("r.end_at > ?::timestamptz", query.from);
    if (query.to) add("r.start_at < ?::timestamptz", query.to);
    if (query.roomId) add("r.room_id = ?::uuid", query.roomId);
    if (query.status) {
      add("r.status = ?::reservation_status", query.status);
    } else if (query.excludeCancelled) {
      conditions.push("r.status <> 'CANCELLED'");
    }
    if (query.source) {
      add("r.source = ?::reservation_source", query.source);
    }
    if (query.keyword) {
      values.push(`%${query.keyword}%`, `%${query.keyword}%`, `%${query.keyword}%`, `%${query.keyword}%`);
      const base = values.length - 3;
      const keywordConditions = [
        `lower(r.applicant_name) LIKE $${base}`,
        `lower(coalesce(r.applicant_email,'')) LIKE $${base + 1}`,
        `lower(r.purpose) LIKE $${base + 2}`,
        `EXISTS (
          SELECT 1 FROM reservation_histories h
          WHERE h.reservation_id = r.id AND lower(coalesce(h.memo,'')) LIKE $${base + 3}
        )`,
      ];
      if (query.phoneKeyword) {
        values.push(`%${query.phoneKeyword}%`);
        keywordConditions.push(`coalesce(r.applicant_phone,'') LIKE $${values.length}`);
      }
      conditions.push(`(${keywordConditions.join(" OR ")})`);
    }
    return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
  }

  async listReservations(query: ReservationListQuery) {
    const { page, size, offset } = query;
    const filter = this.reservationFilter(query);
    const count = await this.database.query(`SELECT count(*) AS total FROM reservations r ${filter.where}`, filter.values);
    const rows = await this.database.query(
      `${this.reservationSelect} ${filter.where} ORDER BY r.created_at DESC
       LIMIT $${filter.values.length + 1} OFFSET $${filter.values.length + 2}`,
      [...filter.values, size, offset],
    );
    return paged(rows.rows.map((row) => this.mapReservationList(row)), page, size, Number(count.rows[0]?.total ?? 0));
  }

  async getWeeklyReservations(roomId: string, weekStart: string) {
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
          applicantName: item.showApplicantName ? item.applicantName : this.maskName(item.applicantName),
          startAt: item.startAt, endAt: item.endAt,
          status: item.status, purpose: item.purpose, recurrenceId: item.recurrenceId,
          seriesLabel: item.seriesLabel, seriesColor: item.seriesColor,
        };
      }),
    };
  }

  async checkAvailability(query: AvailabilityQuery) {
    const { roomId, startAt, endAt } = query;
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
      if (
        error instanceof AppError
        && (error.kind === "POLICY_VIOLATION" || error.kind === "VALIDATION")
      ) {
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
    actorId: string | null,
    deleted = false,
  ): Promise<void> {
    const roomName = await this.historyRoomName(client, current);
    const beforeRoomName = before ? await this.historyRoomName(client, before) : null;
    await client.query(
      `INSERT INTO reservation_histories (
        reservation_id, reservation_deleted_id, action, before_status, after_status, memo,
        actor_type, actor_id, reservation_room_id, before_reservation_room_id,
        reservation_purpose, before_reservation_purpose, reservation_room_name, before_reservation_room_name,
        reservation_start_at, before_reservation_start_at, reservation_end_at, before_reservation_end_at,
        reservation_applicant_name, before_reservation_applicant_name,
        reservation_applicant_email, before_reservation_applicant_email,
        reservation_applicant_phone, before_reservation_applicant_phone,
        reservation_show_applicant_name, before_reservation_show_applicant_name
       ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
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
        value(current, "show_applicant_name"), before ? value(before, "show_applicant_name") : null,
      ],
    );
  }

  private async historyRoomName(client: Queryable, reservation: Row): Promise<string> {
    const preservedName = nullableText(reservation, "original_room_name");
    if (preservedName) return preservedName;

    const selectedName = nullableText(reservation, "current_room_name")
      || nullableText(reservation, "room_name");
    if (selectedName) return selectedName;

    const roomId = nullableText(reservation, "room_id");
    if (roomId) {
      const result = await client.query("SELECT name FROM rooms WHERE id=$1", [roomId]);
      const currentName = result.rows[0] ? nullableText(result.rows[0], "name") : null;
      if (currentName) return currentName;
    }

    return "삭제된 공간";
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
      reservationShowApplicantName: value(row, "reservation_show_applicant_name") === null
        ? null
        : bool(row, "reservation_show_applicant_name"),
      beforeReservationShowApplicantName: value(row, "before_reservation_show_applicant_name") === null
        ? null
        : bool(row, "before_reservation_show_applicant_name"),
      actorType: text(row, "actor_type"),
      actorId: nullableText(row, "actor_id") || "",
      createdAt: iso(value(row, "created_at")),
    };
  }

  async getReservationHistories(reservationId: string) {
    await this.getReservationRow(reservationId);
    const result = await this.database.query(
      "SELECT * FROM reservation_histories WHERE reservation_id=$1 OR reservation_deleted_id=$1 ORDER BY created_at DESC",
      [reservationId],
    );
    return result.rows.map((row) => this.mapHistory(row));
  }

  async listHistories(query: HistoryListQuery) {
    const { page, size, offset } = query;
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (condition: string, input: unknown) => { values.push(input); conditions.push(condition.replace("?", `$${values.length}`)); };
    if (query.reservationId) add("coalesce(reservation_id,reservation_deleted_id)=?::uuid", query.reservationId);
    if (query.roomId) add("(reservation_room_id=?::uuid OR before_reservation_room_id=?::uuid)", query.roomId);
    if (query.roomId) {
      const last = values.length;
      conditions[conditions.length - 1] = `(reservation_room_id=$${last}::uuid OR before_reservation_room_id=$${last}::uuid)`;
    }
    if (query.action) add("action=?", query.action);
    if (query.from) add("created_at>=?::timestamptz", query.from);
    if (query.to) add("created_at<=?::timestamptz", query.to);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const count = await this.database.query(`SELECT count(*) AS total FROM reservation_histories ${where}`, values);
    const result = await this.database.query(
      `SELECT * FROM reservation_histories ${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, size, offset],
    );
    return paged(result.rows.map((row) => this.mapHistory(row)), page, size, Number(count.rows[0]?.total ?? 0));
  }

  async previewRecurrence(input: RecurrencePreviewCommand) {
    const dates = datesInRange(input.startDate, input.endDate);
    if (input.startTime >= input.endTime) {
      validation("Start time must be before end time.");
    }
    const candidates = dates
      .filter((date) => input.daysOfWeek.includes(weekdayCode(date)))
      .map((date) => ({ date, startAt: serviceOffsetDateTime(date, input.startTime), endAt: serviceOffsetDateTime(date, input.endTime) }));
    const { room, settings } = await this.roomAndSettings(input.roomId);
    const items = candidates.map((candidate) => ({
      ...candidate,
      available: true,
      reason: null as string | null,
      message: null as string | null,
    }));
    const validCandidates: Array<typeof candidates[number] & { itemIndex: number }> = [];
    for (const [itemIndex, candidate] of candidates.entries()) {
      const policyInput: ReservationInput = {
        roomId: input.roomId, applicantName: "recurrence-preview", applicantEmail: "preview@example.test",
        applicantPhone: input.applicantPhone, purpose: "recurrence-preview",
        startAt: candidate.startAt, endAt: candidate.endAt,
      };
      try {
        validateReservationPolicy(bool(room, "enabled") && !bool(room, "system_reserved"), settings, policyInput, "ADMIN", this.now());
        validCandidates.push({ ...candidate, itemIndex });
      } catch (error) {
        if (error instanceof AppError) {
          items[itemIndex] = { ...candidate, available: false, reason: error.code, message: error.message };
        }
        else throw error;
      }
    }
    if (validCandidates.length > 0) {
      const conflicts = await this.database.query(
        `SELECT candidate.candidate_index::int AS candidate_index
         FROM unnest($2::timestamptz[], $3::timestamptz[])
           WITH ORDINALITY AS candidate(start_at, end_at, candidate_index)
         WHERE EXISTS (
           SELECT 1 FROM reservations reservation
           WHERE reservation.room_id=$1
             AND reservation.status IN ('REQUESTED','CONFIRMED')
             AND reservation.start_at < candidate.end_at
             AND reservation.end_at > candidate.start_at
         )
         ORDER BY candidate.candidate_index`,
        [input.roomId, validCandidates.map((candidate) => candidate.startAt), validCandidates.map((candidate) => candidate.endAt)],
      );
      for (const row of conflicts.rows) {
        const itemIndex = validCandidates[number(row, "candidate_index") - 1]?.itemIndex;
        if (itemIndex !== undefined) {
          items[itemIndex] = {
            ...candidates[itemIndex]!,
            available: false,
            reason: "TIME_SLOT_CONFLICT",
            message: "Time slot is already reserved.",
          };
        }
      }
    }
    const availableCount = items.filter((item) => item.available).length;
    const conflictCount = items.length - availableCount;
    const timeSlotConflictCount = items.filter((item) => item.reason === "TIME_SLOT_CONFLICT").length;
    return {
      conflictPolicy: input.conflictPolicy,
      totalCandidates: items.length,
      availableCount,
      conflictCount,
      createAllowed: input.conflictPolicy === "FAIL_ALL"
        ? items.length > 0 && conflictCount === 0
        : availableCount + timeSlotConflictCount > 0,
      items,
    };
  }

  async createRecurrence(input: RecurrenceCreateCommand, adminUsername: string) {
    const preview = await this.previewRecurrence(input);
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
            start_date, end_date, days_of_week, start_time, end_time, conflict_policy, created_by,
            show_applicant_name
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [input.roomId, input.applicantName, input.applicantEmail, input.applicantPhone, input.purpose,
            input.tagId, input.startDate, input.endDate, input.daysOfWeek.join(","), input.startTime,
            input.endTime, input.conflictPolicy, adminUsername, input.showApplicantName],
        );
        const recurrence = recurrenceResult.rows[0]!;
        const resultItems: Array<{ date: string; status: "CREATED" | "CANCELLED" | "SKIPPED"; reason: string | null }> = [];
        let createdCount = 0;
        let cancelledCount = 0;
        let skippedCount = 0;
        const insertGeneratedReservation = async (
          item: (typeof preview.items)[number],
          status: "CONFIRMED" | "CANCELLED",
          memo: string | null,
        ) => {
          const inserted = await client.query(
            `INSERT INTO reservations (
              room_id, recurrence_id, applicant_name, applicant_email, applicant_phone, purpose,
              start_at, end_at, status, source, created_by_actor_type, created_by_actor_id,
              show_applicant_name
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RECURRING_GENERATED','ADMIN',$10,$11) RETURNING *`,
            [input.roomId, value(recurrence, "id"), input.applicantName, input.applicantEmail,
              input.applicantPhone, input.purpose, item.startAt, item.endAt, status, adminUsername,
              input.showApplicantName],
          );
          await this.insertHistory(client, inserted.rows[0]!, "RECURRENCE_GENERATED", null, memo, "ADMIN", adminUsername);
        };
        const recordTimeSlotConflict = async (item: (typeof preview.items)[number]) => {
          await insertGeneratedReservation(
            item,
            "CANCELLED",
            "반복 예약 생성 시 시간 충돌로 취소 상태 기록",
          );
          cancelledCount += 1;
          resultItems.push({ date: item.date, status: "CANCELLED", reason: "TIME_SLOT_CONFLICT" });
        };
        for (let index = 0; index < preview.items.length; index += 1) {
          const item = preview.items[index]!;
          if (!item.available) {
            if (input.conflictPolicy === "SKIP_CONFLICTS" && item.reason === "TIME_SLOT_CONFLICT") {
              await recordTimeSlotConflict(item);
              continue;
            }
            skippedCount += 1;
            resultItems.push({ date: item.date, status: "SKIPPED", reason: item.reason });
            continue;
          }
          const savepoint = `recurrence_candidate_${index}`;
          await client.query(`SAVEPOINT ${savepoint}`);
          try {
            await insertGeneratedReservation(item, "CONFIRMED", null);
            await client.query(`RELEASE SAVEPOINT ${savepoint}`);
            createdCount += 1;
            resultItems.push({ date: item.date, status: "CREATED", reason: null });
          } catch (error) {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            if (input.conflictPolicy === "SKIP_CONFLICTS" && isDatabaseCode(error, "23P01")) {
              await recordTimeSlotConflict(item);
              await client.query(`RELEASE SAVEPOINT ${savepoint}`);
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
          cancelledCount,
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
      daysOfWeek: normalizeDays(text(row, "days_of_week").split(",")).join(","),
      startTime: timeText(value(row, "start_time")),
      endTime: timeText(value(row, "end_time")),
      conflictPolicy: text(row, "conflict_policy"),
      showApplicantName: bool(row, "show_applicant_name"),
      createdAt: iso(value(row, "created_at")),
    };
  }

  async listRecurrences(query: RecurrenceListQuery) {
    const { page, size, offset } = query;
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (condition: string, input: unknown) => { values.push(input); conditions.push(condition.replace("?", `$${values.length}`)); };
    if (query.roomId) add("rr.room_id=?::uuid", query.roomId);
    if (query.fromDate) add("rr.end_date>=?::date", query.fromDate);
    if (query.toDate) add("rr.start_date<=?::date", query.toDate);
    if (query.keyword) {
      values.push(`%${query.keyword}%`);
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
      applicantEmail: nullableText(row, "applicant_email"),
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
      showApplicantName: list.showApplicantName,
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

  async deleteRecurrence(recurrenceId: string, memo: string | null, adminUsername: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const recurrence = await client.query(
        "SELECT id FROM reservation_recurrences WHERE id=$1 FOR UPDATE",
        [recurrenceId],
      );
      if (!recurrence.rows[0]) notFound("Recurrence");
      const reservations = await client.query(
        `${this.reservationSelect} WHERE r.recurrence_id=$1 ORDER BY r.id FOR UPDATE OF r`,
        [recurrenceId],
      );
      for (const before of reservations.rows) {
        await this.hardDeleteReservation(client, before, memo, adminUsername);
      }
      await client.query("DELETE FROM reservation_recurrences WHERE id=$1", [recurrenceId]);
    });
  }

  async exportReservationsCsv(query: ReservationFilterQuery): Promise<string> {
    const filter = this.reservationFilter(query);
    const result = await this.database.query(
      `${this.reservationSelect} ${filter.where} ORDER BY r.start_at ASC LIMIT 10001`,
      filter.values,
    );
    if (result.rows.length > 10_000) {
      policy("CSV_EXPORT_TOO_LARGE", "Too many reservations to export. Narrow the filters and try again.");
    }
    const header = ["reservationId", "roomName", "applicantName", "applicantEmail", "applicantPhone", "purpose", "startAt", "endAt", "status", "source", "recurrenceId", "createdAt"];
    const formatKst = (input: unknown) => new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).format(new Date(input instanceof Date ? input : String(input)));
    const escape = (input: unknown) => {
      let string = input === null || input === undefined ? "" : String(input);
      if (/^\s*[=+\-@]/u.test(string)) string = `'${string}`;
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
      if (!dryRun) await this.lockRoomOrderState(client);
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
         WHERE lower(purpose) LIKE $1 OR lower(applicant_name) LIKE $1 OR lower(coalesce(applicant_email,'')) LIKE $1
           OR room_id=ANY($2::uuid[])`,
        [pattern, roomIds],
      );
      const reservationIds = await ids(
        `SELECT id FROM reservations
         WHERE lower(purpose) LIKE $1 OR lower(applicant_name) LIKE $1 OR lower(coalesce(applicant_email,'')) LIKE $1
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
      if (roomsDeleted.rowCount > 0) await this.incrementRoomOrderVersion(client);
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
