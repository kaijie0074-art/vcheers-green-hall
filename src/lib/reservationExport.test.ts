import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { createSeedState } from '../domain/seed'
import type { AppState, Reservation } from '../domain/types'
import { buildDailyReservationsWorkbook } from './reservationExport'

const DATE = '2026-09-05'
const HEADERS = ['VC-ID', '姓名', '手机号', '预约日期', '预约时长', '是否到场']

function exportState(): AppState {
  const state = createSeedState('2026-09-05T04:00:00.000Z')
  state.sessions.adminAuthenticated = true
  state.reservations = []
  return state
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'record-1',
    spaceId: 'vcheers-green-hall',
    userId: 'user-kaijie',
    date: DATE,
    startHour: 13,
    endHour: 15,
    durationHours: 2,
    memberNo: '001234',
    name: '测试会员',
    phone: '01380013800',
    status: 'booked',
    privacyAccepted: true,
    idempotencyKey: 'test-reservation',
    createdAt: '2026-09-04T04:00:00.000Z',
    updatedAt: '2026-09-04T04:00:00.000Z',
    ...overrides,
  }
}

async function roundTrip(state: AppState, date = DATE) {
  const workbook = await buildDailyReservationsWorkbook(state, date)
  const bytes = await workbook.xlsx.writeBuffer()
  const reloaded = new ExcelJS.Workbook()
  await reloaded.xlsx.load(bytes)
  return reloaded.getWorksheet('预约记录')!
}

describe('每日预约 Excel 下载', () => {
  it('生成可往返读取的六列表格，保存编号和手机号的文本类型与前导零', async () => {
    const state = exportState()
    state.reservations = [reservation()]
    const sheet = await roundTrip(state)

    expect(sheet.columnCount).toBe(6)
    expect(sheet.rowCount).toBe(2)
    expect(sheet.getRow(1).values).toEqual([undefined, ...HEADERS])
    expect(sheet.getRow(2).values).toEqual([undefined, '001234', '测试会员', '01380013800', DATE, 2, '否'])
    for (const address of ['A2', 'C2', 'D2']) {
      expect(sheet.getCell(address).type).toBe(ExcelJS.ValueType.String)
      expect(sheet.getCell(address).numFmt).toBe('@')
    }
    expect(sheet.getCell('E2').type).toBe(ExcelJS.ValueType.Number)
    expect(sheet.getCell('E2').numFmt).toBe('0" 小时"')
  })

  it('保留全部预约状态，只选择当前空间当天的记录并按时段稳定排序', async () => {
    const state = exportState()
    state.reservations = [
      reservation({ id: 'z-last', memberNo: '000003', startHour: 16, endHour: 18, status: 'canceled' }),
      reservation({ id: 'b-second', memberNo: '000002', status: 'arrived' }),
      reservation({ id: 'a-first', memberNo: '000001' }),
      reservation({ id: 'other-day', date: '2026-09-06' }),
      reservation({ id: 'other-space', spaceId: 'other-space' }),
    ]
    const before = structuredClone(state)
    const sheet = await roundTrip(state)
    expect(sheet.rowCount).toBe(4)
    expect([2, 3, 4].map((row) => sheet.getCell(`A${row}`).value)).toEqual(['000001', '000002', '000003'])
    expect([2, 3, 4].map((row) => sheet.getCell(`F${row}`).value)).toEqual(['否', '是', '已取消'])
    expect(state).toEqual(before)
  })

  it('按预约日期导出，预约创建和到场处理日期不改变归属', async () => {
    const state = exportState()
    state.reservations = [reservation({
      status: 'arrived',
      createdAt: '2026-09-01T04:00:00.000Z',
      arrivedAt: '2026-09-06T04:00:00.000Z',
    })]
    expect((await roundTrip(state)).rowCount).toBe(2)
    expect((await roundTrip(state, '2026-09-06')).rowCount).toBe(1)
  })

  it('公式样式的姓名保持原始字符串，不成为 Excel 公式', async () => {
    const names = ['=HYPERLINK("https://example.com","姓名")', '+SUM(1,2)', '-1+1', '@SUM(1,2)']
    const state = exportState()
    state.reservations = names.map((name, index) => reservation({ id: `row-${index}`, name }))
    const sheet = await roundTrip(state)
    names.forEach((name, index) => {
      const cell = sheet.getCell(`B${index + 2}`)
      expect(cell.value).toBe(name)
      expect(cell.type).toBe(ExcelJS.ValueType.String)
      expect(cell.formula).toBeUndefined()
    })
  })

  it('当天没有预约时仍可导出完整表头', async () => {
    const sheet = await roundTrip(exportState())
    expect(sheet.rowCount).toBe(1)
    expect(sheet.columnCount).toBe(6)
    expect(sheet.getRow(1).values).toEqual([undefined, ...HEADERS])
  })

  it('没有管理员登录会话时拒绝导出', async () => {
    const state = exportState()
    state.sessions.adminAuthenticated = false
    await expect(buildDailyReservationsWorkbook(state, DATE)).rejects.toThrow('请先完成管理员登录')
  })

  it('会话已登录但管理员 ID 缺失或对应普通用户时拒绝导出', async () => {
    const state = exportState()
    state.adminUserId = state.currentUserId
    await expect(buildDailyReservationsWorkbook(state, DATE)).rejects.toThrow('没有管理员权限')
    state.adminUserId = 'unknown-admin'
    await expect(buildDailyReservationsWorkbook(state, DATE)).rejects.toThrow('没有管理员权限')
  })

  it.each(['', '2026-9-05', '2026-02-30', '2026-13-01', '../2026-09-05', '2026-09-05T00:00:00Z'])(
    '拒绝无效日期或路径输入 %s', async (date) => {
      await expect(buildDailyReservationsWorkbook(exportState(), date)).rejects.toThrow('有效的预约日期')
    },
  )
})
