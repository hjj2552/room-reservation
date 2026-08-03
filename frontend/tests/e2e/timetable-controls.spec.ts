import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loginByApi } from './helpers';

interface ControlGeometry {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

async function geometry(locator: Locator): Promise<ControlGeometry> {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
    };
  });
}

function expectWithinOnePixel(values: number[], description: string) {
  expect.soft(
    Math.max(...values) - Math.min(...values),
    `${description}: ${values.join(', ')}`,
  ).toBeLessThanOrEqual(1);
}

function expectAligned(controls: ControlGeometry[], description: string) {
  expectWithinOnePixel(controls.map((control) => control.top), `${description} top`);
  expectWithinOnePixel(controls.map((control) => control.bottom), `${description} bottom`);
}

function expectContained(
  controls: ControlGeometry[],
  container: ControlGeometry,
  description: string,
) {
  for (const control of controls) {
    expect.soft(control.left, `${description} left`).toBeGreaterThanOrEqual(container.left - 1);
    expect.soft(control.right, `${description} right`).toBeLessThanOrEqual(container.right + 1);
  }
}

function expectStacked(controls: ControlGeometry[], description: string) {
  for (let index = 1; index < controls.length; index += 1) {
    expect.soft(controls[index].top, `${description} order`).toBeGreaterThan(controls[index - 1].top);
  }
}

function expectMobileNavigationTargets(buttons: ControlGeometry[]) {
  for (const button of buttons) {
    expect.soft(button.width, 'mobile week navigation target width').toBeGreaterThanOrEqual(40);
    expect.soft(button.height, 'mobile week navigation target height').toBeGreaterThanOrEqual(40);
  }
}

async function expectMobileDateControl(locator: Locator) {
  const metric = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      height: box.height,
      appearance: style.appearance,
      lineHeight: style.lineHeight,
    };
  });
  expect(metric).toEqual({
    height: 40,
    appearance: 'none',
    lineHeight: '38px',
  });
}

async function expectNoDocumentOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('public and admin timetable controls share desktop geometry', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('timetable-control-geometry');
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/timetable?view=date');
  await page.evaluate(() => document.fonts.ready);
  const publicDate = await geometry(page.getByTestId('public-timetable-date-input'));

  await page.getByTestId('public-timetable-view-room').click();
  const publicRoom = await geometry(page.getByTestId('public-timetable-room-select'));
  const publicWeek = await geometry(page.getByTestId('public-timetable-week-input'));
  const publicPrevious = await geometry(page.getByRole('button', { name: '이전 주' }));
  const publicNext = await geometry(page.getByRole('button', { name: '다음 주' }));
  await page.getByTestId('public-timetable-room-select').selectOption(room.id);
  expectAligned([publicRoom, publicPrevious, publicWeek, publicNext], 'public room view controls');

  await page.goto('/admin/timetable?view=date');
  const adminDateRoom = await geometry(page.getByTestId('timetable-date-room-select'));
  const adminDate = await geometry(page.getByTestId('timetable-date-input'));
  expectAligned([adminDateRoom, adminDate], 'admin date view controls');

  await page.getByTestId('timetable-view-room').click();
  const adminRoom = await geometry(page.getByTestId('timetable-room-select'));
  const adminWeek = await geometry(page.getByTestId('timetable-week-input'));
  const adminPrevious = await geometry(page.getByTestId('timetable-prev-week'));
  const adminNext = await geometry(page.getByTestId('timetable-next-week'));
  expectAligned([adminRoom, adminPrevious, adminWeek, adminNext], 'admin room view controls');

  const pickers = [publicDate, publicRoom, publicWeek, adminDateRoom, adminDate, adminRoom, adminWeek];
  const allControls = [...pickers, publicPrevious, publicNext, adminPrevious, adminNext];
  expectWithinOnePixel(pickers.map((control) => control.width), 'timetable picker widths');
  expectWithinOnePixel(allControls.map((control) => control.height), 'timetable control heights');
  expect(pickers.map((control) => control.width)).toEqual(pickers.map(() => 196));
  expect(allControls.map((control) => control.height)).toEqual(allControls.map(() => 40));
  for (const [label, button] of [
    ['public previous', publicPrevious],
    ['public next', publicNext],
    ['admin previous', adminPrevious],
    ['admin next', adminNext],
  ] as const) {
    expect.soft(Math.abs(button.width - button.height), `${label} button should be square`).toBeLessThanOrEqual(1);
  }
});

