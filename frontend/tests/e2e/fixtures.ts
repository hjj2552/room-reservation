import { expect, test as base, type APIRequestContext } from '@playwright/test';
import {
  createPublicReservationByApi,
  createReservationByApi,
  createRecurrenceByApi,
  createRoomByApi,
  createTagByApi,
  csrfHeaders,
  deleteReservationByApi,
  deleteTagByApi,
  uniqueE2eName,
  type E2ePublicReservation,
  type E2eRecurrence,
  type E2eReservation,
  type E2eRoom,
  type E2eTag,
} from './helpers';

interface E2eResourceRegistry {
  rooms: string[];
  reservations: string[];
  recurrences: string[];
  tags: string[];
}

interface E2eDataFactory {
  name(label: string): string;
  createTestRoom(
    label: string,
    options?: { location?: string | null; description?: string | null },
  ): Promise<E2eRoom>;
  createTestTag(label: string, options?: { color?: string }): Promise<E2eTag>;
  createTestReservation(
    roomId: string,
    label: string,
    options?: { startAt?: string; endAt?: string; memo?: string },
  ): Promise<E2eReservation>;
  createTestPublicReservation(
    roomId: string,
    label: string,
    options?: {
      startAt?: string;
      endAt?: string;
      applicantName?: string;
      applicantEmail?: string;
      applicantPhone?: string;
      cancelPassword?: string;
    },
  ): Promise<E2ePublicReservation>;
  createTestRecurringReservation(
    roomId: string,
    label: string,
    options?: {
      startDate?: string;
      endDate?: string;
      dayOfWeek?: string;
      startTime?: string;
      endTime?: string;
      conflictPolicy?: 'SKIP_CONFLICTS' | 'FAIL_ALL';
      tagId?: string | null;
    },
  ): Promise<E2eRecurrence>;
  registerRoom(roomId: string): void;
  registerReservation(reservationId: string): void;
  registerRecurrence(recurrenceId: string): void;
  registerTag(tagId: string): void;
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
      tags: [],
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
      createTestRoom: async (label, options) => {
        const room = await createRoomByApi(request, uniqueE2eName(`room-${label}`), options);
        e2eRegistry.rooms.push(room.id);
        return room;
      },
      createTestTag: async (label, options) => {
        const tag = await createTagByApi(request, uniqueE2eName(`tag-${label}`), options?.color);
        e2eRegistry.tags.push(tag.id);
        return tag;
      },
      createTestReservation: async (roomId, label, options) => {
        const purpose = uniqueE2eName(`reservation-${label}`);
        const reservation = await createReservationByApi(request, roomId, purpose, options);
        e2eRegistry.reservations.push(reservation.id);
        return { ...reservation, purpose };
      },
      createTestPublicReservation: async (roomId, label, options) => {
        const purpose = uniqueE2eName(`reservation-${label}`);
        const reservation = await createPublicReservationByApi(request, roomId, purpose, options);
        e2eRegistry.reservations.push(reservation.id);
        return reservation;
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
      registerTag: (tagId) => {
        e2eRegistry.tags.push(tagId);
      },
    });
  },
});

export { expect };

async function cleanupRegisteredResources(request: APIRequestContext, registry: E2eResourceRegistry) {
  for (const recurrenceId of [...registry.recurrences].reverse()) {
    await postIgnoringFailures(request, `/api/admin/recurrences/${recurrenceId}/cancel`, { memo: 'testing-fixture-cleanup' });
  }
  for (const reservationId of [...registry.reservations].reverse()) {
    await deleteReservationIgnoringFailures(request, reservationId);
  }
  for (const tagId of [...registry.tags].reverse()) {
    await deleteTagIgnoringFailures(request, tagId);
  }
  for (const roomId of [...registry.rooms].reverse()) {
    await deleteIgnoringFailures(request, `/api/admin/rooms/${roomId}`);
  }
}

async function deleteReservationIgnoringFailures(request: APIRequestContext, reservationId: string) {
  try {
    await deleteReservationByApi(request, reservationId, 'testing-fixture-cleanup');
  } catch {
    // Prefix cleanup runs next and handles any resources that are still present.
  }
}

async function postIgnoringFailures(request: APIRequestContext, url: string, data: unknown) {
  try {
    await request.post(url, {
      headers: await csrfHeaders(request),
      data,
    });
  } catch {
    // Prefix cleanup runs next and handles any resources that are still present.
  }
}

async function deleteTagIgnoringFailures(request: APIRequestContext, tagId: string) {
  try {
    await deleteTagByApi(request, tagId);
  } catch {
    // Prefix cleanup runs next and handles any resources that are still present.
  }
}

async function deleteIgnoringFailures(request: APIRequestContext, url: string) {
  try {
    await request.delete(url, {
      headers: await csrfHeaders(request),
    });
  } catch {
    // Prefix cleanup runs next and handles any resources that are still present.
  }
}
