import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  getRoomOrderByApi,
  loginByApi,
  saveRoomOrderByApi,
  type E2eRoom,
} from './helpers';

async function displayedOrderIds(page: Page) {
  const items = page.getByTestId('room-order-item');
  await expect.poll(() => items.count()).toBeGreaterThan(0);
  return items.evaluateAll((elements) =>
    elements.map((item) => item.getAttribute('data-room-id') || ''),
  );
}

async function moveWithKeyboard(page: Page, roomName: string, direction: 'ArrowUp' | 'ArrowDown') {
  const item = page.getByTestId('room-order-item').filter({ hasText: roomName });
  const handle = item.getByTestId('room-order-handle');
  const before = await displayedOrderIds(page);
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(item).toHaveClass(/is-dragging/);
  await page.keyboard.press(direction);
  await page.keyboard.press('Space');
  await expect(item).not.toHaveClass(/is-dragging/);
  await expect.poll(() => displayedOrderIds(page)).not.toEqual(before);
}

async function nonEmptyOptionValues(page: Page, testId: string, minimum = 1) {
  const select = page.getByTestId(testId);
  await expect(select).toBeVisible();
  await expect.poll(async () => select.locator('option').evaluateAll((options) =>
    options.filter((option) => Boolean((option as HTMLOptionElement).value)).length,
  )).toBeGreaterThanOrEqual(minimum);
  return select.locator('option').evaluateAll((options) =>
    options
      .map((option) => (option as HTMLOptionElement).value)
      .filter(Boolean),
  );
}

test('room management paginates 20 at a time, resets search, and corrects an invalid last page', async ({
  page,
  request,
  e2eData,
}) => {
  test.setTimeout(120_000);
  await loginByApi(request);
  const batch = `batch${Date.now().toString().slice(-6)}`;
  const rooms: E2eRoom[] = [];
  for (let index = 0; index < 21; index += 1) {
    rooms.push(await e2eData.createTestRoom(`${batch}-${String(index).padStart(2, '0')}`));
  }

  await page.goto(`/admin/rooms?keyword=${batch}&page=0`);
  await expect(page.getByTestId('rooms-table').locator('tbody tr')).toHaveCount(20);
  await expect(page.getByText(/페이지당 20건/)).toBeVisible();

  await page.getByRole('button', { name: '다음' }).click();
  await expect(page).toHaveURL(new RegExp(`keyword=${batch}.*page=1|page=1.*keyword=${batch}`));
  const lastPageRows = page.getByTestId('rooms-table').locator('tbody tr');
  await expect(lastPageRows).toHaveCount(1);

  await page.getByTestId('room-keyword-input').fill(rooms[0].name);
  await page.getByTestId('room-search-button').click();
  await expect(page).toHaveURL(/page=0/);
  await expect(page.getByTestId('rooms-table').locator('tbody tr')).toHaveCount(1);
  await page.getByTestId('room-search-reset').click();
  await expect(page).toHaveURL(/page=0/);
  expect(new URL(page.url()).searchParams.has('keyword')).toBe(false);

  await page.getByTestId('room-keyword-input').fill(batch);
  await page.getByTestId('room-search-button').click();
  await page.getByRole('button', { name: '다음' }).click();
  await expect(lastPageRows).toHaveCount(1);
  const lastRoomName = (await lastPageRows.first().locator('strong').textContent()) || '';
  await lastPageRows.first().getByTestId('room-delete-button').click();
  await page.getByTestId('room-delete-confirm-input').fill(lastRoomName);
  await expect(page.getByTestId('room-delete-confirm-button')).toBeEnabled();
  await page.getByTestId('room-delete-confirm-button').click();
  await expect(page).toHaveURL(new RegExp(`keyword=${batch}.*page=0|page=0.*keyword=${batch}`));
  await expect(page.getByTestId('rooms-table').locator('tbody tr')).toHaveCount(20);
});

