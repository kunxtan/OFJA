import { Icon, Badge, Skeleton, useEscapeToClose } from '../../components/ui';
import { StaffAvatar } from '../staff/StaffAvatar';
import { ROLE_TH, orderStatusMeta, PAYMENT_STATUS_META, REFUND_TYPE_TH, REFUND_STATUS_META, PRINT_TYPE_TH } from './salesMeta';
import { timeHM, fmtMoney, formatPhone, thaiDateTime, minutesBetween, formatDuration } from '../../lib/format';
import { useState, useEffect } from 'react';
import AuthImage, { openFile } from '../../../../shared/ui/AuthImage';
import { ISSUE_STATUS } from '../../components/NotifDetailModal';

export function SalesPersonCard({ label, icon, person, extra, empty = 'ยังไม่ถึงขั้นนี้' }) {
  return (
    <div className={`sh-person ${person ? '' : 'empty'}`}>
      <div className="sh-person-label"><Icon name={icon} size={14} /> {label}</div>
      {person ? (
        <div className="sh-person-body">
          {person.IsSystem
            ? <span className="sh-system-avatar"><Icon name="settings" size={18} /></span>
            : <StaffAvatar name={person.Name} id={person.UserId} size={36} />}
          <div style={{ minWidth: 0 }}>
            <div className="sh-person-name" title={person.Name}>{person.Name || '-'}</div>
            <div className="sh-person-sub">{person.IsSystem ? 'อัตโนมัติ' : (ROLE_TH[person.RoleCode] || person.RoleCode || '')}</div>
            {person.At && <div className="sh-person-time"><Icon name="clock" size={11} /> {timeHM(person.At)} น.</div>}
            {extra && <div className="sh-person-extra">{extra}</div>}
          </div>
        </div>
      ) : (
        <div className="sh-person-empty">{empty}</div>
      )}
    </div>
  );
}

