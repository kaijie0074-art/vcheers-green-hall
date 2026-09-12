import {
  Armchair,
  CheckCircle2,
  LogOut,
  MessageCircle,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Dialog } from '../components/Dialog'
import { BrandLogo } from '../components/BrandLogo'
import { AgreementDialog, AgreementLinks } from '../components/AgreementDialog'
import { type AgreementKind } from '../content/agreements'
import { StatusBadge } from '../components/StatusBadge'
import {
  canUserCancel,
  selectCurrentMember,
  selectCurrentUser,
  selectHours,
  selectRangeRemaining,
  selectReservationsForUser,
} from '../domain/selectors'
import { useStore } from '../domain/store'
import { bookingDateKeys, formatDateLabel, formatHour, formatLongDate } from '../domain/time'
import type { Reservation } from '../domain/types'
import { useCurrentTime } from '../lib/useCurrentTime'

export function MemberApp() {
  const store = useStore()
  const now = useCurrentTime()
  const dates = useMemo(
    () => bookingDateKeys(now, store.state.space.bookingWindowDays),
    [now, store.state.space.bookingWindowDays],
  )
  const [selectedDate, setSelectedDate] = useState(() => dates[0])
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [durationHours, setDurationHours] = useState(1)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const currentUser = selectCurrentUser(store.state)
  const currentMember = selectCurrentMember(store.state)
  const hours = selectHours(store.state, selectedDate, now)

  useEffect(() => {
    if (!dates.includes(selectedDate)) {
      setSelectedDate(dates[0])
      setSelectedHour(null)
    }
  }, [dates, selectedDate])

  useEffect(() => {
    if (selectedHour === null) return
    const slot = hours.find((item) => item.hour === selectedHour)
    const invalid =
      !slot ||
      slot.past ||
      slot.remaining < 1 ||
      selectedHour + durationHours > store.state.space.closeHour ||
      selectRangeRemaining(store.state, selectedDate, selectedHour, durationHours) < 1
    if (invalid) setSelectedHour(null)
  }, [durationHours, hours, selectedDate, selectedHour, store.state])

  if (!currentUser) {
    return <main className="site-shell"><p>当前用户不存在，请点击顶部“重置数据”。</p></main>
  }

  if (!store.state.sessions.memberAuthenticated) {
    return <MemberLoginScreen onLogin={store.loginMember} />
  }

  if (!currentMember) {
    return <MemberBindingScreen onBind={store.bindMember} onLogout={store.logoutMember} />
  }

  const reservations = selectReservationsForUser(store.state, currentUser.id)
  const successReservation = store.state.reservations.find((item) => item.id === successId)
  const rangeRemaining = selectedHour === null
    ? null
    : selectRangeRemaining(store.state, selectedDate, selectedHour, durationHours)

  return (
    <main className="site-shell member-site">
      <header className="member-topbar">
        <div className="member-wordmark">
          <BrandLogo />
        </div>
        <div className="member-account">
          <div><strong>{currentMember.name}</strong><small>{currentMember.memberNo}</small></div>
          <button type="button" className="header-logout" onClick={store.logoutMember} aria-label="退出用户登录"><LogOut size={18} /></button>
        </div>
      </header>

      <section className="venue-heading">
        <div className="venue-title">
          <span><Armchair size={24} /></span>
          <div><p>绿厅</p><h1>共享座位预约</h1></div>
        </div>
        <dl className="venue-facts">
          <div><dt>营业</dt><dd>13:00—22:00</dd></div>
          <div><dt>座位</dt><dd>{store.state.space.defaultCapacity}</dd></div>
          <div><dt>最长</dt><dd>4 小时</dd></div>
        </dl>
      </section>

      <div className="booking-layout">
        <section className="booking-picker" aria-labelledby="booking-picker-title">
          <h2 id="booking-picker-title" className="picker-title">选择日期</h2>

          <div className="date-grid" role="group" aria-label="选择预约日期">
            {dates.map((date, index) => {
              const label = formatDateLabel(date, now)
              return (
                <button
                  type="button"
                  key={date}
                  data-testid={`date-option-${index}`}
                  className={selectedDate === date ? 'date-option selected' : 'date-option'}
                  onClick={() => { setSelectedDate(date); setSelectedHour(null) }}
                  aria-pressed={selectedDate === date}
                >
                  <span>{label.eyebrow}</span><strong>{label.date}</strong>
                </button>
              )
            })}
          </div>

          <div className="slot-heading">
            <h2>{formatLongDate(selectedDate)}</h2>
            <span>可预约时段</span>
          </div>
          <div className="time-grid" role="group" aria-label="选择开始时间">
            {hours.map((item) => {
              const disabled = item.past || item.remaining < 1
              return (
                <button
                  type="button"
                  key={item.hour}
                  data-testid={`time-option-${item.hour}`}
                  className={selectedHour === item.hour ? 'time-option selected' : 'time-option'}
                  disabled={disabled}
                  onClick={() => {
                    setSelectedHour(item.hour)
                    if (
                      item.hour + durationHours > store.state.space.closeHour ||
                      selectRangeRemaining(store.state, selectedDate, item.hour, durationHours) < 1
                    ) {
                      setDurationHours(1)
                    }
                  }}
                  aria-pressed={selectedHour === item.hour}
                >
                  <strong>{formatHour(item.hour)}</strong>
                  <span>{item.past ? '已开始' : item.remaining > 0 ? `剩 ${item.remaining} 座` : '已约满'}</span>
                </button>
              )
            })}
          </div>

          <div className="duration-row">
            <h2>预约时长</h2>
            <div className="duration-options" role="group" aria-label="选择预约时长">
              {Array.from({ length: store.state.space.maxDurationHours }, (_, index) => index + 1).map((duration) => {
                const disabled = selectedHour !== null && (
                  selectedHour + duration > store.state.space.closeHour ||
                  selectRangeRemaining(store.state, selectedDate, selectedHour, duration) < 1
                )
                return (
                  <button
                    type="button"
                    key={duration}
                    data-testid={`duration-${duration}`}
                    disabled={disabled}
                    className={durationHours === duration ? 'duration-option selected' : 'duration-option'}
                    onClick={() => setDurationHours(duration)}
                    aria-pressed={durationHours === duration}
                  >{duration} 小时</button>
                )
              })}
            </div>
          </div>

          <div className="selection-summary" aria-live="polite">
            {selectedHour === null ? (
              <div><span>所选时段</span><strong>—</strong></div>
            ) : (
              <div><span>所选时段</span><strong>{formatLongDate(selectedDate)} · {formatHour(selectedHour)}—{formatHour(selectedHour + durationHours)}</strong></div>
            )}
            <span className="summary-remaining">{rangeRemaining === null ? '请选择' : `余 ${rangeRemaining} 座`}</span>
          </div>
        </section>

        <BookingForm
          member={currentMember}
          disabled={selectedHour === null || rangeRemaining === null || rangeRemaining < 1}
          summary={selectedHour === null ? '尚未选择时段' : `${formatHour(selectedHour)}—${formatHour(selectedHour + durationHours)} · ${durationHours} 小时`}
          onSubmit={(privacyAccepted, rulesAccepted) => {
            if (selectedHour === null) return false
            const id = store.createReservation({
              date: selectedDate,
              startHour: selectedHour,
              durationHours,
              privacyAccepted,
              rulesAccepted,
            })
            if (id) setSuccessId(id)
            return Boolean(id)
          }}
        />
      </div>

      <section className="my-bookings" aria-labelledby="my-bookings-title">
        <div className="bookings-heading">
          <h2 id="my-bookings-title">我的预约</h2>
          <span>{reservations.length} 条</span>
        </div>
        <div className="reservation-list">
          {reservations.map((reservation) => (
            <article className="reservation-card" key={reservation.id}>
              <div className="reservation-date"><small>{reservation.date.slice(0, 7)}</small><strong>{reservation.date.slice(8)}</strong></div>
              <div className="reservation-main">
                <div><StatusBadge status={reservation.status} /><strong>{formatHour(reservation.startHour)}–{formatHour(reservation.endHour)}</strong></div>
                <p>绿厅 · {reservation.durationHours} 小时</p>
                {reservation.cancelReason && <small>取消原因：{reservation.cancelReason}</small>}
              </div>
              {canUserCancel(reservation, now) ? (
                <button type="button" className="danger-ghost-button" onClick={() => setCancelTarget(reservation)}><Trash2 size={18} />取消预约</button>
              ) : <span className="action-hint">{reservation.status === 'canceled' ? '已释放名额' : '当前不可取消'}</span>}
            </article>
          ))}
          {reservations.length === 0 && <div className="empty-state">暂无预约</div>}
        </div>
      </section>

      <Dialog open={Boolean(successReservation)} onClose={() => setSuccessId(null)} title="预约成功">
        {successReservation && <div className="success-content">
          <CheckCircle2 size={52} />
          <h3>座位已为你保留</h3>
          <p>{formatLongDate(successReservation.date)}<br />{formatHour(successReservation.startHour)}–{formatHour(successReservation.endHour)}</p>
          <small>预约编号：{successReservation.id}</small>
          <button type="button" className="primary-button full-button" onClick={() => { setSuccessId(null); document.getElementById('my-bookings-title')?.scrollIntoView({ behavior: 'smooth' }) }}>查看我的预约</button>
        </div>}
      </Dialog>

      <Dialog open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} title="确认取消预约">
        {cancelTarget && <div className="confirm-content">
          <p>将取消 {formatLongDate(cancelTarget.date)} {formatHour(cancelTarget.startHour)}–{formatHour(cancelTarget.endHour)} 的预约，并立即释放座位。</p>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setCancelTarget(null)}>保留预约</button>
            <button type="button" className="danger-button" onClick={() => { if (store.cancelReservation(cancelTarget.id)) setCancelTarget(null) }}>确认取消</button>
          </div>
        </div>}
      </Dialog>
    </main>
  )
}

