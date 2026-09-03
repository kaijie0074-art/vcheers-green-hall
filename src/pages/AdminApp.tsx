import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  LogOut,
  MessageCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Dialog } from '../components/Dialog'
import { StatusBadge } from '../components/StatusBadge'
import {
  isArrivalWindow,
  maskPhone,
  selectAdminUser,
  selectCapacity,
  selectPeakOccupancy,
  selectReservationsForDate,
} from '../domain/selectors'
import { useStore } from '../domain/store'
import { addDays, adminDateBounds, formatHour, formatLongDate, slotTimestamp } from '../domain/time'
import type { Reservation } from '../domain/types'
import type { MemberImportPreview } from '../domain/types'
import { downloadMemberTemplate, parseMemberCsv } from '../lib/memberCsv'
import { useCurrentTime } from '../lib/useCurrentTime'

export function AdminApp() {
  const store = useStore()
  const now = useCurrentTime()
  const bounds = useMemo(() => adminDateBounds(now), [now])
  const [selectedDate, setSelectedDate] = useState(bounds.today)
  const [capacityValue, setCapacityValue] = useState(() => String(selectCapacity(store.state, bounds.today)))
  const [visiblePhones, setVisiblePhones] = useState<Set<string>>(() => new Set())
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [section, setSection] = useState<'bookings' | 'members'>('bookings')
  const admin = selectAdminUser(store.state)
  const reservations = selectReservationsForDate(store.state, selectedDate)
  const capacity = selectCapacity(store.state, selectedDate)
  const peak = selectPeakOccupancy(store.state, selectedDate)
  const editableDate = selectedDate >= bounds.today && selectedDate <= bounds.max

  useEffect(() => {
    setCapacityValue(String(selectCapacity(store.state, selectedDate)))
  }, [selectedDate, store.state])

  const changeDate = (date: string) => {
    if (date < bounds.min || date > bounds.max) return
    setSelectedDate(date)
  }

  const revealPhone = (reservationId: string) => {
    if (!store.revealPhone(reservationId)) return
    setVisiblePhones((current) => new Set(current).add(reservationId))
  }

  if (!admin) {
    return <main className="site-shell"><p>管理员不存在，请点击顶部“重置数据”。</p></main>
  }

  if (!store.state.sessions.adminAuthenticated) {
    return <AdminLoginScreen onLogin={store.loginAdmin} />
  }

  return (
    <main className="site-shell admin-site">
      <header className="admin-topbar">
        <div className="admin-wordmark">
          <span>V</span>
          <div><strong>V cheers</strong><small>绿厅管理端</small></div>
        </div>
        <div className="admin-account">
          <div><strong>{admin.name}</strong><small>管理员</small></div>
          <button type="button" className="header-logout" onClick={store.logoutAdmin} aria-label="退出管理员登录"><LogOut size={18} /></button>
        </div>
      </header>

      <section className="admin-page-heading">
        <div><p>绿厅</p><h1>{section === 'bookings' ? '预约管理' : '会员名册'}</h1></div>
        <a className="admin-member-link" href="/member">用户端 <ChevronRight size={18} /></a>
      </section>

      <nav className="admin-section-tabs" aria-label="管理端功能">
        <button type="button" className={section === 'bookings' ? 'active' : ''} onClick={() => setSection('bookings')}>预约与容量</button>
        <button type="button" className={section === 'members' ? 'active' : ''} onClick={() => setSection('members')}>会员名册</button>
      </nav>

      {section === 'bookings' ? <>
        <section className="date-control-panel">
          <div className="admin-block-heading"><h2>日期</h2>{!editableDate && <span className="readonly-pill">只读</span>}</div>
          <div className="admin-date-controls">
            <button type="button" className="icon-square-button" disabled={selectedDate <= bounds.min} onClick={() => changeDate(addDays(selectedDate, -1))} aria-label="前一天"><ChevronLeft size={21} /></button>
            <input data-testid="admin-date-input" type="date" min={bounds.min} max={bounds.max} value={selectedDate} onChange={(event) => changeDate(event.target.value)} aria-label="管理日期" />
            <button type="button" className="icon-square-button" disabled={selectedDate >= bounds.max} onClick={() => changeDate(addDays(selectedDate, 1))} aria-label="后一天"><ChevronRight size={21} /></button>
            <button type="button" className="secondary-button" onClick={() => changeDate(bounds.today)}>今天</button>
            <strong>{formatLongDate(selectedDate)}</strong>
          </div>
        </section>

        <div className="admin-overview-grid">
        <section className="capacity-card">
          <div className="admin-block-heading"><h2>开放座位</h2></div>
          <div className="capacity-metrics">
            <article><span>当前容量</span><strong>{capacity}</strong></article>
            <article><span>峰值占用</span><strong>{peak}</strong></article>
          </div>
          <label className="capacity-input"><span>设置当天容量</span><div><input type="number" min={peak} max="1000" step="1" value={capacityValue} disabled={!editableDate} onChange={(event) => setCapacityValue(event.target.value)} /><em>座</em></div></label>
          <button
            type="button"
            className="primary-button full-button"
            disabled={!editableDate || capacityValue === '' || Number(capacityValue) === capacity}
            onClick={() => store.setDailyCapacity(selectedDate, Number(capacityValue))}
          ><Save size={18} />保存容量设置</button>
          <p className="form-footnote">不可低于峰值占用 {peak}</p>
        </section>

        <section className="records-card">
          <div className="admin-block-heading split-heading">
            <h2>预约记录</h2>
            <strong>{reservations.length} 条</strong>
          </div>
          <div className="admin-table-scroll">
            <div className="admin-record-table">
              <div className="admin-record-head"><span>状态 / 时段</span><span>预约人</span><span>联系方式</span><span>会员编号</span><span>操作</span></div>
              {reservations.map((reservation) => (
                <ReservationRow
                  key={reservation.id}
                  reservation={reservation}
                  now={now}
                  phoneVisible={visiblePhones.has(reservation.id)}
                  onReveal={() => revealPhone(reservation.id)}
                  onHide={() => setVisiblePhones((current) => { const next = new Set(current); next.delete(reservation.id); return next })}
                  onAction={(action) => {
                    if (action === 'cancel') {
                      setCancelReason('')
                      setCancelTarget(reservation)
                    } else {
                      store.updateReservationStatus(reservation.id, action)
                    }
                  }}
                />
              ))}
              {reservations.length === 0 && <div className="empty-state table-empty">该日期暂无预约记录。</div>}
            </div>
          </div>
        </section>
        </div>

        <section className="privacy-notice"><ShieldCheck size={18} /><span>查看完整手机号将记录操作日志</span></section>
      </> : <MemberRegistryView />}

      <Dialog open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)} title="管理员取消预约">
        {cancelTarget && <div className="confirm-content">
          <p>将取消 {cancelTarget.name} 在 {formatLongDate(cancelTarget.date)} {formatHour(cancelTarget.startHour)}–{formatHour(cancelTarget.endHour)} 的预约。</p>
          <label className="dialog-field"><span>取消原因 <b>*</b></span><textarea autoFocus maxLength={200} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="填写通知预约人的具体原因" /></label>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setCancelTarget(null)}>返回</button>
            <button type="button" className="danger-button" disabled={!cancelReason.trim()} onClick={() => { if (store.updateReservationStatus(cancelTarget.id, 'cancel', cancelReason)) setCancelTarget(null) }}>确认取消</button>
          </div>
        </div>}
      </Dialog>
    </main>
  )
}

