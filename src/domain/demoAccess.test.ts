import { describe, expect, it } from 'vitest'
import { bindDemoMember } from './demoAccess'
import { createSeedState } from './seed'
import { selectCurrentMember } from './selectors'
import { bindMember } from './transitions'

const NOW = '2026-09-12T06:30:00.000Z'
const options = { now: NOW, id: () => 'demo-binding-audit' }
function demoState() {
  const state = createSeedState(NOW)
  state.sessions.memberAuthenticated = true
  return state
}

describe('仅浏览器体验版开放演示绑定', () => {
  it.each([['', ''], ['随便填写', 'abc'], ['10000A', '123456789'], ['999999', '0000'], ['100001', 'wrong']])(
    '任意输入 %s / %s 使用演示资料，不保存输入或改动其他记录', (number, phone) => {
      const state = demoState()
      const original = structuredClone(state)
      const next = bindDemoMember(state, number, phone, options)
      expect(selectCurrentMember(next)?.memberNo).toBe('100001')
      expect(selectCurrentMember(next)?.phone).toBe('13800138001')
      expect(next.members).toHaveLength(state.members.length)
      expect(next.reservations).toEqual(state.reservations)
      expect(next.capacities).toEqual(state.capacities)
      expect(next.sessions.adminAuthenticated).toBe(false)
      expect(state).toEqual(original)
    },
  )

  it('不抢绑其他人的编号，也不使用他们的身份', () => {
    const state = demoState()
    const next = bindDemoMember(state, '100018', '4312', options)
    expect(selectCurrentMember(next)?.memberNo).toBe('100001')
    expect(next.members.find((item) => item.memberNo === '100018')).toEqual(state.members[1])
  })

  it('有效名册资料保留原有绑定流程和前导零编号', () => {
    const state = demoState()
    state.members.push({ ...state.members[0], memberNo: '001234', name: '前导零测试', phone: '13500012345', source: '测试导入' })
    const next = bindDemoMember(state, '001234', '2345', options)
    expect(selectCurrentMember(next)?.memberNo).toBe('001234')
    expect(bindDemoMember(next, 'anything', '', options)).toBe(next)
  })

  it('演示名册被停用时创建独立访客，保留旧绑定、预约及管理员角色', () => {
    const state = demoState()
    state.members[0].status = 'disabled'
    state.members[0].boundUserId = state.currentUserId
    const next = bindDemoMember(state, '', '', options)
    const member = selectCurrentMember(next)!
    expect(member.name).toBe('演示访客')
    expect(member.memberNo).toMatch(/^\d{6}$/)
    expect(next.members.slice(0, state.members.length)).toEqual(state.members)
    expect(next.users.slice(0, state.users.length)).toEqual(state.users)
    expect(next.reservations).toEqual(state.reservations)
    expect(next.adminUserId).toBe(state.adminUserId)
    expect(bindDemoMember(next, '', '', options)).toBe(next)
  })

  it('仍需点击登录；领域层的正式绑定规则未放宽', () => {
    expect(() => bindDemoMember(createSeedState(NOW), '', '', options)).toThrow('请先完成微信登录')
    expect(() => bindMember(demoState(), 'user-kaijie', 'abc', '1234', options)).toThrow('6 位数字')
  })
})
