const SHANGHAI_TIMEZONE = 'Asia/Shanghai'

function partsFor(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('时间无效')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day') }
}

export function shanghaiDateKey(value: string | Date = new Date()) {
  const { year, month, day } = partsFor(value)
  return `${year}-${month}-${day}`
}

export function addDays(dateKey: string, offset: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new Error('日期格式无效')
  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + offset, 12))
  return date.toISOString().slice(0, 10)
}

export function bookingDateKeys(now: string | Date, count = 7) {
  const today = shanghaiDateKey(now)
  return Array.from({ length: count }, (_, index) => addDays(today, index))
}

export function adminDateBounds(now: string | Date) {
  const today = shanghaiDateKey(now)
  return { min: addDays(today, -30), max: addDays(today, 6), today }
}

export function slotTimestamp(dateKey: string, hour: number) {
  const paddedHour = String(hour).padStart(2, '0')
  const value = Date.parse(`${dateKey}T${paddedHour}:00:00+08:00`)
  if (!Number.isFinite(value)) throw new Error('预约时间无效')
  return value
}

export function isPastOrStarted(dateKey: string, hour: number, now: string | Date) {
  const current = now instanceof Date ? now.getTime() : Date.parse(now)
  return slotTimestamp(dateKey, hour) <= current
}

export function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`
}

export function formatDateLabel(dateKey: string, now: string | Date) {
  const today = shanghaiDateKey(now)
  const tomorrow = addDays(today, 1)
  const date = new Date(`${dateKey}T12:00:00+08:00`)
  const weekday = new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIMEZONE,
    weekday: 'short',
  }).format(date)
  return {
    eyebrow: dateKey === today ? '今天' : dateKey === tomorrow ? '明天' : weekday,
    date: dateKey.slice(5).replace('-', '/'),
  }
}

export function formatLongDate(dateKey: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIMEZONE,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${dateKey}T12:00:00+08:00`))
}
