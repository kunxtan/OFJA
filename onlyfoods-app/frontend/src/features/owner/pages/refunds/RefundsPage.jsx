import { todayISO, toISODate } from '../../../../lib/dates';
import { parseOrderDate } from '../../lib/dates';
import { awaitingAccount, STATUS_TH as REFUND_STATUS_TH, payoutLabel } from '../../../../shared/refunds/refundText';
import { fmtBaht, fmtMoney, thaiDate, timeHM, formatPhone, thaiDateTime } from '../../lib/format';
import { REFUND_TYPE_TH } from '../history/salesMeta';
import { PageHeader, Icon, Skeleton, Badge } from '../../components/ui';
import { openFile } from '../../../../shared/ui/AuthImage';

// หน้าคืนเงินลูกค้า : รอคืน/พร้อมโอน/รอลูกค้าระบุบัญชี/คืนแล้ว
// ข้อมูลและ state อยู่ที่ OwnerView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function RefundsPage({
  refundRange, refundFrom, refundTo, refunds, refundStatus, refundSearch, refundLimit, setSalesDetailId,
  pendingRefundCount, setRefundRange, setRefundLimit, setRefundFrom, setRefundTo, loaded, setRefundStatus,
  setRefundSearch, setRefundChecking, setRefundConfirming, apiBase
}) {
  // ---- ช่วงวันที่ (ตามวันที่ขอคืน) ----
  const today = todayISO();
  const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); };
  const range = refundRange === 'custom'
    ? { from: refundFrom || today, to: refundTo || today }
    : refundRange === 'all' ? null
    : { from: refundRange === 'today' ? today : shiftDays(Number(refundRange) - 1), to: today };
  const dayKey = (r) => { const d = parseOrderDate(r.RequestedAt); return d ? toISODate(d) : 'unknown'; };
  const inRange = refunds.filter(r => !range || (dayKey(r) >= range.from && dayKey(r) <= range.to));

  // ---- สถานะ ----
  const isPending = (r) => r.RefundStatus === 'PENDING';
  const needSlipCheck = (r) => isPending(r) && r.SlipUnverified;
  // ออนไลน์ : ลูกค้าระบุบัญชีแล้ว = พร้อมโอน ; ยังไม่ระบุ = รอลูกค้า (walk-in คืนเงินสดที่หน้าร้าน)
  const needTransfer = (r) => isPending(r) && !r.SlipUnverified && !r.IsWalkIn && r.PayoutMethod === 'TRANSFER';
  const needAccount = (r) => !r.SlipUnverified && awaitingAccount(r);
  const pendingList = inRange.filter(isPending);
  const doneList = inRange.filter(r => r.RefundStatus === 'DONE');
  const failedList = inRange.filter(r => r.RefundStatus === 'FAILED');
  const slipCount = inRange.filter(needSlipCheck).length;
  const transferCount = inRange.filter(needTransfer).length;
  const accountCount = inRange.filter(needAccount).length;
  const sumOf = (list) => list.reduce((s, r) => s + Number(r.Amount || 0), 0);
  const statusTabs = [
    { id: 'pending', label: 'รอคืน', count: pendingList.length, tone: 'amber' },
    { id: 'slip', label: 'ต้องตรวจสลิป', count: slipCount, tone: 'red' },
    { id: 'transfer', label: 'พร้อมโอนคืน', count: transferCount },
    { id: 'account', label: 'รอลูกค้าระบุบัญชี', count: accountCount },
    { id: 'done', label: 'คืนแล้ว', count: doneList.length, tone: 'green' },
    ...(failedList.length ? [{ id: 'failed', label: 'ไม่ต้องคืน', count: failedList.length }] : []),
    { id: 'all', label: 'ทั้งหมด', count: inRange.length },
  ];
  const matchStatus = {
    all: () => true,
    pending: isPending,
    slip: needSlipCheck,
    transfer: needTransfer,
    account: needAccount,
    done: (r) => r.RefundStatus === 'DONE',
    failed: (r) => r.RefundStatus === 'FAILED',
  }[refundStatus] || (() => true);

  // ---- ค้นหา ----
  const q = refundSearch.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const shown = inRange
    .filter(matchStatus)
    .filter(r => !q
      || String(r.QueueNo || '').toLowerCase().includes(q)
      || String(r.OrderId).includes(q)
      || String(r.CustomerName || '').toLowerCase().includes(q)
      || String(r.Reason || '').toLowerCase().includes(q)
      || (qDigits.length >= 3 && String(r.CustomerPhone || '').includes(qDigits)))
    .sort((x, y) => (parseOrderDate(y.RequestedAt)?.getTime() || 0) - (parseOrderDate(x.RequestedAt)?.getTime() || 0)
      || y.RefundId - x.RefundId);

  // ---- สรุปยอดของช่วงที่เลือก ----
  const doneTransfer = sumOf(doneList.filter(r => r.PaidMethod === 'TRANSFER'));
  const typeCounts = inRange.reduce((acc, r) => { acc[r.RefundType] = (acc[r.RefundType] || 0) + 1; return acc; }, {});
  const kpis = [
    { tone: 'amber', icon: 'clock', value: `฿${fmtBaht(sumOf(pendingList))}`, label: 'รอคืนเงิน (ยังไม่นับเป็นรายได้)',
      sub: pendingList.length ? [`${fmtMoney(pendingList.length)} รายการ`, transferCount ? `พร้อมโอน ${transferCount}` : null,
        accountCount ? `รอบัญชี ${accountCount}` : null].filter(Boolean).join(' · ') : 'ไม่มีรายการค้าง' },
    { tone: 'green', icon: 'check', value: `฿${fmtBaht(sumOf(doneList))}`, label: 'คืนเงินแล้ว',
      sub: doneList.length ? `${fmtMoney(doneList.length)} รายการ · โอน ฿${fmtBaht(doneTransfer)} · เงินสด ฿${fmtBaht(sumOf(doneList) - doneTransfer)}` : null },
    { tone: 'red', icon: 'alert', value: fmtMoney(slipCount), label: 'ต้องตรวจสลิปก่อนคืน',
      sub: slipCount ? 'ออเดอร์ถูกยกเลิกก่อนร้านตรวจสลิป' : null },
    { tone: 'blue', icon: 'receipt', value: fmtMoney(inRange.length), label: 'รายการคืนเงินทั้งหมด',
      sub: Object.entries(typeCounts).map(([t, n]) => `${REFUND_TYPE_TH[t] || t} ${n}`).join(' · ') || null },
  ];
  const rangeChips = [
    { id: 'today', label: 'วันนี้' }, { id: '7', label: '7 วัน' }, { id: '30', label: '30 วัน' },
    { id: 'all', label: 'ทั้งหมด' }, { id: 'custom', label: 'กำหนดเอง' },
  ];

  // ---- จัดกลุ่มตามวันที่ขอคืน (แสดงทีละ refundLimit รายการ) ----
  const visible = shown.slice(0, refundLimit);
  const days = [];
  visible.forEach(r => {
    const key = dayKey(r);
    let day = days[days.length - 1];
    if (!day || day.key !== key) { day = { key, date: parseOrderDate(r.RequestedAt), rows: [] }; days.push(day); }
    day.rows.push(r);
  });
  const daySummary = (key) => {
    const list = shown.filter(r => dayKey(r) === key);
    const pend = list.filter(isPending);
    const done = list.filter(r => r.RefundStatus === 'DONE');
    return [
      `${list.length} รายการ`,
      pend.length ? `รอคืน ฿${fmtBaht(sumOf(pend))}` : null,
      done.length ? `คืนแล้ว ฿${fmtBaht(sumOf(done))}` : null,
    ].filter(Boolean).join(' · ');
  };
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const openOrder = (r) => setSalesDetailId(r.OrderId);
  const emptyText = {
    pending: ['ไม่มีรายการที่รอคืนเงิน', 'เมื่อมีการยกเลิกหลังจ่ายเงิน หรือเปลี่ยนเมนูที่ถูกกว่า รายการจะมาแสดงที่นี่'],
    slip: ['ไม่มีสลิปที่ต้องตรวจ', 'รายการที่ออเดอร์ถูกยกเลิกก่อนร้านตรวจสลิปจะแสดงที่นี่'],
    transfer: ['ไม่มีรายการที่พร้อมโอนคืน', 'ลูกค้าออนไลน์ที่ระบุบัญชีรับเงินคืนแล้วจะแสดงที่นี่'],
    account: ['ไม่มีรายการที่รอลูกค้าระบุบัญชี', 'ระบบแจ้งลูกค้าให้ระบุบัญชีรับเงินคืนแล้ว เมื่อระบุแล้วรายการจะย้ายไปที่ "พร้อมโอนคืน"'],
  }[refundStatus] || ['ไม่พบรายการคืนเงินในช่วงนี้', 'ลองเลือกช่วงวันที่ที่กว้างขึ้น หรือเปลี่ยนตัวกรองสถานะ'];

  return (
    <>
      <PageHeader title="คืนเงินลูกค้า" subtitle="เงินที่ต้องคืนลูกค้าจากการยกเลิกหรือเปลี่ยนเมนู กดที่รายการเพื่อดูรายละเอียดออเดอร์" icon="coin">
        <span className={`op-count-chip ${pendingRefundCount ? 'danger' : ''}`}>
          {pendingRefundCount ? `รอคืน ${fmtMoney(pendingRefundCount)} รายการ` : 'ไม่มีรายการค้าง'}
        </span>
      </PageHeader>

      <div className="rv-privacy rr-note">
        <Icon name="lock" size={15} />
        ยอดที่รอคืนไม่ถูกนับเป็นรายได้ · ลูกค้าออนไลน์รับเงินคืนทางโอนเท่านั้น ต้องแนบสลิปโอนทุกครั้ง และข้อมูลบัญชีลูกค้าจะถูกลบหลังยืนยัน · walk-in คืนเงินสดที่หน้าร้าน
      </div>

      <div className="sh-filter-bar">
        <div className="sh-range" role="group" aria-label="ช่วงวันที่ขอคืนเงิน">
          <Icon name="calendar" size={16} />
          {rangeChips.map(c => (
            <button key={c.id} type="button" className={refundRange === c.id ? 'active' : ''}
              onClick={() => { setRefundRange(c.id); setRefundLimit(60); }}>
              {c.label}
            </button>
          ))}
        </div>
        {refundRange === 'custom' && (
          <div className="berry-date-range sh-dates">
            <label>
              ตั้งแต่
              <input type="date" value={refundFrom} max={refundTo || today}
                onChange={e => { const v = e.target.value || today; setRefundFrom(v); if (v > refundTo) setRefundTo(v); setRefundLimit(60); }} />
            </label>
            <label>
              ถึง
              <input type="date" value={refundTo} min={refundFrom} max={today}
                onChange={e => { setRefundTo(e.target.value || today); setRefundLimit(60); }} />
            </label>
          </div>
        )}
        <span className="sh-range-label">
          {range ? (range.from === range.to ? thaiDate(range.from) : `${thaiDate(range.from)} – ${thaiDate(range.to)}`) : 'ทุกช่วงเวลา'}
        </span>
      </div>

      <div className="sf-stats">
        {kpis.map(k => (
          <div key={k.label} className={`sf-stat tone-${k.tone}`}>
            <span className="icon"><Icon name={k.icon} size={20} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="value">{loaded.refunds ? k.value : <Skeleton height={22} width={60} />}</div>
              <div className="label">{k.label}</div>
              {loaded.refunds && k.sub && <div className="sub">{k.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="mm-toolbar mm-wrap-tabs">
        <div className="mm-tabs" role="tablist" aria-label="กรองตามสถานะการคืนเงิน">
          {statusTabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={refundStatus === t.id}
              onClick={() => { setRefundStatus(t.id); setRefundLimit(60); }}
              className={`mm-tab ${refundStatus === t.id ? 'active' : ''} ${t.tone ? `tone-${t.tone}` : ''}`}>
              {t.tone && <span className="dot" />}
              {t.label}
              <span className="count">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="mm-search">
          <Icon name="search" size={16} />
          <input value={refundSearch} onChange={e => { setRefundSearch(e.target.value); setRefundLimit(60); }}
            placeholder="ค้นหาเลขคิว เลขออเดอร์ ชื่อ เบอร์โทร หรือเหตุผล..." aria-label="ค้นหารายการคืนเงิน" />
          {refundSearch && (
            <button type="button" onClick={() => setRefundSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>
          )}
        </div>
      </div>

      {!loaded.refunds ? (
        <div className="sh-list">{[0, 1, 2, 3].map(i => <Skeleton key={i} height={72} radius={14} />)}</div>
      ) : shown.length === 0 ? (
        <div className="sf-empty">
          <span className="icon"><Icon name={q ? 'search' : 'coin'} size={28} /></span>
          <h3>{q ? 'ไม่พบรายการที่ตรงกับการค้นหา' : emptyText[0]}</h3>
          <p>{q ? 'ลองค้นด้วยเลขคิว ชื่อลูกค้า หรือเบอร์โทรอื่น' : emptyText[1]}</p>
        </div>
      ) : (
        <div className="sh-list">
          {days.map(day => (
            <section key={day.key} className="sh-day">
              <div className="sh-day-head">
                <strong>{day.date ? day.date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'ไม่ทราบวันที่'}</strong>
                <span>{daySummary(day.key)}</span>
              </div>
              <div className="sh-day-card">
                {day.rows.map(r => {
                  const pending = isPending(r);
                  const transfer = (r.RefundStatus === 'DONE' ? r.PaidMethod : r.PayoutMethod) === 'TRANSFER';
                  const statusClass = needSlipCheck(r) ? 'cancelled' : pending ? 'active' : r.RefundStatus === 'DONE' ? 'done' : 'noshow';
                  const badgeTone = needSlipCheck(r) ? 'danger' : pending ? 'warning' : r.RefundStatus === 'DONE' ? 'success' : 'neutral';
                  const badgeLabel = needSlipCheck(r) ? 'สลิปยังไม่ได้ตรวจ'
                    : needAccount(r) ? 'รอลูกค้าระบุบัญชี'
                    : needTransfer(r) ? 'รอร้านโอนคืน'
                    : (REFUND_STATUS_TH[r.RefundStatus] || r.RefundStatus);
                  // คืนคนละวันกับวันที่ขอ (กลุ่มวันเป็นวันที่ขอ) : ใส่วันที่ด้วย
                  const refundedDay = r.RefundedAt && dayKey({ RequestedAt: r.RefundedAt }) !== day.key
                    ? `${parseOrderDate(r.RefundedAt)?.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ` : '';
                  return (
                    <div key={r.RefundId} className={`sh-row rr-row status-${statusClass}`} role="button" tabIndex={0}
                      aria-label={`ดูออเดอร์ #${r.OrderId} คิว ${r.QueueNo}`}
                      onClick={() => openOrder(r)}
                      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openOrder(r); } }}>
                      <span className="sh-time">{timeHM(r.RequestedAt)}</span>
                      <span className="sh-queue">{r.QueueNo}</span>
                      <span className="sh-main">
                        <span className="sh-who">
                          {r.IsWalkIn ? <span className="sh-type walkin">Walk-in</span> : (r.CustomerName || 'ลูกค้า')}
                          {r.CustomerPhone && <span className="sh-order-id rr-phone">{formatPhone(r.CustomerPhone)}</span>}
                          <span className="sh-order-id">#{r.OrderId}</span>
                        </span>
                        <span className="sh-items-text" title={r.Reason || ''}>
                          <b className="rr-type">{REFUND_TYPE_TH[r.RefundType] || r.RefundType}</b>
                          {r.Reason ? ` · ${r.Reason}` : ''}
                        </span>
                      </span>
                      <span className={`rr-payout ${transfer ? 'transfer' : ''}`}>
                        <Icon name={transfer ? 'receipt' : 'coin'} size={14} />
                        <span>
                          {payoutLabel(r)}
                          {pending && r.PayoutMethod === 'TRANSFER' && r.PayoutBank && <small>{r.PayoutBank}</small>}
                        </span>
                      </span>
                      <span className="sh-amount">฿{fmtBaht(r.Amount)}</span>
                      <span className="sh-status">
                        <Badge tone={badgeTone}>{badgeLabel}</Badge>
                        {r.RefundedAt && (
                          <span className="sh-delivered" title={`คืนเมื่อ ${thaiDateTime(r.RefundedAt, true)}`}>
                            {r.RefundedByName ? `${r.RefundedByName} · ` : ''}{refundedDay}{timeHM(r.RefundedAt)}
                          </span>
                        )}
                      </span>
                      <span className="rr-action">
                        {pending && needSlipCheck(r) ? (
                          <button type="button" className="rr-btn danger" onClick={stop(() => setRefundChecking(r))}>ตรวจสลิป</button>
                        ) : pending && needAccount(r) ? (
                          <span className="rr-wait">รอลูกค้า<br />ระบุบัญชี</span>
                        ) : pending ? (
                          <button type="button" className="rr-btn primary" onClick={stop(() => setRefundConfirming(r))}>
                            {r.IsWalkIn ? 'คืนเงินสดแล้ว' : 'โอนคืน'}
                          </button>
                        ) : r.TransferSlipUrl ? (
                          <button type="button" className="rr-btn ghost" onClick={stop(() => openFile(apiBase, r.TransferSlipUrl))}>
                            <Icon name="eye" size={14} /> สลิปโอน
                          </button>
                        ) : (
                          <span className="sh-chevron"><Icon name="arrowRight" size={16} /></span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {shown.length > refundLimit && (
            <button type="button" className="sh-more" onClick={() => setRefundLimit(n => n + 60)}>
              แสดงเพิ่ม ({fmtMoney(shown.length - refundLimit)} รายการที่เหลือ)
            </button>
          )}
        </div>
      )}
    </>
  );
}
