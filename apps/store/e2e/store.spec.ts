import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { STORE_NO_API_PORT, STORE_TEST_ENV_PORT, storeUrl } from '../playwright.config.ts';
import { INACTIVE_HOST, STORE_A, STORE_B, UNKNOWN_HOST } from './fixtures.ts';

const SHOTS = 'test-results/screenshots';

/**
 * Collects CSP violations, script errors and failed sub-resources. The browser also logs the
 * HTTP status of the document itself (expected on 404 pages): that one is not a problem.
 */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      problems.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.request().resourceType() !== 'document') {
      problems.push(`${String(response.status())} ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

const cssVariable = (page: Page, name: string) =>
  page.evaluate(
    (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(),
    name,
  );

test.describe('store — résolution par hôte, langues, en-têtes', () => {
  test('boutique A : arabe par défaut (RTL), thème, en-têtes de sécurité et de cache', async ({
    page,
  }, info) => {
    const problems = watchConsole(page);
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });

    const response = await page.goto(storeUrl(STORE_A.host));
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `مرحبًا بكم في ${STORE_A.name}`,
    );
    await expect(page).toHaveTitle(STORE_A.name);
    expect(await cssVariable(page, '--color-primary')).toBe(STORE_A.primary);

    const headers = response?.headers() ?? {};
    expect(headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    );
    expect(headers['content-language']).toBe('ar');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    // Hash-based CSP computed by Astro (no nonce: the HTML is shared by the CDN cache).
    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/style-src 'self'[^;]*'sha256-/u);
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");

    // No JavaScript on a page without islands (budget: < 50 KB).
    expect(scripts).toEqual([]);
    expect(problems).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/a-ar-${info.project.name}.png`, fullPage: true });
  });

  test('boutique A : version française (LTR) et sélecteur de langue', async ({ page }, info) => {
    const problems = watchConsole(page);
    await page.goto(storeUrl(STORE_A.host, '/fr/'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `Bienvenue chez ${STORE_A.name}`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute(
      'href',
      `https://${STORE_A.host}/`,
    );
    await page.screenshot({ path: `${SHOTS}/a-fr-${info.project.name}.png`, fullPage: true });

    await page
      .getByRole('navigation', { name: 'Langue' })
      .getByRole('link', { name: 'العربية' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(new URL(page.url()).pathname).toBe('/');
    expect(problems).toEqual([]);
  });

  test('préfixe de la langue par défaut ⇒ redirection 301 vers l’URL unique', async ({ page }) => {
    const response = await page.goto(storeUrl(STORE_A.host, '/ar/?utm_source=test'));
    const redirect = response?.request().redirectedFrom();
    expect((await redirect?.response())?.status()).toBe(301);
    expect(page.url()).toBe(storeUrl(STORE_A.host, '/?utm_source=test'));
  });

  test('boutique B sur un autre hôte : autre boutique, autre langue par défaut, autre thème', async ({
    page,
  }, info) => {
    const problems = watchConsole(page);
    await page.goto(storeUrl(STORE_B.host));
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `Bienvenue chez ${STORE_B.name}`,
    );
    expect(await cssVariable(page, '--color-primary')).toBe(STORE_B.primary);
    expect(await cssVariable(page, '--radius')).toBe('1rem');
    await expect(page.getByText(STORE_A.name)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/b-fr-${info.project.name}.png`, fullPage: true });

    await page.goto(storeUrl(STORE_B.host, '/ar/'));
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `مرحبًا بكم في ${STORE_B.name}`,
    );
    expect(problems).toEqual([]);
  });

  for (const host of [UNKNOWN_HOST, INACTIVE_HOST]) {
    test(`hôte sans boutique active (${host}) ⇒ 404 bilingue, aucune donnée de boutique`, async ({
      page,
    }) => {
      const problems = watchConsole(page);
      const response = await page.goto(storeUrl(host));
      expect(response?.status()).toBe(404);
      expect(response?.headers()['cache-control']).toBe('public, max-age=0, s-maxage=60');
      await expect(page.getByRole('heading', { name: 'هذا المتجر غير موجود' })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Cette boutique n’existe pas' }),
      ).toBeVisible();
      await expect(page.getByText('Boutique fermée')).toHaveCount(0);
      expect(problems).toEqual([]);
    });
  }

  test('page inconnue d’une boutique ⇒ 404 aux couleurs de la boutique, dans la langue du chemin', async ({
    page,
  }, info) => {
    const problems = watchConsole(page);
    let response = await page.goto(storeUrl(STORE_A.host, '/n-existe-pas'));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('الصفحة غير موجودة');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await page.screenshot({ path: `${SHOTS}/a-404-ar-${info.project.name}.png`, fullPage: true });

    response = await page.goto(storeUrl(STORE_A.host, '/fr/n-existe-pas'));
    expect(response?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await page.getByRole('link', { name: 'Retour à l’accueil' }).click();
    expect(new URL(page.url()).pathname).toBe('/fr/');
    expect(problems).toEqual([]);
  });

  test('fichier de build inexistant ⇒ 404 simple (jamais une erreur 500)', async ({ page }) => {
    const response = await page.goto(storeUrl(STORE_A.host, '/_astro/inexistant.js'));
    expect(response?.status()).toBe(404);
    expect(await response?.text()).toBe('Not found');
  });

  test('API injoignable ⇒ 503 bilingue, jamais mis en cache', async ({ page }) => {
    const response = await page.goto(storeUrl(STORE_A.host, '/', STORE_NO_API_PORT));
    expect(response?.status()).toBe(503);
    expect(response?.headers()['cache-control']).toBe('no-store');
    expect(response?.headers()['retry-after']).toBe('30');
    await expect(page.getByRole('heading', { name: 'المتجر غير متاح مؤقتًا' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Boutique momentanément indisponible' }),
    ).toBeVisible();
  });

  test('environnement de test : mention visible, pages exclues des moteurs de recherche', async ({
    page,
  }, info) => {
    const response = await page.goto(storeUrl(STORE_A.host, '/', STORE_TEST_ENV_PORT));
    expect(response?.status()).toBe(200);
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.getByRole('note')).toHaveText('بيئة تجريبية — لا توجد مبيعات حقيقية');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await page.screenshot({ path: `${SHOTS}/a-test-env-${info.project.name}.png`, fullPage: true });
    await page.goto(storeUrl(STORE_B.host, '/', STORE_TEST_ENV_PORT));
    await expect(page.getByRole('note')).toHaveText('Environnement de test — aucune vente réelle');
  });

  test('hors environnement de test : ni mention ni exclusion', async ({ page }) => {
    const response = await page.goto(storeUrl(STORE_A.host));
    expect(response?.headers()['x-robots-tag']).toBeUndefined();
    await expect(page.getByRole('note')).toHaveCount(0);
  });

  test('sonde de vie /health, sans boutique ni API', async ({ page }) => {
    const response = await page.goto(storeUrl('127.0.0.1', '/health'));
    expect(response?.status()).toBe(200);
    expect(await response?.json()).toEqual({ status: 'ok' });
    expect(response?.headers()['cache-control']).toBe('no-store');
  });
});