test('public and admin timetable controls remain contained and functional on mobile', async ({
  page,
  request,
  e2eData,
}) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('timetable-control-mobile');
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/timetable?view=date');
  const publicDateInput = page.getByTestId('public-timetable-date-input');
  await expectMobileDateControl(publicDateInput);
  expectContained(
    [await geometry(publicDateInput)],
    await geometry(page.locator('.timetable-panel')),
    'public date view',
  );
  await expectNoDocumentOverflow(page);

  await page.getByTestId('public-timetable-view-room').click();
  const publicRoomSelect = page.getByTestId('public-timetable-room-select');
  const publicWeekInput = page.getByTestId('public-timetable-week-input');
  const publicPreviousButton = page.getByRole('button', { name: '이전 주' });
  const publicNextButton = page.getByRole('button', { name: '다음 주' });
  await publicRoomSelect.selectOption(room.id);
  await expectMobileDateControl(publicWeekInput);
  const publicRoomControls = await Promise.all([
    geometry(publicRoomSelect),
    geometry(publicPreviousButton),
    geometry(publicWeekInput),
    geometry(publicNextButton),
  ]);
  expectContained(publicRoomControls, await geometry(page.locator('.timetable-panel')), 'public room view');
  expectStacked(publicRoomControls, 'public room view');
  expectMobileNavigationTargets([publicRoomControls[1], publicRoomControls[3]]);
  const initialPublicWeek = await publicWeekInput.inputValue();
  await publicNextButton.click();
  await expect(publicWeekInput).not.toHaveValue(initialPublicWeek);
  await publicPreviousButton.click();
  await expect(publicWeekInput).toHaveValue(initialPublicWeek);
  await expectNoDocumentOverflow(page);

  await page.goto('/admin/timetable?view=date');
  const adminDateRoomSelect = page.getByTestId('timetable-date-room-select');
  const adminDateInput = page.getByTestId('timetable-date-input');
  await expectMobileDateControl(adminDateInput);
  const adminDateControls = await Promise.all([
    geometry(adminDateRoomSelect),
    geometry(adminDateInput),
  ]);
  expectContained(adminDateControls, await geometry(page.locator('.timetable-panel')), 'admin date view');
  expectStacked(adminDateControls, 'admin date view');
  await expectNoDocumentOverflow(page);

  await page.getByTestId('timetable-view-room').click();
  const adminRoomSelect = page.getByTestId('timetable-room-select');
  const adminWeekInput = page.getByTestId('timetable-week-input');
  const adminPreviousButton = page.getByTestId('timetable-prev-week');
  const adminNextButton = page.getByTestId('timetable-next-week');
  await adminRoomSelect.selectOption(room.id);
  await expectMobileDateControl(adminWeekInput);
  const adminRoomControls = await Promise.all([
    geometry(adminRoomSelect),
    geometry(adminPreviousButton),
    geometry(adminWeekInput),
    geometry(adminNextButton),
  ]);
  expectContained(adminRoomControls, await geometry(page.locator('.timetable-panel')), 'admin room view');
  expectStacked(adminRoomControls, 'admin room view');
  expectMobileNavigationTargets([adminRoomControls[1], adminRoomControls[3]]);
  const initialAdminWeek = await adminWeekInput.inputValue();
  await adminNextButton.click();
  await expect(adminWeekInput).not.toHaveValue(initialAdminWeek);
  await adminPreviousButton.click();
  await expect(adminWeekInput).toHaveValue(initialAdminWeek);
  await expectNoDocumentOverflow(page);
});
