import { ADMIN_USER_ID } from './seed'
import type { AppState } from './types'

const legacyDemoMembers = [
  { before: 'VC2026090301', after: '100001' },
  { before: 'VC2026090318', after: '100018' },
  { before: 'VC2026090326', after: '100026' },
  { before: 'VC2026090342', after: '100042' },
  { before: 'VC-ADMIN-01', after: '900001' },
] as const

/** Upgrade only identifiable demo IDs; never replace or discard imported records. */
export function migrateDemoMemberNos(state: AppState): AppState {
  const existingNumbers = new Set([
    ...state.members.map((member) => member.memberNo),
    ...state.users.map((user) => user.memberNo),
    ...state.reservations.map((reservation) => reservation.memberNo),
  ])
  const upgrades = legacyDemoMembers.filter((entry) => {
    if (existingNumbers.has(entry.after)) return false
    const member = state.members.find((item) => item.memberNo === entry.before)
    if (entry.before === 'VC-ADMIN-01') {
      return !member && state.users.some(
        (user) => user.id === ADMIN_USER_ID && user.role === 'admin' && user.memberNo === entry.before,
      )
    }
    return member?.source === '演示初始名册'
  })
  if (upgrades.length === 0) return state

  const next = structuredClone(state)
  for (const entry of upgrades) {
    for (const member of next.members) {
      if (member.memberNo === entry.before) member.memberNo = entry.after
    }
    for (const user of next.users) {
      if (user.memberNo === entry.before &&
        (entry.before !== 'VC-ADMIN-01' || user.id === ADMIN_USER_ID)) {
        user.memberNo = entry.after
      }
    }
    for (const reservation of next.reservations) {
      if (reservation.memberNo === entry.before &&
        (entry.before !== 'VC-ADMIN-01' || reservation.userId === ADMIN_USER_ID)) {
        reservation.memberNo = entry.after
      }
    }
  }
  return next
}
