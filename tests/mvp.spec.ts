import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'vcheers-green-hall-booking-state-v4'

async function resetDemo(page: Page, path: '/member' | '/admin') {
  await page.goto(path)
  await page.evaluate((key) => sessionStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
}

async function loginAndBindMember(page: Page) {
  await page.getByRole('button', { name: '微信授权登录' }).click()
  await expect(page.getByRole('heading', { name: '绑定会员编号' })).toBeVisible()
  await page.getByRole('button', { name: '确认绑定' }).click()
  await expect(page.getByRole('heading', { name: '共享座位预约' })).toBeVisible()
}

async function loginAdmin(page: Page) {
  await page.getByRole('button', { name: '微信管理员登录' }).click()
  await expect(page.getByRole('heading', { name: '预约管理' })).toBeVisible()
}

test('用户可选择连续时段、即时预约并在开始前取消', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await resetDemo(page, '/member')
  await loginAndBindMember(page)

  await page.getByTestId('date-option-1').click()
  await page.getByTestId('time-option-18').click()
  await page.getByTestId('duration-2').click()
  await expect(page.getByText('18:00—20:00 · 2 小时')).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: '确认预约' }).click()

  const success = page.getByRole('dialog', { name: '预约成功' })
  await expect(success).toContainText('座位已为你保留')
  await expect(success).toContainText('18:00–20:00')
  await success.getByRole('button', { name: '查看我的预约' }).click()

  const created = page.locator('.reservation-card').filter({ hasText: '18:00–20:00' })
  await expect(created.getByText('已预约', { exact: true })).toBeVisible()
  await expect(page.getByTestId('time-option-18')).toContainText('剩 4 座')

  await created.getByRole('button', { name: '取消预约' }).click()
  const cancel = page.getByRole('dialog', { name: '确认取消预约' })
  await cancel.getByRole('button', { name: '确认取消' }).click()
  await expect(created.getByText('已取消', { exact: true })).toBeVisible()
  await expect(page.getByTestId('time-option-18')).toContainText('剩 5 座')
  expect(pageErrors).toEqual([])
})

test('无名额日期不可选择时段', async ({ page }) => {
  await resetDemo(page, '/member')
  await loginAndBindMember(page)
  await page.getByTestId('date-option-2').click()
  await expect(page.getByTestId('time-option-13')).toBeDisabled()
  await expect(page.getByTestId('time-option-13')).toContainText('已约满')
  await expect(page.getByRole('button', { name: '确认预约' })).toBeDisabled()
})

test('管理员可设置容量、查看脱敏号码、取消并恢复预约', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), '管理端完整表格闭环由桌面视口验证')
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await resetDemo(page, '/admin')
  await loginAdmin(page)

  const capacityInput = page.getByLabel('设置当天容量')
  await capacityInput.fill('12')
  await page.getByRole('button', { name: '保存容量设置' }).click()
  await expect(page.locator('.capacity-metrics article').first()).toContainText('12')
  await page.reload()
  await expect(page.locator('.capacity-metrics article').first()).toContainText('12')

  await page.getByRole('button', { name: '后一天' }).click()
  const row = page.locator('.admin-record-row').filter({ hasText: '杨凯杰' })
  await expect(row).toContainText('138****8001')
  await row.getByRole('button', { name: '查看' }).click()
  await expect(row).toContainText('13800138001')

  await row.getByRole('button', { name: '取消', exact: true }).click()
  const cancel = page.getByRole('dialog', { name: '管理员取消预约' })
  await cancel.getByPlaceholder('填写通知预约人的具体原因').fill('绿厅临时维护')
  await cancel.getByRole('button', { name: '确认取消' }).click()
  await expect(row.getByText('已取消', { exact: true })).toBeVisible()
  await expect(row).toContainText('原因：绿厅临时维护')

  await row.getByRole('button', { name: '恢复' }).click()
  await expect(row.getByText('已预约', { exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('移动端无页面级横向溢出且正文和主操作字号可读', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), '仅在移动视口执行')
  await resetDemo(page, '/member')
  await loginAndBindMember(page)

  const metrics = await page.evaluate(() => {
    const fontSize = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`找不到用于字号检查的元素：${selector}`)
      return Number.parseFloat(getComputedStyle(element).fontSize)
    }
    return {
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      bodyTextSize: fontSize('.venue-facts dd'),
      identityTextSize: fontSize('.bound-identity-card strong'),
      actionTextSize: fontSize('.booking-form-card .primary-button'),
    }
  })

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.bodyTextSize).toBeGreaterThanOrEqual(16)
  expect(metrics.identityTextSize).toBeGreaterThanOrEqual(16)
  expect(metrics.actionTextSize).toBeGreaterThanOrEqual(16)
})

test('管理员可导入会员名册并查看绑定状态', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), '管理端导入闭环由桌面视口验证')
  await resetDemo(page, '/admin')
  await loginAdmin(page)
  await page.getByRole('button', { name: '会员名册' }).click()

  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({
    name: '新增会员.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFF会员编号,姓名,手机号,状态\nVC2026090999,测试新会员,13500009999,active'),
  })
  await expect(page.getByText('校验通过，可以整批导入。')).toBeVisible()
  await page.getByRole('button', { name: '确认导入' }).click()
  await expect(page.getByText('会员名册已写入当前原型数据层')).toBeVisible()
  const row = page.locator('.member-table-row').filter({ hasText: 'VC2026090999' })
  await expect(row).toContainText('测试新会员')
  await expect(row).toContainText('待绑定')
})
