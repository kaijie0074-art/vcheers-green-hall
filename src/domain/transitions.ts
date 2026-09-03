import {
  canUserCancel,
  hasUserOverlap,
  isArrivalWindow,
  isBookingDate,
  selectPeakOccupancy,
  selectRangeRemaining,
  selectReservation,
} from './selectors'
import { isPastOrStarted, slotTimestamp } from './time'
import type {
  AdminReservationAction,
  AppState,
  AuditAction,
  MemberImportPreview,
  MemberImportRow,
  MemberRecord,
  Reservation,
  ReservationInput,
  TransitionOptions,
  User,
} from './types'

function runtime(options?: TransitionOptions) {
  return {
    now: options?.now ?? new Date().toISOString(),
    id: options?.id ?? (() => crypto.randomUUID()),
  }
}

function clone(state: AppState) {
  return structuredClone(state)
}

function requireUser(state: AppState, userId: string): User {
  const user = state.users.find((item) => item.id === userId)
  if (!user) throw new Error('用户不存在')
  return user
}

function requireAdmin(state: AppState, userId: string) {
  const user = requireUser(state, userId)
  if (user.role !== 'admin' || user.id !== state.adminUserId) {
    throw new Error('没有管理员权限')
  }
  return user
}

function requireReservation(state: AppState, reservationId: string) {
  const reservation = selectReservation(state, reservationId)
  if (!reservation) throw new Error('预约不存在')
  return reservation
}

function validateText(value: string, field: string, maxLength = 50) {
  const cleaned = value.trim()
  if (!cleaned) throw new Error(`${field}不能为空`)
  if (cleaned.length > maxLength) throw new Error(`${field}不能超过 ${maxLength} 个字符`)
  return cleaned
}

function addAudit(
  state: AppState,
  values: {
    operatorId: string
    action: AuditAction
    targetId: string
    before?: string
    after?: string
    reason?: string
  },
  now: string,
  id: () => string,
) {
  state.auditLogs.unshift({ id: id(), createdAt: now, ...values })
}

function sameRequest(reservation: Reservation, input: ReservationInput) {
  return (
    reservation.date === input.date &&
    reservation.startHour === input.startHour &&
    reservation.durationHours === input.durationHours
  )
}

function requireBoundMember(state: AppState, userId: string) {
  const member = state.members.find(
    (item) => item.boundUserId === userId && item.status === 'active',
  )
  if (!member) throw new Error('请先绑定有效的 V cheers 会员编号')
  return member
}

export function createReservation(
  state: AppState,
  userId: string,
  input: ReservationInput,
  options?: TransitionOptions,
) {
  const { now, id } = runtime(options)
  requireUser(state, userId)
  const member = requireBoundMember(state, userId)
  if (!input.privacyAccepted) throw new Error('请先同意个人信息收集说明')
  const idempotencyKey = validateText(input.idempotencyKey, '幂等键', 100)

  const existingRequest = state.reservations.find(
    (item) => item.userId === userId && item.idempotencyKey === idempotencyKey,
  )
  if (existingRequest) {
    if (sameRequest(existingRequest, input)) return state
    throw new Error('本次提交标识已用于其他预约，请刷新后重试')
  }

  if (!isBookingDate(state, input.date, now)) throw new Error('该日期不在可预约范围内')
  if (
    !Number.isInteger(input.startHour) ||
    input.startHour < state.space.openHour ||
    input.startHour >= state.space.closeHour
  ) {
    throw new Error('开始时间不在营业时段内')
  }
  if (
    !Number.isInteger(input.durationHours) ||
    input.durationHours < 1 ||
    input.durationHours > state.space.maxDurationHours
  ) {
    throw new Error(`单次预约时长必须为 1–${state.space.maxDurationHours} 小时`)
  }
  const endHour = input.startHour + input.durationHours
  if (endHour > state.space.closeHour) throw new Error('结束时间不能晚于 22:00')
  if (isPastOrStarted(input.date, input.startHour, now)) {
    throw new Error('该时段已经开始，不能预约')
  }
  if (hasUserOverlap(state, userId, input.date, input.startHour, endHour)) {
    throw new Error('你在该时间段已有预约，请选择其他时间')
  }
  if (selectRangeRemaining(state, input.date, input.startHour, input.durationHours) < 1) {
    throw new Error('所选连续时段刚刚约满，请重新选择')
  }

  const next = clone(state)
  const reservation: Reservation = {
    id: id(),
    spaceId: state.space.id,
    userId,
    date: input.date,
    startHour: input.startHour,
    endHour,
    durationHours: input.durationHours,
    name: member.name,
    phone: member.phone,
    memberNo: member.memberNo,
    privacyAccepted: true,
    status: 'booked',
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  }
  next.reservations.unshift(reservation)
  addAudit(
    next,
    {
      operatorId: userId,
      action: 'create_reservation',
      targetId: reservation.id,
      after: 'booked',
    },
    now,
    id,
  )
  return next
}

