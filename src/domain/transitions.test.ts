import { describe, expect, it } from 'vitest'
import { ADMIN_USER_ID, CURRENT_USER_ID, createSeedState } from './seed'
import { canAdminMarkArrival, canAdminUndoArrival, selectOccupiedCount, selectRemaining } from './selectors'
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
  state.members.find((member) => member.memberNo === '100001')!.boundUserId = CURRENT_USER_ID
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

  it('管理员不能提前标记未来日期，可在预约当日标记和撤销到场', () => {
    const state = createSeedState(NOW)
    expect(() => updateReservationStatus(state, 'reservation-demo-1', 'mark-arrived', ADMIN_USER_ID, '', { now: NOW })).toThrow('今天或过去')

    const bookingMorning = '2026-09-04T00:00:00.000Z'
    const arrived = updateReservationStatus(state, 'reservation-demo-1', 'mark-arrived', ADMIN_USER_ID, '', { now: bookingMorning, id: ids() })
    expect(arrived.reservations.find((item) => item.id === 'reservation-demo-1')?.status).toBe('arrived')
    const undone = updateReservationStatus(arrived, 'reservation-demo-1', 'undo-arrived', ADMIN_USER_ID, '', { now: bookingMorning, id: ids() })
    expect(undone.reservations.find((item) => item.id === 'reservation-demo-1')?.status).toBe('booked')
  })

  it.each(['2026-09-04T16:00:00.000Z', '2026-09-10T04:00:00.000Z'])(
    '管理员可以在预约结束后或次日补记和撤销到场，写入操作时间：%s', (now) => {
      const state = createSeedState(NOW)
      const reservationId = 'reservation-demo-1'
      const original = state.reservations.find((item) => item.id === reservationId)!
      const id = ids()
      expect(canAdminMarkArrival(original, now)).toBe(true)
      expect(canAdminUndoArrival(original, now)).toBe(false)
      const arrived = updateReservationStatus(state, reservationId, 'mark-arrived', ADMIN_USER_ID, '', { now, id })
      const record = arrived.reservations.find((item) => item.id === reservationId)!
      expect(record).toMatchObject({ status: 'arrived', arrivedBy: ADMIN_USER_ID, arrivedAt: now, updatedAt: now })
      expect(canAdminMarkArrival(record, now)).toBe(false)
      expect(canAdminUndoArrival(record, now)).toBe(true)
      expect(arrived.auditLogs[0]).toMatchObject({ action: 'mark_arrived', operatorId: ADMIN_USER_ID, before: 'booked', after: 'arrived', createdAt: now })
      expect(selectOccupiedCount(arrived, TOMORROW, 13)).toBe(selectOccupiedCount(state, TOMORROW, 13))
      const undone = updateReservationStatus(arrived, reservationId, 'undo-arrived', ADMIN_USER_ID, '', { now, id })
      expect(undone.reservations.find((item) => item.id === reservationId)).not.toHaveProperty('arrivedAt')
      expect(undone.auditLogs[0]).toMatchObject({ action: 'undo_arrived', before: 'arrived', after: 'booked', createdAt: now })
    },
  )

  it('到场操作按上海日期判断，不能对未来日期撤销到场或对取消记录标记到场', () => {
    const state = createSeedState(NOW)
    const record = state.reservations.find((item) => item.id === 'reservation-demo-1')!
    expect(canAdminMarkArrival(record, '2026-09-03T15:59:59.000Z')).toBe(false)
    expect(canAdminMarkArrival(record, '2026-09-03T16:00:00.000Z')).toBe(true)
    record.status = 'arrived'
    expect(() => updateReservationStatus(state, record.id, 'undo-arrived', ADMIN_USER_ID, '', { now: NOW })).toThrow('今天或过去')
    record.status = 'canceled'
    expect(() => updateReservationStatus(state, record.id, 'mark-arrived', ADMIN_USER_ID, '', { now: '2026-09-04T12:00:00.000Z' })).toThrow('已预约记录')
  })

  it.each(['2026-09-04T06:00:00.000Z', '2026-09-05T04:00:00.000Z'])(
    '管理员在开始后和结束后仍可取消已预约记录，释放容量并保留原因：%s', (now) => {
      const state = createSeedState(NOW)
      const id = ids()
      const canceled = updateReservationStatus(state, 'reservation-demo-1', 'cancel', ADMIN_USER_ID, '  未到场  ', { now, id })
      expect(canceled.reservations.find((item) => item.id === 'reservation-demo-1')).toMatchObject({ status: 'canceled', canceledBy: 'admin', cancelReason: '未到场', canceledAt: now })
      for (const hour of [13, 14, 15]) expect(selectRemaining(canceled, TOMORROW, hour)).toBe(5)
      expect(canceled.auditLogs[0]).toMatchObject({ action: 'admin_cancel', before: 'booked', after: 'canceled', reason: '未到场', createdAt: now })
      expect(() => updateReservationStatus(canceled, 'reservation-demo-1', 'restore', ADMIN_USER_ID, '', { now })).toThrow('尚未开始')
      expect(() => cancelReservation(state, 'reservation-demo-1', 'user-demo-1', { now })).toThrow('预约已开始')
    },
  )

  it('已到场记录须先撤销到场再取消；取消仍需原因和管理员权限', () => {
    const state = createSeedState(NOW)
    expect(() => updateReservationStatus(state, 'reservation-history', 'cancel', ADMIN_USER_ID, '误记', { now: NOW })).toThrow('先撤销到场')
    const undone = updateReservationStatus(state, 'reservation-history', 'undo-arrived', ADMIN_USER_ID, '', { now: NOW, id: ids() })
    expect(() => updateReservationStatus(undone, 'reservation-history', 'cancel', ADMIN_USER_ID, '', { now: NOW })).toThrow('取消原因不能为空')
    expect(() => updateReservationStatus(undone, 'reservation-history', 'cancel', CURRENT_USER_ID, '误记', { now: NOW })).toThrow('没有管理员权限')
    const canceled = updateReservationStatus(undone, 'reservation-history', 'cancel', ADMIN_USER_ID, '误记', { now: NOW, id: ids() })
    expect(canceled.reservations.find((item) => item.id === 'reservation-history')?.status).toBe('canceled')
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
    expect(() => bindMember(state, CURRENT_USER_ID, '999999', '8001', { now: NOW })).toThrow('不在已导入名册')
    expect(() => bindMember(state, CURRENT_USER_ID, '100001', '0000', { now: NOW })).toThrow('不匹配')

    const next = bindMember(state, CURRENT_USER_ID, '100001', '8001', { now: NOW, id: ids() })
    expect(next.members.find((member) => member.memberNo === '100001')?.boundUserId).toBe(CURRENT_USER_ID)
    expect(next.auditLogs[0]?.action).toBe('bind_member')
  })

  it('会员名册导入按编号新增或更新并保留已有绑定', () => {
    const state = createSeedState(NOW)
    state.members.find((member) => member.memberNo === '100018')!.boundUserId = 'user-demo-1'
    const preview = prepareMemberImport(state, [
      { memberNo: '100018', name: '周雨桐（更新）', phone: '13612344312', status: 'active' },
      { memberNo: '100999', name: '新会员', phone: '13500009999', status: '启用' },
    ], 'members.csv', { now: NOW })
    expect(preview).toMatchObject({ insertedCount: 1, updatedCount: 1, unchangedCount: 0, issues: [] })

    const next = confirmMemberImport(state, preview, ADMIN_USER_ID, { now: NOW, id: ids() })
    expect(next.members.find((member) => member.memberNo === '100018')).toMatchObject({ name: '周雨桐（更新）', boundUserId: 'user-demo-1' })
    expect(next.members.some((member) => member.memberNo === '100999')).toBe(true)
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

  it.each(['', '12345', '1234567', 'VC1234', '１２３４５６', '123 45'])('绑定和导入均拒绝非 6 位 ASCII 数字编号：%s', (memberNo) => {
    const state = createSeedState(NOW)
    expect(() => bindMember(state, CURRENT_USER_ID, memberNo, '8001', { now: NOW })).toThrow('6 位数字')
    const preview = prepareMemberImport(state, [{ memberNo, name: '示例会员', phone: '13800138001' }], 'invalid.csv', { now: NOW })
    expect(preview.issues.some((issue) => issue.message.includes('6 位数字'))).toBe(true)
    expect(preview.rows).toHaveLength(0)
  })

  it('导入、绑定及预约快照均保留会员编号的前导零', () => {
    const state = createSeedState(NOW)
    const preview = prepareMemberImport(state, [{ memberNo: '000123', name: '示例会员', phone: '13800138001' }], 'members.csv', { now: NOW })
    const imported = confirmMemberImport(state, preview, ADMIN_USER_ID, { now: NOW, id: ids() })
    const bound = bindMember(imported, CURRENT_USER_ID, '000123', '8001', { now: NOW, id: ids() })
    const booked = createReservation(bound, CURRENT_USER_ID, input(), { now: NOW, id: ids() })
    expect(booked.users.find((user) => user.id === CURRENT_USER_ID)?.memberNo).toBe('000123')
    expect(booked.reservations.find((record) => record.idempotencyKey === 'request-1')?.memberNo).toBe('000123')
  })

  it('旧会话已绑定的自定义无效编号不能绕过预约校验', () => {
    const state = boundState()
    state.members.find((member) => member.boundUserId === CURRENT_USER_ID)!.memberNo = 'CUSTOM-123'
    expect(() => createReservation(state, CURRENT_USER_ID, input(), { now: NOW })).toThrow('6 位数字')
  })

  it('导入确认重新校验编号、手机号和重复项，不能通过清空预览错误绕过', () => {
    const state = createSeedState(NOW)
    const preview = prepareMemberImport(state, [{ memberNo: '000123', name: '新会员', phone: '13800138001' }], 'members.csv', { now: NOW })
    const invalidId = structuredClone(preview)
    invalidId.rows[0].memberNo = 'VC1234'
    expect(() => confirmMemberImport(state, invalidId, ADMIN_USER_ID, { now: NOW })).toThrow('6 位数字')
    const invalidPhone = structuredClone(preview)
    invalidPhone.rows[0].phone = '123'
    expect(() => confirmMemberImport(state, invalidPhone, ADMIN_USER_ID, { now: NOW })).toThrow('手机号')
    const duplicate = structuredClone(preview)
    duplicate.rows.push({ ...duplicate.rows[0] })
    expect(() => confirmMemberImport(state, duplicate, ADMIN_USER_ID, { now: NOW })).toThrow('重复')
    expect(state.members.some((member) => member.memberNo === '000123')).toBe(false)
  })

  it('导入确认保留当前绑定，不信任伪造绑定信息及导入数量', () => {
    const state = createSeedState(NOW)
    const preview = prepareMemberImport(state, [{ memberNo: '000123', name: '新会员', phone: '13800138001' }], 'members.csv', { now: NOW })
    preview.rows[0].boundUserId = CURRENT_USER_ID
    preview.insertedCount = 999
    const imported = confirmMemberImport(state, preview, ADMIN_USER_ID, { now: NOW, id: ids() })
    expect(imported.members.find((member) => member.memberNo === '000123')?.boundUserId).toBeUndefined()
    expect(imported.auditLogs[0].after).toBe('1 inserted, 0 updated')
  })
})
