import { expect, test } from '@playwright/test';
import {
  createRoomByApi,
  createReservationByApi,
  deleteRoomByApi,
  getSettingsByApi,
  loginByApi,
  updateSettingsByApi,
  uniqueE2eName,
} from './helpers';

test('rooms smoke: list renders and an existing room can be updated', async ({ page, request }) => {
  await loginByApi(request);
  const room = await createRoomByApi(request, uniqueE2eName('Rooms Smoke'));

  try {
    await page.goto('/rooms');
    const table = page.getByTestId('rooms-table');
    await expect(table).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: room.name });
    await expect(row).toBeVisible();
    await row.getByTestId('room-edit-button').click();

    const updatedLocation = uniqueE2eName('Updated Location');
    await expect(page.getByTestId('room-name-input')).toHaveValue(room.name);
    await page.getByTestId('room-location-input').fill(updatedLocation);
    await page.getByTestId('room-save-button').click();

    await expect(row).toContainText(updatedLocation);
  } finally {
    await deleteRoomByApi(request, room.id);
  }
});

test('rooms smoke: deletion requires matching room name and server checks', async ({ page, request }) => {
  await loginByApi(request);
  const room = await createRoomByApi(request, uniqueE2eName('Rooms Delete'));

  await page.goto('/rooms');
  const row = page.getByRole('row').filter({ hasText: room.name });
  await expect(row).toBeVisible();

  await row.getByTestId('room-delete-button').click();
  await expect(page.getByTestId('room-delete-modal')).toBeVisible();
  await expect(page.getByRole('heading', { name: '강의실 영구 삭제' })).toBeVisible();
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

test('rooms smoke: deletion explains preserved reservation records', async ({ page, request }) => {
  await loginByApi(request);
  const room = await createRoomByApi(request, uniqueE2eName('Rooms Delete Blocked'));
  await createReservationByApi(request, room.id, uniqueE2eName('room delete blocker'));

  try {
    await page.goto('/rooms');
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

test('settings smoke: settings load and can be saved with feedback', async ({ page, request }) => {
  await loginByApi(request);
  const originalSettings = await getSettingsByApi(request);
  const updatedOrganizationName = uniqueE2eName('Settings Org');

  try {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-form')).toBeVisible();

    await page.getByTestId('settings-organization-input').fill(updatedOrganizationName);
    await page.getByTestId('settings-public-notice-input').fill('E2E settings smoke notice');
    await page.getByTestId('settings-save-button').click();

    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByTestId('settings-organization-input')).toHaveValue(updatedOrganizationName);
  } finally {
    const latestSettings = await getSettingsByApi(request);
    await updateSettingsByApi(request, {
      ...originalSettings,
      version: latestSettings.version,
    });
  }
});