// --- รายละเอียดเชิงลึกของออเดอร์ (ดึงจาก GET /api/orders/{id}/detail) ---
export function SalesOrderDetailModal({ orderId, statusCode, apiBase, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  useEscapeToClose(onClose, false);

  // โหลดใหม่เมื่อสถานะออเดอร์เปลี่ยน (หน้าหลัก polling ทุก 4 วินาที)
  useEffect(() => {
    let alive = true;
    fetch(`${apiBase}/api/orders/${orderId}/detail`)
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.detail || 'โหลดรายละเอียดออเดอร์ไม่สำเร็จ');
        return data;
      })
      .then(d => { if (alive) { setDetail(d); setError(''); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [apiBase, orderId, statusCode]);

  const o = detail?.order;
  const people = detail?.people || {};
  const meta = orderStatusMeta(o?.StatusCode || statusCode);
  const items = detail?.order?.items || [];
  const replacedBy = Object.fromEntries(items.filter(i => i.ReplacesItemId).map(i => [i.ReplacesItemId, i]));
  const calledAt = people.called?.At;
  const stats = o ? [
    { label: 'สั่ง → เรียกคิว', value: calledAt ? formatDuration(minutesBetween(o.CreatedAt, calledAt)) : '—' },
    { label: 'เวลาทำอาหาร', value: people.cooking && people.cooked ? formatDuration(minutesBetween(people.cooking.At, people.cooked.At)) : '—' },
    { label: 'เรียกคิว → ลูกค้ารับ', value: calledAt && people.handed_over ? formatDuration(minutesBetween(calledAt, people.handed_over.At)) : '—' },
  ] : [];

  return (
    <div className="berry-modal-overlay mf-overlay sh-overlay" onClick={onClose}>
      <div className="mf-modal sh-modal" role="dialog" aria-modal="true" aria-labelledby="sh-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head sh-head">
          <div className="sh-queue-big">{o?.QueueNo || '…'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sh-head-badges">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {o && <span className={`sh-type ${o.IsWalkIn ? 'walkin' : 'online'}`}>{o.IsWalkIn ? 'Walk-in หน้าร้าน' : 'สั่งออนไลน์'}</span>}
            </div>
            <h3 id="sh-title">ออเดอร์ #{orderId}</h3>
            <p>{o ? `สั่งเมื่อ ${thaiDateTime(o.CreatedAt, true)}` : 'กำลังโหลด...'}{o?.PickupTime ? ` · นัดรับ ${o.PickupTime}` : ''}{o?.DeliveredAt ? ` · ส่งมอบ ${thaiDateTime(o.DeliveredAt, true)}` : ''}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} aria-label="ปิด"><Icon name="close" size={18} /></button>
        </div>

        <div className="mf-body sh-body">
          {error && <div className="mf-form-error">{error}</div>}
          {!detail && !error && (
            <div className="sh-loading">
              <Skeleton height={86} radius={14} />
              <Skeleton height={120} radius={14} />
              <Skeleton height={160} radius={14} />
            </div>
          )}

          {detail && (
            <>
              <section className="sh-section">
                <h4 className="sf-section-title"><Icon name="users" size={16} /> ผู้เกี่ยวข้องกับออเดอร์นี้</h4>
                <div className="sh-people">
                  <div className="sh-person">
                    <div className="sh-person-label"><Icon name="user" size={14} /> ลูกค้า</div>
                    <div className="sh-person-body">
                      <StaffAvatar name={o.IsWalkIn ? 'Walk in' : o.CustomerName} id={o.CustomerId || 0} size={36} />
                      <div style={{ minWidth: 0 }}>
                        <div className="sh-person-name">{o.IsWalkIn ? 'ลูกค้า Walk-in' : (o.CustomerName || '-')}</div>
                        <div className="sh-person-sub">
                          {o.CustomerPhone ? <a href={`tel:${o.CustomerPhone}`}>{formatPhone(o.CustomerPhone)}</a> : (o.IsWalkIn ? 'สั่งที่หน้าร้าน' : '-')}
                        </div>
                      </div>
                    </div>
                  </div>
                  <SalesPersonCard
                    label={o.IsWalkIn ? 'คีย์ออเดอร์ / รับเงิน' : 'รับออเดอร์ (ยืนยันสลิป)'}
                    icon="check"
                    person={people.accepted}
                    empty={o.StatusCode === 'VERIFYING_SLIP' ? 'รอตรวจสลิป' : 'ยังไม่มีคนรับ'}
                  />
                  <SalesPersonCard
                    label="ทำอาหาร"
                    icon="flame"
                    person={people.cooking || people.cooked}
                    extra={people.cooked && people.cooking && people.cooked.UserId !== people.cooking.UserId
                      ? `ทำเสร็จโดย ${people.cooked.Name}` : (people.cooked ? `เสร็จ ${timeHM(people.cooked.At)} น.` : null)}
                  />
                  <SalesPersonCard label="เรียกคิว" icon="bell" person={people.called} />
                  {people.cancelled ? (
                    <SalesPersonCard label="ยกเลิกโดย" icon="soldout" person={people.cancelled} />
                  ) : people.no_show ? (
                    <SalesPersonCard label="ตัดเป็นไม่มารับโดย" icon="soldout" person={people.no_show} />
                  ) : (
                    <SalesPersonCard label="ส่งมอบอาหาร" icon="award" person={people.handed_over} />
                  )}
                </div>
                <div className="sh-stats">
                  {stats.map(s => (
                    <div key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>
                  ))}
                </div>
              </section>

              <section className="sh-section">
                <h4 className="sf-section-title"><Icon name="receipt" size={16} /> รายการอาหาร</h4>
                <div className="nd-card">
                  <ul className="sh-items">
                    {items.map(i => {
                      const replaced = i.ItemStatus === 'REPLACED';
                      return (
                        <li key={i.OrderItemId} className={replaced ? 'replaced' : ''}>
                          <span className="sh-item-img">{i.ImageUrl ? <img src={i.ImageUrl} alt="" /> : <Icon name="photo" size={16} />}</span>
                          <span className="sh-item-name">
                            {i.ProductName} <b>× {i.Qty}</b>
                            {i.ItemStatus === 'OUT_OF_STOCK' && <em className="nd-tag">ของหมด</em>}
                            {i.ItemStatus === 'CANCELLED' && <em className="nd-tag">ยกเลิก</em>}
                            {replaced && <small>ลูกค้าเปลี่ยนเป็น “{replacedBy[i.OrderItemId]?.ProductName || 'เมนูอื่น'}”</small>}
                            {i.ReplacesItemId && <small className="sh-swap">เมนูที่เปลี่ยนมาแทน</small>}
                            {i.ItemNote && <small>หมายเหตุ: {i.ItemNote}</small>}
                          </span>
                          <span className="sh-item-price">฿{fmtMoney(Number(i.UnitPrice) * Number(i.Qty))}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {o.Note && <div className="sh-note"><Icon name="edit" size={14} /> หมายเหตุจากลูกค้า: {o.Note}</div>}
                  <div className="sh-total"><span>ยอดรวม</span><b>฿{fmtMoney(o.TotalAmount)}</b></div>
                  {o.CancelReason && <div className="sh-cancel-reason"><Icon name="soldout" size={14} /> เหตุผลที่ยกเลิก: {o.CancelReason}</div>}
                </div>
              </section>

              <section className="sh-section">
                <h4 className="sf-section-title"><Icon name="coin" size={16} /> การชำระเงิน</h4>
                {detail.payments.length === 0 ? (
                  <div className="sf-note">ไม่มีข้อมูลการชำระเงิน</div>
                ) : detail.payments.map(p => {
                  const ps = PAYMENT_STATUS_META[p.PaymentStatus] || { label: p.PaymentStatus, tone: 'neutral' };
                  return (
                    <div key={p.PaymentId} className="nd-card sh-pay">
                      {p.SlipUrl ? (
                        <button type="button" className="sh-slip" onClick={() => openFile(apiBase, p.SlipUrl)} title="เปิดสลิปขนาดเต็ม">
                          <AuthImage apiBase={apiBase} src={p.SlipUrl} alt="สลิปการโอน" />
                        </button>
                      ) : (
                        <span className="sh-slip none"><Icon name={p.MethodCode === 'CASH' ? 'coin' : 'receipt'} size={20} /></span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="sh-pay-head">
                          <strong>{p.PaymentType === 'TOP_UP' ? 'ส่วนต่างค่าอาหาร' : 'ค่าอาหาร'} · ฿{fmtMoney(p.Amount)}</strong>
                          <Badge tone={ps.tone}>{ps.label}</Badge>
                        </div>
                        <div className="sh-pay-sub">{p.MethodNameTh}{p.SlipUrl ? '' : (p.MethodCode === 'CASH' ? '' : ' · ไม่มีสลิปแนบ')}</div>
                        {p.CashReceived != null && (
                          <div className="sh-pay-sub">รับเงินสด <b>฿{fmtMoney(p.CashReceived)}</b> · ทอน <b>฿{fmtMoney(p.ChangeGiven || 0)}</b></div>
                        )}
                        <div className="sh-pay-sub">
                          {p.VerifiedByName
                            ? <>{p.PaymentStatus === 'REJECTED' ? 'ปฏิเสธโดย' : 'ตรวจโดย'} <b>{p.VerifiedByName}</b> ({ROLE_TH[p.VerifiedByRole] || p.VerifiedByRoleTh}){p.PaidAt ? ` · ${thaiDateTime(p.PaidAt, true)}` : ''}</>
                            : 'ยังไม่มีคนตรวจ'}
                        </div>
                        {p.RejectReason && <div className="sh-pay-reject">เหตุผลที่ปฏิเสธ: {p.RejectReason}</div>}
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="sh-section">
                <h4 className="sf-section-title"><Icon name="history" size={16} /> ไทม์ไลน์</h4>
                <ol className="sh-timeline">
                  {detail.timeline.map((t, idx) => {
                    const tm = orderStatusMeta(t.NewStatusCode);
                    const prev = detail.timeline[idx - 1];
                    const gap = prev ? minutesBetween(prev.CreatedAt, t.CreatedAt) : null;
                    return (
                      <li key={t.LogId} className={`tone-${tm.tone}`}>
                        <span className="dot" />
                        <div className="sh-tl-head">
                          <strong>{t.OldStatusCode ? t.NewStatusNameTh : `สร้างออเดอร์ · ${t.NewStatusNameTh}`}</strong>
                          <span>{thaiDateTime(t.CreatedAt, true)}</span>
                        </div>
                        <div className="sh-tl-sub">
                          {t.ChangedByType === 'SYSTEM'
                            ? 'โดยระบบอัตโนมัติ'
                            : <>โดย <b>{t.ChangedByName || '-'}</b> ({ROLE_TH[t.ChangedByRole] || t.ChangedByRoleTh || '-'})</>}
                          {gap !== null && <span className="sh-gap">+{formatDuration(gap)}</span>}
                        </div>
                        {t.Reason && <div className="sh-tl-reason">{t.Reason}</div>}
                      </li>
                    );
                  })}
                </ol>
              </section>

              {detail.refunds.length > 0 && (
                <section className="sh-section">
                  <h4 className="sf-section-title"><Icon name="coin" size={16} /> การคืนเงิน</h4>
                  {detail.refunds.map(r => {
                    const rs = REFUND_STATUS_META[r.RefundStatus] || { label: r.RefundStatus, tone: 'neutral' };
                    return (
                      <div key={r.RefundId} className="nd-card sh-row-card">
                        <div style={{ minWidth: 0 }}>
                          <strong>{REFUND_TYPE_TH[r.RefundType] || r.RefundType} · ฿{fmtMoney(r.Amount)}</strong>
                          <div className="sh-pay-sub">{r.Reason || '-'}</div>
                          <div className="sh-pay-sub">
                            ขอคืน {thaiDateTime(r.RequestedAt, true)}
                            {r.RefundedAt && ` · คืนแล้ว ${thaiDateTime(r.RefundedAt, true)}${r.RefundedByName ? ` โดย ${r.RefundedByName}` : ''}`}
                          </div>
                        </div>
                        <Badge tone={rs.tone}>{rs.label}</Badge>
                      </div>
                    );
                  })}
                </section>
              )}

              {(detail.review || detail.issues.length > 0) && (
                <section className="sh-section">
                  <h4 className="sf-section-title"><Icon name="star" size={16} /> ความเห็นจากลูกค้า</h4>
                  {detail.review && (
                    <div className="nd-card sh-row-card">
                      <div style={{ minWidth: 0 }}>
                        <div className="sh-stars" aria-label={`${detail.review.Rating} ดาว`}>
                          {[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= detail.review.Rating ? 'on' : ''}>★</span>)}
                        </div>
                        <div className="sh-pay-sub">{detail.review.Comment || 'ไม่ได้เขียนความเห็น'}</div>
                      </div>
                      <span className="nd-muted">{thaiDateTime(detail.review.CreatedAt)}</span>
                    </div>
                  )}
                  {detail.issues.map(is => (
                    <div key={is.IssueReportId} className="nd-card sh-row-card">
                      <div style={{ minWidth: 0 }}>
                        <strong>รายงานปัญหา: {is.IssueType}</strong>
                        <div className="sh-pay-sub">{is.Description}</div>
                      </div>
                      <Badge tone={(ISSUE_STATUS[is.IssueStatus] || {}).tone || 'neutral'}>{(ISSUE_STATUS[is.IssueStatus] || {}).label || is.IssueStatus}</Badge>
                    </div>
                  ))}
                </section>
              )}

              {detail.prints.length > 0 && (
                <section className="sh-section">
                  <h4 className="sf-section-title"><Icon name="receipt" size={16} /> การพิมพ์</h4>
                  <div className="nd-card">
                    <ul className="sh-prints">
                      {detail.prints.map(pj => (
                        <li key={pj.PrintJobId}>
                          <span>{PRINT_TYPE_TH[pj.PrintType] || pj.PrintType}{pj.PerformedByName ? ` · โดย ${pj.PerformedByName}` : ''}</span>
                          <span className="nd-muted">{pj.PrintStatus === 'PRINTED' ? thaiDateTime(pj.PrintedAt, true) : 'รอพิมพ์'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="mf-footer" style={{ gridTemplateColumns: '1fr' }}>
          <button type="button" className="mf-btn ghost" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}
