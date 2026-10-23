import { fmtMoney, timeAgo, thaiDate, thaiDateTime, formatDuration, hoursSince, formatHours } from '../../lib/format';
import { Icon, Badge } from '../../components/ui';
import { StaffAvatar } from '../staff/StaffAvatar';
import { ISSUE_TYPE_ICON, ISSUE_STATUS_UI, ISSUE_OPEN_STATES, ISSUE_STALE_HOURS } from './issueMeta';

export function IssueCard({ issue, busy, onAction }) {
  const i = issue;
  const st = ISSUE_STATUS_UI[i.IssueStatus] || ISSUE_STATUS_UI.OPEN;
  const keyNum = parseInt(String(i.ReporterKey || '0').slice(0, 6), 16) || 0;
  const isOpen = ISSUE_OPEN_STATES.includes(i.IssueStatus);
  const age = hoursSince(i.CreatedAt);
  const stale = isOpen && age >= ISSUE_STALE_HOURS;
  return (
    <article className={`is-card tone-${st.tone} ${stale ? 'stale' : ''}`}>
      <header className="is-card-head">
        <span className={`is-type-icon tone-${st.tone}`}><Icon name={ISSUE_TYPE_ICON[i.TypeCode] || 'alert'} size={18} /></span>
        <div className="is-title">
          <strong>{i.IssueType}</strong>
          <span title={thaiDateTime(i.CreatedAt, true)}>แจ้งเมื่อ {timeAgo(i.CreatedAt)} · #{i.IssueReportId}</span>
        </div>
        <div className="is-head-right">
          <Badge tone={st.badge}>{st.label}</Badge>
          {stale && <span className="is-stale"><Icon name="clock" size={12} /> ค้าง {formatHours(age)}</span>}
        </div>
      </header>

      <div className="is-reporter">
        <StaffAvatar name={i.ReporterName} id={keyNum} size={32} />
        <div style={{ minWidth: 0 }}>
          <div className="is-reporter-name">{i.ReporterName}{i.Visits >= 3 && <span className="rv-regular"><Icon name="award" size={11} /> ลูกค้าประจำ</span>}</div>
          <div className="is-reporter-sub">สั่งร้านนี้ {fmtMoney(i.Visits)} ครั้ง · แจ้งปัญหา {fmtMoney(i.ReporterIssueCount)} ครั้ง</div>
        </div>
      </div>

      <p className="is-quote">{i.Description}</p>

      {(i.HasOrder ?? i.OrderID) ? (
        <div className="is-order">
          <div className="is-order-meta">
            {i.QueueNo && <span className="rv-queue">คิว {i.QueueNo}</span>}
            {i.OrderedAt
              ? <span>สั่ง {thaiDateTime(i.OrderedAt, true)}</span>
              : i.OrderedDate && <span>สั่งวันที่ {thaiDate(i.OrderedDate)}{i.OrderedPeriod ? ` ช่วง${i.OrderedPeriod}` : ''}</span>}
            {i.TotalAmount != null && <span>฿{fmtMoney(i.TotalAmount)}</span>}
            {i.OrderStatusNameTh && <span className="is-order-status">{i.OrderStatusNameTh}</span>}
            {i.ReadyMinutes !== null && (
              <span className={`is-ready ${i.TypeCode === 'SLOW_SERVICE' ? 'hl' : ''}`}><Icon name="clock" size={12} /> สั่ง → เรียกคิว {formatDuration(i.ReadyMinutes)}</span>
            )}
          </div>
          {i.items?.length > 0 && (
            <div className="rv-items">
              {i.items.map((it, idx) => (
                <span key={`${it.ProductId}-${idx}`} className="rv-item">
                  <span className="rv-item-img">{it.ImageUrl ? <img src={it.ImageUrl} alt="" /> : <Icon name="photo" size={11} />}</span>
                  {it.ProductName} ×{it.Qty}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="is-order none"><Icon name="receipt" size={14} /> ไม่ได้ระบุออเดอร์ (ปัญหาทั่วไปของร้าน)</div>
      )}

      {(i.AdminNote || i.HandledByName) && (
        <div className={`is-reply tone-${st.tone}`}>
          <div className="is-reply-head">
            <Icon name={i.AdminNote ? 'check' : 'user'} size={13} />
            {i.AdminNote ? 'ตอบกลับลูกค้า' : 'รับเรื่องโดย'}{i.HandledByName ? ` ${i.AdminNote ? '· โดย ' : ''}${i.HandledByName}` : ''}
          </div>
          {i.AdminNote && <div>{i.AdminNote}</div>}
          {i.ResolvedAt && <div className="is-reply-time">ปิดเรื่องเมื่อ {thaiDateTime(i.ResolvedAt, true)}</div>}
        </div>
      )}

      <footer className="is-actions">
        {i.IssueStatus === 'OPEN' && (
          <button type="button" className="sf-act" onClick={() => onAction(i, 'IN_PROGRESS')} disabled={busy}><Icon name="clock" size={15} /> รับเรื่อง</button>
        )}
        {isOpen && (
          <>
            <button type="button" className="sf-act success" onClick={() => onAction(i, 'RESOLVED')} disabled={busy}><Icon name="check" size={15} /> แก้ไขแล้ว</button>
            <button type="button" className="sf-act danger" onClick={() => onAction(i, 'REJECTED')} disabled={busy}><Icon name="close" size={15} /> ไม่รับเรื่อง</button>
          </>
        )}
        {!isOpen && (
          <button type="button" className="sf-act" onClick={() => onAction(i, 'IN_PROGRESS')} disabled={busy}><Icon name="history" size={15} /> เปิดเรื่องอีกครั้ง</button>
        )}
      </footer>
    </article>
  );
}