export function bindMember(
  state: AppState,
  userId: string,
  memberNoInput: string,
  phoneLastFourInput: string,
  options?: TransitionOptions,
) {
  const { now, id } = runtime(options)
  const user = requireUser(state, userId)
  if (user.role !== 'member') throw new Error('管理员账号不能绑定会员编号')
  const memberNo = validateText(memberNoInput, '会员编号').toUpperCase()
  const phoneLastFour = validateText(phoneLastFourInput, '手机号后四位', 4)
  if (!/^\d{4}$/.test(phoneLastFour)) throw new Error('手机号后四位必须是 4 位数字')

  const member = state.members.find((item) => item.memberNo.toUpperCase() === memberNo)
  if (!member) throw new Error('会员编号不在已导入名册中')
  if (member.status !== 'active') throw new Error('该会员编号已停用，请联系管理员')
  if (!member.phone.endsWith(phoneLastFour)) throw new Error('会员编号与手机号后四位不匹配')
  if (member.boundUserId && member.boundUserId !== userId) {
    throw new Error('该会员编号已绑定其他微信用户')
  }
  const existingBinding = state.members.find(
    (item) => item.boundUserId === userId && item.memberNo !== member.memberNo,
  )
  if (existingBinding) throw new Error('当前微信用户已经绑定其他会员编号')
  if (member.boundUserId === userId) return state

  const next = clone(state)
  const target = next.members.find((item) => item.memberNo === member.memberNo)!
  target.boundUserId = userId
  target.updatedAt = now
  const targetUser = requireUser(next, userId)
  targetUser.name = target.name
  targetUser.phone = target.phone
  targetUser.memberNo = target.memberNo
  addAudit(
    next,
    {
      operatorId: userId,
      action: 'bind_member',
      targetId: target.memberNo,
      after: userId,
    },
    now,
    id,
  )
  return next
}

function normalizedMemberStatus(value?: string): MemberRecord['status'] | null {
  const status = value?.trim().toLowerCase()
  if (!status || ['active', '启用', '有效'].includes(status)) return 'active'
  if (['disabled', '停用', '禁用'].includes(status)) return 'disabled'
  return null
}

