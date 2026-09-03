export type UserRole = 'member' | 'admin'
export type ReservationStatus = 'booked' | 'arrived' | 'canceled'
export type AdminReservationAction = 'mark-arrived' | 'undo-arrived' | 'cancel' | 'restore'
export type MemberStatus = 'active' | 'disabled'

export interface User {
  id: string
  name: string
  phone: string
  memberNo: string
  role: UserRole
}

export interface MemberRecord {
  memberNo: string
  name: string
  phone: string
  status: MemberStatus
  boundUserId?: string
  source: string
  importedAt: string
  updatedAt: string
}

export interface AuthSessions {
  memberAuthenticated: boolean
  adminAuthenticated: boolean
}

export interface SpaceConfig {
  id: string
  name: string
  openHour: number
  closeHour: number
  maxDurationHours: number
  defaultCapacity: number
  bookingWindowDays: number
  timezone: 'Asia/Shanghai'
}

export interface DailyCapacity {
  spaceId: string
  date: string
  capacity: number
  updatedBy?: string
  updatedAt?: string
}

export interface Reservation {
  id: string
  spaceId: string
  userId: string
  date: string
  startHour: number
  endHour: number
  durationHours: number
  name: string
  phone: string
  memberNo: string
  privacyAccepted: true
  status: ReservationStatus
  idempotencyKey: string
  createdAt: string
  updatedAt: string
  canceledBy?: 'user' | 'admin'
  cancelReason?: string
  canceledAt?: string
  arrivedBy?: string
  arrivedAt?: string
}

export type AuditAction =
  | 'create_reservation'
  | 'cancel_reservation'
  | 'set_capacity'
  | 'mark_arrived'
  | 'undo_arrived'
  | 'admin_cancel'
  | 'restore_reservation'
  | 'view_phone'
  | 'bind_member'
  | 'import_members'

export interface AuditLog {
  id: string
  operatorId: string
  action: AuditAction
  targetId: string
  before?: string
  after?: string
  reason?: string
  createdAt: string
}

export interface AppState {
  schemaVersion: 4
  currentUserId: string
  adminUserId: string
  sessions: AuthSessions
  space: SpaceConfig
  users: User[]
  members: MemberRecord[]
  capacities: DailyCapacity[]
  reservations: Reservation[]
  auditLogs: AuditLog[]
}

export interface ReservationInput {
  date: string
  startHour: number
  durationHours: number
  privacyAccepted: boolean
  idempotencyKey: string
}

export interface MemberImportRow {
  memberNo: string
  name: string
  phone: string
  status?: string
}

export interface MemberImportIssue {
  rowNumber: number
  message: string
}

export interface MemberImportPreview {
  fileName: string
  rows: MemberRecord[]
  issues: MemberImportIssue[]
  insertedCount: number
  updatedCount: number
  unchangedCount: number
}

export type TransitionOptions = {
  now?: string
  id?: () => string
}
