import { expect, test } from './fixtures';
import {
  deleteRoomByApi,
  expectTextContentWithinCell,
  getSettingsByApi,
  loginByApi,
  moveFocusOutsidePanel,
  updateSettingsByApi,
} from './helpers';

test('rooms smoke: list renders and an existing room can be updated', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('rooms-smoke');

  try {
    await page.goto('/admin/rooms');
    const table = page.getByTestId('rooms-table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveText([
      '공간',
      '예약 대상',
      '정원',
      '수정일',
      '관리',
    ]);

    const row = page.getByRole('row').filter({ hasText: room.name });
    await expect(row).toBeVisible();
    const editButton = row.getByTestId('room-edit-button');
    await editButton.click();

    const updatedLocation = e2eData.name('updated-location');
    await expect(page.getByTestId('room-form-panel')).toBeVisible();
    await expect(page.getByRole('heading', { name: '공간 수정' })).toBeVisible();
    await expect(page.getByTestId('room-name-input')).toHaveValue(room.name);
    await expect(page.getByLabel('공간 이용 안내')).toBeVisible();
    await expect(page.getByRole('button', { name: '새 공간 입력' })).toHaveCount(0);
    await page.getByTestId('room-location-input').fill(updatedLocation);
    await page.getByTestId('room-save-button').click();

    await expect(page.getByTestId('room-form-panel')).toBeHidden();
    await expect(row).toContainText(updatedLocation);
    await expect(editButton).toBeFocused();
  } finally {
    await deleteRoomByApi(request, room.id);
  }
});

test('rooms layout uses the page width and registration panel closes on Escape outside focus', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const layoutRoom = await e2eData.createTestRoom(`rooms-drawer-${'x'.repeat(35)}`, {
    location: `testing-${'location'.repeat(15)}`,
  });
  const createdRoomName = e2eData.name('room-drawer-create');
  const createdLocation = e2eData.name('room-drawer-location');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/rooms');

  const listPanel = page.locator('.room-list-panel');
  const tableWrap = listPanel.locator('.table-wrap');
  const table = page.getByTestId('rooms-table');
  await expect(table).toBeVisible();
  const layoutMetrics = await listPanel.evaluate((element) => {
    const pageSection = element.closest('.rooms-page');
    const listBox = element.getBoundingClientRect();
    const pageBox = pageSection?.getBoundingClientRect();
    return {
      listWidth: listBox.width,
      pageWidth: pageBox?.width || 0,
    };
  });
  expect(Math.abs(layoutMetrics.pageWidth - layoutMetrics.listWidth)).toBeLessThanOrEqual(1);
  expect(await tableWrap.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const firstRowCells = table.locator('tbody tr').first().locator('td');
  const layoutRow = table.getByRole('row').filter({ hasText: layoutRoom.name });
  const layoutCells = layoutRow.locator('td');
  await expectTextContentWithinCell(layoutCells.nth(0).locator('strong'), layoutCells.nth(0), layoutCells.nth(1));
  await expectTextContentWithinCell(layoutCells.nth(0).locator('.muted'), layoutCells.nth(0), layoutCells.nth(1));
  const updatedAtCell = firstRowCells.nth(3);
  const manageCell = firstRowCells.nth(4);
  await expect(updatedAtCell).toContainText(/\([월화수목금토일]\)/);
  expect(await updatedAtCell.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const [updatedAtBox, manageBox] = await Promise.all([updatedAtCell.boundingBox(), manageCell.boundingBox()]);
  if (!updatedAtBox || !manageBox) throw new Error('Could not measure room updated-at and management cells.');
  expect(updatedAtBox.x + updatedAtBox.width).toBeLessThanOrEqual(manageBox.x + 1);

  const createButton = page.getByTestId('room-create-button');
  await createButton.click();
  await expect(page.getByTestId('room-form-panel')).toBeVisible();
  await expect(page.getByTestId('room-form-close')).toBeFocused();
  await page.getByTestId('room-form-close').click();
  await expect(page.getByTestId('room-form-panel')).toBeHidden();
  await expect(createButton).toBeFocused();

  await createButton.click();
  await moveFocusOutsidePanel(page, 'room-form-panel');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('room-form-panel')).toBeHidden();
  await expect(createButton).toBeFocused();

  await createButton.click();
  await page.getByTestId('room-name-input').focus();
  await expect(page.getByTestId('room-name-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('room-form-panel')).toBeHidden();
  await expect(createButton).toBeFocused();

  await createButton.click();
  await page.getByTestId('room-name-input').fill(createdRoomName);
  await page.getByTestId('room-form-backdrop').click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId('room-form-panel')).toBeVisible();
  await expect(page.getByTestId('room-name-input')).toHaveValue(createdRoomName);
  await page.getByTestId('room-form-close').click();
  await expect(page.getByTestId('room-form-panel')).toBeHidden();
  await expect(createButton).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await tableWrap.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await createButton.click();
  await expect(page.getByTestId('room-form-panel')).toBeVisible();
  await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');
  await expect(page.locator('.room-form-panel .side-panel-body')).toHaveCSS('overflow-y', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId('room-form-close').click();
  await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');

  await page.setViewportSize({ width: 1440, height: 900 });
  await createButton.click();
  await page.getByTestId('room-name-input').fill(createdRoomName);
  await page.getByTestId('room-location-input').fill(createdLocation);
  await page.getByTestId('room-capacity-input').fill('18');
  await page.getByTestId('room-description-input').fill('testing-created-from-room-drawer');
  const createResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/admin/rooms') && response.request().method() === 'POST',
  );
  await page.getByTestId('room-save-button').click();
  const createdRoom = await (await createResponsePromise).json() as { id: string };
  e2eData.registerRoom(createdRoom.id);

  await expect(page.getByTestId('room-form-panel')).toBeHidden();
  await expect(createButton).toBeFocused();
  const createdRow = page.getByRole('row').filter({ hasText: createdRoomName });
  await expect(createdRow).toContainText(createdLocation);
});

test('rooms smoke: deletion requires matching room name and server checks', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('rooms-delete');

  await page.goto('/admin/rooms');
  const row = page.getByRole('row').filter({ hasText: room.name });
  await expect(row).toBeVisible();

  await row.getByTestId('room-delete-button').click();
  const deleteModal = page.getByTestId('room-delete-modal');
  await expect(deleteModal).toBeVisible();
  await expect(page.getByRole('heading', { name: '공간 영구 삭제' })).toBeVisible();
  await expect(deleteModal.locator('.modal-close-button')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(deleteModal).toBeHidden();
  await expect(row.getByTestId('room-delete-button')).toBeFocused();

  await row.getByTestId('room-delete-button').click();
  await expect(deleteModal).toBeVisible();
  await expect(page.getByText('삭제 후 복구할 수 없습니다')).toBeVisible();
  await expect(page.getByTestId('room-delete-checks')).toHaveCount(0);

  const confirmButton = page.getByTestId('room-delete-confirm-button');
  await page.getByTestId('room-delete-confirm-input').fill(`${room.name} typo`);
  await expect(confirmButton).toBeDisabled();

  await page.getByTestId('room-delete-confirm-input').fill(room.name);
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  await expect(page.getByTestId('room-delete-modal')).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: room.name })).toHaveCount(0);
});

