import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createSeedState } from './seed'
import { migrateDemoMemberNos } from './migrations'
import {
  bindMember as transitionBindMember,
  cancelReservation as transitionCancelReservation,
  confirmMemberImport as transitionConfirmMemberImport,
  createReservation as transitionCreateReservation,
  logPhoneReveal as transitionLogPhoneReveal,
  prepareMemberImport as transitionPrepareMemberImport,
  setDailyCapacity as transitionSetDailyCapacity,
  updateReservationStatus as transitionUpdateReservationStatus,
} from './transitions'
import type {
  AdminReservationAction,
  AppState,
  MemberImportPreview,
  MemberImportRow,
  ReservationInput,
} from './types'

export const STORAGE_KEY = 'vcheers-green-hall-booking-state-v4'

function isCurrentSchema(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<AppState>
  if (
    state.schemaVersion !== 4 ||
    typeof state.currentUserId !== 'string' ||
    typeof state.adminUserId !== 'string' ||
    !state.space ||
    !state.sessions ||
    !Array.isArray(state.users) ||
    !Array.isArray(state.members) ||
    !Array.isArray(state.capacities) ||
    !Array.isArray(state.reservations) ||
    !Array.isArray(state.auditLogs)
  ) {
    return false
  }
  if (
    state.space.id !== 'vcheers-green-hall' ||
    state.space.openHour !== 13 ||
    state.space.closeHour !== 22 ||
    state.space.maxDurationHours !== 4
  ) {
    return false
  }
  if (
    typeof state.sessions.memberAuthenticated !== 'boolean' ||
    typeof state.sessions.adminAuthenticated !== 'boolean'
  ) {
    return false
  }
  const userIds = new Set(state.users.map((user) => user.id))
  const memberNos = new Set(state.members.map((member) => member.memberNo))
  if (
    userIds.size !== state.users.length ||
    memberNos.size !== state.members.length ||
    !userIds.has(state.currentUserId) ||
    !userIds.has(state.adminUserId) ||
    state.members.some(
      (member) =>
        !/^1[3-9]\d{9}$/.test(member.phone) ||
        (member.boundUserId ? !userIds.has(member.boundUserId) : false),
    )
  ) {
    return false
  }
  return state.reservations.every(
    (reservation) =>
      typeof reservation.id === 'string' &&
      reservation.spaceId === state.space?.id &&
      userIds.has(reservation.userId) &&
      /^\d{4}-\d{2}-\d{2}$/.test(reservation.date) &&
      Number.isInteger(reservation.startHour) &&
      Number.isInteger(reservation.endHour) &&
      ['booked', 'arrived', 'canceled'].includes(reservation.status),
  )
}

function readInitialState() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (!saved) return createSeedState()
    const parsed: unknown = JSON.parse(saved)
    return isCurrentSchema(parsed) ? migrateDemoMemberNos(parsed) : createSeedState()
  } catch {
    return createSeedState()
  }
}

type CreateInput = Omit<ReservationInput, 'idempotencyKey'>

export type StoreValue = {
  state: AppState
  error: string
  clearError: () => void
  resetDemo: () => void
  loginMember: () => boolean
  logoutMember: () => boolean
  bindMember: (memberNo: string, phoneLastFour: string) => boolean
  loginAdmin: () => boolean
  logoutAdmin: () => boolean
  prepareMemberImport: (rows: MemberImportRow[], fileName: string) => MemberImportPreview | null
  confirmMemberImport: (preview: MemberImportPreview) => boolean
  createReservation: (input: CreateInput) => string | null
  cancelReservation: (reservationId: string) => boolean
  setDailyCapacity: (date: string, capacity: number) => boolean
  updateReservationStatus: (
    reservationId: string,
    action: AdminReservationAction,
    reason?: string,
  ) => boolean
  revealPhone: (reservationId: string) => boolean
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(readInitialState)
  const stateRef = useRef(state)
  const [error, setError] = useState('')

  const commit = (next: AppState) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      throw new Error('浏览器无法保存本次会话数据，请释放存储空间后重试')
    }
    stateRef.current = next
    setState(next)
    setError('')
  }

  const safely = (work: (current: AppState) => AppState) => {
    try {
      commit(work(stateRef.current))
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请稍后重试')
      return false
    }
  }

  const value = useMemo<StoreValue>(
    () => ({
      state,
      error,
      clearError: () => setError(''),
      resetDemo: () => {
        safely(() => createSeedState())
      },
      loginMember: () => safely((current) => ({
        ...current,
        sessions: { ...current.sessions, memberAuthenticated: true },
      })),
      logoutMember: () => safely((current) => ({
        ...current,
        sessions: { ...current.sessions, memberAuthenticated: false },
      })),
      bindMember: (memberNo, phoneLastFour) =>
        safely((current) => {
          if (!current.sessions.memberAuthenticated) throw new Error('请先完成微信登录')
          return transitionBindMember(current, current.currentUserId, memberNo, phoneLastFour)
        }),
      loginAdmin: () => safely((current) => ({
        ...current,
        sessions: { ...current.sessions, adminAuthenticated: true },
      })),
      logoutAdmin: () => safely((current) => ({
        ...current,
        sessions: { ...current.sessions, adminAuthenticated: false },
      })),
      prepareMemberImport: (rows, fileName) => {
        try {
          if (!stateRef.current.sessions.adminAuthenticated) throw new Error('请先完成管理员登录')
          const preview = transitionPrepareMemberImport(stateRef.current, rows, fileName)
          setError('')
          return preview
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : '无法读取会员数据')
          return null
        }
      },
      confirmMemberImport: (preview) =>
        safely((current) => {
          if (!current.sessions.adminAuthenticated) throw new Error('请先完成管理员登录')
          return transitionConfirmMemberImport(current, preview, current.adminUserId)
        }),
      createReservation: (input) => {
        const idempotencyKey = crypto.randomUUID()
        try {
          if (!stateRef.current.sessions.memberAuthenticated) throw new Error('请先完成微信登录')
          const next = transitionCreateReservation(
            stateRef.current,
            stateRef.current.currentUserId,
            { ...input, idempotencyKey },
          )
          const created = next.reservations.find(
            (reservation) =>
              reservation.userId === next.currentUserId &&
              reservation.idempotencyKey === idempotencyKey,
          )
          commit(next)
          return created?.id ?? null
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : '预约失败，请稍后重试')
          return null
        }
      },
      cancelReservation: (reservationId) =>
        safely((current) => {
          if (!current.sessions.memberAuthenticated) throw new Error('请先完成微信登录')
          return transitionCancelReservation(current, reservationId, current.currentUserId)
        }),
      setDailyCapacity: (date, capacity) =>
        safely((current) => {
          if (!current.sessions.adminAuthenticated) throw new Error('请先完成管理员登录')
          return transitionSetDailyCapacity(current, date, capacity, current.adminUserId)
        }),
      updateReservationStatus: (reservationId, action, reason = '') =>
        safely((current) => {
          if (!current.sessions.adminAuthenticated) throw new Error('请先完成管理员登录')
          return transitionUpdateReservationStatus(
            current,
            reservationId,
            action,
            current.adminUserId,
            reason,
          )
        }),
      revealPhone: (reservationId) =>
        safely((current) => {
          if (!current.sessions.adminAuthenticated) throw new Error('请先完成管理员登录')
          return transitionLogPhoneReveal(current, reservationId, current.adminUserId)
        }),
    }),
    [state, error],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore 必须在 StoreProvider 内使用')
  return value
}
