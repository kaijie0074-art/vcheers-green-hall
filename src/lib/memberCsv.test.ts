import { describe, expect, it } from 'vitest'
import { parseMemberCsv } from './memberCsv'

describe('会员名册 CSV', () => {
  it.each(['VC-ID', 'vc-id', '会员编号', 'member_no', 'memberNo'])('支持 %s 表头，保留六位编号前导零', (header) => {
    expect(parseMemberCsv(`\uFEFF${header},姓名,手机号,状态\r\n000123,示例会员,13800138001,active`)).toEqual([
      { memberNo: '000123', name: '示例会员', phone: '13800138001', status: 'active' },
    ])
  })

  it('支持引号单元格且不会将编号转成数字', () => {
    expect(parseMemberCsv('VC-ID,姓名,手机号\n"000001","示例,会员","13800138001"')[0]).toMatchObject({ memberNo: '000001', name: '示例,会员' })
  })
})
