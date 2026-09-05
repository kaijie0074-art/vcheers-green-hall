import type { Workbook } from 'exceljs'
import type { AppState, ReservationStatus } from '../domain/types'

export const DAILY_RESERVATION_HEADERS = ['VC-ID', '姓名', '手机号', '预约日期', '预约时长', '是否到场'] as const

const attendanceLabels: Record<ReservationStatus, string> = {
  booked: '否',
  arrived: '是',
  canceled: '已取消',
}

function validateExport(state: AppState, date: string) {
  if (!state.sessions.adminAuthenticated) throw new Error('请先完成管理员登录')
  if (!state.users.some((user) => user.id === state.adminUserId && user.role === 'admin')) {
    throw new Error('当前账号没有管理员权限')
  }
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('请选择有效的预约日期（YYYY-MM-DD）')
  }
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

export async function buildDailyReservationsWorkbook(state: AppState, date: string): Promise<Workbook> {
  validateExport(state, date)
  const rows = state.reservations
    .filter((reservation) => reservation.spaceId === state.space.id && reservation.date === date)
    .slice()
    .sort((left, right) => left.startHour - right.startHour || compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id))
    .map((reservation) => [
      String(reservation.memberNo),
      String(reservation.name),
      String(reservation.phone),
      reservation.date,
      reservation.durationHours,
      attendanceLabels[reservation.status],
    ])

  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('预约记录', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = DAILY_RESERVATION_HEADERS.map((header, index) => ({
    header,
    width: [14, 20, 18, 16, 14, 14][index],
    style: { numFmt: index === 4 ? '0" 小时"' : '@' },
  }))
  // String values remain text cells, including leading zeros and formula-like names.
  sheet.addRows(rows)
  sheet.getRow(1).font = { bold: true }
  sheet.autoFilter = { from: 'A1', to: `F${sheet.rowCount}` }
  return workbook
}

export async function downloadDailyReservations(state: AppState, date: string): Promise<void> {
  const workbook = await buildDailyReservationsWorkbook(state, date)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `V-cheers预约记录-${date}.xlsx`
  anchor.hidden = true
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    // Give mobile browsers time to consume the download before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
