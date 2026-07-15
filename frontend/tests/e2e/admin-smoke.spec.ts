import { expect, test } from './fixtures';
import {
  deleteRoomByApi,
  getSettingsByApi,
  loginByApi,
  updateSettingsByApi,
} from './helpers';

test('rooms smoke: list renders and an existing room can be updated', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const room = await e2eData.createTestRoom('rooms-smoke');

  try {
    await page.goto('/admin/rooms');
    const table = page.getByTestId('rooms-table');
    await expect(table).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: room.name });
    await expect(row).toBeVisible();
    await row.getByTestId('room-edit-button').click();

    const updatedLocation = e2eData.name('updated-location');
    await expect(page.getByTestId('room-name-input')).toHaveValue(room.name);
    await expect(page.getByLabel('강의실 안내')).toBeVisible();
    await page.getByTestId('room-location-input').fill(updatedLocation);
    await page.getByTestId('room-save-button').click();

    await expect(row).toContainText(updatedLocation);
  } finally {
    await deleteRoomByApi(request, room.id);
  }
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
  await expect(page.getByRole('heading', { name: '강의실 영구 삭제' })).toBeVisible();
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
    await expect(page.getByText('기존 예약 기록은 삭제된 강의실로 보존됩니다')).toBeVisible();
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
    await expect(page.getByLabel('관리자 이름')).toHaveCount(0);
    await expect(page.getByLabel('문의 이메일')).toBeVisible();
    await expect(page.getByLabel('문의 전화번호')).toBeVisible();
    await expect(page.getByTestId('settings-slot-minutes-select').locator('option[value="60"]')).toHaveCount(0);
    await expect(page.getByTestId('settings-open-time-input')).toHaveAttribute('step', '1800');
    await expect(page.getByTestId('settings-close-time-input')).toHaveAttribute('step', '1800');

    await page.getByTestId('settings-organization-input').fill(updatedOrganizationName);
    await page.getByTestId('settings-public-notice-input').fill('testing-settings-smoke-notice');
    await page.getByLabel('문의 이메일').fill(contactEmail);
    await page.getByLabel('문의 전화번호').fill(contactPhone);
    await page.getByTestId('settings-slot-minutes-select').selectOption('5');
    await expect(page.getByTestId('settings-min-reservation-input')).toHaveAttribute('step', '5');
    await expect(page.getByTestId('settings-max-reservation-input')).toHaveAttribute('step', '5');
    await expect(page.getByTestId('settings-form')).toContainText(
      '최소·최대 예약 시간을 현재 예약 단위의 배수로 입력해 주세요.',
    );
    await page.getByTestId('settings-save-button').click();

    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByTestId('settings-organization-input')).toHaveValue(updatedOrganizationName);
    await expect(page.getByTestId('settings-slot-minutes-select')).toHaveValue('5');
    await page.reload();
    await expect(page.getByTestId('settings-slot-minutes-select')).toHaveValue('5');

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
