import { CURRENT_USER_ID } from './seed'
import { bindMember } from './transitions'
import type { AppState, TransitionOptions } from './types'

/** Public, browser-only demo access. Never use this as production authentication. */
export function bindDemoMember(
  state: AppState,
  memberNoInput: string,
  phoneLastFourInput: string,
  options?: TransitionOptions,
): AppState {
  if (!state.sessions.memberAuthenticated) throw new Error('请先完成微信登录')
  const user = state.users.find((item) => item.id === state.currentUserId)
  if (!user || user.role !== 'member') throw new Error('演示用户不存在')
  const existing = state.members.find((item) => item.boundUserId === user.id)
  if (existing?.status === 'active') return state

  // Keep valid roster-binding demonstrations working, including leading zeros.
  const memberNo = memberNoInput.trim()
  const suffix = phoneLastFourInput.trim()
  const candidate = state.members.find((item) => item.memberNo === memberNo)
  if (!existing && /^\d{6}$/.test(memberNo) && /^\d{4}$/.test(suffix) &&
    candidate?.status === 'active' && !candidate.boundUserId && candidate.phone.endsWith(suffix)) {
    return bindMember(state, user.id, memberNo, suffix, options)
  }

  // Arbitrary credentials fall back to synthetic data, not another member's identity.
  const demo = state.members.find((item) => item.memberNo === '100001')
  if (!existing && user.id === CURRENT_USER_ID && demo?.source === '演示初始名册' &&
    demo.status === 'active' && !demo.boundUserId && demo.phone === '13800138001') {
    return bindMember(state, user.id, demo.memberNo, '8001', options)
  }

  // Preserve disabled/imported/occupied records; give this visitor a separate demo identity.
  const next = structuredClone(state)
  const used = new Set([
    ...state.members.map((item) => item.memberNo),
    ...state.users.map((item) => item.memberNo),
    ...state.reservations.map((item) => item.memberNo),
  ])
  let number = 0
  while (number < 1_000_000 && used.has(String(number).padStart(6, '0'))) number += 1
  if (number === 1_000_000) throw new Error('演示编号已用完，请重置演示数据')
  const guestNo = String(number).padStart(6, '0')
  const guestId = `demo-guest-${crypto.randomUUID()}`
  const now = options?.now ?? new Date().toISOString()
  next.users.push({ id: guestId, name: '演示访客', phone: '13800000000', memberNo: guestNo, role: 'member' })
  next.members.push({
    memberNo: guestNo, name: '演示访客', phone: '13800000000', status: 'active',
    source: '开放演示临时名册', importedAt: now, updatedAt: now,
  })
  next.currentUserId = guestId
  return bindMember(next, guestId, guestNo, '0000', options)
}
