import type { ReservationStatus } from '../domain/types'

const labels: Record<ReservationStatus, string> = {
  booked: '已预约',
  arrived: '已到场',
  canceled: '已取消',
}

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>
}
