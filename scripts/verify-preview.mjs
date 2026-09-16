// Exercises a built preview (including GitHub Pages subpaths) in isolated demo
// browser sessions only. Usage: node scripts/verify-preview.mjs https://.../path/
import { chromium, expect } from '@playwright/test'
import ExcelJS from 'exceljs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (!process.argv[2]) throw new Error('Provide the preview root URL, including its trailing /')
const root = new URL(process.argv[2])
const output = await mkdtemp(join(tmpdir(), 'vcheers-preview-'))
const browser = await chromium.launch({ args: ['--no-proxy-server'] })
const results = []
try {
  for (const [name, width] of [['mobile', 390], ['desktop', 1280]]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: name === 'mobile', hasTouch: name === 'mobile' })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
    page.on('requestfailed', (request) => errors.push(`${request.failure()?.errorText} ${request.url()}`))
    await page.clock.install({ time: new Date('2026-09-12T14:30:00+08:00') })
    const entry = new URL(root)
    entry.search = `view=member&verify=${Date.now()}`
    await page.goto(entry.href, { waitUntil: 'networkidle', timeout: 60000 })
    await expect(page.getByRole('navigation', { name: '角色视图' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '管理端', exact: true })).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'V cheers', exact: true })).toBeVisible()
    const resources = await page.evaluate(async () => {
      const logo = document.querySelector('.brand-logo')
      const favicon = document.querySelector('link[rel="icon"]')
      return {
        logo: logo.src,
        logoLoaded: logo.complete && logo.naturalWidth > 0,
        favicon: favicon.href,
        faviconLoaded: (await fetch(favicon.href)).ok,
      }
    })
    expect(resources.logoLoaded && resources.faviconLoaded).toBe(true)
    expect(new URL(resources.logo).pathname.startsWith(root.pathname)).toBe(true)
    expect(new URL(resources.favicon).pathname.startsWith(root.pathname)).toBe(true)
    await page.getByRole('button', { name: '空间使用守则', exact: true }).click()
    const rulesDialog = page.getByRole('dialog', { name: '空间使用守则', exact: true })
    await expect(rulesDialog).toContainText('2026-09-12')
    await expect(rulesDialog.locator('li')).toHaveCount(9)
    await rulesDialog.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '微信授权登录', exact: true }).click()
    await page.getByLabel('会员编号', { exact: true }).fill('随便体验')
    await page.getByLabel('预留手机号后四位').fill('any-input')
    await page.getByRole('button', { name: '确认绑定', exact: true }).click()
    await page.getByTestId('date-option-1').click()
    await page.getByTestId('time-option-18').click()
    await page.getByTestId('duration-2').click()
    const submit = page.getByRole('button', { name: '确认预约', exact: true })
    await expect(submit).toBeDisabled()
    await page.getByRole('checkbox', { name: '我已阅读并同意《预约信息使用说明》' }).check()
    await expect(submit).toBeDisabled()
    await page.getByRole('checkbox', { name: '我已阅读并同意《空间使用守则》' }).check()
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: join(output, `${name}-member.png`), fullPage: true })
    await submit.click()
    await expect(page.getByRole('dialog', { name: '预约成功', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '查看我的预约', exact: true }).click()
    const created = await page.evaluate(() => JSON.parse(sessionStorage.getItem('vcheers-green-hall-booking-state-v4')).reservations[0])
    expect(created.privacyConsent.version).toBe('2026-09-12')
    expect(created.rulesConsent.version).toBe('2026-09-12')
    for (const checkbox of await page.getByRole('checkbox').all()) await expect(checkbox).not.toBeChecked()

    const adminEntry = new URL(root)
    adminEntry.search = `view=admin&verify=${Date.now()}`
    await page.goto(adminEntry.href, { waitUntil: 'networkidle', timeout: 60000 })
    expect(new URL(page.url()).pathname).toBe(root.pathname)
    await page.getByRole('button', { name: '微信管理员登录', exact: true }).click()
    await expect(page.getByRole('link', { name: '用户端', exact: true })).toHaveCount(0)
    await page.getByTestId('admin-date-input').fill(created.date)
    const row = page.locator('.admin-record-row').filter({ hasText: '18:00–20:00' })
    await expect(row).toContainText('100001')
    // Advance this isolated demo clock to the reservation day for arrival.
    await page.clock.setSystemTime(new Date('2026-09-13T14:30:00+08:00'))
    await page.clock.fastForward(16000)
    await row.getByRole('button', { name: '标记到场', exact: true }).click()
    await expect(row).toContainText('已到场')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: join(output, `${name}-admin.png`), fullPage: true })

    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载当日表格', exact: true }).click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe('V-cheers预约记录-2026-09-13.xlsx')
    const file = join(output, `${name}-daily.xlsx`)
    await download.saveAs(file)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(file)
    const sheet = workbook.worksheets[0]
    expect(sheet.columnCount).toBe(6)
    expect(sheet.getRow(1).values.slice(1)).toEqual(['VC-ID', '姓名', '手机号', '预约日期', '预约时长', '是否到场'])
    const rows = []
    sheet.eachRow((entry, index) => { if (index > 1) rows.push(entry.values.slice(1)) })
    expect(rows).toContainEqual(['100001', created.name, created.phone, created.date, 2, '是'])
    await row.getByRole('button', { name: '撤销到场', exact: true }).click()
    await row.getByRole('button', { name: '取消', exact: true }).click()
    const cancel = page.getByRole('dialog', { name: '管理员取消预约', exact: true })
    await cancel.getByRole('textbox').fill('预览自动验证')
    await cancel.getByRole('button', { name: '确认取消', exact: true }).click()
    await expect(row).toContainText('已取消')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(errors).toEqual([])
    results.push({ viewport: name, resourceBase: root.pathname, booking: 'passed', consent: 'passed', arrivalAndCancel: 'passed', excelColumns: sheet.columnCount, errors })
    await context.close()
  }
  console.log(JSON.stringify({ url: root.href, results, artifacts: output }, null, 2))
} finally {
  await browser.close()
}
