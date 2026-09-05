import { describe, expect, it } from 'vitest'
import { migrateDemoMemberNos } from './migrations'
import { CURRENT_USER_ID, createSeedState } from './seed'

const NOW = '2026-09-03T04:00:00.000Z'
const legacyNumbers: Record<string, string> = {
  '100001': 'VC2026090301',
  '100018': 'VC2026090318',
  '100026': 'VC2026090326',
  '100042': 'VC2026090342',
  '900001': 'VC-ADMIN-01',
}

function legacyState() {
  const state = createSeedState(NOW)
  for (const record of [...state.members, ...state.users, ...state.reservations]) {
    record.memberNo = legacyNumbers[record.memberNo] ?? record.memberNo
  }
  return state
}

describe('旧演示会员编号迁移', () => {
  it('只更新已知演示编号，保留全部预约、状态、绑定、登录及审计数据', () => {
    const state = legacyState()
    state.sessions = { memberAuthenticated: true, adminAuthenticated: true }
    state.members[0].boundUserId = CURRENT_USER_ID
    state.reservations[0].status = 'canceled'
    state.reservations[0].cancelReason = '已有操作不能丢失'
    state.auditLogs.push({ id: 'audit-1', operatorId: CURRENT_USER_ID, action: 'bind_member', targetId: 'VC2026090301', createdAt: NOW })
    const before = structuredClone(state)
    const migrated = migrateDemoMemberNos(state)
    expect(state).toEqual(before)
    expect(migrated.members.map((member) => member.memberNo)).toEqual(['100001', '100018', '100026', '100042'])
    expect(migrated.users.map((user) => user.memberNo)).toEqual(['100001', '900001', '100018', '100026'])
    expect(migrated.reservations).toHaveLength(before.reservations.length)
    for (const record of migrated.reservations) {
      const original = before.reservations.find((item) => item.id === record.id)!
      expect({ ...record, memberNo: original.memberNo }).toEqual(original)
    }
    expect(migrated.members[0].boundUserId).toBe(CURRENT_USER_ID)
    expect(migrated.sessions).toEqual(before.sessions)
    expect(migrated.auditLogs).toEqual(before.auditLogs)
    expect(migrateDemoMemberNos(migrated)).toBe(migrated)
  })

  it('不会将导入名册里碰巧同名的旧编号或自定义编号当作演示数据改写', () => {
    const state = legacyState()
    state.members[0].source = 'custom-import.csv'
    state.members.push({ ...state.members[0], memberNo: 'CUSTOM-ID', name: '自定义记录' })
    const migrated = migrateDemoMemberNos(state)
    expect(migrated.members[0]).toEqual(state.members[0])
    expect(migrated.users[0]).toEqual(state.users[0])
    expect(migrated.reservations.find((item) => item.id === 'reservation-mine')).toEqual(state.reservations.find((item) => item.id === 'reservation-mine'))
    expect(migrated.members.find((item) => item.memberNo === 'CUSTOM-ID')).toEqual(state.members.at(-1))
  })

  it('新编号已经被其他数据使用时不覆盖、不生成重复编号，也不丢失数据', () => {
    const state = legacyState()
    state.members.push({ ...state.members[0], memberNo: '100001', source: 'custom-import.csv', name: '其他会员' })
    const migrated = migrateDemoMemberNos(state)
    expect(migrated.members).toHaveLength(state.members.length)
    expect(new Set(migrated.members.map((item) => item.memberNo)).size).toBe(state.members.length)
    expect(migrated.members.find((item) => item.memberNo === '100001')).toEqual(state.members.at(-1))
    expect(migrated.members[0].memberNo).toBe('VC2026090301')
    expect(migrated.users[0].memberNo).toBe('VC2026090301')
  })

  it('演示会员绑定其他微信身份后，相关用户和预约快照仍同步迁移', () => {
    const state = legacyState()
    const member = state.members.find((item) => item.memberNo === 'VC2026090342')!
    member.boundUserId = CURRENT_USER_ID
    state.users[0].memberNo = member.memberNo
    state.reservations[1].memberNo = member.memberNo
    const migrated = migrateDemoMemberNos(state)
    expect(migrated.members.find((item) => item.memberNo === '100042')?.boundUserId).toBe(CURRENT_USER_ID)
    expect(migrated.users[0].memberNo).toBe('100042')
    expect(migrated.reservations[1].memberNo).toBe('100042')
  })
})