test('rooms smoke: deletion explains preserved reservation records', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('rooms-delete-blocked');
  await e2eData.createTestReservation(room.id, 'room-delete-blocker');

  try {
    await page.goto('/admin/rooms');
    const row = page.getByRole('row').filter({ hasText: room.name });
    await expect(row).toBeVisible();

    await row.getByTestId('room-delete-button').click();
    await expect(page.getByTestId('room-delete-modal')).toBeVisible();
    await expect(page.getByText('기존 예약 기록은 삭제된 공간으로 보존됩니다')).toBeVisible();
    await expect(page.getByTestId('room-delete-checks')).toContainText('연결된 예약 기록 1건');

    await page.getByTestId('room-delete-confirm-input').fill(room.name);
    await expect(page.getByTestId('room-delete-confirm-button')).toBeEnabled();
  } finally {
    await deleteRoomByApi(request, room.id);
  }
});

test('settings smoke: settings load and can be saved with feedback', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const originalSettings = await getSettingsByApi(request);
  const updatedOrganizationName = e2eData.name('settings-org');
  const contactEmail = 'testing-contact@example.test';
  const contactPhone = '02-1234-5678';

  try {
    await page.goto('/admin/settings');
    await expect(page.getByTestId('settings-form')).toBeVisible();
    await expect(page.locator('.page-header').getByRole('link', { name: '태그 설정' })).toHaveCount(0);
    await expect(page.getByLabel('관리자 이름')).toHaveCount(0);
    await expect(page.getByLabel('문의 이메일')).toBeVisible();
    await expect(page.getByLabel('문의 전화번호')).toBeVisible();
    await expect(page.getByTestId('settings-slot-minutes-select')).toHaveCount(0);
    await expect(page.getByTestId('settings-open-time-input').locator('option[value="00:30"]')).toHaveCount(1);
    await expect(page.getByTestId('settings-open-time-input').locator('option[value="00:05"]')).toHaveCount(0);

    await page.getByTestId('settings-organization-input').fill(updatedOrganizationName);
    await page.getByTestId('settings-public-notice-input').fill('testing-settings-smoke-notice');
    await page.getByLabel('문의 이메일').fill(contactEmail);
    await page.getByLabel('문의 전화번호').fill(contactPhone);
    await expect(page.getByTestId('settings-min-reservation-input')).toHaveAttribute('min', '30');
    await expect(page.getByTestId('settings-min-reservation-input')).toHaveAttribute('step', '5');
    await expect(page.getByTestId('settings-max-reservation-input')).toHaveAttribute('step', '5');
    await expect(page.getByTestId('settings-form')).toContainText(
      '최소·최대 예약 시간을 5(분)의 배수로 입력해 주세요. 최소 예약 시간은 30분 이상이어야 합니다.',
    );
    await page.getByTestId('settings-save-button').click();

    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByTestId('settings-organization-input')).toHaveValue(updatedOrganizationName);
    await expect(page.getByTestId('settings-slot-minutes-select')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('settings-slot-minutes-select')).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const footer = page.getByTestId('public-contact-footer');
    await expect(footer).toContainText(updatedOrganizationName);
    await expect(footer.getByRole('link', { name: /문의 이메일/ })).toHaveAttribute('href', `mailto:${contactEmail}`);
    await expect(footer.getByRole('link', { name: /문의 전화번호/ })).toHaveAttribute('href', 'tel:0212345678');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, {
      ...latestSettings,
      adminContactEmail: null,
      adminContactPhone: null,
    });
    await page.reload();
    await expect(footer).toContainText(updatedOrganizationName);
    await expect(footer.getByRole('link')).toHaveCount(0);
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, {
      ...originalSettings,
      version: latestSettings.version,
    });
  }
});

