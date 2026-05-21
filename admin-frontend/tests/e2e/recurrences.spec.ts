import { expect, test } from '@playwright/test';
import {
  cancelRecurrenceByApi,
  createRoomByApi,
  deleteRoomByApi,
  loginByApi,
  nextWeekdayRecurrenceInputs,
  uniqueE2eName,
} from './helpers';

test('recurrence smoke: list, preview, create, detail, and cancel', async ({ page, request }) => {
  await loginByApi(request);
  const room = await createRoomByApi(request, uniqueE2eName('Recurrence Room'));
  const purpose = uniqueE2eName('recurrence smoke');
  const recurrenceTime = nextWeekdayRecurrenceInputs();
  let recurrenceId: string | undefined;
  let cancelled = false;

  try {
    await page.goto('/recurrences');
    await expect(page.getByTestId('recurrence-form')).toBeVisible();
    await expect(page.getByTestId('recurrences-table').or(page.getByText('등록된 반복 예약이 없습니다.'))).toBeVisible();

    await page.getByTestId('recurrence-room-select').selectOption(room.id);
    await page.getByTestId('recurrence-applicant-name-input').fill('E2E Recurrence Admin');
    await page.getByTestId('recurrence-email-input').fill(`recurrence-${Date.now()}@example.com`);
    await page.getByTestId('recurrence-phone-input').fill('010-2222-3333');
    await page.getByTestId('recurrence-purpose-input').fill(purpose);
    await page.getByTestId('recurrence-start-date-input').fill(recurrenceTime.startDate);
    await page.getByTestId('recurrence-end-date-input').fill(recurrenceTime.endDate);
    await page.getByTestId('recurrence-start-time-input').fill(recurrenceTime.startTime);
    await page.getByTestId('recurrence-end-time-input').fill(recurrenceTime.endTime);
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
    expect(createResponse.ok(), createBody).toBeTruthy();
    const created = JSON.parse(createBody) as { recurrenceId: string; createdCount: number };
    recurrenceId = created.recurrenceId;
    expect(created.createdCount, createBody).toBeGreaterThan(0);

    await page.goto(`/recurrences/${recurrenceId}`);
    await expect(page.getByRole('heading', { name: room.name })).toBeVisible();
    await expect(page.getByText(purpose)).toBeVisible();
    await expect(page.getByTestId('recurrence-detail-room')).toContainText(room.name);
    await expect(page.getByTestId('recurrence-detail-schedule')).toContainText(recurrenceTime.dayOfWeek);

    await page.getByTestId('recurrence-detail-cancel-memo-input').fill('E2E recurrence cancel');
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

    await page.goto('/recurrences');
    const row = page.getByRole('row').filter({ hasText: purpose });
    await expect(row).toBeVisible();
    await expect(row).toContainText('취소');
  } finally {
    if (recurrenceId && !cancelled) {
      await cancelRecurrenceByApi(request, recurrenceId, 'E2E cleanup');
    }
    await deleteRoomByApi(request, room.id);
  }
});
