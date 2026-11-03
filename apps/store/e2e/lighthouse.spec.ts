import { mkdirSync, writeFileSync } from 'node:fs';

import { chromium, expect, test } from '@playwright/test';
import lighthouse from 'lighthouse';

import { storeUrl } from '../playwright.config.ts';
import { STORE_A, STORE_B } from './fixtures.ts';

// Performance budgets of the storefront (ADR-0014, ARCHITECTURE §8), measured by Lighthouse
// with its default mobile profile (emulated mid-range phone, simulated slow 4G).
const BUDGET = {
  performance: 0.9,
  accessibility: 0.9,
  bestPractices: 0.9,
  seo: 0.9,
  lcpMs: 2_500,
  cls: 0.1,
  totalBlockingTimeMs: 200,
  scriptBytes: 50 * 1024,
};
const DEBUGGING_PORT = 9333;
const REPORTS = 'test-results/lighthouse';

for (const [label, url] of [
  ['accueil boutique A (arabe)', storeUrl(STORE_A.host)],
  ['accueil boutique B (français)', storeUrl(STORE_B.host)],
] as const) {
  test(`budgets Lighthouse mobile — ${label}`, async () => {
    test.setTimeout(120_000);
    const browser = await chromium.launch({
      channel: 'chromium',
      args: [`--remote-debugging-port=${String(DEBUGGING_PORT)}`],
    });
    try {
      const result = await lighthouse(url, {
        port: DEBUGGING_PORT,
        output: 'html',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      });
      if (result === undefined) throw new Error('Lighthouse returned no result');
      const { lhr } = result;
      mkdirSync(REPORTS, { recursive: true });
      const name = new URL(url).hostname;
      writeFileSync(`${REPORTS}/${name}.html`, String(result.report));
      writeFileSync(`${REPORTS}/${name}.json`, JSON.stringify(lhr));

      const score = (id: string) => lhr.categories[id]?.score ?? 0;
      const numeric = (id: string) => lhr.audits[id]?.numericValue ?? Number.POSITIVE_INFINITY;
      const scriptBytes = (
        lhr.audits['network-requests']?.details?.type === 'table'
          ? lhr.audits['network-requests'].details.items
          : []
      )
        .filter((item) => item.resourceType === 'Script')
        .reduce((total, item) => total + Number(item.transferSize ?? 0), 0);

      const measured = {
        performance: score('performance'),
        accessibility: score('accessibility'),
        bestPractices: score('best-practices'),
        seo: score('seo'),
        lcpMs: Math.round(numeric('largest-contentful-paint')),
        cls: numeric('cumulative-layout-shift'),
        totalBlockingTimeMs: Math.round(numeric('total-blocking-time')),
        scriptBytes,
      };
      test.info().annotations.push({ type: 'lighthouse', description: JSON.stringify(measured) });

      expect
        .soft(measured.performance, 'score performance')
        .toBeGreaterThanOrEqual(BUDGET.performance);
      expect
        .soft(measured.accessibility, 'score accessibilité')
        .toBeGreaterThanOrEqual(BUDGET.accessibility);
      expect
        .soft(measured.bestPractices, 'score bonnes pratiques')
        .toBeGreaterThanOrEqual(BUDGET.bestPractices);
      expect.soft(measured.seo, 'score SEO').toBeGreaterThanOrEqual(BUDGET.seo);
      expect.soft(measured.lcpMs, 'LCP (ms)').toBeLessThan(BUDGET.lcpMs);
      expect.soft(measured.cls, 'CLS').toBeLessThan(BUDGET.cls);
      expect
        .soft(measured.totalBlockingTimeMs, 'TBT (ms)')
        .toBeLessThan(BUDGET.totalBlockingTimeMs);
      expect.soft(measured.scriptBytes, 'JS transféré (octets)').toBeLessThan(BUDGET.scriptBytes);
    } finally {
      await browser.close();
    }
  });
}
