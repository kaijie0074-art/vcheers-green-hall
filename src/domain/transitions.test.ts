import { describe, expect, it } from 'vitest'
import { ADMIN_USER_ID, CURRENT_USER_ID, createSeedState } from './seed'
import { selectOccupiedCount, selectRemaining } from './selectors'
import {
  cancelReservation,
  bindMember,
  confirmMemberImport,
  createReservation,
  logPhoneReveal,
  prepareMemberImport,
  setDailyCapacity,
  updateReservationStatus,
} from './transitions'

const NOW = '2026-09-03T04:00:00.000Z'
const TODAY = '2026-09-03'
const TOMORROW = '2026-09-04'

function ids() {
  let count = 0
  return () => `generated-${++count}`
}

function input(overrides: Partial<Parameters<typeof createReservation>[2]> = {}) {
  return {
    date: TODAY,
    startHour: 13,
    durationHours: 1,
    privacyAccepted: true,
    idempotencyKey: 'request-1',
    ...overrides,
  }
}

function boundState() {
  const state = createSeedState(NOW)
  state.members.find((member) => member.memberNo === 'VC2026090301')!.boundUserId = CURRENT_USER_ID
  state.sessions.memberAuthenticated = true
  return state
}

describe('共享座位预约规则', () => {
  it('连续预约会占用覆盖到的每个小时', () => {
    const next = createReservation(
      boundState(),
      CURRENT_USER_ID,
      input({ durationHours: 3 }),
      { now: NOW, id: ids() },
    )

    expect(selectOccupiedCount(next, TODAY, 13)).toBe(1)
    expect(selectOccupiedCount(next, TODAY, 14)).toBe(1)
    expect(selectOccupiedCount(next, TODAY, 15)).toBe(1)
    expect(selectOccupiedCount(next, TODAY, 16)).toBe(0)
    expect(next.auditLogs[0]?.action).toBe('create_reservation')
  })

  it('任一连续小时无名额时整段预约失败', () => {
    const state = boundState()
    expect(() => createReservation(
      state,
      CURRENT_USER_ID,
      input({ date: '2026-09-05' }),
      { now: NOW, id: ids() },
    )).toThrow('所选连续时段刚刚约满')
  })

  it('拒绝超营业时间、超时长和已经开始的预约', () => {
    const state = boundState()
    expect(() => createReservation(state, CURRENT_USER_ID, input({ startHour: 20, durationHours: 3 }), { now: NOW })).toThrow('结束时间不能晚于 22:00')
    expect(() => createReservation(state, CURRENT_USER_ID, input({ durationHours: 5 }), { now: NOW })).toThrow('单次预约时长必须为 1–4 小时')
    expect(() => createReservation(state, CURRENT_USER_ID, input(), { now: '2026-09-03T05:00:00.000Z' })).toThrow('该时段已经开始')
  })

  it('同一用户的重叠时段失败，相邻时段可预约', () => {
    const state = boundState()
    expect(() => createReservation(
      state,
      CURRENT_USER_ID,
      input({ date: TOMORROW, startHour: 17, durationHours: 2 }),
      { now: NOW },
    )).toThrow('已有预约')

    const next = createReservation(
      state,
      CURRENT_USER_ID,
      input({ date: TOMORROW, startHour: 18, idempotencyKey: 'adjacent' }),
      { now: NOW, id: ids() },
    )
    expect(next.reservations.some((item) => item.idempotencyKey === 'adjacent')).toBe(true)
  })

  it('相同幂等键与相同参数不会重复创建，参数变化会被拒绝', () => {
    const id = ids()
    const created = createReservation(boundState(), CURRENT_USER_ID, input(), { now: NOW, id })
    const retried = createReservation(created, CURRENT_USER_ID, input(), { now: NOW, id })
    expect(retried).toBe(created)
    expect(retried.reservations.filter((item) => item.idempotencyKey === 'request-1')).toHaveLength(1)
    expect(() => createReservation(created, CURRENT_USER_ID, input({ durationHours: 2 }), { now: NOW, id })).toThrow('提交标识已用于其他预约')
  })

  it('用户可在开始前取消自己的预约并释放全部小时名额', () => {
    const id = ids()
    const created = createReservation(boundState(), CURRENT_USER_ID, input({ durationHours: 2 }), { now: NOW, id })
    const reservation = created.reservations.find((item) => item.idempotencyKey === 'request-1')!
    const canceled = cancelReservation(created, reservation.id, CURRENT_USER_ID, { now: NOW, id })

    expect(canceled.reservations.find((item) => item.id === reservation.id)?.status).toBe('canceled')
    expect(selectRemaining(canceled, TODAY, 13)).toBe(50)
    expect(selectRemaining(canceled, TODAY, 14)).toBe(50)
    expect(cancelReservation(canceled, reservation.id, CURRENT_USER_ID, { now: NOW, id })).toBe(canceled)
  })

  it('用户不能取消他人的预约', () => {
    expect(() => cancelReservation(
      createSeedState(NOW),
      'reservation-demo-1',
      CURRENT_USER_ID,
      { now: NOW },
    )).toThrow('只能取消自己的预约')
  })

  it('管理员不能把容量调到峰值占用以下，但可关闭空白日期', () => {
    const state = createSeedState(NOW)
    expect(() => setDailyCapacity(state, TOMORROW, 0, ADMIN_USER_ID, { now: NOW })).toThrow('不能低于当前峰值占用 1')
    const next = setDailyCapacity(state, TODAY, 0, ADMIN_USER_ID, { now: NOW, id: ids() })
    expect(selectRemaining(next, TODAY, 13)).toBe(0)
    expect(next.auditLogs[0]?.action).toBe('set_capacity')
  })

  it('管理员只能在到场窗口内标记和撤销到场', () => {
    const state = createSeedState(NOW)
    expect(() => updateReservationStatus(state, 'reservation-demo-1', 'mark-arrived', ADMIN_USER_ID, '', { now: NOW })).toThrow('时间窗口')

    const inWindow = '2026-09-04T04:45:00.000Z'
    const arrived = updateReservationStatus(state, 'reservation-demo-1', 'mark-arrived', ADMIN_USER_ID, '', { now: inWindow, id: ids() })
    expect(arrived.reservations.find((item) => item.id === 'reservation-demo-1')?.status).toBe('arrived')
    const undone = updateReservationStatus(arrived, 'reservation-demo-1', 'undo-arrived', ADMIN_USER_ID, '', { now: inWindow, id: ids() })
    expect(undone.reservations.find((item) => item.id === 'reservation-demo-1')?.status).toBe('booked')
  })

  it('管理员取消必须填写原因，恢复时重新校验名额', () => {
    const state = createSeedState(NOW)
    expect(() => updateReservationStatus(state, 'reservation-mine', 'cancel', ADMIN_USER_ID, '', { now: NOW })).toThrow('取消原因不能为空')
    const canceled = updateReservationStatus(state, 'reservation-mine', 'cancel', ADMIN_USER_ID, '临时维护', { now: NOW, id: ids() })
    const record = canceled.reservations.find((item) => item.id === 'reservation-mine')
    expect(record).toMatchObject({ status: 'canceled', canceledBy: 'admin', cancelReason: '临时维护' })

    const restored = updateReservationStatus(canceled, 'reservation-mine', 'restore', ADMIN_USER_ID, '', { now: NOW, id: ids() })
    expect(restored.reservations.find((item) => item.id === 'reservation-mine')?.status).toBe('booked')

    const full = structuredClone(canceled)
    full.capacities.find((item) => item.date === TOMORROW)!.capacity = 0
    expect(() => updateReservationStatus(full, 'reservation-mine', 'restore', ADMIN_USER_ID, '', { now: NOW })).toThrow('名额不足')
  })

  it('查看完整手机号会写入审计日志', () => {
    const next = logPhoneReveal(createSeedState(NOW), 'reservation-demo-1', ADMIN_USER_ID, { now: NOW, id: ids() })
    expect(next.auditLogs[0]).toMatchObject({ operatorId: ADMIN_USER_ID, action: 'view_phone', targetId: 'reservation-demo-1' })
  })

  it('首次登录只能绑定名册中且手机号后四位匹配的有效编号', () => {
    const state = createSeedState(NOW)
    expect(() => bindMember(state, CURRENT_USER_ID, 'UNKNOWN', '8001', { now: NOW })).toThrow('不在已导入名册')
    expect(() => bindMember(state, CURRENT_USER_ID, 'VC2026090301', '0000', { now: NOW })).toThrow('不匹配')

    const next = bindMember(state, CURRENT_USER_ID, 'vc2026090301', '8001', { now: NOW, id: ids() })
    expect(next.members.find((member) => member.memberNo === 'VC2026090301')?.boundUserId).toBe(CURRENT_USER_ID)
    expect(next.auditLogs[0]?.action).toBe('bind_member')
  })

  it('会员名册导入按编号新增或更新并保留已有绑定', () => {
    const state = createSeedState(NOW)
    state.members.find((member) => member.memberNo === 'VC2026090318')!.boundUserId = 'user-demo-1'
    const preview = prepareMemberImport(state, [
      { memberNo: 'VC2026090318', name: '周雨桐（更新）', phone: '13612344312', status: 'active' },
      { memberNo: 'VC2026090999', name: '新会员', phone: '13500009999', status: '启用' },
    ], 'members.csv', { now: NOW })
    expect(preview).toMatchObject({ insertedCount: 1, updatedCount: 1, unchangedCount: 0, issues: [] })

    const next = confirmMemberImport(state, preview, ADMIN_USER_ID, { now: NOW, id: ids() })
    expect(next.members.find((member) => member.memberNo === 'VC2026090318')).toMatchObject({ name: '周雨桐（更新）', boundUserId: 'user-demo-1' })
    expect(next.members.some((member) => member.memberNo === 'VC2026090999')).toBe(true)
    expect(next.auditLogs[0]?.action).toBe('import_members')
  })

  it('会员名册整批校验会阻断重复编号和无效手机号', () => {
    const preview = prepareMemberImport(createSeedState(NOW), [
      { memberNo: 'VC-X', name: '甲', phone: '123', status: 'active' },
      { memberNo: 'VC-X', name: '乙', phone: '13800138000', status: 'active' },
    ], 'invalid.csv', { now: NOW })
    expect(preview.issues.map((issue) => issue.message).join(' ')).toContain('手机号必须')
    expect(preview.issues.map((issue) => issue.message).join(' ')).toContain('重复')
    expect(() => confirmMemberImport(createSeedState(NOW), preview, ADMIN_USER_ID, { now: NOW })).toThrow('修正')
  })
})