test('settings canonicalize weekday selection and mixed API order before saving', async ({ page, request }) => {
  await loginByApi(request);
  const originalSettings = await getSettingsByApi(request);
  let mixedResponseServed = false;

  await page.route('**/api/admin/settings', async (route) => {
    if (route.request().method() === 'GET' && !mixedResponseServed) {
      mixedResponseServed = true;
      await route.fulfill({
        json: {
          ...originalSettings,
          availableDaysOfWeek: ['THU', 'TUE', 'WED'],
          publicAvailableDaysOfWeek: ['THU', 'TUE', 'WED'],
        },
      });
      return;
    }
    await route.continue();
  });

  try {
    await page.goto('/admin/settings');
    await expect(page.getByTestId('settings-form')).toBeVisible();
    const fieldPairOrder = await Promise.all([
      page.getByTestId('settings-hours-pair'),
      page.getByTestId('settings-public-hours-pair'),
      page.getByTestId('settings-duration-pair'),
    ].map(async (locator) => (await locator.boundingBox())?.y || 0));
    expect(fieldPairOrder[0]).toBeLessThan(fieldPairOrder[1]);
    expect(fieldPairOrder[1]).toBeLessThan(fieldPairOrder[2]);
    await expect(page.getByRole('group', { name: '운영 요일' })).toBeVisible();
    await expect(page.getByRole('group', { name: '일반 예약 가능 요일' })).toBeVisible();

    await page.getByTestId('settings-day-THU').uncheck();
    await page.getByTestId('settings-save-button').click();
    await expect(page.getByRole('alert')).toContainText('일반 예약 가능 요일은 운영 요일에 포함되어야 합니다.');
    await page.getByTestId('settings-day-THU').check();

    for (const day of ['TUE', 'WED', 'THU']) {
      await expect(page.getByTestId(`settings-day-${day}`)).toBeChecked();
      await page.getByTestId(`settings-day-${day}`).uncheck();
      await expect(page.getByTestId(`settings-public-day-${day}`)).toBeChecked();
      await page.getByTestId(`settings-public-day-${day}`).uncheck();
    }

    await page.getByTestId('settings-day-THU').check();
    await page.getByTestId('settings-day-TUE').check();
    await page.getByTestId('settings-day-WED').check();
    await page.getByTestId('settings-public-day-THU').check();
    await page.getByTestId('settings-public-day-TUE').check();
    await page.getByTestId('settings-public-day-WED').check();
    const saveRequestPromise = page.waitForRequest((request) =>
      new URL(request.url()).pathname === '/api/admin/settings' && request.method() === 'PUT',
    );
    await page.getByTestId('settings-save-button').click();
    const saveRequest = await saveRequestPromise;
    const payload = JSON.parse(saveRequest.postData() || '{}') as {
      availableDaysOfWeek?: string[];
      publicAvailableDaysOfWeek?: string[];
    };
    expect(payload.availableDaysOfWeek).toEqual(['TUE', 'WED', 'THU']);
    expect(payload.publicAvailableDaysOfWeek).toEqual(['TUE', 'WED', 'THU']);
    await expect(page.getByRole('status')).toBeVisible();

    const savedSettings = await getSettingsByApi(request);
    expect(savedSettings.availableDaysOfWeek).toEqual(['TUE', 'WED', 'THU']);
    expect(savedSettings.publicAvailableDaysOfWeek).toEqual(['TUE', 'WED', 'THU']);
    await page.reload();
    for (const day of ['TUE', 'WED', 'THU']) {
      await expect(page.getByTestId(`settings-day-${day}`)).toBeChecked();
      await expect(page.getByTestId(`settings-public-day-${day}`)).toBeChecked();
    }
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, {
      ...originalSettings,
      version: latestSettings.version,
    });
  }
});
