import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import {
  cancelRecurrenceByApi,
  cancelReservationByApi,
  deleteRoomByApi,
  expectTestIdBelow,
  getSettingsByApi,
  loginByApi,
  nextWeekdayRecurrenceInputs,
} from './helpers';

test('recurrence smoke: list, preview, create, detail, and cancel', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('recurrence-room');
  const purpose = e2eData.name('recurring-smoke');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ weeks: 1 });
  const settings = await getSettingsByApi(request);
  let recurrenceId: string | undefined;
  let cancelled = false;

  try {
    await page.goto('/admin/recurrences');
    await expect(page.getByTestId('recurrence-form')).toBeVisible();
    await expect(page.getByTestId('recurrence-start-time-input').locator('option[value="09:05"]')).toHaveCount(1);
    await expect(page.getByTestId('recurrence-start-time-input')).toHaveValue(settings.openTime.slice(0, 5));
    await expect(page.getByTestId('recurrence-end-time-input')).toHaveValue(
      addMinutesToTime(settings.openTime, settings.minReservationMinutes),
    );
    await expect(page.getByTestId('recurrences-table').or(page.getByText('조건에 맞는 반복 예약이 없습니다.'))).toBeVisible();
    await expectTestIdBelow(page, 'recurrence-applicant-name-input', 'recurrence-show-applicant-name-input');
    await expect(page.getByTestId('recurrence-show-applicant-name-input').locator('xpath=ancestor::fieldset')).toHaveCount(0);

    await page.getByTestId('recurrence-room-select').selectOption(room.id);
    await page.getByTestId('recurrence-applicant-name-input').fill('testing-recurrence-admin');
    await page.getByTestId('recurrence-purpose-input').fill(purpose);
    await page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate);
    await page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate);
    await page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime);
    await page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime);
    await page.getByTestId('recurrence-day-THU').check();
    await page.getByTestId('recurrence-day-TUE').check();
    await page.getByTestId('recurrence-day-WED').check();
    await page.getByTestId('recurrence-conflict-policy-select').selectOption('FAIL_ALL');
    await page.getByTestId('recurrence-show-applicant-name-input').check();

    const previewResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/recurrences/preview') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('recurrence-preview-button').click();
    const previewResponse = await previewResponsePromise;
    const previewBody = await previewResponse.text();
    const previewRequest = JSON.parse(previewResponse.request().postData() || '{}') as {
      applicantPhone?: string | null;
      daysOfWeek?: string[];
    };
    expect(previewRequest.applicantPhone).toBeNull();
    expect(previewRequest.daysOfWeek).toEqual(['TUE', 'WED', 'THU']);
    expect(previewResponse.ok(), previewBody).toBeTruthy();
    const preview = JSON.parse(previewBody) as { availableCount: number; totalCandidates: number };
    expect(preview.totalCandidates, previewBody).toBeGreaterThan(0);
    expect(preview.availableCount, previewBody).toBeGreaterThan(0);
    await expect(page.getByTestId('recurrence-preview-summary')).toContainText(String(preview.availableCount));

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/recurrences' && response.request().method() === 'POST';
    });
    await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
    await page.getByTestId('recurrence-create-button').click();
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.text();
    const createRequest = JSON.parse(createResponse.request().postData() || '{}') as {
      applicantEmail?: string | null;
      applicantPhone?: string | null;
      showApplicantName?: boolean;
      daysOfWeek?: string[];
    };
    expect(createRequest.applicantEmail).toBeNull();
    expect(createRequest.applicantPhone).toBeNull();
    expect(createRequest.showApplicantName).toBe(true);
    expect(createRequest.daysOfWeek).toEqual(['TUE', 'WED', 'THU']);
    expect(createResponse.ok(), createBody).toBeTruthy();
    const created = JSON.parse(createBody) as { recurrenceId: string; createdCount: number };
    recurrenceId = created.recurrenceId;
    e2eData.registerRecurrence(recurrenceId);
    expect(created.createdCount, createBody).toBeGreaterThan(0);

    await page.route('**/api/admin/recurrences?**', async (route) => {
      const response = await route.fetch();
      const body = await response.json() as { items: Array<{ id: string; daysOfWeek: string }> };
      await route.fulfill({
        response,
        json: {
          ...body,
          items: body.items.map((item) => item.id === recurrenceId
            ? { ...item, daysOfWeek: 'THU,TUE,WED' }
            : item),
        },
      });
    }, { times: 1 });
    await page.goto('/admin/recurrences');
    let row = page.getByRole('row').filter({ hasText: purpose });
    await expect(row).toContainText('화, 수, 목');
    await page.reload();
    row = page.getByRole('row').filter({ hasText: purpose });
    await expect(row).toContainText('화, 수, 목');

    await page.route(`**/api/admin/recurrences/${recurrenceId}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json() as { daysOfWeek: string };
      await route.fulfill({ response, json: { ...body, daysOfWeek: 'THU,TUE,WED' } });
    }, { times: 1 });
    await page.goto(`/admin/recurrences/${recurrenceId}`);
    await expect(page.getByRole('heading', { name: room.name })).toBeVisible();
    await expect(page.getByTestId('recurrence-detail-purpose')).toHaveText(purpose);
    await expect(page.getByTestId('recurrence-detail-room')).toContainText(room.name);
    await expect(page.getByTestId('recurrence-detail-schedule')).toContainText('화, 수, 목');
    await expect(page.getByTestId('recurrence-detail-applicant-name')).toContainText('(공개)');
    await expect(page.getByTestId('recurrence-detail-applicant-email').locator('span').first()).toHaveText('-');
    await expect(page.getByTestId('recurrence-detail-applicant-email')).toContainText('(비공개)');
    await expect(page.getByTestId('recurrence-detail-applicant-phone').locator('span').first()).toHaveText('-');
    await expect(page.getByTestId('recurrence-detail-applicant-phone')).toContainText('(비공개)');

    await page.getByTestId('recurrence-detail-cancel-memo-input').fill('testing-recurrence-cancel');
    const cancelResponsePromise = page.waitForResponse((response) =>
      response.url().includes(`/api/admin/recurrences/${recurrenceId}/cancel`) &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('recurrence-detail-cancel-button').click();
    const cancelResponse = await cancelResponsePromise;
    expect(cancelResponse.ok(), `Cancel recurrence failed with status ${cancelResponse.status()}`).toBeTruthy();
    cancelled = true;

    await expect(page.getByTestId('recurrence-detail-status')).toContainText('취소');
    await expect(page.getByTestId('recurrence-detail-cancel-button')).toBeDisabled();

    await page.goto('/admin/recurrences');
    await expect(page.getByTestId('recurrence-status-filter')).toHaveValue('ALL');
    row = page.getByRole('row').filter({ hasText: purpose });
    await expect(row).toBeVisible();
    await expect(row).toContainText('취소');
  } finally {
    if (recurrenceId && !cancelled) {
      await cancelRecurrenceByApi(request, recurrenceId, 'testing-cleanup');
    }
    await deleteRoomByApi(request, room.id);
  }
});

test('recurrence SKIP_CONFLICTS creates only available candidates when one slot conflicts', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('recurrence-skip-room');
  const purpose = e2eData.name('recurring-skip-conflicts');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ daysAhead: 35, weeks: 1 });
  const blocker = await e2eData.createTestReservation(room.id, 'recurrence-blocker', {
    startAt: recurrenceTime.firstStartAt,
    endAt: recurrenceTime.firstEndAt,
    memo: 'testing-recurrence-conflict-blocker',
  });
  let recurrenceId: string | undefined;

  try {
    await page.goto('/admin/recurrences');
    await page.getByTestId('recurrence-room-select').selectOption(room.id);
    await page.getByTestId('recurrence-applicant-name-input').fill('testing-recurrence-admin');
    await page.getByTestId('recurrence-email-input').fill(`testing-recurrence-skip-${Date.now()}@example.test`);
    await page.getByTestId('recurrence-phone-input').fill('010-2222-3333');
    await page.getByTestId('recurrence-purpose-input').fill(purpose);
    await page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate);
    await page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate);
    await page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime);
    await page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime);
    await page.getByTestId(`recurrence-day-${recurrenceTime.dayOfWeek}`).check();
    await page.getByTestId('recurrence-conflict-policy-select').selectOption('SKIP_CONFLICTS');

    const previewResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/recurrences/preview') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('recurrence-preview-button').click();
    const previewResponse = await previewResponsePromise;
    const previewBody = await previewResponse.text();
    expect(previewResponse.ok(), previewBody).toBeTruthy();
    const preview = JSON.parse(previewBody) as {
      totalCandidates: number;
      availableCount: number;
      conflictCount: number;
    };
    expect(preview.totalCandidates, previewBody).toBe(2);
    expect(preview.availableCount, previewBody).toBe(1);
    expect(preview.conflictCount, previewBody).toBe(1);

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/recurrences' && response.request().method() === 'POST';
    });
    await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
    await page.getByTestId('recurrence-create-button').click();
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.text();
    expect(createResponse.ok(), createBody).toBeTruthy();
    const created = JSON.parse(createBody) as {
      recurrenceId: string;
      createdCount: number;
      skippedCount: number;
      items: Array<{ status: string; reason: string | null }>;
    };
    recurrenceId = created.recurrenceId;
    e2eData.registerRecurrence(recurrenceId);
    expect(created.createdCount, createBody).toBe(1);
    expect(created.skippedCount, createBody).toBe(1);
    expect(created.items.map((item) => item.status)).toEqual(['SKIPPED', 'CREATED']);
    expect(created.items[0].reason).toBe('TIME_SLOT_CONFLICT');

    await page.goto(`/admin/recurrences/${recurrenceId}`);
    await expect(page.getByTestId('recurrence-detail-purpose')).toHaveText(purpose);
    await expect(page.getByTestId('recurrence-detail-schedule')).toContainText(dayLabel(recurrenceTime.dayOfWeek));
  } finally {
    if (recurrenceId) {
      await cancelRecurrenceByApi(request, recurrenceId, 'testing-cleanup');
    }
    await cancelReservationByApi(request, blocker.id, 'testing-cleanup');
    await deleteRoomByApi(request, room.id);
  }
});

test('recurrence create can select a configured tag', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('recurrence-tag-room');
  const tag = await e2eData.createTestTag('recurrence-create', { color: '#dc2626' });
  const purpose = e2eData.name('recurring-tagged');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ daysAhead: 42 });
  let recurrenceId: string | undefined;

  try {
    await page.goto('/admin/recurrences');
    await page.getByTestId('recurrence-room-select').selectOption(room.id);
    await page.getByTestId('recurrence-applicant-name-input').fill('testing-recurrence-tag-admin');
    await page.getByTestId('recurrence-email-input').fill(`testing-recurrence-tag-${Date.now()}@example.test`);
    await page.getByTestId('recurrence-phone-input').fill('010-2222-3333');
    await page.getByTestId('recurrence-purpose-input').fill(purpose);
    await page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate);
    await page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate);
    await page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime);
    await page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime);
    await expect(page.getByTestId('recurrence-tag-select')).toContainText(tag.name);
    await page.getByTestId('recurrence-tag-select').selectOption(tag.id);
    await page.getByTestId(`recurrence-day-${recurrenceTime.dayOfWeek}`).check();
    await page.getByTestId('recurrence-conflict-policy-select').selectOption('FAIL_ALL');

    const previewResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/recurrences/preview') &&
      response.request().method() === 'POST',
    );
    await page.getByTestId('recurrence-preview-button').click();
    const previewResponse = await previewResponsePromise;
    const previewBody = await previewResponse.text();
    expect(previewResponse.ok(), previewBody).toBeTruthy();

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/admin/recurrences' && response.request().method() === 'POST';
    });
    await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
    await page.getByTestId('recurrence-create-button').click();
    const createResponse = await createResponsePromise;
    const createBody = await createResponse.text();
    expect(createResponse.ok(), createBody).toBeTruthy();
    const created = JSON.parse(createBody) as { recurrenceId: string; createdCount: number };
    recurrenceId = created.recurrenceId;
    e2eData.registerRecurrence(recurrenceId);
    expect(created.createdCount, createBody).toBeGreaterThan(0);

    await page.goto(`/admin/recurrences/${recurrenceId}`);
    await expect(page.getByTestId('recurrence-detail-purpose')).toHaveText(purpose);
    await expect(page.getByTestId('recurrence-detail-tag')).toContainText(tag.name);

    await page.goto('/admin/recurrences');
    const row = page.getByRole('row').filter({ hasText: purpose });
    await expect(row).toBeVisible();
    await expect(row).toContainText(tag.name);
  } finally {
    if (recurrenceId) {
      await cancelRecurrenceByApi(request, recurrenceId, 'testing-cleanup');
    }
  }
});

test('recurrence preview validity follows only the preview condition values', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const firstRoom = await e2eData.createTestRoom('recurrence-preview-first');
  const secondRoom = await e2eData.createTestRoom('recurrence-preview-second');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ daysAhead: 49, weeks: 1 });
  const purpose = e2eData.name('recurring-preview-validity');

  await page.goto('/admin/recurrences');
  await fillRecurrenceDraft(page, firstRoom.id, purpose, recurrenceTime);
  await runRecurrencePreview(page);

  const createButton = page.getByTestId('recurrence-create-button');
  const summary = page.getByTestId('recurrence-preview-summary');
  const staleMessage = page.getByTestId('recurrence-preview-stale');
  await expect(createButton).toBeEnabled();
  await expect(summary).toBeVisible();

  await page.getByTestId('recurrence-room-select').focus();
  await page.keyboard.press('Tab');
  await expect(createButton).toBeEnabled();
  await expect(staleMessage).toBeHidden();

  async function expectStaleUntilRestored(change: () => Promise<void>, restore: () => Promise<void>) {
    await change();
    await expect(createButton).toBeDisabled();
    await expect(staleMessage).toHaveText('반복 조건이 변경되었습니다. 다시 미리보기를 실행해 주세요.');
    await expect(summary).toBeHidden();
    await restore();
    await expect(createButton).toBeEnabled();
    await expect(staleMessage).toBeHidden();
    await expect(summary).toBeVisible();
  }

  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-room-select').selectOption(secondRoom.id),
    () => page.getByTestId('recurrence-room-select').selectOption(firstRoom.id),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-start-date-input').fill(shiftDate(recurrenceTime.startDate, 1)),
    () => page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-end-date-input').fill(shiftDate(recurrenceTime.endDate, 1)),
    () => page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate),
  );
  const additionalDay = recurrenceTime.dayOfWeek === 'MON' ? 'TUE' : 'MON';
  await expectStaleUntilRestored(
    () => page.getByTestId(`recurrence-day-${additionalDay}`).check(),
    () => page.getByTestId(`recurrence-day-${additionalDay}`).uncheck(),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-start-time-input').selectOption(addMinutesToTime(recurrenceTime.startTime, 5)),
    () => page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-end-time-input').selectOption(addMinutesToTime(recurrenceTime.endTime, 5)),
    () => page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime),
  );
  await expectStaleUntilRestored(
    () => page.getByTestId('recurrence-conflict-policy-select').selectOption('SKIP_CONFLICTS'),
    () => page.getByTestId('recurrence-conflict-policy-select').selectOption('FAIL_ALL'),
  );

  let releaseRepeatedPreview!: () => void;
  let markRepeatedPreviewStarted!: () => void;
  const repeatedPreviewGate = new Promise<void>((resolve) => { releaseRepeatedPreview = resolve; });
  const repeatedPreviewStarted = new Promise<void>((resolve) => { markRepeatedPreviewStarted = resolve; });
  await page.route('**/api/admin/recurrences/preview', async (route) => {
    markRepeatedPreviewStarted();
    await repeatedPreviewGate;
    await route.continue();
  }, { times: 1 });

  const repeatedPreviewResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences/preview',
  );
  await page.getByTestId('recurrence-preview-button').click();
  await repeatedPreviewStarted;
  await expect(createButton).toBeDisabled();
  await expect(summary).toBeHidden();
  await expect(staleMessage).toBeHidden();
  releaseRepeatedPreview();
  expect((await repeatedPreviewResponse).ok()).toBe(true);
  await expect(createButton).toBeEnabled();
  await expect(summary).toBeVisible();

  await page.route('**/api/admin/recurrences/preview', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'testing-preview-failure' }),
    });
  }, { times: 1 });
  const failedPreviewResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences/preview',
  );
  await page.getByTestId('recurrence-preview-button').click();
  expect((await failedPreviewResponse).status()).toBe(503);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(createButton).toBeDisabled();
  await expect(summary).toBeHidden();
  await expect(staleMessage).toBeHidden();
});

test('a late preview response cannot validate changed recurrence conditions', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const firstRoom = await e2eData.createTestRoom('recurrence-late-preview-first');
  const secondRoom = await e2eData.createTestRoom('recurrence-late-preview-second');
  const recurrenceTime = nextWeekdayRecurrenceInputs({ daysAhead: 56, weeks: 1 });
  const purpose = e2eData.name('recurring-late-preview');
  let releasePreview!: () => void;
  let markPreviewStarted!: () => void;
  const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
  const previewStarted = new Promise<void>((resolve) => { markPreviewStarted = resolve; });

  await page.route('**/api/admin/recurrences/preview', async (route) => {
    markPreviewStarted();
    await previewGate;
    await route.continue();
  }, { times: 1 });

  await page.goto('/admin/recurrences');
  await fillRecurrenceDraft(page, firstRoom.id, purpose, recurrenceTime);
  const firstResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences/preview',
  );
  await page.getByTestId('recurrence-preview-button').click();
  await previewStarted;
  await page.getByTestId('recurrence-room-select').selectOption(secondRoom.id);
  releasePreview();
  expect((await firstResponsePromise).ok()).toBe(true);

  await expect(page.getByTestId('recurrence-create-button')).toBeDisabled();
  await expect(page.getByTestId('recurrence-preview-summary')).toBeHidden();
  await expect(page.getByTestId('recurrence-preview-stale')).toBeVisible();

  await runRecurrencePreview(page);
  await expect(page.getByTestId('recurrence-preview-stale')).toBeHidden();
  await expect(page.getByTestId('recurrence-preview-summary')).toBeVisible();
  await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
});

test('a pending recurrence create keeps its payload snapshot and the next draft intact', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const firstRoom = await e2eData.createTestRoom('recurrence-create-snapshot-first');
  const secondRoom = await e2eData.createTestRoom('recurrence-create-snapshot-second');
  const tag = await e2eData.createTestTag('recurrence-create-snapshot', { color: '#245b47' });
  const firstTime = nextWeekdayRecurrenceInputs({ daysAhead: 63, weeks: 1 });
  const secondTime = nextWeekdayRecurrenceInputs({ daysAhead: 77, weeks: 1, startHour: 15, endHour: 16 });
  const firstPurpose = e2eData.name('recurring-snapshot-first');
  const submittedPurpose = `${firstPurpose}-submitted`;
  const secondPurpose = e2eData.name('recurring-snapshot-second');

  await page.goto('/admin/recurrences');
  await fillRecurrenceDraft(page, firstRoom.id, firstPurpose, firstTime);
  await runRecurrencePreview(page);

  await page.getByTestId('recurrence-applicant-name-input').fill('testing-snapshot-applicant');
  await page.getByTestId('recurrence-email-input').fill('testing-snapshot@example.test');
  await page.getByTestId('recurrence-phone-input').fill('010-5555-6666');
  await page.getByTestId('recurrence-purpose-input').fill(submittedPurpose);
  await page.getByTestId('recurrence-tag-select').selectOption(tag.id);
  await page.getByTestId('recurrence-show-applicant-name-input').check();
  await expect(page.getByTestId('recurrence-create-button')).toBeEnabled();
  await expect(page.getByTestId('recurrence-preview-stale')).toBeHidden();

  let releaseCreate!: () => void;
  let markCreateStarted!: () => void;
  let createRequestCount = 0;
  let submittedBody: Record<string, unknown> | undefined;
  const createGate = new Promise<void>((resolve) => { releaseCreate = resolve; });
  const createStarted = new Promise<void>((resolve) => { markCreateStarted = resolve; });
  await page.route('**/api/admin/recurrences', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/recurrences' && route.request().method() === 'POST') {
      createRequestCount += 1;
      submittedBody = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
      markCreateStarted();
      await createGate;
    }
    await route.continue();
  });

  const createResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences'
      && response.request().method() === 'POST',
  );
  const createButton = page.getByTestId('recurrence-create-button');
  await createButton.click();
  await createStarted;
  await expect(createButton).toBeDisabled();
  await createButton.evaluate((button: HTMLButtonElement) => button.click());
  expect(createRequestCount).toBe(1);

  await page.getByTestId('recurrence-room-select').selectOption(secondRoom.id);
  await page.getByTestId('recurrence-applicant-name-input').fill('testing-next-draft-applicant');
  await page.getByTestId('recurrence-email-input').fill('testing-next-draft@example.test');
  await page.getByTestId('recurrence-phone-input').fill('010-7777-8888');
  await page.getByTestId('recurrence-purpose-input').fill(secondPurpose);
  await page.getByTestId('recurrence-start-date-input').fill(secondTime.startDate);
  await page.getByTestId('recurrence-end-date-input').fill(secondTime.endDate);
  await page.getByTestId('recurrence-start-time-input').selectOption(secondTime.startTime);
  await page.getByTestId('recurrence-end-time-input').selectOption(secondTime.endTime);
  await page.getByTestId('recurrence-tag-select').selectOption('');
  await page.getByTestId('recurrence-show-applicant-name-input').uncheck();
  if (secondTime.dayOfWeek !== firstTime.dayOfWeek) {
    await page.getByTestId(`recurrence-day-${firstTime.dayOfWeek}`).uncheck();
    await page.getByTestId(`recurrence-day-${secondTime.dayOfWeek}`).check();
  }

  await runRecurrencePreview(page);
  await expect(page.getByTestId('recurrence-preview-summary')).toBeVisible();
  await expect(page.getByTestId('recurrence-preview-stale')).toBeHidden();
  await expect(createButton).toBeDisabled();

  releaseCreate();
  const createResponse = await createResponsePromise;
  const createBody = await createResponse.text();
  expect(createResponse.ok(), createBody).toBe(true);
  const created = JSON.parse(createBody) as {
    recurrenceId: string;
    createdCount: number;
    skippedCount: number;
    failedCount: number;
  };
  e2eData.registerRecurrence(created.recurrenceId);

  expect(createRequestCount).toBe(1);
  expect(submittedBody).toMatchObject({
    roomId: firstRoom.id,
    startDate: firstTime.startDate,
    endDate: firstTime.endDate,
    daysOfWeek: [firstTime.dayOfWeek],
    startTime: `${firstTime.startTime}:00`,
    endTime: `${firstTime.endTime}:00`,
    applicantName: 'testing-snapshot-applicant',
    applicantEmail: 'testing-snapshot@example.test',
    applicantPhone: '010-5555-6666',
    purpose: submittedPurpose,
    tagId: tag.id,
    showApplicantName: true,
  });

  await expect(page.getByTestId('recurrence-room-select')).toHaveValue(secondRoom.id);
  await expect(page.getByTestId('recurrence-purpose-input')).toHaveValue(secondPurpose);
  await expect(page.getByTestId('recurrence-start-date-input')).toHaveValue(secondTime.startDate);
  await expect(page.getByTestId('recurrence-end-date-input')).toHaveValue(secondTime.endDate);
  await expect(page.getByTestId('recurrence-preview-summary')).toBeVisible();
  await expect(createButton).toBeEnabled();
  await expect(page.locator('.success-box')).toHaveText(
    `‘${submittedPurpose}’ 등록 완료: 등록 ${created.createdCount}건, 건너뜀 ${created.skippedCount}건, 실패 ${created.failedCount}건`,
  );
});

function dayLabel(day: string) {
  const labels: Record<string, string> = {
    MON: '월',
    TUE: '화',
    WED: '수',
    THU: '목',
    FRI: '금',
    SAT: '토',
    SUN: '일',
  };
  return labels[day] || day;
}

function addMinutesToTime(value: string, minutesToAdd: number) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  const total = hour * 60 + minute + minutesToAdd;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fillRecurrenceDraft(
  page: Page,
  roomId: string,
  purpose: string,
  recurrenceTime: ReturnType<typeof nextWeekdayRecurrenceInputs>,
) {
  await page.getByTestId('recurrence-room-select').selectOption(roomId);
  await page.getByTestId('recurrence-applicant-name-input').fill('testing-recurrence-admin');
  await page.getByTestId('recurrence-purpose-input').fill(purpose);
  await page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate);
  await page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate);
  await page.getByTestId('recurrence-start-time-input').selectOption(recurrenceTime.startTime);
  await page.getByTestId('recurrence-end-time-input').selectOption(recurrenceTime.endTime);
  await page.getByTestId(`recurrence-day-${recurrenceTime.dayOfWeek}`).check();
  await page.getByTestId('recurrence-conflict-policy-select').selectOption('FAIL_ALL');
}

async function runRecurrencePreview(page: Page) {
  const responsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/admin/recurrences/preview'
      && response.request().method() === 'POST',
  );
  await page.getByTestId('recurrence-preview-button').click();
  const response = await responsePromise;
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  return JSON.parse(body) as Record<string, unknown>;
}
