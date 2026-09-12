import { expect, test, type Page } from '@playwright/test'
import { privacyNotice, spaceRules } from '../src/content/agreements'
import type { AppState } from '../src/domain/types'

const STORAGE_KEY = 'vcheers-green-hall-booking-state-v4'
const privacyLabel = '我已阅读并同意《预约信息使用说明》'
const rulesLabel = '我已阅读并同意《空间使用守则》'

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-12T14:30:00+08:00') })
  await page.goto('/member')
})

async function bind(page: Page) {
  await page.getByRole('button', { name: '微信授权登录', exact: true }).click()
  await page.getByRole('button', { name: '确认绑定', exact: true }).click()
}

async function selectTime(page: Page, hour = 18) {
  await page.getByTestId('date-option-1').click()
  await page.getByTestId(`time-option-${hour}`).click()
}

async function savedState(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), STORAGE_KEY)
}

async function assertLayout(page: Page) {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector('main')!
    const fonts = Array.from(main.querySelectorAll('h1, h2, .primary-button, .wechat-button, .agreement-link, .bound-identity-card strong'))
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    const smallTargets = Array.from(main.querySelectorAll('button, a, .consent-toggle'))
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => element.getBoundingClientRect().height < 44)
      .map((element) => element.textContent)
    return { width: document.documentElement.scrollWidth, viewport: window.innerWidth, fonts, smallTargets }
  })
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport)
  expect(metrics.fonts.every((size) => size >= 16)).toBe(true)
  expect(metrics.smallTargets).toEqual([])
}

test('未登录也可阅读本地完整正文；新 Logo、图标和各页面布局正常', async ({ page }, testInfo) => {
  const logo = page.getByRole('img', { name: 'V cheers', exact: true })
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  const icon = await page.locator('link[rel="icon"]').getAttribute('href')
  expect((await page.request.get(icon!)).ok()).toBe(true)
  await assertLayout(page)
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true })

  await page.getByRole('button', { name: '空间使用守则', exact: true }).click()
  const rules = page.getByRole('dialog', { name: '空间使用守则', exact: true })
  await expect(rules).toContainText(spaceRules.documentTitle)
  await expect(rules.locator('li')).toHaveText([...spaceRules.rules])
  for (const text of [spaceRules.subtitle, ...spaceRules.introduction, ...spaceRules.conclusion, ...spaceRules.contact]) {
    await expect(rules).toContainText(text)
  }
  await expect(rules).toContainText('2026-09-12')
  await page.screenshot({ path: testInfo.outputPath('rules-top.png') })
  await rules.locator('.dialog-body').evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(rules.getByText(spaceRules.contact[1])).toBeInViewport()
  await expect(rules.getByRole('button', { name: '关闭', exact: true })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('rules-bottom.png') })
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '预约信息使用说明', exact: true }).click()
  const privacy = page.getByRole('dialog', { name: '预约信息使用说明', exact: true })
  for (const text of [privacyNotice.introduction, ...privacyNotice.sections.flatMap((section) => [...section.paragraphs])]) {
    await expect(privacy).toContainText(text)
  }
  await privacy.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('button', { name: '微信授权登录', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '微信授权登录', exact: true }).click()
  await assertLayout(page)
  await page.screenshot({ path: testInfo.outputPath('binding.png'), fullPage: true })
  await page.getByRole('button', { name: '确认绑定', exact: true }).click()
  await selectTime(page)
  await assertLayout(page)
  await page.screenshot({ path: testInfo.outputPath('member.png'), fullPage: true })

  await page.goto('/admin')
  await assertLayout(page)
  await page.getByRole('button', { name: '微信管理员登录', exact: true }).click()
  await page.getByRole('button', { name: '后一天', exact: true }).click()
  await assertLayout(page)
  await page.screenshot({ path: testInfo.outputPath('admin.png'), fullPage: true })
  await page.getByRole('button', { name: '会员名册', exact: true }).click()
  await assertLayout(page)
  await page.screenshot({ path: testInfo.outputPath('members.png'), fullPage: true })
})

test('320px 窄屏仍可操作两项确认、关闭正文和管理记录', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await assertLayout(page)
  await bind(page)
  await selectTime(page)
  await assertLayout(page)
  await page.getByRole('button', { name: '《空间使用守则》', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '空间使用守则' })
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport()
  expect(await dialog.locator('.agreement-content').evaluate((element) => getComputedStyle(element).textAlign)).toBe('left')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.goto('/admin')
  await page.getByRole('button', { name: '微信管理员登录', exact: true }).click()
  await page.getByRole('button', { name: '后一天', exact: true }).click()
  await assertLayout(page)
  const actions = await page.locator('.row-actions button').evaluateAll((buttons) => buttons.map((button) => {
    const bounds = button.getBoundingClientRect()
    return bounds.left >= 0 && bounds.right <= window.innerWidth
  }))
  expect(actions.length).toBeGreaterThan(0)
  expect(actions.every(Boolean)).toBe(true)
})