export function prepareMemberImport(
  state: AppState,
  rows: MemberImportRow[],
  fileName: string,
  options?: TransitionOptions,
): MemberImportPreview {
  const { now } = runtime(options)
  const issues: MemberImportPreview['issues'] = []
  const sanitized: MemberRecord[] = []
  const seenMemberNos = new Set<string>()

  if (rows.length === 0) issues.push({ rowNumber: 0, message: '文件中没有会员数据' })
  if (rows.length > 1000) issues.push({ rowNumber: 0, message: '单次最多导入 1000 条会员数据' })

  rows.slice(0, 1000).forEach((row, index) => {
    const rowNumber = index + 2
    const memberNo = row.memberNo.trim().toUpperCase()
    const name = row.name.trim()
    const phone = row.phone.trim()
    const status = normalizedMemberStatus(row.status)
    if (!memberNo) issues.push({ rowNumber, message: '会员编号不能为空' })
    if (!name) issues.push({ rowNumber, message: '姓名不能为空' })
    if (!/^1[3-9]\d{9}$/.test(phone)) issues.push({ rowNumber, message: '手机号必须是有效的 11 位号码' })
    if (!status) issues.push({ rowNumber, message: '状态只能填写 active、disabled、启用或停用' })
    if (seenMemberNos.has(memberNo)) issues.push({ rowNumber, message: `会员编号 ${memberNo} 在文件中重复` })
    seenMemberNos.add(memberNo)
    if (!memberNo || !name || !/^1[3-9]\d{9}$/.test(phone) || !status) return

    const existing = state.members.find((item) => item.memberNo.toUpperCase() === memberNo)
    sanitized.push({
      memberNo,
      name,
      phone,
      status,
      boundUserId: existing?.boundUserId,
      source: fileName,
      importedAt: existing?.importedAt ?? now,
      updatedAt: now,
    })
  })

  const counts = sanitized.reduce(
    (result, row) => {
      const existing = state.members.find((item) => item.memberNo === row.memberNo)
      if (!existing) result.insertedCount += 1
      else if (
        existing.name === row.name &&
        existing.phone === row.phone &&
        existing.status === row.status
      ) result.unchangedCount += 1
      else result.updatedCount += 1
      return result
    },
    { insertedCount: 0, updatedCount: 0, unchangedCount: 0 },
  )

  return { fileName, rows: sanitized, issues, ...counts }
}

export function confirmMemberImport(
  state: AppState,
  preview: MemberImportPreview,
  adminUserId: string,
  options?: TransitionOptions,
) {
  const { now, id } = runtime(options)
  requireAdmin(state, adminUserId)
  if (preview.issues.length > 0) throw new Error('请先修正导入文件中的错误')
  if (preview.rows.length === 0) throw new Error('没有可导入的会员数据')

  const next = clone(state)
  for (const row of preview.rows) {
    const existing = next.members.find((item) => item.memberNo === row.memberNo)
    if (existing) Object.assign(existing, row, { boundUserId: existing.boundUserId, updatedAt: now })
    else next.members.push({ ...row, importedAt: now, updatedAt: now })

    const boundUserId = existing?.boundUserId ?? row.boundUserId
    if (boundUserId) {
      const boundUser = next.users.find((item) => item.id === boundUserId)
      if (boundUser) {
        boundUser.name = row.name
        boundUser.phone = row.phone
        boundUser.memberNo = row.memberNo
      }
    }
  }
  addAudit(
    next,
    {
      operatorId: adminUserId,
      action: 'import_members',
      targetId: preview.fileName,
      after: `${preview.insertedCount} inserted, ${preview.updatedCount} updated`,
    },
    now,
    id,
  )
  return next
}

export function cancelReservation(
  state: AppState,
  reservationId: string,
  userId: string,
  options?: TransitionOptions,
) {
  const { now, id } = runtime(options)
  requireUser(state, userId)
  const reservation = requireReservation(state, reservationId)
  if (reservation.userId !== userId) throw new Error('只能取消自己的预约')
  if (reservation.status === 'canceled') return state
  if (!canUserCancel(reservation, now)) throw new Error('预约已开始或状态已变化，不能取消')

  const next = clone(state)
  const target = requireReservation(next, reservationId)
  target.status = 'canceled'
  target.canceledBy = 'user'
  target.canceledAt = now
  target.updatedAt = now
  addAudit(
    next,
    {
      operatorId: userId,
      action: 'cancel_reservation',
      targetId: reservationId,
      before: 'booked',
      after: 'canceled',
    },
    now,
    id,
  )
  return next
}

export function setDailyCapacity(
  state: AppState,
  date: string,
  capacity: number,
  adminUserId: string,
  options?: TransitionOptions,
) {
  const { now, id } = runtime(options)
  requireAdmin(state, adminUserId)
  if (!isBookingDate(state, date, now)) throw new Error('只能设置今天起 7 天内的容量')
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) {
    throw new Error('容量必须是 0–1000 的整数')
  }
  const peak = selectPeakOccupancy(state, date)
  if (capacity < peak) throw new Error(`容量不能低于当前峰值占用 ${peak}`)

  const next = clone(state)
  const existing = next.capacities.find(
    (item) => item.spaceId === state.space.id && item.date === date,
  )
  const before = existing?.capacity ?? state.space.defaultCapacity
  if (existing) {
    existing.capacity = capacity
    existing.updatedBy = adminUserId
    existing.updatedAt = now
  } else {
    next.capacities.push({
      spaceId: state.space.id,
      date,
      capacity,
      updatedBy: adminUserId,
      updatedAt: now,
    })
  }
  addAudit(
    next,
    {
      operatorId: adminUserId,
      action: 'set_capacity',
      targetId: `${state.space.id}:${date}`,
      before: String(before),
      after: String(capacity),
    },
    now,
    id,
  )
  return next
}

