import { expect, test } from './fixtures';

const emptyPage = {
  items: [],
  page: 0,
  size: 20,
  totalItems: 0,
  totalPages: 0,
};

for (const timezoneId of ['Asia/Seoul', 'UTC']) {
  test.describe(`Seoul instant display and date filters in ${timezoneId}`, () => {
    test.use({ timezoneId });

    test('uses the same Seoul display and +09:00 admin day boundaries', async ({ page }) => {
      let auditFilters: { from: string | null; to: string | null } | undefined;
      let reservationFilters: { from: string | null; to: string | null } | undefined;

      await page.route('**/api/admin/audit/reservation-histories**', async (route) => {
        const url = new URL(route.request().url());
        auditFilters = {
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
        };
        await route.fulfill({
          json: {
            ...emptyPage,
            items: [
              {
                id: '00000000-0000-0000-0000-000000000001',
                reservationId: '10000000-0000-0000-0000-000000000001',
                action: 'DELETED',
                beforeStatus: 'CONFIRMED',
                afterStatus: null,
                memo: null,
                reservationRoomId: null,
                reservationPurpose: null,
                reservationRoomName: 'mock-seoul-room',
                reservationStartAt: '2026-07-13T15:30:00Z',
                reservationEndAt: '2026-07-14T14:30:00Z',
                actorType: 'ADMIN',
                actorId: 'admin',
                createdAt: '2026-07-13T15:30:00Z',
              },
            ],
            totalItems: 1,
            totalPages: 1,
          },
        });
      });
      await page.route('**/api/admin/reservations**', async (route) => {
        const url = new URL(route.request().url());
        reservationFilters = {
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
        };
        await route.fulfill({ json: emptyPage });
      });

      await page.goto('/admin/audit?action=DELETED&fromDate=2026-07-14&toDate=2026-07-14');
      await expect.poll(() => auditFilters).toEqual({
        from: '2026-07-14T00:00:00+09:00',
        to: '2026-07-14T23:59:59+09:00',
      });

      const auditRow = page.getByTestId('audit-table').locator('tbody tr').first();
      await expect(auditRow.locator('td').first()).toContainText('2026. 7. 14.');
      await expect(auditRow.locator('td').first()).toContainText('12:30');
      const snapshotText = await auditRow.locator('.audit-snapshot-time').innerText();
      expect(snapshotText.match(/2026\. 7\. 14\./g)).toHaveLength(1);
      expect(snapshotText).not.toContain('2026. 7. 13.');
      expect(snapshotText).toContain('12:30');
      expect(snapshotText).toContain('11:30');

      await page.goto('/admin/reservations?fromDate=2026-07-14&toDate=2026-07-14');
      await expect.poll(() => reservationFilters).toEqual({
        from: '2026-07-14T00:00:00+09:00',
        to: '2026-07-14T23:59:59+09:00',
      });
    });
  });
}
