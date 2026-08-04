import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  getSettingsByApi,
  loginByApi,
  nextWeekdayReservationLocalInputs,
  updateSettingsByApi,
} from './helpers';

interface VisibilityToggleOptions {
  checkboxTestId: string;
  previousInputTestId: string;
  nextInputTestId: string;
}

async function expectMobileVisibilityToggle(
  page: Page,
  options: VisibilityToggleOptions,
) {
  const checkbox = page.getByTestId(options.checkboxTestId);
  const label = checkbox.locator('xpath=ancestor::label[1]');
  const labelText = label.getByText('신청자 이름 보이기', { exact: true });
  const previousInput = page.getByTestId(options.previousInputTestId);
  const nextInput = page.getByTestId(options.nextInputTestId);

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(label).toBeVisible();

    const [labelBox, checkboxBox, previousBox, nextBox] = await Promise.all([
      label.boundingBox(),
      checkbox.boundingBox(),
      previousInput.boundingBox(),
      nextInput.boundingBox(),
    ]);
    if (!labelBox || !checkboxBox || !previousBox || !nextBox) {
      throw new Error(`Could not measure ${options.checkboxTestId} at ${width}px`);
    }

    expect(labelBox.height, `${options.checkboxTestId} label height at ${width}px`).toBeGreaterThanOrEqual(44);
    expect(checkboxBox.width, `${options.checkboxTestId} width at ${width}px`).toBeGreaterThanOrEqual(18);
    expect(checkboxBox.width, `${options.checkboxTestId} width at ${width}px`).toBeLessThanOrEqual(20);
    expect(checkboxBox.height, `${options.checkboxTestId} height at ${width}px`).toBeGreaterThanOrEqual(18);
    expect(checkboxBox.height, `${options.checkboxTestId} height at ${width}px`).toBeLessThanOrEqual(20);
    expect(
      Math.abs((labelBox.y + labelBox.height / 2) - (checkboxBox.y + checkboxBox.height / 2)),
      `${options.checkboxTestId} vertical alignment at ${width}px`,
    ).toBeLessThanOrEqual(1);
    expect(previousBox.y + previousBox.height).toBeLessThanOrEqual(labelBox.y + 1);
    expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(nextBox.y + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const wasChecked = await checkbox.isChecked();
    await labelText.click();
    await expect(checkbox).toBeChecked({ checked: !wasChecked });
    await labelText.click();
    await expect(checkbox).toBeChecked({ checked: wasChecked });
  }
}

async function expectSingleLineTimelineLabel(page: Page, row: Locator) {
  const label = row.locator('dt');
  await expect(label).toHaveText('신청자 이름 보이기');
  const metrics = await label.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
      whiteSpace: style.whiteSpace,
    };
  });
  expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight + 1);
  expect(metrics.whiteSpace).toBe('nowrap');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectSlotFocusContract(
  page: Page,
  slot: Locator,
  panelTestId: string,
  closeTestId: string,
) {
  await expect(slot).toBeVisible();
  await slot.scrollIntoViewIfNeeded();
  const scrollRegion = slot.locator('xpath=ancestor::*[contains(@class,"timetable-scroll")][1]');
  const before = await scrollRegion.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
    windowX: window.scrollX,
    windowY: window.scrollY,
  }));

  await slot.click();
  await expect(page.getByTestId(panelTestId)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(panelTestId)).toBeHidden();
  await expect(slot).toBeFocused();

  const focusStyle = await slot.evaluate((element) => {
    const style = getComputedStyle(element);
    const markerStyle = getComputedStyle(element, '::before');
    return {
      backgroundColor: markerStyle.backgroundColor,
      boxShadow: markerStyle.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(focusStyle.boxShadow).toBe('none');
  expect(focusStyle.outlineStyle).toBe('solid');
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(await scrollRegion.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
    windowX: window.scrollX,
    windowY: window.scrollY,
  }))).toEqual(before);

  await page.keyboard.press('Tab');
  await expect(slot).not.toBeFocused();

  await slot.click();
  await expect(page.getByTestId(panelTestId)).toBeVisible();
  await page.getByTestId(closeTestId).click();
  await expect(page.getByTestId(panelTestId)).toBeHidden();
  await expect(slot).toBeFocused();
}