export function updateReservationStatus(
  state: AppState,
  reservationId: string,
  action: AdminReservationAction,
  adminUserId: string,
  reason = '',
  options?: TransitionOptions,
) {
  const { now, id } = runtime(options)
  requireAdmin(state, adminUserId)
  const reservation = requireReservation(state, reservationId)
  const current = Date.parse(now)
  const startsAt = slotTimestamp(reservation.date, reservation.startHour)
  const next = clone(state)
  const target = requireReservation(next, reservationId)

  if (action === 'mark-arrived') {
    if (reservation.status !== 'booked' || !isArrivalWindow(reservation, now)) {
      throw new Error('当前不在可标记到场的时间窗口')
    }
    target.status = 'arrived'
    target.arrivedBy = adminUserId
    target.arrivedAt = now
    addAudit(
      next,
      {
        operatorId: adminUserId,
        action: 'mark_arrived',
        targetId: reservationId,
        before: 'booked',
        after: 'arrived',
      },
      now,
      id,
    )
  } else if (action === 'undo-arrived') {
    if (reservation.status !== 'arrived' || !isArrivalWindow(reservation, now)) {
      throw new Error('当前不能撤销到场标记')
    }
    target.status = 'booked'
    delete target.arrivedBy
    delete target.arrivedAt
    addAudit(
      next,
      {
        operatorId: adminUserId,
        action: 'undo_arrived',
        targetId: reservationId,
        before: 'arrived',
        after: 'booked',
      },
      now,
      id,
    )
  } else if (action === 'cancel') {
    const cancelReason = validateText(reason, '取消原因', 200)
    if (reservation.status !== 'booked' || current >= startsAt) {
      throw new Error('只能取消尚未开始的已预约记录')
    }
    target.status = 'canceled'
    target.canceledBy = 'admin'
    target.cancelReason = cancelReason
    target.canceledAt = now
    addAudit(
      next,
      {
        operatorId: adminUserId,
        action: 'admin_cancel',
        targetId: reservationId,
        before: 'booked',
        after: 'canceled',
        reason: cancelReason,
      },
      now,
      id,
    )
  } else if (action === 'restore') {
    if (reservation.status !== 'canceled' || current >= startsAt) {
      throw new Error('只能恢复尚未开始的取消记录')
    }
    if (
      hasUserOverlap(
        state,
        reservation.userId,
        reservation.date,
        reservation.startHour,
        reservation.endHour,
        reservation.id,
      )
    ) {
      throw new Error('该用户在原时段已有其他预约，无法恢复')
    }
    if (
      selectRangeRemaining(
        state,
        reservation.date,
        reservation.startHour,
        reservation.durationHours,
      ) < 1
    ) {
      throw new Error('原时段名额不足，无法恢复')
    }
    target.status = 'booked'
    delete target.canceledBy
    delete target.cancelReason
    delete target.canceledAt
    addAudit(
      next,
      {
        operatorId: adminUserId,
        action: 'restore_reservation',
        targetId: reservationId,
        before: 'canceled',
        after: 'booked',
      },
      now,
      id,
    )
  }
  target.updatedAt = now
  return next
}

export function logPhoneReveal(
  state: AppState,
  reservationId: string,
  adminUserId: string,
  options?: TransitionOptions,
) {
  const { now, id } = runtime(options)
  requireAdmin(state, adminUserId)
  requireReservation(state, reservationId)
  const next = clone(state)
  addAudit(
    next,
    {
      operatorId: adminUserId,
      action: 'view_phone',
      targetId: reservationId,
    },
    now,
    id,
  )
  return next
}
