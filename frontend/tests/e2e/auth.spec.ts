import { expect, type Page, test } from '@playwright/test';
import { adminCredentials, csrfHeaders, loginByApi, loginByUi } from './helpers';

const protectedLocation = '/admin/reservations?page=3&status=REQUESTED&keyword=testing#results';

async function mockReservationPage(page: Page) {
  await page.route('**/api/admin/reservations?**', async (route) => {
    await route.fulfill({
      json: {
        items: [],
        page: 3,
        size: 20,
        totalItems: 61,
        totalPages: 4,
      },
    });
  });
}

async function expectProtectedLocation(page: Page) {
  await expect.poll(() => new URL(page.url()).pathname).toBe('/admin/reservations');
  const restored = new URL(page.url());
  expect(restored.searchParams.get('page')).toBe('3');
  expect(restored.searchParams.get('status')).toBe('REQUESTED');
  expect(restored.searchParams.get('keyword')).toBe('testing');
  expect(restored.hash).toBe('#results');
}

test('로그인 화면은 빈 자격 증명으로 시작한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/login');

  await expect(page.getByLabel('아이디')).toHaveValue('');
  await expect(page.getByLabel('비밀번호')).toHaveValue('');
  await expect(page.getByLabel('아이디')).toHaveAttribute('autocomplete', 'username');
  await expect(page.getByLabel('비밀번호')).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByLabel('아이디')).toHaveCSS('font-size', '16px');
  await expect(page.getByLabel('비밀번호')).toHaveCSS('font-size', '16px');
});

test('잘못된 자격 증명은 로그인 실패로만 안내한다', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('아이디').fill('testing-invalid-admin');
  await page.getByLabel('비밀번호').fill('testing-invalid-password');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page.getByRole('alert')).toHaveText('아이디 또는 비밀번호가 잘못되었습니다.');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page).not.toHaveURL(/\/admin\/reservations/);
});

test('비로그인 상태에서 보호 라우트 접근 시 로그인 화면으로 이동한다', async ({ page }) => {
  await page.goto('/admin/rooms');
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
  await expect(page.getByText('아이디 또는 비밀번호가 잘못되었습니다.')).toHaveCount(0);
});

test('로그인 실패 후 성공해도 보호 라우트의 query와 hash를 복원한다', async ({ page }) => {
  await mockReservationPage(page);
  await page.goto(protectedLocation);
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.getByLabel('아이디').fill('testing-invalid-admin');
  await page.getByLabel('비밀번호').fill('testing-invalid-password');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.getByLabel('아이디').fill(adminCredentials.username);
  await page.getByLabel('비밀번호').fill(adminCredentials.password);
  await page.getByRole('button', { name: '로그인' }).click();
  await expectProtectedLocation(page);
});

test('보호 라우트에서 전달된 위치는 이미 로그인된 세션에도 복원된다', async ({ page }) => {
  await mockReservationPage(page);
  await page.goto(protectedLocation);
  await expect(page).toHaveURL(/\/admin\/login$/);

  await loginByApi(page.request);
  await page.reload();
  await expectProtectedLocation(page);
});

test('직접 관리자 로그인 후 기본 예약 목록에 진입할 수 있다', async ({ page }) => {
  await loginByUi(page);
  await expect(page.getByRole('link', { name: '예약 목록' })).toBeVisible();
});

test('로그인 성공 쿠키를 받지 못해도 기존 쿠키로 다시 로그인할 수 있다', async ({ page, playwright }) => {
  await page.goto('/admin/login');
  expect((await page.request.get('/api/auth/csrf')).status()).toBe(200);
  const before = await page.context().cookies();
  // Apply the successful response only to an independent cookie jar, like a lost browser response.
  const detached = await playwright.request.newContext({
    baseURL: new URL(page.url()).origin,
    storageState: await page.context().storageState(),
  });
  try {
    expect((await detached.post('/api/auth/admin/login', {
      headers: await csrfHeaders(detached), data: adminCredentials,
    })).status()).toBe(200);
    expect(JSON.stringify(await page.context().cookies()) === JSON.stringify(before)).toBe(true);
    expect((await page.request.get('/api/auth/admin/me')).status()).toBe(401);
    expect((await page.request.get('/api/auth/csrf')).status()).toBe(403);
    await page.reload();
    await page.getByLabel('아이디').fill('testing-invalid-admin');
    await page.getByLabel('비밀번호').fill('testing-invalid-password');
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByRole('alert')).toHaveText('아이디 또는 비밀번호가 잘못되었습니다.');
    expect(JSON.stringify(await page.context().cookies()) === JSON.stringify(before)).toBe(true);
    let release!: () => void;
    const resume = new Promise<void>(resolve => { release = resolve; });
    let reached!: () => void;
    const paused = new Promise<void>(resolve => { reached = resolve; });
    await page.route('**/api/auth/admin/login-session', async route => {
      const response = await route.fetch();
      expect(response.headers()['set-cookie'] === undefined).toBe(true);
      reached();
      await resume;
      await route.fulfill({ response });
    });
    const otherTab = await page.context().newPage();
    const firstLogin = loginByUi(page);
    try {
      await paused;
      await loginByUi(otherTab);
      const otherCookies = await page.context().cookies();
      release();
      await firstLogin;
      // A late recovery must not consume the authenticated cookie installed by the other tab.
      expect((await detached.get('/api/auth/admin/me', {
        headers: { Cookie: otherCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') },
      })).status()).toBe(200);
      expect((await page.request.get('/api/auth/admin/me')).status()).toBe(200);
    } finally {
      release();
      await Promise.allSettled([firstLogin]);
      await otherTab.close();
    }
    const after = await page.context().cookies();
    expect(['ROOM-SESSION', 'XSRF-TOKEN'].every(name =>
      after.find(cookie => cookie.name === name)?.value !== before.find(cookie => cookie.name === name)?.value)).toBe(true);
  } finally {
    await detached.dispose();
  }
});