function BookingForm({
  member,
  disabled,
  summary,
  onSubmit,
}: {
  member: { name: string; phone: string; memberNo: string }
  disabled: boolean
  summary: string
  onSubmit: (privacyAccepted: boolean, rulesAccepted: boolean) => boolean
}) {
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const [reading, setReading] = useState<AgreementKind | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (onSubmit(privacyAccepted, rulesAccepted)) {
      setPrivacyAccepted(false)
      setRulesAccepted(false)
    }
  }

  return (
    <aside className="booking-form-card">
      <div className="booking-form-heading"><h2>确认预约</h2><strong>{summary}</strong></div>
      <form onSubmit={submit}>
        <div className="bound-identity-card">
          <span>预约人</span>
          <div><strong>{member.name}</strong><p>{member.memberNo} · {member.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')}</p></div>
        </div>
        <div className="consent-list">
          <ConsentCheck kind="privacy" title="预约信息使用说明" checked={privacyAccepted} onChange={setPrivacyAccepted} onRead={() => setReading('privacy')} />
          <ConsentCheck kind="rules" title="空间使用守则" checked={rulesAccepted} onChange={setRulesAccepted} onRead={() => setReading('rules')} />
        </div>
        <button type="submit" className="primary-button full-button" disabled={disabled || !privacyAccepted || !rulesAccepted}>确认预约</button>
      </form>
      <AgreementDialog kind={reading} onClose={() => setReading(null)} />
    </aside>
  )
}

