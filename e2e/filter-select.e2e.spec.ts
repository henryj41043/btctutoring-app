import { test, expect, type Page } from '@playwright/test';

const adminUser = {
  username: 'admin@example.com',
  email: 'admin@example.com',
  groups: ['Admins'],
  contact: 'c-9',
};

const contacts = [
  { id: 'c-9', first_name: 'Ada', last_name: 'Admin', user_group: 'Admins' },
  { id: 'c-1', first_name: 'Casey', last_name: 'Lee' },
  { id: 'c-2', first_name: 'Jordan', last_name: 'Casey' },
  { id: 'c-3', first_name: 'Josh', last_name: 'Henry' },
];

async function mockApi(page: Page): Promise<void> {
  await page.route('http://localhost:3000/**', (route) => {
    const url = route.request().url();
    if (url.includes('/auth/login')) {
      return route.fulfill({ json: { AccessToken: 'access', IdToken: 'id' } });
    }
    if (/\/auth(\?|$)/.test(url)) {
      return route.fulfill({ json: adminUser });
    }
    if (url.includes('/contacts')) {
      return route.fulfill({ json: contacts });
    }
    return route.fulfill({ json: [] });
  });
}

async function loginAndOpenReminderDialog(page: Page): Promise<void> {
  await mockApi(page);
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('Password1!');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/calendar/);
  // In-app navigation: a hard goto would reset the in-memory auth state.
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('menuitem', { name: 'Reminders' }).click();
  await page.getByRole('button', { name: 'Add Reminder' }).click();
}

const filterInput = (page: Page) =>
  page.getByRole('dialog').getByPlaceholder('Type to filter…');
const visibleOptions = (page: Page) =>
  page.locator('mat-option:visible .mdc-list-item__primary-text');

test.describe('FilterSelect typeahead', () => {
  test('filters, selects on click, and KEEPS filtering when the text is edited after a selection', async ({ page }) => {
    await loginAndOpenReminderDialog(page);

    const input = filterInput(page);
    await input.click({force: true});
    await input.pressSequentially('jos');
    await expect(input).toHaveValue('jos');
    await expect(visibleOptions(page)).toHaveText(['Josh Henry']);

    await page.locator('mat-option', { hasText: 'Josh Henry' }).click();
    await expect(input).toHaveValue('Josh Henry');

    // Click back in and delete down to 'Jo' — the list must narrow again.
    await input.click({force: true});
    for (let i = 0; i < 'sh Henry'.length; i++) {
      await input.press('Backspace');
    }
    await expect(input).toHaveValue('Jo');
    await expect(visibleOptions(page)).toHaveText(['Jordan Casey', 'Josh Henry']);

    // Clear entirely: full list, then a fresh filter still narrows.
    for (let i = 0; i < 'Jo'.length; i++) {
      await input.press('Backspace');
    }
    await expect(visibleOptions(page)).toHaveText([
      'Ada Admin', 'Casey Lee', 'Jordan Casey', 'Josh Henry',
    ]);
    await input.pressSequentially('casey');
    await expect(visibleOptions(page)).toHaveText(['Casey Lee', 'Jordan Casey']);

    // And a second pick still lands.
    await page.locator('mat-option', { hasText: 'Casey Lee' }).click();
    await expect(input).toHaveValue('Casey Lee');
  });
});