function AdminLoginScreen({ onLogin }: { onLogin: () => boolean }) {
  return (
    <main className="auth-stage admin-auth-stage">
      <section className="auth-card">
        <span className="auth-icon"><ShieldCheck size={32} /></span>
        <h1>管理员登录</h1>
        <button type="button" className="wechat-button" onClick={onLogin}><MessageCircle size={22} />微信管理员登录</button>
      </section>
    </main>
  )
}

function MemberRegistryView() {
  const store = useStore()
  const [preview, setPreview] = useState<MemberImportPreview | null>(null)
  const [fileError, setFileError] = useState('')
  const [imported, setImported] = useState(false)
  const members = [...store.state.members].sort((left, right) => left.memberNo.localeCompare(right.memberNo))
  const boundCount = members.filter((member) => member.boundUserId).length
  const disabledCount = members.filter((member) => member.status === 'disabled').length

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileError('')
    setImported(false)
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('请上传 CSV 文件；Excel 可另存为 CSV 后导入')
      const rows = parseMemberCsv(await file.text())
      setPreview(store.prepareMemberImport(rows, file.name))
    } catch (cause) {
      setPreview(null)
      setFileError(cause instanceof Error ? cause.message : '无法读取这个文件')
    }
  }

  const confirm = () => {
    if (!preview || preview.issues.length > 0) return
    if (store.confirmMemberImport(preview)) {
      setImported(true)
      setPreview(null)
    }
  }

  return (
    <div className="member-admin-grid">
      <section className="member-import-card">
        <div className="admin-block-heading"><h2>导入会员</h2></div>
        <button type="button" className="secondary-button full-button" onClick={downloadMemberTemplate}><Download size={18} />下载 CSV 模板</button>
        <label className="member-upload-zone">
          <input type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event)} />
          <Upload size={28} />
          <strong>选择会员名册 CSV</strong>
          <span>表头：会员编号、姓名、手机号、状态</span>
        </label>
        {fileError && <p className="inline-error">{fileError}</p>}
        {imported && <p className="inline-success"><Check size={18} />会员名册已写入当前原型数据层</p>}
        {preview && <div className="member-import-preview">
          <div className="import-counts"><span>新增 <strong>{preview.insertedCount}</strong></span><span>更新 <strong>{preview.updatedCount}</strong></span><span>不变 <strong>{preview.unchangedCount}</strong></span></div>
          {preview.issues.length > 0 ? <div className="import-issues">{preview.issues.slice(0, 8).map((issue) => <p key={`${issue.rowNumber}-${issue.message}`}>{issue.rowNumber ? `第 ${issue.rowNumber} 行：` : ''}{issue.message}</p>)}</div> : <p className="preview-ready">校验通过，可以整批导入。</p>}
          <button type="button" className="primary-button full-button" disabled={preview.issues.length > 0} onClick={confirm}>确认导入</button>
        </div>}
        <p className="form-footnote">重复编号将更新资料并保留绑定关系</p>
      </section>

      <section className="member-registry-card">
        <div className="admin-block-heading split-heading">
          <h2>会员名册</h2>
          <strong>{members.length} 人</strong>
        </div>
        <div className="member-metrics"><span>已绑定 <strong>{boundCount}</strong></span><span>待绑定 <strong>{members.length - boundCount - disabledCount}</strong></span><span>已停用 <strong>{disabledCount}</strong></span></div>
        <div className="member-table-scroll">
          <div className="member-table">
            <div className="member-table-head"><span>会员编号</span><span>姓名</span><span>手机号</span><span>状态</span><span>微信绑定</span></div>
            {members.map((member) => {
              const user = store.state.users.find((item) => item.id === member.boundUserId)
              return <div className="member-table-row" key={member.memberNo}>
                <strong>{member.memberNo}</strong><span>{member.name}</span><span>{maskPhone(member.phone)}</span>
                <span className={`member-status member-${member.status}`}>{member.status === 'active' ? '启用' : '停用'}</span>
                <span>{user ? `已绑定 · ${user.name}` : member.status === 'active' ? '待绑定' : '不可绑定'}</span>
              </div>
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

function ReservationRow({
  reservation,
  now,
  phoneVisible,
  onReveal,
  onHide,
  onAction,
}: {
  reservation: Reservation
  now: Date
  phoneVisible: boolean
  onReveal: () => void
  onHide: () => void
  onAction: (action: 'mark-arrived' | 'undo-arrived' | 'cancel' | 'restore') => void
}) {
  const current = now.getTime()
  const startsAt = slotTimestamp(reservation.date, reservation.startHour)
  const arrivalWindow = isArrivalWindow(reservation, now)
  const beforeStart = current < startsAt

  return (
    <article className="admin-record-row">
      <div className="record-time"><StatusBadge status={reservation.status} /><strong>{formatHour(reservation.startHour)}–{formatHour(reservation.endHour)}</strong><small>{reservation.durationHours} 小时</small></div>
      <div><strong>{reservation.name}</strong><small>预约于 {new Date(reservation.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</small></div>
      <div className="phone-cell"><strong>{phoneVisible ? reservation.phone : maskPhone(reservation.phone)}</strong><button type="button" className="text-button" onClick={phoneVisible ? onHide : onReveal}>{phoneVisible ? <><EyeOff size={16} />隐藏</> : <><Eye size={16} />查看</>}</button></div>
      <div><strong>{reservation.memberNo}</strong>{reservation.cancelReason && <small>原因：{reservation.cancelReason}</small>}</div>
      <div className="row-actions">
        {reservation.status === 'booked' && arrivalWindow && <button type="button" className="success-button" onClick={() => onAction('mark-arrived')}><Check size={17} />标记到场</button>}
        {reservation.status === 'arrived' && arrivalWindow && <button type="button" className="secondary-button small-button" onClick={() => onAction('undo-arrived')}><RotateCcw size={16} />撤销到场</button>}
        {reservation.status === 'booked' && beforeStart && <button type="button" className="danger-ghost-button small-button" onClick={() => onAction('cancel')}><XCircle size={17} />取消</button>}
        {reservation.status === 'canceled' && beforeStart && <button type="button" className="secondary-button small-button" onClick={() => onAction('restore')}><RotateCcw size={16} />恢复</button>}
        {!((reservation.status === 'booked' && (arrivalWindow || beforeStart)) || (reservation.status === 'arrived' && arrivalWindow) || (reservation.status === 'canceled' && beforeStart)) && <span className="action-hint">无可用操作</span>}
      </div>
    </article>
  )
}
