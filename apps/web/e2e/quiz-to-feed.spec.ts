import { expect, test } from '@playwright/test';
import { CARD_COUNT, mockApi, seedSession } from './fixtures';

test.describe('DaFitMatch web flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('a guest builds a fit and is asked to sign in', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Build my fit' }).click();
    await expect(page).toHaveURL(/\/try$/);

    // Nothing picked yet: the builder explains what is missing.
    await page.getByRole('button', { name: 'Generate fit' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();

    await page
      .getByRole('group', { name: 'How you dress' })
      .getByRole('button', { name: 'Feminine' })
      .click();
    await page
      .getByRole('group', { name: 'Shop section' })
      .getByRole('button', { name: "Women's" })
      .click();
    await page
      .getByRole('group', { name: 'Occasion' })
      .getByRole('button', { name: /Dinner/ })
      .click();
    await page.getByRole('button', { name: '₹4,000' }).click();
    await page.getByRole('button', { name: /Soft Romantic/ }).click();

    await page.getByRole('button', { name: 'Generate fit' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Sign in to generate your fit');
    await expect(dialog.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('a signed-in user swipes the quiz and lands on the ranked feed', async ({ page }) => {
    await seedSession(page);
    await page.goto('/app/quiz');
    await expect(page.getByRole('heading', { name: 'Find your style' })).toBeVisible();

    await page.getByRole('button', { name: 'Start swiping' }).click();
    await expect(page.getByText(`Card 1 of ${CARD_COUNT}`)).toBeVisible();

    // Keyboard: right = like, backspace = undo.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(`Card 2 of ${CARD_COUNT}`)).toBeVisible();
    await page.keyboard.press('Backspace');
    await expect(page.getByText(`Card 1 of ${CARD_COUNT}`)).toBeVisible();

    // Swipe the whole deck (up = love) to reach the rules step.
    for (let i = 0; i < CARD_COUNT; i += 1) {
      await page.keyboard.press('ArrowUp');
    }
    await expect(page.getByRole('heading', { name: 'Your rules' })).toBeVisible();

    await page.getByRole('button', { name: 'See my style' }).click();
    await expect(page.getByRole('heading', { name: 'Your style is ready' })).toBeVisible();

    await page.getByRole('link', { name: 'See my feed' }).click();
    await expect(page).toHaveURL(/\/app\/feed$/);
    await expect(page.getByRole('heading', { name: 'Your feed' })).toBeVisible();
    await expect(page.getByText('Item 1')).toBeVisible();
  });

  test('the feed records a reaction straight away', async ({ page }) => {
    await seedSession(page);
    await page.goto('/app/feed');
    await expect(page.getByText('Item 1')).toBeVisible();

    await page.getByRole('button', { name: 'Love' }).first().click();
    await expect(page.getByTestId('reaction').first()).toHaveText('Loved');
  });
});
