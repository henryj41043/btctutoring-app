import { test, expect, type Page } from '@playwright/test';

const adminUser = {
  username: 'admin@example.com',
  email: 'admin@example.com',
  groups: ['Admins'],
  contact: 'c-1',
};

/**
 * Stub every dev-API call (http://localhost:3000) so the e2e suite is fully
 * hermetic — no real backend, DB, or Cognito involved.
 */
async function mockApi(page: Page): Promise<void> {
  await page.route('http://localhost:3000/**', (route) => {
    const url = route.request().url();
    if (url.includes('/auth/login')) {
      return route.fulfill({ json: { AccessToken: 'access', IdToken: 'id' } });
    }
    if (url.includes('/auth/forgot-password')) {
      return route.fulfill({ json: { success: true, message: 'Code sent.' } });
    }
    if (/\/auth(\?|$)/.test(url)) {
      return route.fulfill({ json: adminUser });
    }
    if (url.includes('/contacts')) {
      return route.fulfill({ json: [{ id: 'c-1', first_name: 'Ada' }] });
    }
    // Sessions / students / notes etc. — empty collections are fine.
    return route.fulfill({ json: [] });
  });
}

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('renders the login card', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { name: 'Beyond the Chalkboard Hub' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('signs an admin in and lands on the calendar', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('Password1!');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/calendar/);
  });

  test('opens the forgot-password flow', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(
      page.getByText(/Enter your account email/i),
    ).toBeVisible();
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByRole('button', { name: 'Send reset code' }).click();
    await expect(page.getByText(/Enter the code sent to your email/i)).toBeVisible();
  });
});
