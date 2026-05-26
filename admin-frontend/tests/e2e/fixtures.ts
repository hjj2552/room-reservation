import { expect, test as base, type APIRequestContext } from '@playwright/test';
import {
  createReservationByApi,
  createRecurrenceByApi,
  createRoomByApi,
  uniqueE2eName,
  type E2eRecurrence,
  type E2eReservation,
  type E2eRoom,
} from './helpers';

interface E2eResourceRegistry {
  rooms: string[];
  reservations: string[];
  recurrences: string[];
}

interface E2eDataFactory {
  name(label: string): string;
  createTestRoom(label: string): Promise<E2eRoom>;
  createTestReservation(
    roomId: string,
    label: string,
    options?: { startAt?: string; endAt?: string; memo?: string },
  ): Promise<E2eReservation>;
  createTestRecurringReservation(
    roomId: string,
    label: string,
    options?: {
      startDate?: string;
      endDate?: string;
      dayOfWeek?: string;
      startTime?: string;
      endTime?: string;
      conflictPolicy?: 'SKIP_CONFLICTS' | 'FAIL_ALL' | 'CREATE_AVAILABLE_ONLY';
    },
  ): Promise<E2eRecurrence>;
  registerRoom(roomId: string): void;
  registerReservation(reservationId: string): void;
  registerRecurrence(recurrenceId: string): void;
}

interface E2eFixtures {
  e2eRegistry: E2eResourceRegistry;
  e2eData: E2eDataFactory;
}

export const test = base.extend<E2eFixtures>({
  e2eRegistry: [async ({ request }, use) => {
    const registry: E2eResourceRegistry = {
      rooms: [],
      reservations: [],
      recurrences: [],
    };

    try {
      await use(registry);
    } finally {
      await cleanupRegisteredResources(request, registry);
    }
  }, { auto: true }],
  e2eData: async ({ request, e2eRegistry }, use) => {
    await use({
      name: uniqueE2eName,
      createTestRoom: async (label) => {
        const room = await createRoomByApi(request, uniqueE2eName(`room-${label}`));
        e2eRegistry.rooms.push(room.id);
        return room;
      },
      createTestReservation: async (roomId, label, options) => {
        const purpose = uniqueE2eName(`reservation-${label}`);
        const reservation = await createReservationByApi(request, roomId, purpose, options);
        e2eRegistry.reservations.push(reservation.id);
        return { ...reservation, purpose };
      },
      createTestRecurringReservation: async (roomId, label, options) => {
        const purpose = uniqueE2eName(`recurring-${label}`);
        const recurrence = await createRecurrenceByApi(request, roomId, purpose, options);
        e2eRegistry.recurrences.push(recurrence.recurrenceId);
        return recurrence;
      },
      registerRoom: (roomId) => {
        e2eRegistry.rooms.push(roomId);
      },
      registerReservation: (reservationId) => {
        e2eRegistry.reservations.push(reservationId);
      },
      registerRecurrence: (recurrenceId) => {
        e2eRegistry.recurrences.push(recurrenceId);
      },
    });
  },
});

export { expect };

async function cleanupRegisteredResources(request: APIRequestContext, registry: E2eResourceRegistry) {
  for (const recurrenceId of [...registry.recurrences].reverse()) {
    await postIgnoringFailures(request, `/api/admin/recurrences/${recurrenceId}/cancel`, { memo: 'e2e-fixture-cleanup' });
  }
  for (const reservationId of [...registry.reservations].reverse()) {
    await postIgnoringFailures(request, `/api/admin/reservations/${reservationId}/cancel`, { memo: 'e2e-fixture-cleanup' });
  }
  for (const roomId of [...registry.rooms].reverse()) {
    await deleteIgnoringFailures(request, `/api/admin/rooms/${roomId}`);
  }
}

async function postIgnoringFailures(request: APIRequestContext, url: string, data: unknown) {
  try {
    await request.post(url, { data });
  } catch {
    // Prefix cleanup runs next and handles any resources that are still present.
  }
}

async function deleteIgnoringFailures(request: APIRequestContext, url: string) {
  try {
    await request.delete(url);
  } catch {
    // Prefix cleanup runs next and handles any resources that are still present.
  }
}
