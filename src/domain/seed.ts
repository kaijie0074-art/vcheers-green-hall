import { addDays, shanghaiDateKey } from './time'
import type { AppState, Reservation, ReservationStatus } from './types'

export const CURRENT_USER_ID = 'user-kaijie'
export const ADMIN_USER_ID = 'user-dongmei'
export const SPACE_ID = 'vcheers-green-hall'

function reservation(
  now: Date,
  values: {
    id: string
    userId: string
    date: string
    startHour: number
    durationHours: number
    name: string
    phone: string
    memberNo: string
    status?: ReservationStatus
  },
): Reservation {
  const createdAt = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString()
  return {
    id: values.id,
    spaceId: SPACE_ID,
    userId: values.userId,
    date: values.date,
    startHour: values.startHour,
    endHour: values.startHour + values.durationHours,
    durationHours: values.durationHours,
    name: values.name,
    phone: values.phone,
    memberNo: values.memberNo,
    privacyAccepted: true,
    status: values.status ?? 'booked',
    idempotencyKey: `seed-${values.id}`,
    createdAt,
    updatedAt: createdAt,
    ...(values.status === 'arrived'
      ? { arrivedBy: ADMIN_USER_ID, arrivedAt: createdAt }
      : {}),
    ...(values.status === 'canceled'
      ? {
          canceledBy: 'user' as const,
          cancelReason: '行程调整',
          canceledAt: createdAt,
        }
      : {}),
  }
}

export function createSeedState(now: string | Date = new Date()): AppState {
  const base = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(base.getTime())) throw new Error('演示数据基准时间无效')
  const today = shanghaiDateKey(base)
  const tomorrow = addDays(today, 1)
  const dayAfterTomorrow = addDays(today, 2)

  return {
    schemaVersion: 4,
    currentUserId: CURRENT_USER_ID,
    adminUserId: ADMIN_USER_ID,
    sessions: {
      memberAuthenticated: false,
      adminAuthenticated: false,
    },
    space: {
      id: SPACE_ID,
      name: 'V cheers 绿厅',
      openHour: 13,
      closeHour: 22,
      maxDurationHours: 4,
      defaultCapacity: 50,
      bookingWindowDays: 7,
      timezone: 'Asia/Shanghai',
    },
    users: [
      {
        id: CURRENT_USER_ID,
        name: '杨凯杰',
        phone: '13800138001',
        memberNo: 'VC2026090301',
        role: 'member',
      },
      {
        id: ADMIN_USER_ID,
        name: '冬梅老师',
        phone: '13900139002',
        memberNo: 'VC-ADMIN-01',
        role: 'admin',
      },
      {
        id: 'user-demo-1',
        name: '周雨桐',
        phone: '13612344312',
        memberNo: 'VC2026090318',
        role: 'member',
      },
      {
        id: 'user-demo-2',
        name: '陈屿',
        phone: '15845679077',
        memberNo: 'VC2026090326',
        role: 'member',
      },
    ],
    members: [
      {
        memberNo: 'VC2026090301',
        name: '杨凯杰',
        phone: '13800138001',
        status: 'active',
        source: '演示初始名册',
        importedAt: base.toISOString(),
        updatedAt: base.toISOString(),
      },
      {
        memberNo: 'VC2026090318',
        name: '周雨桐',
        phone: '13612344312',
        status: 'active',
        boundUserId: 'user-demo-1',
        source: '演示初始名册',
        importedAt: base.toISOString(),
        updatedAt: base.toISOString(),
      },
      {
        memberNo: 'VC2026090326',
        name: '陈屿',
        phone: '15845679077',
        status: 'active',
        boundUserId: 'user-demo-2',
        source: '演示初始名册',
        importedAt: base.toISOString(),
        updatedAt: base.toISOString(),
      },
      {
        memberNo: 'VC2026090342',
        name: '林晓',
        phone: '13700006542',
        status: 'active',
        source: '演示初始名册',
        importedAt: base.toISOString(),
        updatedAt: base.toISOString(),
      },
    ],
    capacities: [
      { spaceId: SPACE_ID, date: today, capacity: 50 },
      { spaceId: SPACE_ID, date: tomorrow, capacity: 5 },
      { spaceId: SPACE_ID, date: dayAfterTomorrow, capacity: 0 },
    ],
    reservations: [
      reservation(base, {
        id: 'reservation-demo-1',
        userId: 'user-demo-1',
        date: tomorrow,
        startHour: 13,
        durationHours: 3,
        name: '周雨桐',
        phone: '13612344312',
        memberNo: 'VC2026090318',
      }),
      reservation(base, {
        id: 'reservation-mine',
        userId: CURRENT_USER_ID,
        date: tomorrow,
        startHour: 16,
        durationHours: 2,
        name: '杨凯杰',
        phone: '13800138001',
        memberNo: 'VC2026090301',
      }),
      reservation(base, {
        id: 'reservation-demo-2',
        userId: 'user-demo-2',
        date: addDays(today, 3),
        startHour: 19,
        durationHours: 3,
        name: '陈屿',
        phone: '15845679077',
        memberNo: 'VC2026090326',
      }),
      reservation(base, {
        id: 'reservation-canceled',
        userId: CURRENT_USER_ID,
        date: addDays(today, 4),
        startHour: 14,
        durationHours: 1,
        name: '杨凯杰',
        phone: '13800138001',
        memberNo: 'VC2026090301',
        status: 'canceled',
      }),
      reservation(base, {
        id: 'reservation-history',
        userId: 'user-demo-1',
        date: addDays(today, -1),
        startHour: 18,
        durationHours: 2,
        name: '周雨桐',
        phone: '13612344312',
        memberNo: 'VC2026090318',
        status: 'arrived',
      }),
    ],
    auditLogs: [],
  }
}
