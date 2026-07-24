import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createRoom, ensureMigrations, reservationBody } from "./helpers";

describe("D1 atomic reservation conflict path", () => {
  beforeAll(ensureMigrations);

  it("allows exactly one of eight concurrent Worker requests", async () => {
    const roomId = await createRoom();
    const requests = Array.from({ length: 8 }, (_, index) =>
      SELF.fetch("https://example.test/api/p3-d1/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: reservationBody(roomId, `testing-reservation-concurrent-${index}`),
      }),
    );
    const responses = await Promise.all(requests);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(7);
    for (const response of responses.filter((item) => item.status === 409)) {
      expect(await response.json()).toEqual({ code: "RESERVATION_CONFLICT" });
    }

    const active = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM p3_d1_reservations WHERE room_id = ? AND status IN ('REQUESTED', 'CONFIRMED')",
    )
      .bind(roomId)
      .first<{ count: number }>();
    const events = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM p3_d1_reservation_events e
       JOIN p3_d1_reservations r ON r.id = e.reservation_id
       WHERE r.room_id = ?`,
    )
      .bind(roomId)
      .first<{ count: number }>();
    expect(active?.count).toBe(1);
    expect(events?.count).toBe(1);
  });
});
