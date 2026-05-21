import { expect, test } from '@playwright/test';
import {
  createRoomByApi,
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
