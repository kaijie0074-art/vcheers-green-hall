import { bookingDateKeys, isPastOrStarted, slotTimestamp } from './time'
import type { AppState, Reservation } from './types'

export const isActiveReservation = (reservation: Reservation) =>
  reservation.status === 'booked' || reservation.status === 'arrived'

export const selectCurrentUser = (state: AppState) =>
  state.users.find((user) => user.id === state.currentUserId)

export const selectCurrentMember = (state: AppState) =>
  state.members.find(
    (member) => member.boundUserId === state.currentUserId && member.status === 'active',
  )

export const selectAdminUser = (state: AppState) =>
  state.users.find((user) => user.id === state.adminUserId && user.role === 'admin')

export const selectReservation = (state: AppState, reservationId: string) =>
  state.reservations.find((reservation) => reservation.id === reservationId)

export function selectCapacity(state: AppState, date: string) {
  return state.capacities.find(
    (item) => item.spaceId === state.space.id && item.date === date,
  )?.capacity ?? state.space.defaultCapacity
}

export function selectOccupiedCount(state: AppState, date: string, hour: number) {
  return state.reservations.filter(
    (reservation) =>
      reservation.spaceId === state.space.id &&
      reservation.date === date &&
      isActiveReservation(reservation) &&
      reservation.startHour <= hour &&
      reservation.endHour > hour,
  ).length
}

export function selectRemaining(state: AppState, date: string, hour: number) {
  return Math.max(0, selectCapacity(state, date) - selectOccupiedCount(state, date, hour))
}

export function selectPeakOccupancy(state: AppState, date: string) {
  const hours = Array.from(
    { length: state.space.closeHour - state.space.openHour },
    (_, index) => state.space.openHour + index,
  )
  return Math.max(0, ...hours.map((hour) => selectOccupiedCount(state, date, hour)))
}

export function selectRangeRemaining(
  state: AppState,
  date: string,
  startHour: number,
  durationHours: number,
) {
  const hours = Array.from({ length: durationHours }, (_, index) => startHour + index)
  return Math.min(...hours.map((hour) => selectRemaining(state, date, hour)))
}

export function selectHours(state: AppState, date: string, now: string | Date) {
  return Array.from(
    { length: state.space.closeHour - state.space.openHour },
    (_, index) => state.space.openHour + index,
  ).map((hour) => ({
    hour,
    occupied: selectOccupiedCount(state, date, hour),
    remaining: selectRemaining(state, date, hour),
    past: isPastOrStarted(date, hour, now),
  }))
}

export function selectReservationsForUser(state: AppState, userId: string) {
  return state.reservations
    .filter((reservation) => reservation.userId === userId)
    .sort((left, right) => {
      const difference =
        slotTimestamp(left.date, left.startHour) - slotTimestamp(right.date, right.startHour)
      return difference || left.createdAt.localeCompare(right.createdAt)
    })
}

export function selectReservationsForDate(state: AppState, date: string) {
  return state.reservations
    .filter((reservation) => reservation.spaceId === state.space.id && reservation.date === date)
    .sort(
      (left, right) =>
        left.startHour - right.startHour || left.createdAt.localeCompare(right.createdAt),
    )
}

export function hasUserOverlap(
  state: AppState,
  userId: string,
  date: string,
  startHour: number,
  endHour: number,
  excludedReservationId?: string,
) {
  return state.reservations.some(
    (reservation) =>
      reservation.id !== excludedReservationId &&
      reservation.userId === userId &&
      reservation.date === date &&
      isActiveReservation(reservation) &&
      startHour < reservation.endHour &&
      endHour > reservation.startHour,
  )
}

export function canUserCancel(reservation: Reservation, now: string | Date) {
  const current = now instanceof Date ? now.getTime() : Date.parse(now)
  return (
    reservation.status === 'booked' &&
    current < slotTimestamp(reservation.date, reservation.startHour)
  )
}

export function isArrivalWindow(reservation: Reservation, now: string | Date) {
  const current = now instanceof Date ? now.getTime() : Date.parse(now)
  const start = slotTimestamp(reservation.date, reservation.startHour)
  const end = slotTimestamp(reservation.date, reservation.endHour)
  return current >= start - 30 * 60 * 1000 && current < end
}

export function isBookingDate(state: AppState, date: string, now: string | Date) {
  return bookingDateKeys(now, state.space.bookingWindowDays).includes(date)
}

export function maskPhone(phone: string) {
  return /^(\d{3})\d{4}(\d{4})$/.test(phone)
    ? phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
    : '号码已隐藏'
}
