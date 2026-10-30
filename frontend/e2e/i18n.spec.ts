import { expect, test, type Page } from '@playwright/test'

/**
 * Language smoke test: every route, in English and Marathi, with the main
 * interactive panels opened, checked for
 *  - missing dictionary keys (the app logs "[i18n] missing key" in dev),
 *  - English UI text left in the Marathi interface, and
 *  - Indic script left in the English interface.
 *
 * Data is real (live backend); auth is stubbed, by seeding a token and
 * answering /auth/me, and so are the LLM endpoints — a full run would
 * otherwise spend a free-tier daily token quota in minutes. Text inside [translate="no"] is skipped: that is the
 * markup for data that must not be translated — scientific names, IDs,
 * DNA sequences, people's names, licence codes.
 */

const ROUTES = [
  '/',
  '/login',
  '/dashboard',
  '/ocean',
  '/weather',
  '/species',
  '/fisheries',
  '/molecular',
  '/correlation',
  '/alerts',
  '/chat',
  '/admin',
  '/settings',
] as const

/**
 * Latin-script tokens that legitimately stay as they are in Marathi:
 * organisation and dataset names, standard scientific abbreviations and
 * symbols, and statistic names that are conventionally written in English.
 * Deliberately specific — a general English word here would hide a gap.
 */
const ALLOWED_LATIN = new Set(
  [
    'OASIS', 'NL', 'SST', 'DNA', 'eDNA', 'RAMA', 'ERA5', 'NOAA', 'FAO', 'GBIF', 'OBIS', 'BOLD', 'Systems',
    'Sea', 'Around', 'Us', 'Open-Meteo', 'Global', 'Capture', 'Production', 'HAB', 'EEZ', 'Pearson', 'Spearman',
    'LLM', 'AI', 'API', 'UV', 'BIN', 'COI-5P', 'rbcL', 'FASTA', 'BLAST', 'Engine', 'ID', 'E-value', 'indels',
    'mer', 'p-value', 'CC', 'BY', 'NC', 'SA', 'mg', 'hPa', 'PSU', 'x', 'p', 'r', 'XY', 'X', 'Y', 'alignment',
    'median', 'oil', 'sardine', 'catch_history', 'name@gmail.com', 'ρ', 'BY-NC-SA',
  ].map((w) => w.toLowerCase()),
)

/** Answer the LLM-backed endpoints locally: the species panel gets numbers
 *  without a model-written explanation, and recommendation and chat behave
 *  as if the model were unavailable (which exercises the translated error). */
async function stubLlm(page: Page) {
  await page.route('**/api/species/*/context*', (route) =>
    route.fulfill({
      json: {
        n_occurrences: 120,
        sst_c: { mean: 28.4, min: 26.1, max: 30.2 },
        salinity_psu_mean: 34.9,
        seabed_depth_m_mean: 85,
        explanation: null,
      },
    }),
  )
  await page.route('**/api/analytics/recommendation/**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'LLM stubbed in e2e' } }),
  )
  await page.route('**/api/agent/chat', (route) =>
    route.fulfill({ status: 503, json: { detail: 'LLM stubbed in e2e' } }),
  )
}

async function signIn(page: Page, language: string, role = 'admin') {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      json: {
        user_id: 'e2e',
        email: 'e2e@example.org',
        full_name: 'E2E Tester',
        role,
        institution: null,
        created_at: '2026-01-15T00:00:00Z',
      },
    }),
  )
  await stubLlm(page)
  // Seed once per tab: a later reload must see whatever the app itself
  // persisted (that is what the persistence test checks).
  await page.addInitScript((lang) => {
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    localStorage.setItem('oasis-auth', JSON.stringify({ state: { accessToken: 'e2e', refreshToken: null }, version: 0 }))
    localStorage.setItem('oasis-locale', JSON.stringify({ state: { language: lang, explicit: true }, version: 0 }))
  }, language)
}

/** Visible UI text, minus [translate="no"] data and map tiles/attribution.
 *  Model-written text is returned with species binomials and parenthesised
 *  asides removed: the model is told to keep scientific names as given and
 *  often adds the English common name in brackets, which is correct. */
