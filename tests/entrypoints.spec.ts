import { expect, test, type Page } from '@playwright/test'

async function expectSeparateEntry(page: Page, forbiddenView: string) {
  await expect(page.getByRole('navigation', { name: '角色视图' })).toHaveCount(0)
  await expect(page.locator(`a[href*="${forbiddenView}"]`)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

for (const entry of ['/', '/member', '/?view=member']) {
  test(`用户独立入口 ${entry} 在登录、绑定、预约和退出时都没有管理入口`, async ({ page }) => {
    await page.goto(entry)
    await expect(page.getByRole('button', { name: '微信授权登录', exact: true })).toBeVisible()
    await expectSeparateEntry(page, 'admin')
    await page.getByRole('button', { name: '微信授权登录', exact: true }).click()
    await expectSeparateEntry(page, 'admin')
    await page.getByLabel('会员编号', { exact: true }).fill('随便体验')
    await page.getByRole('button', { name: '确认绑定', exact: true }).click()
    await expect(page.getByRole('heading', { name: '共享座位预约' })).toBeVisible()
    await expectSeparateEntry(page, 'admin')
    await page.reload()
    await expectSeparateEntry(page, 'admin')
    await page.getByRole('button', { name: '退出用户登录', exact: true }).click()
    await expect(page.getByRole('button', { name: '微信授权登录', exact: true })).toBeVisible()
    await expectSeparateEntry(page, 'admin')
  })
}

for (const entry of ['/admin', '/?view=admin']) {
  test(`管理独立入口 ${entry} 保留演示登录，没有用户端跳转`, async ({ page }) => {
    await page.goto(entry)
    await expect(page.getByRole('button', { name: '微信管理员登录', exact: true })).toBeVisible()
    await expectSeparateEntry(page, 'member')
    await page.getByRole('button', { name: '微信管理员登录', exact: true }).click()
    await expect(page.getByRole('heading', { name: '预约管理' })).toBeVisible()
    await expectSeparateEntry(page, 'member')
    await page.getByRole('button', { name: '会员名册', exact: true }).click()
    await expectSeparateEntry(page, 'member')
    await page.reload()
    await expect(page.getByRole('heading', { name: '预约管理' })).toBeVisible()
    await page.getByRole('button', { name: '退出管理员登录', exact: true }).click()
    await expectSeparateEntry(page, 'member')
  })
}