test('room order panel supports keyboard save, discard, conflict retention, and focus return', async ({
  page,
  request,
  e2eData,
}) => {
  await loginByApi(request);
  const first = await e2eData.createTestRoom('order-keyboard-a');
  const inactive = await e2eData.createTestRoom('order-keyboard-b', { enabled: false });
  const third = await e2eData.createTestRoom('order-keyboard-c');

  await page.goto('/admin/rooms');
  const orderButton = page.getByTestId('room-order-button');
  await orderButton.click();
  await expect(page.getByTestId('room-order-panel')).toBeVisible();

  const initial = await getRoomOrderByApi(request);
  await expect(page.getByTestId('room-order-item')).toHaveCount(initial.items.length);
  await expect(
    page.getByTestId('room-order-item').filter({ hasText: inactive.name }),
  ).toContainText('사용 안 함');
  await expect(page.getByTestId('room-order-panel')).not.toContainText('삭제된 공간');

  await moveWithKeyboard(page, third.name, 'ArrowUp');
  await page.getByTestId('room-order-save').click();
  await expect(page.getByTestId('room-order-panel')).toBeHidden();
  await expect(orderButton).toBeFocused();
  const saved = await getRoomOrderByApi(request);
  expect(saved.items.findIndex((room) => room.id === third.id)).toBeLessThan(
    saved.items.findIndex((room) => room.id === inactive.id),
  );

  await orderButton.click();
  const beforeCancel = await displayedOrderIds(page);
  await moveWithKeyboard(page, inactive.name, 'ArrowUp');
  expect(await displayedOrderIds(page)).not.toEqual(beforeCancel);
  await page.getByTestId('room-order-cancel').click();
  await expect(page.getByTestId('room-order-panel')).toBeHidden();

  await orderButton.click();
  expect(await displayedOrderIds(page)).toEqual(beforeCancel);
  await moveWithKeyboard(page, inactive.name, 'ArrowUp');
  await page.getByTestId('room-order-close').click();
  await expect(page.getByTestId('room-order-panel')).toBeHidden();

  await orderButton.click();
  expect(await displayedOrderIds(page)).toEqual(beforeCancel);
  const escapeItem = page.getByTestId('room-order-item').filter({ hasText: inactive.name });
  await escapeItem.getByTestId('room-order-handle').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('room-order-panel')).toBeVisible();
  expect(await displayedOrderIds(page)).toEqual(beforeCancel);

  await moveWithKeyboard(page, inactive.name, 'ArrowUp');
  const draft = await displayedOrderIds(page);
  await page.route('**/api/admin/rooms/order', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'ROOM_ORDER_CONFLICT',
        message: 'The room list changed.',
      }),
    });
  });
  await page.getByTestId('room-order-save').click();
  await expect(page.getByTestId('room-order-panel')).toBeVisible();
  await expect(page.getByTestId('room-order-error')).toContainText('다시 불러온 뒤');
  expect(await displayedOrderIds(page)).toEqual(draft);
  await page.unroute('**/api/admin/rooms/order');
  await page.getByTestId('room-order-close').click();

  expect(first.id).toBeTruthy();
});

test('room order panel saves a desktop handle drag', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const first = await e2eData.createTestRoom('order-mouse-a');
  const second = await e2eData.createTestRoom('order-mouse-b');
  await page.goto('/admin/rooms');
  await page.getByTestId('room-order-button').click();

  const source = page.getByTestId('room-order-item').filter({ hasText: second.name });
  const target = page.getByTestId('room-order-item').filter({ hasText: first.name });
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.getByTestId('room-order-handle').boundingBox();
  const targetBox = await target.getByTestId('room-order-handle').boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Could not measure room order drag handles.');

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2 - 6);
  const overlay = page.locator('.room-order-item-content.is-overlay');
  await expect(overlay).toBeVisible();
  const overlayName = overlay.locator('.room-order-name');
  await expect(overlayName).toHaveText(second.name);
  expect(await overlayName.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(200);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await expect.poll(() => displayedOrderIds(page)).toEqual(expect.arrayContaining([first.id, second.id]));
  const draft = await displayedOrderIds(page);
  expect(draft.indexOf(second.id)).toBeLessThan(draft.indexOf(first.id));
  await page.getByTestId('room-order-save').click();

  const saved = await getRoomOrderByApi(request);
  expect(saved.items.findIndex((room) => room.id === second.id)).toBeLessThan(
    saved.items.findIndex((room) => room.id === first.id),
  );
});