test('timetable slot focus remains distinct after public and admin panels close', async ({
  page,
  request,
  e2eData,
}) => {
  const originalSettings = await getSettingsByApi(request);
  await updateSettingsByApi(request, {
    ...originalSettings,
    reservationEnabled: true,
    reservationDisabledMessage: originalSettings.reservationDisabledMessage || 'Reservation is currently disabled.',
  });
  await loginByApi(request);
  const room = await e2eData.createTestRoom('slot-focus');
  const reservationDate = nextWeekdayReservationLocalInputs({ daysAhead: 42 }).date;
  const weekStart = mondayOf(reservationDate);
  const escapedRoomName = room.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const slotName = new RegExp(`^${escapedRoomName} .* 예약 신청$`);

  try {
    const cases = [
      {
        url: `/timetable?view=date&date=${reservationDate}`,
        panelTestId: 'public-quick-request-panel',
        closeTestId: 'public-quick-request-close',
      },
      {
        url: `/timetable?view=room&roomViewRoomId=${room.id}&weekStart=${weekStart}`,
        panelTestId: 'public-quick-request-panel',
        closeTestId: 'public-quick-request-close',
      },
      {
        url: `/admin/timetable?view=date&date=${reservationDate}&roomId=${room.id}`,
        panelTestId: 'timetable-quick-add-panel',
        closeTestId: 'timetable-quick-add-close',
      },
      {
        url: `/admin/timetable?view=room&roomViewRoomId=${room.id}&weekStart=${weekStart}`,
        panelTestId: 'timetable-quick-add-panel',
        closeTestId: 'timetable-quick-add-close',
      },
    ];

    for (const testCase of cases) {
      await page.goto(testCase.url);
      const slot = page.getByRole('button', { name: slotName }).first();
      await expectSlotFocusContract(page, slot, testCase.panelTestId, testCase.closeTestId);
    }
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});

test('reservation edit toggle has a contained mobile touch target', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('mobile-edit-toggle');
  const reservation = await e2eData.createTestReservation(room.id, 'mobile-edit-toggle');

  await page.goto(`/admin/reservations/${reservation.id}/edit`);
  await expectMobileVisibilityToggle(page, {
    checkboxTestId: 'reservation-show-applicant-name-input',
    previousInputTestId: 'reservation-applicant-name-input',
    nextInputTestId: 'reservation-email-input',
  });
});

test('reservation audit labels stay on one line without mobile overflow', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('mobile-audit-label');
  const reservation = await e2eData.createTestReservation(room.id, 'mobile-audit-label');

  await page.goto(`/admin/reservations/${reservation.id}/edit`);
  await page.getByText('신청자 이름 보이기', { exact: true }).click();
  const updateResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/admin/reservations/${reservation.id}`)
      && response.request().method() === 'PUT',
  );
  await page.getByTestId('reservation-save-button').click();
  await updateResponse;

  const row = page.locator('.timeline-diff-row').filter({ hasText: '신청자 이름 보이기' });
  await expect(row).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expectSingleLineTimelineLabel(page, row);
  }
});

test('quick reservation toggle has a contained mobile touch target', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('mobile-quick-toggle');
  const reservationDate = nextWeekdayReservationLocalInputs({ daysAhead: 35 }).date;

  await page.goto(`/admin/timetable?view=date&date=${reservationDate}&roomId=${room.id}`);
  await page.getByRole('button', { name: `${room.name} 09:00-09:30 예약 신청` }).click();
  await expectMobileVisibilityToggle(page, {
    checkboxTestId: 'quick-add-show-applicant-name-input',
    previousInputTestId: 'quick-add-applicant-name-input',
    nextInputTestId: 'quick-add-email-input',
  });
});

test('recurrence toggle has a contained mobile touch target', async ({ page, request }) => {
  await loginByApi(request);
  await page.goto('/admin/recurrences');
  await expectMobileVisibilityToggle(page, {
    checkboxTestId: 'recurrence-show-applicant-name-input',
    previousInputTestId: 'recurrence-applicant-name-input',
    nextInputTestId: 'recurrence-email-input',
  });
});

function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