test('늦은 중복 복구 준비와 이전 CSRF 응답은 정상 로그인 쿠키를 덮어쓰지 않는다', async ({ page }) => {
  await page.goto('/admin/login');
  expect((await page.request.get('/api/auth/csrf')).status()).toBe(200);
  let release!: () => void;
  const resume = new Promise<void>(resolve => { release = resolve; });
  let reached!: () => void;
  const paused = new Promise<void>(resolve => { reached = resolve; });
  let count = 0;
  await page.route(/\/api\/auth\/(csrf|admin\/login-session)$/, async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    expect(response.headers()['set-cookie'] === undefined).toBe(true);
    if (++count === 3) reached();
    await resume;
    await route.fulfill({ response });
  });
  const pending = page.evaluate(async () => Promise.all([
    '/api/auth/admin/login-session', '/api/auth/admin/login-session', '/api/auth/csrf',
  ].map(async path => (await fetch(path)).status)));
  try {
    await paused;
    // Stay on this document so its delayed fetches survive the normal login.
    const status = await page.evaluate(async credentials => {
      const csrf = document.cookie.split('; ').find(value => value.startsWith('XSRF-TOKEN='))!.slice(11);
      return (await fetch('/api/auth/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(csrf) },
        body: JSON.stringify(credentials),
      })).status;
    }, adminCredentials);
    expect(status).toBe(200);
    const afterLogin = await page.context().cookies();
    release();
    expect(await pending).toEqual([200, 200, 200]);
    expect(JSON.stringify(await page.context().cookies()) === JSON.stringify(afterLogin)).toBe(true);
    expect((await page.request.get('/api/auth/admin/me')).status()).toBe(200);
  } finally {
    release();
    await pending;
  }
});

test('로그인 CSRF 오류가 아닌 403은 복구나 자동 재시도를 하지 않는다', async ({ page }) => {
  let preparations = 0;
  let logins = 0;
  await page.route('**/api/auth/admin/login-session', async route => {
    preparations += 1;
    await route.abort();
  });
  await page.route('**/api/auth/admin/login', async route => {
    logins += 1;
    await route.fulfill({ status: 403, json: { code: 'FORBIDDEN', message: 'Forbidden' } });
  });
  await page.goto('/admin/login');
  await page.getByLabel('아이디').fill('testing-admin');
  await page.getByLabel('비밀번호').fill('testing-password');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(logins).toBe(1);
  expect(preparations).toBe(0);
});

test('로그인 직후 설정 저장과 로그아웃·재로그인이 정상 동작한다', async ({ page }) => {
  await loginByUi(page);
  await page.goto('/admin/settings');
  await expect(page.getByTestId('settings-form')).toBeVisible();
  const saved = page.waitForResponse(response => response.url().endsWith('/api/admin/settings')
    && response.request().method() === 'PUT');
  await page.getByTestId('settings-save-button').click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('status')).toBeVisible();
  await page.goto('/admin/timetable?view=date&date=2026-09-15');
  await expect(page.getByTestId('timetable-date-input')).toHaveValue('2026-09-15');
  const contextKeys = [
    'admin-timetable-context',
    'admin-reservations-context',
    'admin-recurrences-context',
    'admin-rooms-context',
    'admin-audit-context',
  ];
  await page.evaluate((keys) => {
    for (const key of keys) window.sessionStorage.setItem(key, 'page=1');
  }, contextKeys);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(await page.evaluate((keys) => keys.filter((key) => window.sessionStorage.getItem(key) !== null), contextKeys))
    .toEqual([]);

  await loginByUi(page);
  await page.getByRole('link', { name: '시간표', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/admin/timetable' && url.search === '');
});
