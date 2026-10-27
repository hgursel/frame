import type { Page } from '@playwright/test';

export async function openAccountPage(page: Page, name: 'Settings' | 'Admin' | 'Scheduled Tasks') {
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).waitFor();
  if (!(await page.locator('.sidebar').isVisible()))
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page
    .getByRole('group', { name: 'Account menu', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}
