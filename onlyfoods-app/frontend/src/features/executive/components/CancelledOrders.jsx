import { useMemo, useState, useEffect } from 'react';
import { T, FONT_STACK, tableStyle, thStyle, thRightStyle, trStyle, tdStyle, tdRightStyle, cancelStatRowStyle, cancelStatBoxStyle, cancelStatLabelStyle, cancelStatValueStyle, cancelChipRowStyle, cancelChipStyle } from '../theme';
import { money, thaiDateTime, money2 } from '../lib/format';
import { parseOrderDate } from '../lib/dates';
import { sumAmount, CANCEL_REASON_FALLBACK, summarizeCancelReasons } from '../lib/sales';
import { Card, Badge, Button, EmptyState, AlertBanner, Modal } from './ui';
import { callApi } from '../lib/api';

// ===== ออเดอร์ยกเลิก: สรุปและตรวจสอบรายการที่ถูกยกเลิก =====
export function CancelledOrdersCard({ api, cancelled = [], periodLabel, showStore = true, loading = false, style, onStoreClick }) {
    const [reasonFilter, setReasonFilter] = useState('');
    const [openId, setOpenId] = useState(null);
    const [showAll, setShowAll] = useState(false);
    const reasons = useMemo(() => summarizeCancelReasons(cancelled), [cancelled]);
    const rows = useMemo(() => {
        const filtered = reasonFilter
            ? cancelled.filter((o) => (String(o.CancelReason || '').trim() || CANCEL_REASON_FALLBACK) === reasonFilter)
            : cancelled;
        return [...filtered].sort((a, b) => {
            const at = parseOrderDate(a.CreatedAt);
            const bt = parseOrderDate(b.CreatedAt);
            return (bt ? bt.getTime() : 0) - (at ? at.getTime() : 0);
        });
    }, [cancelled, reasonFilter]);
    const lostAmount = sumAmount(cancelled);
    const topReason = reasons[0] || null;
    const visibleRows = showAll ? rows : rows.slice(0, 8);
    const openOrder = cancelled.find((o) => o.OrderID === openId) || null;
    return (<Card title="รายงานออเดอร์ยกเลิก" subtitle={`${periodLabel} · กดที่แถวเพื่อดูว่าใครสั่ง ใครยกเลิก เพราะอะไร และสั่งอะไรไปบ้าง`} right={<Badge tone={cancelled.length ? 'danger' : 'ok'}>{money(cancelled.length)} ออเดอร์</Badge>} style={{ marginTop: '16px', ...style }}>
      {loading && <EmptyState text="กำลังโหลดข้อมูล..." minHeight="160px"/>}

      {!loading && !cancelled.length && (<EmptyState text="ช่วงเวลานี้ไม่มีออเดอร์ที่ถูกยกเลิก" minHeight="160px"/>)}

      {!loading && cancelled.length > 0 && (<>

          <div style={cancelStatRowStyle}>
            <div style={cancelStatBoxStyle}>
              <span style={cancelStatLabelStyle}>ออเดอร์ที่ถูกยกเลิก</span>
              <strong style={cancelStatValueStyle}>{money(cancelled.length)} ออเดอร์</strong>
            </div>
            <div style={cancelStatBoxStyle}>
              <span style={cancelStatLabelStyle}>มูลค่าที่เสียไป</span>
              <strong style={{ ...cancelStatValueStyle, color: T.down }}>
                {money(lostAmount)} บาท
              </strong>
            </div>
            <div style={cancelStatBoxStyle}>
              <span style={cancelStatLabelStyle}>เหตุผลที่พบบ่อยที่สุด</span>
              <strong style={{ ...cancelStatValueStyle, fontSize: '15px' }}>
                {topReason ? topReason.reason : '-'}
              </strong>
            </div>
          </div>

          <div style={cancelChipRowStyle}>
            <button type="button" onClick={() => setReasonFilter('')} style={cancelChipStyle(!reasonFilter)}>
              ทั้งหมด ({money(cancelled.length)})
            </button>
            {reasons.map((r) => (<button key={r.reason} type="button" onClick={() => setReasonFilter((prev) => (prev === r.reason ? '' : r.reason))} style={cancelChipStyle(reasonFilter === r.reason)} title={`${r.reason} · มูลค่า ${money(r.amount)} บาท`}>
                {r.reason} ({money(r.count)})
              </button>))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>เวลาที่สั่ง</th>
                  <th style={thStyle}>คิว</th>
                  {showStore && <th style={thStyle}>ร้านค้า</th>}
                  <th style={thStyle}>ลูกค้า</th>
                  <th style={thRightStyle}>ยอดออเดอร์</th>
                  <th style={thStyle}>เหตุผลการยกเลิก</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((o) => (<tr key={o.OrderID} className="of-click-row" title="กดเพื่อดูรายละเอียดออเดอร์นี้" style={{ ...trStyle, cursor: 'pointer', background: openId === o.OrderID ? T.bg : 'transparent' }} onClick={() => setOpenId(o.OrderID)}>
                      <td style={tdStyle}>{thaiDateTime(o.CreatedAt)}</td>
                      <td style={tdStyle}>
                        <strong style={{ color: T.ink }}>{o.QueueNo || '-'}</strong>
                        {Boolean(o.IsWalkIn) && (<span style={{ marginLeft: '8px' }}>
                            <Badge tone="neutral">หน้าร้าน</Badge>
                          </span>)}
                      </td>
                      {showStore && <td style={tdStyle}>{onStoreClick ? (<button type="button" onClick={(event) => { event.stopPropagation(); onStoreClick(o.StoreId); }} title={`ดูเฉพาะร้าน ${o.StoreName || `ร้าน #${o.StoreId}`}`} style={{ border: 'none', background: 'transparent', padding: 0, color: T.ink, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK, textAlign: 'left', textDecoration: 'underline', textUnderlineOffset: '3px' }}>{o.StoreName || `ร้าน #${o.StoreId}`}</button>) : (o.StoreName || `ร้าน #${o.StoreId}`)}</td>}
                      <td style={tdStyle}>{cancelCustomerName(o)}</td>
                      <td style={{ ...tdRightStyle, color: T.down, fontWeight: 600 }}>
                        {money(o.TotalAmount)} บาท
                      </td>
                      <td style={tdStyle}>
                        {String(o.CancelReason || '').trim() || (<span style={{ color: T.muted }}>{CANCEL_REASON_FALLBACK}</span>)}
                      </td>
                    </tr>))}
                {rows.length === 0 && (<tr>
                    <td colSpan={showStore ? 6 : 5} style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                      ไม่มีออเดอร์ที่ตรงกับเหตุผลที่เลือก
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          
          {rows.length > 8 && (<div style={{ marginTop: '14px', textAlign: 'center' }}>
              <Button variant="ghost" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'ย่อรายการ' : `ดูทั้งหมด ${money(rows.length)} ออเดอร์`}
              </Button>
            </div>)}
        </>)}
              <CancelledOrderDetailModal api={api} order={openOrder} onClose={() => setOpenId(null)}/>
    </Card>);
}

// ชื่อลูกค้าของออเดอร์ (walk-in ไม่มีบัญชีลูกค้า)
export const cancelCustomerName = (o) => o.CustomerName || o.UserName || (Number(o.IsWalkIn) === 1 ? 'ลูกค้าหน้าร้าน (Walk-in)' : 'ไม่ระบุ');

export const PAYMENT_STATUS_TH = { VERIFIED: 'ชำระแล้ว', PENDING: 'รอตรวจสอบการชำระ', REJECTED: 'สลิปไม่ผ่าน (ไม่ได้รับเงิน)' };

export const REFUND_STATUS_TH = { PENDING: 'รอคืนเงิน', DONE: 'คืนเงินแล้ว', FAILED: 'คืนเงินไม่สำเร็จ' };

export const ITEM_STATUS_TH = { OUT_OF_STOCK: 'สินค้าหมด', CANCELLED: 'ยกเลิกรายการ' };

// รายละเอียดออเดอร์ที่ยกเลิก: ดึง /api/orders/{id}/detail (ใครกดยกเลิก + เวลา จาก OrderStatusLog, การชำระ, การคืนเงิน)
export function CancelledOrderDetailModal({ api, order, onClose }) {
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!order || !api) return undefined;
        let stop = false;
        setDetail(null);
        setError('');
        callApi(`${api}/api/orders/${order.OrderID}/detail`)
            .then((data) => { if (!stop) setDetail(data); })
            .catch((err) => { if (!stop) setError(err.message || 'โหลดรายละเอียดไม่สำเร็จ'); });
        return () => { stop = true; };
    }, [api, order]);
    if (!order) return null;
    const o = detail?.order || order;
    const cancelStep = [...(detail?.timeline || [])].reverse().find((t) => t.NewStatusCode === 'CANCELLED');
    const cancelledBy = !cancelStep ? null
        : cancelStep.ChangedByType === 'SYSTEM' ? 'ระบบ (ยกเลิกอัตโนมัติ)'
        : `${cancelStep.ChangedByName || 'ไม่ทราบชื่อ'}${cancelStep.ChangedByRoleTh ? ` · ${cancelStep.ChangedByRoleTh}` : ''}`;
    const payment = (detail?.payments || []).filter((p) => p.PaymentType === 'ORDER').slice(-1)[0];
    const refunds = detail?.refunds || [];
    const items = (detail?.order?.items || order.items || []).filter((it) => it.ItemStatus !== 'REPLACED');
    const info = (label, value, full) => (<div style={{ gridColumn: full ? '1 / -1' : 'auto', minWidth: 0 }}>
        <div style={{ color: T.muted, fontSize: '12px', fontWeight: 600 }}>{label}</div>
        <div style={{ color: T.ink, fontSize: '14px', marginTop: '3px', overflowWrap: 'anywhere' }}>{value}</div>
      </div>);
    const waiting = !detail && !error ? <span style={{ color: T.muted }}>กำลังโหลด...</span> : null;
    return (<Modal open title={`ออเดอร์ที่ยกเลิก · คิว ${o.QueueNo || '-'}`} subtitle={o.StoreName} onClose={onClose} width={680}>
      {error && <AlertBanner style={{ marginBottom: '12px' }}>โหลดข้อมูลบางส่วนไม่สำเร็จ: {error}</AlertBanner>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '14px 20px', padding: '14px 16px', borderRadius: T.radiusMd, background: T.bg }}>
        {info('ลูกค้า', <>{cancelCustomerName(o)}{o.CustomerPhone && <span style={{ color: T.muted }}> · {o.CustomerPhone}</span>}</>)}
        {info('ผู้กดยกเลิก', waiting || cancelledBy || <span style={{ color: T.muted }}>ไม่พบบันทึกในระบบ</span>)}
        {info('สั่งเมื่อ', `${thaiDateTime(o.CreatedAt)} น.`)}
        {info('ยกเลิกเมื่อ', waiting || (cancelStep ? `${thaiDateTime(cancelStep.CreatedAt)} น.` : <span style={{ color: T.muted }}>ไม่พบบันทึกในระบบ</span>))}
        {info('ช่องทางชำระ', <>{o.PaymentMethod || '-'}{(payment?.PaymentStatus || o.PaymentStatus) && <span style={{ color: T.muted }}> · {PAYMENT_STATUS_TH[payment?.PaymentStatus || o.PaymentStatus] || (payment?.PaymentStatus || o.PaymentStatus)}</span>}</>)}
        {info('การคืนเงิน', waiting || (refunds.length ? refunds.map((r) => (<div key={r.RefundId}>{money2(r.Amount)} บาท · <span style={{ color: r.RefundStatus === 'DONE' ? T.up : T.amber, fontWeight: 600 }}>{REFUND_STATUS_TH[r.RefundStatus] || r.RefundStatus}</span>{r.RefundedAt ? ` (${thaiDateTime(r.RefundedAt)})` : ''}</div>)) : <span style={{ color: T.muted }}>ไม่มีการคืนเงิน</span>))}
        {info('เหตุผลการยกเลิก', String(o.CancelReason || '').trim() || CANCEL_REASON_FALLBACK, true)}
        {o.Note && info('หมายเหตุจากลูกค้า', o.Note, true)}
      </div>

      <h4 style={{ margin: '18px 0 0', color: T.ink, fontSize: '14.5px' }}>รายการอาหาร</h4>
      <table style={{ ...tableStyle, minWidth: 0 }}>
        <thead><tr><th style={thStyle}>เมนู</th><th style={thRightStyle}>จำนวน</th><th style={thRightStyle}>ราคา/หน่วย</th><th style={thRightStyle}>รวม</th></tr></thead>
        <tbody>
          {items.length === 0 && (<tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>ไม่พบรายการอาหารของออเดอร์นี้</td></tr>)}
          {items.map((it, i) => (<tr key={it.OrderItemId || it.DetailID || i} style={trStyle}>
              <td style={tdStyle}>{it.ProductName || `สินค้า #${it.ProductId}`}{ITEM_STATUS_TH[it.ItemStatus] && <span style={{ marginLeft: '8px' }}><Badge tone="warn">{ITEM_STATUS_TH[it.ItemStatus]}</Badge></span>}</td>
              <td style={tdRightStyle}>{money(it.Qty)}</td>
              <td style={tdRightStyle}>{money2(it.UnitPrice)} บาท</td>
              <td style={tdRightStyle}>{money2(Number(it.Qty || 0) * Number(it.UnitPrice || 0))} บาท</td>
            </tr>))}
          <tr><td colSpan={3} style={{ ...tdRightStyle, fontWeight: 700, color: T.ink }}>ยอดรวมออเดอร์</td><td style={{ ...tdRightStyle, fontWeight: 700, color: T.ink }}>{money2(o.TotalAmount)} บาท</td></tr>
        </tbody>
      </table>
    </Modal>);
}
