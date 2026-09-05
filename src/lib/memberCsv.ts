import type { MemberImportRow } from '../domain/types'

const aliases = {
  memberNo: ['VC-ID', '会员编号', 'member_no', 'memberno'].map((alias) => alias.toLowerCase()),
  name: ['姓名', 'name'],
  phone: ['手机号', 'phone', 'mobile'],
  status: ['状态', 'status'],
} as const

function parseRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }
  if (quoted) throw new Error('CSV 中存在未闭合的双引号')
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function findColumn(headers: string[], names: readonly string[], required = true) {
  const index = headers.findIndex((header) => names.includes(header.toLowerCase()))
  if (required && index < 0) throw new Error(`缺少表头：${names[0]}`)
  return index
}

export function parseMemberCsv(text: string): MemberImportRow[] {
  const rows = parseRows(text.replace(/^\uFEFF/, ''))
  const headers = rows.shift()?.map((item) => item.trim().toLowerCase())
  if (!headers) throw new Error('CSV 文件为空')
  const memberNoIndex = findColumn(headers, aliases.memberNo)
  const nameIndex = findColumn(headers, aliases.name)
  const phoneIndex = findColumn(headers, aliases.phone)
  const statusIndex = findColumn(headers, aliases.status, false)

  return rows.map((row) => ({
    memberNo: row[memberNoIndex] ?? '',
    name: row[nameIndex] ?? '',
    phone: row[phoneIndex] ?? '',
    status: statusIndex >= 0 ? row[statusIndex] : undefined,
  }))
}

export function downloadMemberTemplate() {
  const content = [
    '\uFEFFVC-ID,姓名,手机号,状态',
    '100001,示例会员一,13800138001,active',
    '100002,示例会员二,13900139002,active',
  ].join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'V-cheers会员名册导入模板.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}
