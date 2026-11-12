import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { AGENT, OWNER, STORE, totpNow } from './fixtures.ts';

const SHOTS = 'test-results/screenshots';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

// The scenarios share the OWNER's TOTP secret, obtained during enrolment (serial execution).
let totpSecret = '';

test.describe.serial('admin — parcours OWNER puis agent', () => {
  test('OWNER : enrôlement 2FA obligatoire, codes de secours, accueil (mobile)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/u);
    await expect(page.getByRole('note')).toHaveText('Environnement de test — aucune vente réelle');
    await page.screenshot({ path: `${SHOTS}/login-mobile.png`, fullPage: true });

    await login(page, OWNER.email, 'mauvais mot de passe');
    await expect(page.getByRole('alert')).toContainText('incorrect');

    await login(page, OWNER.email, OWNER.password);
    await expect(page).toHaveURL(/\/2fa\/setup$/u);
    totpSecret = (await page.getByTestId('totp-secret').textContent()) ?? '';
    expect(totpSecret).toMatch(/^[A-Z2-7]{32}$/u);
    await page.screenshot({ path: `${SHOTS}/2fa-setup-mobile.png`, fullPage: true });
    await page.getByLabel('Code à 6 chiffres').fill(totpNow(totpSecret));
    await page.getByRole('button', { name: 'Activer' }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByLabel("J'ai enregistré mes codes de secours").check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByRole('heading', { name: `Bonjour, ${OWNER.name}` })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/home-mobile.png`, fullPage: true });

    // Mobile navigation drawer.
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Utilisateurs' }),
    ).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/menu-mobile.png`, fullPage: true });
  });

  test('OWNER : vérification 2FA, palette de commandes, création d’un agent, langue (desktop)', async ({
    page,
  }) => {
    await login(page, OWNER.email, OWNER.password);
    await expect(page).toHaveURL(/\/2fa\/verify$/u);
    // Next time step: the enrolment code cannot be replayed.
    await page.getByLabel('Code à 6 chiffres').fill(totpNow(totpSecret, 1));
    await page.getByRole('button', { name: 'Vérifier' }).click();
    await expect(page.getByRole('heading', { name: `Bonjour, ${OWNER.name}` })).toBeVisible();

    // Keyboard-first navigation.
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Aller à… ou lancer une action').fill('Utilisateurs');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/users$/u);
    await expect(page.getByRole('heading', { name: 'Utilisateurs' })).toBeVisible();

    await page.getByRole('link', { name: 'Nouvel utilisateur' }).click();
    await page.getByLabel('E-mail').fill(AGENT.email);
    await page.getByLabel('Nom').fill(AGENT.name);
    await page.getByLabel('Mot de passe initial').fill(AGENT.password);
    await expect(page.getByLabel('Agent de confirmation')).toBeChecked();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Utilisateur créé')).toBeVisible();
    await expect(page).toHaveURL(/\/users$/u);
    await expect(page.getByRole('link', { name: AGENT.name })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/users-desktop.png`, fullPage: true });

    await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/users-desktop-en.png`, fullPage: true });
    await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
    await expect(page.getByRole('heading', { name: 'Utilisateurs' })).toBeVisible();

    // Job pipeline from the admin (test environment, no permanent worker).
    await page.getByRole('navigation').getByRole('link', { name: 'Système' }).click();
    await expect(page.getByRole('heading', { name: 'Système' })).toBeVisible();
    await page.getByRole('button', { name: 'Envoyer un événement de test' }).click();
    await expect(page.getByText(/Événement de test n° \d+ publié/u)).toBeVisible();
    await page.getByRole('button', { name: 'Lancer un tour de traitement' }).click();
    await expect(page.getByTestId('tick-relayed')).toHaveText('1');
    await expect(page.getByTestId('tick-dead')).toHaveText('0');
    await expect(page.getByRole('cell', { name: 'system.test-event' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/system-desktop.png`, fullPage: true });

    // Store settings (P1-02): server-side validation, then a saved change.
    await page.getByRole('navigation').getByRole('link', { name: 'Boutiques' }).click();
    await page.getByRole('link', { name: new RegExp(STORE.name, 'u') }).click();
    await expect(page.getByRole('heading', { name: `Boutique « ${STORE.name} »` })).toBeVisible();
    await expect(page.getByText(STORE.hostname)).toBeVisible();
    await page.getByLabel('Préfixe des numéros de commande').fill('bt');
    await page.getByLabel('Français').uncheck();
    await page.getByLabel('Langue par défaut').selectOption('fr');
    await expect(page.getByText('La langue par défaut doit faire partie')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await page.getByLabel('Français').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Paramètres enregistrés')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Préfixe des numéros de commande')).toHaveValue('BT');
    await expect(page.getByLabel('Langue par défaut')).toHaveValue('fr');
    await page.screenshot({ path: `${SHOTS}/store-settings-desktop.png`, fullPage: true });
  });

  test('agent : pas d’accès à la gestion des utilisateurs', async ({ page }) => {
    await login(page, AGENT.email, AGENT.password);
    await expect(page.getByRole('heading', { name: `Bonjour, ${AGENT.name}` })).toBeVisible();
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Utilisateurs' }),
    ).toHaveCount(0);
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Système' })).toHaveCount(
      0,
    );
    await page.goto('/users');
    await expect(page.getByTestId('forbidden')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/forbidden-desktop.png`, fullPage: true });
  });
});