function ConsentCheck({ kind, title, checked, onChange, onRead }: {
  kind: AgreementKind
  title: string
  checked: boolean
  onChange: (checked: boolean) => void
  onRead: () => void
}) {
  // Reading is a separate button, outside the label: it never toggles consent.
  return <div className="consent-check">
    <label className="consent-toggle">
      <input id={`${kind}-consent`} type="checkbox" name={`${kind}Accepted`} checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={`我已阅读并同意《${title}》`} />
    </label>
    <div>
      <label htmlFor={`${kind}-consent`}>我已阅读并同意</label>
      <button type="button" className="agreement-link" onClick={onRead} aria-haspopup="dialog">《{title}》</button>
    </div>
  </div>
}

function MemberLoginScreen({ onLogin }: { onLogin: () => boolean }) {
  return (
    <main className="auth-stage">
      <section className="auth-card">
        <BrandLogo />
        <h1>绿厅座位预约</h1>
        <button type="button" className="wechat-button" onClick={onLogin}><MessageCircle size={22} />微信授权登录</button>
        <AgreementLinks />
      </section>
    </main>
  )
}

function MemberBindingScreen({
  onBind,
  onLogout,
}: {
  onBind: (memberNo: string, phoneLastFour: string) => boolean
  onLogout: () => boolean
}) {
  const [memberNo, setMemberNo] = useState('100001')
  const [phoneLastFour, setPhoneLastFour] = useState('8001')

  return (
    <main className="auth-stage">
      <section className="auth-card binding-card">
        <BrandLogo />
        <h1>绑定会员编号</h1>
        <form onSubmit={(event) => { event.preventDefault(); onBind(memberNo, phoneLastFour) }}>
          <label><span>会员编号</span><input type="text" inputMode="numeric" placeholder="6 位数字" value={memberNo} onChange={(event) => setMemberNo(event.target.value)} autoCapitalize="off" spellCheck={false} /></label>
          <label><span>预留手机号后四位</span><input value={phoneLastFour} onChange={(event) => setPhoneLastFour(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" maxLength={4} /></label>
          <button type="submit" className="primary-button full-button">确认绑定</button>
        </form>
        <div className="demo-credential"><strong>演示资料</strong><span>会员编号 100001，手机号后四位 8001</span></div>
        <button type="button" className="text-button" onClick={onLogout}><LogOut size={17} />退出微信登录</button>
        <AgreementLinks />
      </section>
    </main>
  )
}
