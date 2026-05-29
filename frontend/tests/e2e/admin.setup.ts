import { test as setup } from '@playwright/test';
import { loginByUi } from './helpers';

setup('authenticate as admin', async ({ page }) => {
  await loginByUi(page);
  await page.context().storageState({ path: 'tests/e2e/.auth/admin.json' });
});
