import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  getSettingsByApi,
  loginByApi,
  nextWeekdayReservationLocalInputs,
  updateSettingsByApi,
} from './helpers';

interface TimetableCase {
  label: string;
  url: string;
  blockTestId: 'reservation-timetable-block' | 'reservation-room-timetable-block';
  detailUrl: RegExp;
  panelTestId: 'public-quick-request-panel' | 'timetable-quick-add-panel';
  closeTestId: 'public-quick-request-close' | 'timetable-quick-add-close';
}

const viewports = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
] as const;

test('reservation hit areas cover horizontal card gaps without covering later time slots', async ({
  page,
  request,
  e2eData,
}) => {
  test.setTimeout(process.env.E2E_REMOTE === 'true' ? 240_000 : 120_000);
  const originalSettings = await getSettingsByApi(request);
  await updateSettingsByApi(request, {
    ...originalSettings,
    reservationEnabled: true,
    reservationDisabledMessage: originalSettings.reservationDisabledMessage || 'Reservation is currently disabled.',
  });
  await loginByApi(request);

  const room = await e2eData.createTestRoom('reservation-hit-area');
  const reservationTime = nextWeekdayReservationLocalInputs({ daysAhead: 42, startHour: 10, endHour: 11 });
  const reservation = await e2eData.createTestReservation(room.id, 'reservation-hit-area', {
    startAt: `${reservationTime.startAt}:00+09:00`,
    endAt: `${reservationTime.endAt}:00+09:00`,
  });
  const weekStart = mondayOf(reservationTime.date);
  const cases: TimetableCase[] = [
    {
      label: 'public date timetable',
      url: `/timetable?view=date&date=${reservationTime.date}`,
      blockTestId: 'reservation-timetable-block',
      detailUrl: new RegExp(`/reservations/${reservation.id}$`),
      panelTestId: 'public-quick-request-panel',
      closeTestId: 'public-quick-request-close',
    },
    {
      label: 'public room timetable',
      url: `/timetable?view=room&roomViewRoomId=${room.id}&weekStart=${weekStart}`,
      blockTestId: 'reservation-room-timetable-block',
      detailUrl: new RegExp(`/reservations/${reservation.id}$`),
      panelTestId: 'public-quick-request-panel',
      closeTestId: 'public-quick-request-close',
    },
    {
      label: 'admin date timetable',
      url: `/admin/timetable?view=date&date=${reservationTime.date}&roomId=${room.id}`,
      blockTestId: 'reservation-timetable-block',
      detailUrl: new RegExp(`/admin/reservations/${reservation.id}$`),
      panelTestId: 'timetable-quick-add-panel',
      closeTestId: 'timetable-quick-add-close',
    },
    {
      label: 'admin room timetable',
      url: `/admin/timetable?view=room&roomViewRoomId=${room.id}&weekStart=${weekStart}`,
      blockTestId: 'reservation-room-timetable-block',
      detailUrl: new RegExp(`/admin/reservations/${reservation.id}$`),
      panelTestId: 'timetable-quick-add-panel',
      closeTestId: 'timetable-quick-add-close',
    },
  ];

  try {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const timetableCase of cases) {
        await expectReservationHitArea(page, timetableCase, reservation.purpose, viewport.label);
      }
    }
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, { ...originalSettings, version: latestSettings.version });
  }
});

async function expectReservationHitArea(
  page: Page,
  timetableCase: TimetableCase,
  purpose: string,
  viewportLabel: string,
) {
  const loadBlock = async () => {
    await page.goto(timetableCase.url);
    const block = page.getByTestId(timetableCase.blockTestId).filter({ hasText: purpose });
    await expect(block, `${timetableCase.label} ${viewportLabel} reservation`).toBeVisible();
    await block.scrollIntoViewIfNeeded();
    return block;
  };

  let block = await loadBlock();
  await expectHitAreaGeometry(block, timetableCase.label, viewportLabel);

  await block.click();
  await expect(page).toHaveURL(timetableCase.detailUrl);

  block = await loadBlock();
  await clickHorizontalEdge(page, block, 'left');
  await expect(page).toHaveURL(timetableCase.detailUrl);

  block = await loadBlock();
  await clickHorizontalEdge(page, block, 'right');
  await expect(page).toHaveURL(timetableCase.detailUrl);

  block = await loadBlock();
  const box = await requiredBox(block, `${timetableCase.label} ${viewportLabel} reservation`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height + 8);
  await expect(page.getByTestId(timetableCase.panelTestId)).toBeVisible();
  await page.getByTestId(timetableCase.closeTestId).click();
  await expect(page.getByTestId(timetableCase.panelTestId)).toBeHidden();
}

async function expectHitAreaGeometry(block: Locator, caseLabel: string, viewportLabel: string) {
  const card = block.locator('.reservation-block-card');
  const column = block.locator('xpath=ancestor::*[contains(@class,"timetable-room-column")][1]');
  const [blockBox, cardBox, columnBox] = await Promise.all([
    requiredBox(block, `${caseLabel} ${viewportLabel} hit area`),
    requiredBox(card, `${caseLabel} ${viewportLabel} visual card`),
    requiredBox(column, `${caseLabel} ${viewportLabel} column`),
  ]);

  expect(Math.abs(blockBox.x - columnBox.x), `${caseLabel} ${viewportLabel} left edge`).toBeLessThanOrEqual(1);
  expect(
    Math.abs((blockBox.x + blockBox.width) - (columnBox.x + columnBox.width)),
    `${caseLabel} ${viewportLabel} right edge`,
  ).toBeLessThanOrEqual(1);
  expect(cardBox.x - blockBox.x, `${caseLabel} ${viewportLabel} left visual gap`).toBeGreaterThanOrEqual(4);
  expect(cardBox.x - blockBox.x, `${caseLabel} ${viewportLabel} left visual gap`).toBeLessThanOrEqual(6);
  expect(
    (blockBox.x + blockBox.width) - (cardBox.x + cardBox.width),
    `${caseLabel} ${viewportLabel} right visual gap`,
  ).toBeGreaterThanOrEqual(4);
  expect(
    (blockBox.x + blockBox.width) - (cardBox.x + cardBox.width),
    `${caseLabel} ${viewportLabel} right visual gap`,
  ).toBeLessThanOrEqual(6);
  expect(Math.abs(cardBox.y - blockBox.y), `${caseLabel} ${viewportLabel} card top`).toBeLessThanOrEqual(1);
  expect(Math.abs(cardBox.height - blockBox.height), `${caseLabel} ${viewportLabel} card height`).toBeLessThanOrEqual(1);
  expect(blockBox.height, `${caseLabel} ${viewportLabel} one-hour height`).toBeCloseTo(96, 0);
  await expect(block).toHaveJSProperty('tagName', 'BUTTON');
  await expect(card).toHaveCSS('pointer-events', 'none');
  await expect(block.locator('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).toHaveCount(0);
}

async function clickHorizontalEdge(page: Page, block: Locator, edge: 'left' | 'right') {
  const box = await requiredBox(block, `${edge} reservation edge`);
  const x = edge === 'left' ? box.x + 2 : box.x + box.width - 2;
  await page.mouse.click(x, box.y + box.height / 2);
}

async function requiredBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`Could not measure ${label}`);
  }
  return box;
}

function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}