async function uiText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const generated = (el: Element | null) => el?.closest('[data-generated]') !== null
    const skip = (el: Element | null) =>
      !el ||
      el.closest('[translate="no"], script, style, .leaflet-control-attribution, .leaflet-tile-pane, .recharts-xAxis') !==
        null
    const out: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let text = n.textContent?.trim()
      if (text && generated(n.parentElement)) {
        text = text.replace(/\b[A-Z][a-z]+ [a-z]{3,}\b/g, '').replace(/\([^)]*\)/g, '').replace(/`[^`]*`/g, '')
      }
      if (text && !skip(n.parentElement)) out.push(text)
    }
    // Attribute text a user sees: placeholders, tooltips, option labels.
    for (const el of document.querySelectorAll('[placeholder], [title], [aria-label]')) {
      if (skip(el)) continue
      for (const attr of ['placeholder', 'title', 'aria-label']) {
        const v = el.getAttribute(attr)?.trim()
        if (v) out.push(v)
      }
    }
    return out
  })
}

function englishLeftovers(texts: string[]): string[] {
  const bad = new Set<string>()
  for (const raw of texts) {
    const text = raw
      // RAMA buoy names are position codes (4n67e = 4°N 67°E), i.e. data.
      .replace(/\b\d+(\.\d+)?[ns]\d+(\.\d+)?e\b/g, '')
      // Scientific notation (p = 6.6e-5) is the same in every language.
      .replace(/\d(\.\d+)?e[-+]?\d+/gi, '')
    // Words of 2+ Latin letters (keeps hyphenated tokens whole).
    for (const word of text.match(/[A-Za-z][A-Za-z0-9@._-]*[A-Za-z0-9]/g) ?? []) {
      if (!ALLOWED_LATIN.has(word.toLowerCase())) bad.add(`${word}  ←  "${text.slice(0, 90)}"`)
    }
  }
  return [...bad]
}

function indicLeftovers(texts: string[]): string[] {
  // Devanagari through Malayalam: every script the UI languages use.
  return texts.filter((t) => /[ऀ-෿]/.test(t)).map((t) => t.slice(0, 90))
}

/** Open the panels that only render after interaction. */
async function exercise(page: Page, route: string) {
  if (route === '/species') {
    await page.locator('aside ul button').first().click()
    await page.waitForTimeout(2500)
  }
  if (route === '/fisheries') {
    const speciesSelect = page.locator('main select').nth(3)
    const value = await speciesSelect.locator('option').nth(1).getAttribute('value')
    if (value) await speciesSelect.selectOption(value)
    await page.waitForTimeout(2500)
  }
  if (route === '/molecular') {
    await page.locator('details summary').click()
    // The "Surprise me" button sits directly under the examples list; found
    // by position so the test does not depend on its label in each language.
    await page.locator('details').locator('xpath=following::button[1]').click()
    await page.waitForTimeout(3000)
  }
  if (route === '/ocean') {
    await page.locator('main aside select').first().selectOption('coastal-anchor')
    await page.waitForTimeout(1500)
    const marker = page.locator('.leaflet-marker-icon span[title]').first()
    if (await marker.count()) {
      await marker.click({ force: true })
      await page.locator('.leaflet-popup button').first().click()
      await page.waitForTimeout(3000)
    }
  }
}

for (const language of ['en', 'mr', 'ml', 'gu', 'kn', 'ta', 'te', 'or', 'bn'] as const) {
  test.describe(`UI in ${language}`, () => {
    for (const route of ROUTES) {
      test(`${route}`, async ({ page }) => {
        const missingKeys: string[] = []
        const pageErrors: string[] = []
        page.on('console', (msg) => {
          if (msg.text().includes('[i18n] missing key')) missingKeys.push(msg.text())
        })
        page.on('pageerror', (err) => pageErrors.push(err.message))

        await signIn(page, language)
        await page.goto(route)
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
        await page.waitForTimeout(1500)
        await exercise(page, route)

        expect(await page.evaluate(() => document.documentElement.lang)).toBe(language)
        const texts = await uiText(page)
        expect(texts.length, 'page rendered some text').toBeGreaterThan(5)

        expect(missingKeys, 'missing translation keys').toEqual([])
        expect(pageErrors, 'uncaught page errors').toEqual([])
        if (language !== 'en') {
          expect(englishLeftovers(texts), `English text in the ${language} UI`).toEqual([])
        } else {
          expect(indicLeftovers(texts), 'Indic script in the English UI').toEqual([])
        }
      })
    }
  })
}

test('language persists across reload and navigation, and switching is instant', async ({ page }) => {
  await signIn(page, 'en')
  await page.goto('/correlation')
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  const selectedBefore = await page.locator('main select').first().inputValue()
  const pearsonBefore = await page.locator('text=/^-?0\\.\\d{3}$/').first().textContent()

  // Switch without reloading: the page re-renders in Marathi immediately.
  await page.locator('select[translate="no"]').selectOption('mr')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('सहसंबंध स्टुडिओ')
  // Same variable selected, same coefficient — language never touches data.
  expect(await page.locator('main select').first().inputValue()).toBe(selectedBefore)
  expect(await page.locator('text=/^-?0\\.\\d{3}$/').first().textContent()).toBe(pearsonBefore)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('सहसंबंध स्टुडिओ')
  await page.getByRole('link', { name: 'हवामान' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('हवामान')
})

test('the admin page is hidden from non-admins', async ({ page }) => {
  await signIn(page, 'en', 'researcher')
  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Admin / Data Status' })).toHaveCount(0)
  // Typing the address directly lands on the dashboard instead.
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/dashboard$/)
})
