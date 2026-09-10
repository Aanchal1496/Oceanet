import { expect, test, type Page } from '@playwright/test'

const dates = ['20260701', '20260702', '20260703']
const observations = [
  { depth_m: 5, pressure_dbar: 5.1, temperature: 28.2, model_temp: 28.5, delta: .3, nearest_grid_lat: 10, nearest_grid_lon: 70, distance_km: 12.4, timestamp: '2026-07-01T10:00:00Z', date: '20260701' },
  { depth_m: 50, pressure_dbar: 50.2, temperature: 23.9, model_temp: 24.7, delta: .8, nearest_grid_lat: 10, nearest_grid_lon: 70, distance_km: 12.4, timestamp: '2026-07-01T10:00:00Z', date: '20260701' },
]
const floats = {
  day: 1,
  date: dates[0],
  float_count: 3,
  floats: [
    { id: '290001', lat: 10, lon: 70, first_seen: dates[0], last_seen: dates[2], record_count: 2, source: 'argo', status: 'active', observations },
    { id: '290002', lat: -4, lon: 82, first_seen: dates[0], last_seen: dates[2], record_count: 2, source: 'argo', status: 'active', observations: observations.map((item) => ({ ...item, delta: 1.2 })) },
    { id: '290003', lat: -18, lon: 96, first_seen: dates[0], last_seen: dates[2], record_count: 2, source: 'argo', status: 'inactive', observations: observations.map((item) => ({ ...item, delta: .15 })) },
  ],
}
const currents = Array.from({ length: 42 }, (_, index) => ({
  lat: -20 + Math.floor(index / 7) * 8,
  lon: 44 + (index % 7) * 10,
  u: .2 + (index % 3) * .04,
  v: -.08 + (index % 4) * .05,
  speed: .25 + (index % 5) * .08,
  direction: 35 + (index * 17) % 320,
  source: 'synthetic-demo',
}))

async function mockApi(page: Page, options: { currentsFail?: boolean } = {}) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/api/dates') return route.fulfill({ json: { dates } })
    if (path === '/api/depths') return route.fulfill({ json: { day: 1, date: dates[0], depths: [{ depth_index: 0, depth_m: 5 }, { depth_index: 1, depth_m: 50 }] } })
    if (path === '/api/grid') return route.fulfill({ json: [
      { lat: -20, lon: 45, depth: 5, value: 27.2 }, { lat: -20, lon: 100, depth: 5, value: 26.1 },
      { lat: 20, lon: 45, depth: 5, value: 28.4 }, { lat: 20, lon: 100, depth: 5, value: 29.1 },
    ] })
    if (path === '/api/floats/290001/history') return route.fulfill({ json: floats.floats[0] })
    if (path === '/api/floats') return route.fulfill({ json: floats })
    if (path === '/api/currents') {
      if (options.currentsFail) return route.fulfill({ status: 503, json: { detail: 'Current source delayed' } })
      return route.fulfill({ json: { day: 1, date: dates[0], source: 'synthetic-demo', units: 'm/s', currents } })
    }
    if (path === '/api/data-status') return route.fulfill({ json: { last_updated: '2026-07-01T10:00:00Z', status: 'ok' } })
    return route.fulfill({ status: 404, json: { detail: 'Not mocked' } })
  })
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok', db_exists: true } }))
  const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+OtZ3AAAAAElFTkSuQmCC', 'base64')
  await page.route(/(arcgisonline\.com|tile\.openstreetmap\.org)/, (route) => route.fulfill({ contentType: 'image/png', body: transparentPng }))
}

function watchRuntime(page: Page) {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('Failed to load resource') && /(fonts\.googleapis|fonts\.gstatic)/.test(text)) return
    failures.push(text)
  })
  return failures
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1)
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('home renders live API data and primary CTA navigates', async ({ page }) => {
  const failures = watchRuntime(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Ocean intelligence/i })).toBeVisible()
  await expect(page.getByText('Ocean service connected')).toBeVisible()
  await expect(page.getByTestId('home-map-preview')).toBeVisible()
  await page.getByRole('button', { name: 'Current vectors' }).click()
  await expect(page.getByText('Source: synthetic-demo')).toBeVisible()
  await page.getByRole('link', { name: /Open ocean console/i }).click()
  await expect(page).toHaveURL(/\/console$/)
  await expect(page.getByTestId('ocean-console')).toBeVisible()
  expect(failures).toEqual([])
})

test('desktop navigation exposes active state and report route', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/console')
  const active = page.getByRole('link', { name: 'Ocean Console' })
  await expect(active).toHaveClass(/is-active/)
  await page.getByRole('link', { name: 'Validation Report' }).click()
  await expect(page.getByRole('heading', { name: /Model accuracy and in-situ benchmark/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Validation Report' })).toHaveClass(/is-active/)
})

test('mobile drawer traps the shell, closes with Escape and navigates cleanly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/console')
  const menu = page.getByRole('button', { name: 'Open navigation' })
  await menu.click()
  await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0)
  await menu.click()
  await page.getByRole('dialog').getByRole('link', { name: 'Validation Report' }).click()
  await expect(page).toHaveURL(/\/report$/)
  await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0)
  await expectNoOverflow(page)
})

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'narrow', width: 360, height: 800 },
]) {
  test(`layout has no document overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    for (const path of ['/', '/console', '/report']) {
      await page.goto(path)
      await expect(page.locator('main').first()).toBeVisible()
      await expectNoOverflow(page)
    }
  })
}

test('dashboard map controls and current provenance work', async ({ page }) => {
  const failures = watchRuntime(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/console$/)
  await expect(page.getByTestId('layer-map')).toBeVisible()
  await page.getByRole('button', { name: /3D Earth View/i }).click()
  await expect(page.getByTestId('earth-map')).toBeVisible()
  await page.getByRole('button', { name: 'Show currents layer' }).click()
  await expect(page.getByTestId('current-inspector')).toContainText('Model demo field')
  await expect(page.getByTestId('current-inspector')).toContainText('not a live observed current')
  expect(failures).toEqual([])
})

test('current layer failure stays partial and retryable', async ({ page }) => {
  await page.unroute('**/api/**')
  await mockApi(page, { currentsFail: true })
  await page.goto('/console')
  await page.getByRole('button', { name: /3D Earth View/i }).click()
  await page.getByRole('button', { name: 'Show currents layer' }).click()
  await expect(page.getByTestId('current-inspector')).toContainText('Current vectors are unavailable')
  await expect(page.getByTestId('earth-map')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry source' })).toBeVisible()
})

test('report controls and float profile remain functional', async ({ page }) => {
  await page.goto('/report')
  await expect(page.getByLabel('Report model day')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export report as PDF' })).toBeVisible()
  await page.getByText('290001', { exact: true }).last().click()
  await expect(page).toHaveURL(/\/float\/290001$/)
  await expect(page.getByRole('heading', { name: 'Float 290001' })).toBeVisible()
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  expect(await canvas.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))).toEqual(expect.objectContaining({ height: 100 }))
})

test('keyboard focus is visible on major shell controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/console')
  // The console route is code-split, so the shell only exists after the chunk
  // mounts. Wait for it, otherwise the first Tab press lands on the empty
  // Suspense fallback and focus has nowhere to move.
  await expect(page.getByTestId('ocean-console')).toBeVisible()
  await page.evaluate(() => {
    document.body.tabIndex = -1
    document.body.focus()
  })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused()
  const outline = await page.getByRole('button', { name: 'Open navigation' }).evaluate((element) => getComputedStyle(element).outlineStyle)
  expect(outline).not.toBe('none')
})
