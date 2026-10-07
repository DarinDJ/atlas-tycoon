import { test, expect, type Page } from '@playwright/test';

async function setName(page: Page, name: string) {
  await page.goto('/');
  const accept = page.getByRole('button', { name: 'Accept' });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await page.getByTestId('name-input').fill(name);
}

test.describe('Atlas Tycoon', () => {
  test('landing page renders maps and lobby', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Atlas Tycoon');
    await expect(page.getByTestId('map-india-cities')).toBeVisible();
    await expect(page.getByTestId('map-india-heritage')).toBeVisible();
  });

  test('map landing page is SEO friendly', async ({ page }) => {
    await page.goto('/play/india-cities');
    await expect(page).toHaveTitle(/India Cities/);
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.locator('[data-tile="39"]')).toContainText('Mumbai');
  });

  test('plays a full game against bots and reaches the results screen', async ({ page }) => {
    test.setTimeout(240_000);
    await setName(page, 'Tester');
    await page.getByTestId('play-bots').click();
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]{5}/);
    // Autostart fills the room with bots and starts the game.
    await expect(page.getByTestId('game')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('players')).toContainText('Tester');

    // Play a few turns by hand: roll, buy/decline, end turn.
    let turns = 0;
    const deadline = Date.now() + 60_000;
    while (turns < 4 && Date.now() < deadline) {
      const roll = page.getByTestId('roll');
      if (await roll.isVisible().catch(() => false)) {
        await roll.click();
        turns++;
        await page.waitForTimeout(1500);
        continue;
      }
      const buy = page.getByTestId('buy');
      if (await buy.isVisible().catch(() => false)) {
        await buy.click();
        await page.waitForTimeout(500);
        continue;
      }
      const pass = page.getByTestId('pass-bid');
      if (await pass.isVisible().catch(() => false)) {
        await pass.click();
        await page.waitForTimeout(300);
        continue;
      }
      const end = page.getByTestId('end-turn');
      if (await end.isVisible().catch(() => false)) {
        await end.click();
        await page.waitForTimeout(500);
        continue;
      }
      await page.waitForTimeout(400);
    }
    expect(turns).toBeGreaterThan(0);

    // Open a property card from the board and close it.
    await page.locator('[data-tile="1"]').click();
    await expect(page.getByTestId('property-card')).toBeVisible();
    await page.keyboard.press('Escape');

    // Resign and let the bots finish; the results screen must appear.
    await page.getByRole('button', { name: 'Leave' }).click();
    await page.getByRole('button', { name: 'Resign', exact: true }).click();
    await expect(page.getByTestId('game-over')).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId('game-over')).toContainText('wins');
    await page.getByTestId('play-again').click();
    await expect(page.getByTestId('lobby')).toBeVisible({ timeout: 10_000 });
  });

  test('two browsers can join the same room and chat', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    await setName(a, 'Asha');
    await a.getByTestId('create-room').click();
    await expect(a).toHaveURL(/\/room\//);
    const code = a.url().split('/room/')[1]!.slice(0, 5);
    await setName(b, 'Bala');
    await b.getByTestId('join-code').fill(code);
    await b.locator('form').getByRole('button', { name: 'Join' }).click();
    await expect(a.getByTestId('seats')).toContainText('Bala', { timeout: 15_000 });
    await a.getByTestId('add-bot-easy').click();
    await expect(a.getByTestId('seats')).toContainText('(bot)');
    await a.getByTestId('start-game').click();
    await expect(a.getByTestId('game')).toBeVisible({ timeout: 15_000 });
    await expect(b.getByTestId('game')).toBeVisible({ timeout: 15_000 });
    // Chat round trip.
    await b.getByRole('tab', { name: /Chat/ }).click();
    await b.getByPlaceholder('Say something…').fill('namaste!');
    await b.getByRole('button', { name: 'Send' }).click();
    await a.getByRole('tab', { name: /Chat/ }).click();
    await expect(a.getByTestId('chat')).toContainText('namaste!', { timeout: 10_000 });
    await ctxA.close();
    await ctxB.close();
  });

  test('store dev purchase unlocks a premium map', async ({ page }) => {
    await page.goto('/store');
    await expect(page.getByTestId('product-map-usa')).toBeVisible();
    const buy = page.getByTestId('buy-map-usa');
    if (await buy.isVisible().catch(() => false)) {
      await buy.click();
      await expect(page).toHaveURL(/purchased=map-usa/, { timeout: 15_000 });
      await expect(page.getByTestId('product-map-usa')).toContainText('Owned');
    }
  });

  test('map editor validates a built-in map', async ({ page }) => {
    await page.goto('/editor');
    await page.getByLabel('Load map').selectOption('india-cities');
    await expect(page.getByTestId('board')).toBeVisible();
    await page.getByTestId('validate').click();
    await expect(page.getByText('Map is valid')).toBeVisible({ timeout: 15_000 });
  });
});
