import { applyD1Migrations, env } from "cloudflare:test";

let migrated = false;

export async function ensureMigrations(): Promise<void> {
  if (migrated) return;
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  migrated = true;
}

export async function createRoom(id = crypto.randomUUID()): Promise<string> {
  await env.DB.prepare("INSERT INTO p3_d1_rooms (id, name) VALUES (?, ?)")
    .bind(id, `testing-room-${id}`)
    .run();
  return id;
}

export function reservationBody(roomId: string, purpose = "testing-reservation-p3-d1") {
  return JSON.stringify({
    roomId,
    startAt: "2030-01-01T10:00:00+09:00",
    endAt: "2030-01-01T10:30:00+09:00",
    purpose,
  });
}

export function cookieValue(setCookieHeaders: string[], name: string): string {
  const entry = setCookieHeaders.find((value) => value.startsWith(`${name}=`));
  if (!entry) throw new Error(`Missing ${name} cookie`);
  return entry.split(";", 1)[0]!.slice(name.length + 1);
}