test.describe('mobile room order panel', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('uses a 250ms long press and keeps panel scrolling contained', async ({
    page,
    request,
    e2eData,
  }) => {
    await loginByApi(request);
    const first = await e2eData.createTestRoom('order-touch-a');
    const second = await e2eData.createTestRoom('order-touch-b');
    for (let index = 0; index < 10; index += 1) {
      await e2eData.createTestRoom(`order-touch-fill-${index}`);
    }

    await page.goto('/admin/rooms');
    await page.getByTestId('room-order-button').click();
    await expect(page.getByTestId('room-order-panel')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('position', 'fixed');
    await expect(page.locator('.room-order-panel .side-panel-body')).toHaveCSS('overflow-y', 'auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const source = page.getByTestId('room-order-item').filter({ hasText: second.name });
    const target = page.getByTestId('room-order-item').filter({ hasText: first.name });
    await source.scrollIntoViewIfNeeded();
    const sourceBox = await source.getByTestId('room-order-handle').boundingBox();
    const targetBox = await target.getByTestId('room-order-handle').boundingBox();
    if (!sourceBox || !targetBox) throw new Error('Could not measure mobile room order drag handles.');

    const session = await page.context().newCDPSession(page);
    const sourcePoint = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
    const targetPoint = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [sourcePoint],
    });
    await page.waitForTimeout(150);
    await expect(page.locator('.room-order-item-content.is-overlay')).toHaveCount(0);
    await page.waitForTimeout(130);
    await expect(page.locator('.room-order-item-content.is-overlay')).toBeVisible();
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [targetPoint],
    });
    await page.waitForTimeout(100);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });

    await page.getByTestId('room-order-save').click();
    const saved = await getRoomOrderByApi(request);
    expect(saved.items.findIndex((room) => room.id === second.id)).toBeLessThan(
      saved.items.findIndex((room) => room.id === first.id),
    );
  });
});

test('global room order reaches public and admin timetables, forms, and filters beyond 100 rooms', async ({
  page,
  request,
  e2eData,
}) => {
  test.setTimeout(240_000);
  await loginByApi(request);
  const rooms: E2eRoom[] = [];
  for (let index = 0; index < 101; index += 1) {
    rooms.push(await e2eData.createTestRoom(`over100-${String(index).padStart(3, '0')}`));
  }
  const promoted = rooms[100];
  const current = await getRoomOrderByApi(request);
  const reorderedIds = [
    promoted.id,
    ...current.items.filter((room) => room.id !== promoted.id).map((room) => room.id),
  ];
  await saveRoomOrderByApi(request, {
    orderVersion: current.orderVersion,
    roomIds: reorderedIds,
  });

  const selectors = [
    ['/admin/reservations', 'reservation-room-filter'],
    ['/admin/recurrences', 'recurrence-room-select'],
    ['/admin/recurrences', 'recurrence-list-room-filter'],
    ['/admin/audit', 'audit-room-select'],
    ['/admin/timetable?view=room', 'timetable-room-select'],
  ] as const;
  for (const [url, testId] of selectors) {
    await page.goto(url);
    const values = await nonEmptyOptionValues(page, testId, 101);
    expect(values[0], `${testId} should preserve global order`).toBe(promoted.id);
    expect(values, `${testId} should include the 101st created room`).toContain(rooms[100].id);
    expect(values.length, `${testId} should not stop at 100 rooms`).toBeGreaterThanOrEqual(101);
  }

  const reservation = await e2eData.createTestReservation(promoted.id, 'over100-edit');
  await page.goto(`/admin/reservations/${reservation.id}/edit`);
  const editRoomValues = await nonEmptyOptionValues(page, 'reservation-room-select', 101);
  expect(editRoomValues[0]).toBe(promoted.id);
  expect(editRoomValues).toContain(rooms[100].id);

  await page.goto('/admin/timetable?view=date');
  await expect(page.locator('.timetable-room-header strong').first()).toHaveText(promoted.name);
  await page.getByTestId('timetable-empty-slot').first().click();
  const adminQuickAddValues = await nonEmptyOptionValues(page, 'quick-add-room-select', 101);
  expect(adminQuickAddValues[0]).toBe(promoted.id);
  expect(adminQuickAddValues).toContain(rooms[100].id);
  await page.getByTestId('timetable-quick-add-close').click();

  await page.goto('/timetable?view=room');
  const publicRoomValues = await nonEmptyOptionValues(page, 'public-timetable-room-select', 101);
  expect(publicRoomValues[0]).toBe(promoted.id);
  expect(publicRoomValues).toContain(rooms[100].id);
  expect(publicRoomValues.length).toBeGreaterThanOrEqual(101);

  await page.getByTestId('public-timetable-view-date').click();
  await expect(page.locator('.timetable-room-header strong').first()).toHaveText(promoted.name);
  await page.getByTestId('timetable-empty-slot').first().click();
  const publicRequestValues = await nonEmptyOptionValues(page, 'public-request-room-select', 101);
  expect(publicRequestValues[0]).toBe(promoted.id);
  expect(publicRequestValues).toContain(rooms[100].id);
});
