import { expect, test } from './fixtures';
import { loginByApi } from './helpers';

test('tag settings smoke: create, update, and delete tag', async ({ page, request, e2eData }) => {
  await loginByApi(request);
  const tagName = e2eData.name('tag-settings');
  const updatedTagName = e2eData.name('tag-settings-updated');
  let tagId: string | undefined;

  await page.goto('/admin/settings/tags');
  await expect(page.getByRole('heading', { name: '태그 설정' })).toBeVisible();
  await expect(page.getByTestId('tags-table').or(page.getByText('등록된 태그가 없습니다.'))).toBeVisible();

  await page.getByRole('button', { name: '태그 만들기' }).click();
  await expect(page.getByTestId('tag-form-panel')).toBeVisible();
  await page.getByTestId('tag-name-input').fill(tagName);
  await page.getByTestId('tag-color-input').fill('#2563eb');

  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/admin/tags' && response.request().method() === 'POST';
  });
  await page.getByRole('button', { name: '저장' }).click();
  const createResponse = await createResponsePromise;
  const createBody = await createResponse.text();
  expect(createResponse.ok(), createBody).toBeTruthy();
  tagId = (JSON.parse(createBody) as { id: string }).id;
  e2eData.registerTag(tagId);

  await expect(page.getByTestId('tag-form-panel')).toBeHidden();
  const createdRow = page.getByRole('row').filter({ hasText: tagName });
  await expect(createdRow).toBeVisible();
  await expect(createdRow).toContainText('#2563eb');

  await createdRow.getByRole('button', { name: '수정' }).click();
  await expect(page.getByTestId('tag-form-panel')).toBeVisible();
  await page.getByTestId('tag-name-input').fill(updatedTagName);
  await page.getByTestId('tag-color-input').fill('#dc2626');

  const updateResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/admin/tags/${tagId}`) &&
    response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '저장' }).click();
  const updateResponse = await updateResponsePromise;
  expect(updateResponse.ok(), `Update tag failed with status ${updateResponse.status()}`).toBeTruthy();

  const updatedRow = page.getByRole('row').filter({ hasText: updatedTagName });
  await expect(updatedRow).toBeVisible();
  await expect(updatedRow).toContainText('#dc2626');

  await updatedRow.getByRole('button', { name: '삭제' }).click();
  await expect(page.getByRole('heading', { name: '태그 삭제' })).toBeVisible();
  const deleteResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/admin/tags/${tagId}`) &&
    response.request().method() === 'DELETE',
  );
  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
  const deleteResponse = await deleteResponsePromise;
  expect(deleteResponse.ok(), `Delete tag failed with status ${deleteResponse.status()}`).toBeTruthy();
  await expect(page.getByRole('row').filter({ hasText: updatedTagName })).toHaveCount(0);
});