test('两项勾选所有组合、阅读不勾选、焦点与滚动恢复、成功后重新确认', async ({ page }) => {
  await bind(page)
  await selectTime(page)
  const privacy = page.getByRole('checkbox', { name: privacyLabel })
  const rules = page.getByRole('checkbox', { name: rulesLabel })
  const submit = page.getByRole('button', { name: '确认预约', exact: true })
  await expect(privacy).not.toBeChecked()
  await expect(rules).not.toBeChecked()
  await expect(submit).toBeDisabled()

  for (const title of ['预约信息使用说明', '空间使用守则']) {
    const link = page.getByRole('button', { name: `《${title}》`, exact: true })
    await link.scrollIntoViewIfNeeded()
    const scrollBefore = await page.evaluate(() => window.scrollY)
    await link.click()
    const dialog = page.getByRole('dialog', { name: title, exact: true })
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
    // Keyboard users can focus and scroll the document, then return to Close.
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('document')).toBeFocused()
    await page.keyboard.press('PageDown')
    await expect.poll(() => dialog.getByRole('document').evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
    // Reading to the bottom is never required.
    await page.keyboard.press('Escape')
    await expect(link).toBeFocused()
    expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore)).toBeLessThanOrEqual(1)
    await expect(privacy).not.toBeChecked()
    await expect(rules).not.toBeChecked()
  }
  await privacy.check()
  await expect(submit).toBeDisabled()
  await privacy.uncheck()
  await rules.check()
  await expect(submit).toBeDisabled()
  await privacy.check()
  await expect(submit).toBeEnabled()
  await page.getByRole('button', { name: '《空间使用守则》', exact: true }).click()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(privacy).toBeChecked()
  await expect(rules).toBeChecked()
  await submit.click()
  await expect(page.getByRole('dialog', { name: '预约成功' })).toBeVisible()
  const record = (await savedState(page)).reservations[0]
  expect(record.privacyConsent).toEqual({ version: '2026-09-12', acceptedAt: record.createdAt })
  expect(record.rulesConsent).toEqual({ version: '2026-09-12', acceptedAt: record.createdAt })
  await page.getByRole('button', { name: '查看我的预约' }).click()
  await expect(privacy).not.toBeChecked()
  await expect(rules).not.toBeChecked()
  await expect(submit).toBeDisabled()
  await page.reload()
  expect((await savedState(page)).reservations[0]).toEqual(record)
  await expect(privacy).not.toBeChecked()
  await expect(rules).not.toBeChecked()
})

test('预约冲突和保存失败都保留勾选与时段，不生成预约或确认记录', async ({ page }) => {
  await bind(page)
  await selectTime(page, 17) // The seeded member already holds tomorrow 16–18.
  const before = await savedState(page)
  const privacy = page.getByRole('checkbox', { name: privacyLabel })
  const rules = page.getByRole('checkbox', { name: rulesLabel })
  await privacy.check()
  await rules.check()
  await page.getByRole('button', { name: '确认预约', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('已有预约')
  await expect(privacy).toBeChecked()
  await expect(rules).toBeChecked()
  await expect(page.getByTestId('time-option-17')).toHaveAttribute('aria-pressed', 'true')
  expect(await savedState(page)).toEqual(before)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await page.getByTestId('time-option-18').click()
  await page.getByTestId('duration-2').click()
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
  })
  await page.getByRole('button', { name: '确认预约', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('无法保存本次会话数据')
  await expect(privacy).toBeChecked()
  await expect(rules).toBeChecked()
  await expect(page.getByTestId('time-option-18')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('duration-2')).toHaveAttribute('aria-pressed', 'true')
  expect(await savedState(page)).toEqual(before)
})

test('旧 v4 会话继续使用：绑定、预约和操作日志不变，也不追认两份新正文', async ({ page }) => {
  await bind(page)
  const before = await savedState(page)
  expect(before.auditLogs.length).toBeGreaterThan(0)
  expect(before.members.some((member) => member.boundUserId === before.currentUserId)).toBe(true)
  expect(before.reservations.every((record) => !record.privacyConsent && !record.rulesConsent)).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '共享座位预约' })).toBeVisible()
  expect(await savedState(page)).toEqual(before)
  await selectTime(page)
  await page.getByRole('checkbox', { name: privacyLabel }).check()
  await page.getByRole('checkbox', { name: rulesLabel }).check()
  await page.getByRole('button', { name: '确认预约', exact: true }).click()
  const after = await savedState(page)
  expect(after.reservations.slice(1)).toEqual(before.reservations)
  expect(after.members).toEqual(before.members)
  expect(after.auditLogs.slice(1)).toEqual(before.auditLogs)
})
