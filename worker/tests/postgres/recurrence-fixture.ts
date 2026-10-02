import { ProductService } from "../../src/services/product-service";
import { parseRecurrenceCreate, parseUpdateSettings } from "../../src/http/product-input";
import type { PgDatabase } from "./pg-database";

export const recurrenceNow = new Date("2030-01-01T00:00:00+09:00");
export const recurrenceDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export function recurrenceDate(index: number) {
  return new Date(Date.UTC(2030, 0, 2 + index)).toISOString().slice(0, 10);
}

export async function setupRecurrenceFixture(database: PgDatabase) {
  const products = new ProductService(database, () => recurrenceNow);
  const original = await products.getSettings();
  await products.updateSettings(parseUpdateSettings({
    ...original, semesterStartDate: recurrenceDate(0), semesterEndDate: recurrenceDate(365),
    openTime: "09:00", closeTime: "18:00", availableDaysOfWeek: recurrenceDays,
    specialApprovalStartTime: "17:00", specialApprovalEndTime: "18:00",
    specialApprovalDaysOfWeek: [], minReservationMinutes: 30, maxReservationMinutes: 120,
  }), "testing-admin");
  const room = await products.createRoom({
    name: `testing-room-recurrence-${crypto.randomUUID()}`, location: null,
    capacity: 10, description: null, enabled: true,
  });
  const purpose = `testing-recurring-${crypto.randomUUID()}`;
  const command = (count: number, conflictPolicy = "FAIL_ALL") => parseRecurrenceCreate({
    roomId: room.id, applicantName: "testing-recurring-applicant", applicantEmail: null,
    applicantPhone: "01012345678", purpose, tagId: null, showApplicantName: true,
    startDate: recurrenceDate(0), endDate: recurrenceDate(count - 1), daysOfWeek: recurrenceDays,
    startTime: "10:00", endTime: "11:00", conflictPolicy,
  });
  // Scope cleanup to this fixture's room and marker; never clear unrelated rows.
  async function clear() {
    await database.query("DELETE FROM reservation_histories WHERE reservation_room_id=$1 AND reservation_purpose LIKE 'testing-%'", [room.id]);
    await database.query("DELETE FROM reservations WHERE room_id=$1 AND purpose LIKE 'testing-%'", [room.id]);
    await database.query("DELETE FROM reservation_recurrences WHERE room_id=$1 AND purpose LIKE 'testing-%'", [room.id]);
  }
  async function blocker(index: number) {
    await database.query(
      `INSERT INTO reservations(room_id,applicant_name,purpose,start_at,end_at,status,source,created_by_actor_type)
       VALUES($1,'testing-blocker','testing-recurrence-blocker',$2,$3,'CONFIRMED','ADMIN_MANUAL','ADMIN')`,
      [room.id, `${recurrenceDate(index)}T10:00:00+09:00`, `${recurrenceDate(index)}T11:00:00+09:00`],
    );
  }
  return { products, room, purpose, command, clear, blocker,
    async close() {
      await clear();
      await database.query("DELETE FROM rooms WHERE id=$1 AND name LIKE 'testing-room-%'", [room.id]);
      const latest = await products.getSettings();
      await products.updateSettings(parseUpdateSettings({ ...original, version: latest.version }), "testing-admin");
    },
  };
}

export function recurrenceQueryCounts(statements: string[]) {
  return {
    total: statements.length,
    roomName: statements.filter(sql => /^SELECT name FROM rooms WHERE id=/i.test(sql)).length,
    savepoint: statements.filter(sql => /^SAVEPOINT /i.test(sql)).length,
    release: statements.filter(sql => /^RELEASE SAVEPOINT /i.test(sql)).length,
    rollbackTo: statements.filter(sql => /^ROLLBACK TO SAVEPOINT /i.test(sql)).length,
  };
}
