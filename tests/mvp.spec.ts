import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import type { AppState } from '../src/domain/types'

const STORAGE_KEY = 'vcheers-green-hall-booking-state-v4'
const TEST_DATE = '2026-09-05'

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(`${TEST_DATE}T14:30:00+08:00`) })
})

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

async function downloadDailyRows(page: Page) {
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载当日表格' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/2026-09-05.*\.xlsx$/)
  const filePath = await download.path()
  if (!filePath) throw new Error('每日预约表格未保存为可读取的下载文件')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.worksheets[0]
  expect(sheet.columnCount).toBe(6)
  const rows: ExcelJS.CellValue[][] = []
  sheet.eachRow((row) => {
    rows.push(Array.from({ length: 6 }, (_, index) => row.getCell(index + 1).value))
  })
  expect(rows[0]).toEqual(['VC-ID', '姓名', '手机号', '预约日期', '预约时长', '是否到场'])
  return rows.slice(1)
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

test('管理员可设置容量、查看脱敏号码、取消并恢复预约', async ({ page }) => {
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

test('管理员可导入会员名册并查看绑定状态', async ({ page }) => {
  await resetDemo(page, '/admin')
  await loginAdmin(page)
  await page.getByRole('button', { name: '会员名册' }).click()

  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({
    name: '新增会员.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFF会员编号,姓名,手机号,状态\n100999,测试新会员,13500009999,active'),
  })
  await expect(page.getByText('校验通过，可以整批导入。')).toBeVisible()
  await page.getByRole('button', { name: '确认导入' }).click()
  await expect(page.getByText('会员名册已写入当前原型数据层')).toBeVisible()
  const row = page.locator('.member-table-row').filter({ hasText: '100999' })
  await expect(row).toContainText('测试新会员')
  await expect(row).toContainText('待绑定')
})

test('绑定只接受完整六位数字，拒绝字母和长度错误且不截断输入', async ({ page }) => {
  await resetDemo(page, '/member')
  await page.getByRole('button', { name: '微信授权登录' }).click()
  const memberInput = page.getByLabel('会员编号', { exact: true })

  for (const invalidId of ['10000A', '10000', '1000017']) {
    await memberInput.fill(invalidId)
    await expect(memberInput).toHaveValue(invalidId)
    await page.getByRole('button', { name: '确认绑定' }).click()
    await expect(page.getByRole('alert')).toContainText(/6\s*位数字/)
    await expect(page.getByRole('heading', { name: '绑定会员编号' })).toBeVisible()
    await page.getByRole('button', { name: '关闭提示' }).click()
  }

  await memberInput.fill('100001')
  await page.getByRole('button', { name: '确认绑定' }).click()
  await expect(page.getByRole('heading', { name: '共享座位预约' })).toBeVisible()
})

test('导入后可通过用户入口绑定前导零编号，编号保持六位', async ({ page }) => {
  await resetDemo(page, '/admin')
  await loginAdmin(page)
  await page.getByRole('button', { name: '会员名册' }).click()
  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({
    name: '前导零会员.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFF会员编号,姓名,手机号,状态\n001234,前导零测试会员,13500012345,active'),
  })
  await expect(page.getByText('校验通过，可以整批导入。')).toBeVisible()
  await page.getByRole('button', { name: '确认导入' }).click()
  await expect(page.locator('.member-table-row').filter({ hasText: '001234' })).toContainText('待绑定')

  await page.goto('/?view=member')
  await page.getByRole('button', { name: '微信授权登录' }).click()
  await page.getByLabel('会员编号', { exact: true }).fill('001234')
  await page.getByLabel('预留手机号后四位').fill('2345')
  await page.getByRole('button', { name: '确认绑定' }).click()
  await expect(page.locator('.bound-identity-card')).toContainText('001234')
  await expect(page.locator('.bound-identity-card')).toContainText('前导零测试会员')
  await page.reload()
  await expect(page.locator('.bound-identity-card')).toContainText('001234')

  await page.goto('/?view=admin')
  await expect(page.getByRole('heading', { name: '预约管理' })).toBeVisible()
})

test('管理员可补记已结束预约的到场、撤销和取消，下载当日完整表格', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await resetDemo(page, '/admin')
  await loginAdmin(page)
  await page.evaluate(({ key, today }) => {
    const saved = sessionStorage.getItem(key)
    if (!saved) throw new Error('未找到管理员登录后的演示数据')
    const state = JSON.parse(saved) as AppState
    for (const id of ['reservation-mine', 'reservation-demo-1', 'reservation-canceled']) {
      const reservation = state.reservations.find((item) => item.id === id)
      if (!reservation) throw new Error(`找不到用于到场操作测试的预约：${id}`)
      reservation.date = today
      reservation.startHour = 13
      reservation.endHour = 14
      reservation.durationHours = 1
    }
    sessionStorage.setItem(key, JSON.stringify(state))
  }, { key: STORAGE_KEY, today: TEST_DATE })
  await page.reload()

  const row = page.locator('.admin-record-row').filter({ hasText: '杨凯杰' }).filter({
    has: page.getByText('已预约', { exact: true }),
  })
  await expect(row.getByRole('button', { name: '标记到场' })).toBeVisible()
  await expect(row.getByRole('button', { name: '标记到场' })).toBeEnabled()
  await expect(row.getByRole('button', { name: '取消', exact: true })).toBeVisible()

  const layout = await row.evaluate((element) => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    actionBounds: Array.from(element.querySelectorAll<HTMLButtonElement>('.row-actions button')).map((button) => {
      const bounds = button.getBoundingClientRect()
      return { left: bounds.left, right: bounds.right }
    }),
  }))
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.actionBounds.length).toBeGreaterThan(0)
  if (testInfo.project.name.includes('mobile')) {
    for (const bounds of layout.actionBounds) {
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(layout.viewportWidth)
    }
  }

  await row.getByRole('button', { name: '标记到场' }).click()
  const arrivedRow = page.locator('.admin-record-row').filter({ hasText: '杨凯杰' }).filter({
    has: page.getByText('已到场', { exact: true }),
  })
  await expect(arrivedRow).toBeVisible()
  const arrivedRows = await downloadDailyRows(page)
  expect(arrivedRows).toHaveLength(3)
  expect(arrivedRows).toContainEqual(['100001', '杨凯杰', '13800138001', TEST_DATE, 1, '是'])
  expect(arrivedRows).toContainEqual(['100001', '杨凯杰', '13800138001', TEST_DATE, 1, '已取消'])
  expect(arrivedRows.some((values) => values[1] === '周雨桐' && values[5] === '否')).toBe(true)

  await arrivedRow.getByRole('button', { name: '撤销到场' }).click()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '取消', exact: true }).click()
  const cancel = page.getByRole('dialog', { name: '管理员取消预约' })
  await expect(cancel.getByRole('button', { name: '确认取消' })).toBeDisabled()
  await cancel.getByPlaceholder('填写通知预约人的具体原因').fill('补录：当天未到场，取消预约')
  await cancel.getByRole('button', { name: '确认取消' }).click()
  await expect(page.locator('.admin-record-row').filter({ hasText: '补录：当天未到场，取消预约' })).toContainText('已取消')
  await page.reload()
  const canceledRows = await downloadDailyRows(page)
  expect(canceledRows).toHaveLength(3)
  const mine = canceledRows.filter((values) => values[1] === '杨凯杰')
  expect(mine).toHaveLength(2)
  expect(mine.every((values) => values[5] === '已取消')).toBe(true)
  expect(pageErrors).toEqual([])
})
