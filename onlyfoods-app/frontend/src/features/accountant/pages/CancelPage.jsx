import { parseOrderDate, fmtMoney, fmtRate, fmtDateTime, fmtMoney2, fmtDateTh, fmtTimeOnly } from '../lib/format';
import { moneyOf, isPaymentRejected, orderItemsOf, customerNameOf } from '../lib/orders';
import { BerryStatCard, ShowMoreToggle, Icon, Badge } from '../components/ui';
import { ALERT_WINDOW_DAYS, RATE_WARN, RATE_ALERT } from '../lib/constants';
import { BerryBulletChart } from '../components/charts';

// หน้าการยกเลิก : อัตรายกเลิกรายร้าน เหตุผล รายการออเดอร์ที่ถูกยกเลิก
// ข้อมูลและ state อยู่ที่ AccountantView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function CancelPage({
  cancelRange, cancelCustomStart, cancelCustomEnd, cancelStoreFilter, cancelSummary, cancelledOrdersList,
  cancelInfoOf, cancelReasonFilter, cancelShowAll, cancelDetailId, orders, setCancelStoreFilter,
  setCancelReasonFilter, setCancelShowAll, setCancelRange, setCancelCustomStart, setCancelCustomEnd,
  cancelScope, alertStores, cancelTableRows, rateOpen, RATE_LIMIT, setRateOpen, alertOpen, ALERT_LIMIT,
  openStoreCancel, setAlertOpen, setCancelDetailId
}) {
  const cancelPeriodLabel = cancelRange === 'all' ? 'ทุกช่วงเวลา'
    : cancelRange === 'today' ? 'วันนี้'
    : cancelRange === 'custom' ? `${cancelCustomStart || '...'} ถึง ${cancelCustomEnd || '...'}`
    : `${cancelRange} วันล่าสุด`;
  const cancelStoreName = cancelStoreFilter === 'all' ? 'ทุกร้านค้า' : (cancelSummary.find(x => String(x.storeId) === String(cancelStoreFilter))?.storeName || '-');

  const rowsAll = cancelledOrdersList.map(o => ({ o, info: cancelInfoOf(o), reason: String(o.CancelReason || '').trim() || 'ไม่ระบุเหตุผล' }))
    .sort((x, y) => (parseOrderDate(y.info.time)?.getTime() || 0) - (parseOrderDate(x.info.time)?.getTime() || 0));
  const reasonCount = {};
  rowsAll.forEach(r => { reasonCount[r.reason] = (reasonCount[r.reason] || 0) + 1; });
  const reasons = Object.entries(reasonCount).sort((x, y) => y[1] - x[1]);
  const activeReason = reasons.some(([k]) => k === cancelReasonFilter) ? cancelReasonFilter : '';
  const rowsFiltered = activeReason ? rowsAll.filter(r => r.reason === activeReason) : rowsAll;
  const rowsShown = cancelShowAll ? rowsFiltered : rowsFiltered.slice(0, 8);
  // มูลค่าที่เสียไป = ผลรวม TotalAmount ของออเดอร์ที่ถูกยกเลิก ยกเว้นสลิปถูกปฏิเสธ (ร้านไม่เคยได้รับเงิน) — จำนวนออเดอร์ยังนับครบทุกใบ
  const lostAmount = rowsAll.reduce((a, r) => a + moneyOf(r.o), 0);
  const rejectedCount = rowsAll.filter(r => isPaymentRejected(r.o)).length;
  const showStoreCol = cancelStoreFilter === 'all';

  const detailOrder = cancelDetailId ? orders.find(o => String(o.OrderID) === String(cancelDetailId)) : null;
  const detailInfo = detailOrder ? cancelInfoOf(detailOrder) : null;
  const detailItems = detailOrder ? orderItemsOf(detailOrder) : [];

  return (
  <div className="berry-dashboard-grid">
    <div className="berry-panel berry-filter-row" style={{ flexWrap: 'wrap' }}>
      <label>ร้านค้า:</label>
      <select className="berry-input" value={cancelStoreFilter} onChange={e => { setCancelStoreFilter(e.target.value); setCancelReasonFilter(''); setCancelShowAll(false); }}>
        <option value="all">ทุกร้านค้า</option>
        {cancelSummary.map(x => <option key={x.storeId} value={x.storeId}>{x.storeName}</option>)}
      </select>

      <label>ช่วงเวลา:</label>
      <div className="berry-toggle-pills">
        {[['all', 'ทั้งหมด'], ['today', 'วันนี้'], [7, '7 วัน'], [14, '14 วัน'], [30, '30 วัน'], ['custom', 'กำหนดเอง']].map(([val, label]) => (
          <button
            key={val}
            className={cancelRange === val ? 'active' : ''}
            onClick={() => { setCancelRange(val); setCancelShowAll(false); }}
          >
            {label}
          </button>
        ))}
      </div>
      {cancelRange === 'custom' && (
        <>
          <label>ตั้งแต่วันที่:</label>
          <input type="date" className="berry-input" value={cancelCustomStart} max={cancelCustomEnd || undefined} onChange={e => setCancelCustomStart(e.target.value)} />
          <label>ถึงวันที่:</label>
          <input type="date" className="berry-input" value={cancelCustomEnd} min={cancelCustomStart || undefined} onChange={e => setCancelCustomEnd(e.target.value)} />
        </>
      )}
    </div>

    <div className="berry-stats-row-4">
      <BerryStatCard bgTone="orange" label="Order ทั้งหมด" value={fmtMoney(cancelScope.totalOrders)} />
      <BerryStatCard bgTone="dark" label="Cancelled" value={fmtMoney(cancelScope.totalCancelled)} />
      <BerryStatCard label={showStoreCol ? 'Cancellation Rate เฉลี่ย' : 'Cancellation Rate'} value={fmtRate(cancelScope.rate)} />
      <BerryStatCard
        label={`ร้านที่เกินเกณฑ์ (${ALERT_WINDOW_DAYS} วัน)`}
        value={`${alertStores.length} ร้าน`}
        tone={alertStores.length ? 'red' : 'green'}
      />
    </div>

    <div className="berry-chart-row">
      <div className="berry-panel" style={{ flex: '2 1 500px' }}>
        <div className="berry-panel-header">
          <div>
            <h3 style={{ margin: 0 }}>Cancellation Rate by Store</h3>
            <div className="berry-panel-caption">
              {showStoreCol ? 'ทุกร้านค้า' : `เฉพาะร้าน ${cancelStoreName}`} · {cancelPeriodLabel}
            </div>
          </div>
        </div>
        <div id="cancel-rate-chart">
          <BerryBulletChart
            data={cancelTableRows.slice(0, rateOpen ? cancelTableRows.length : RATE_LIMIT).map(x => ({ label: x.storeName, value: x.rate, status: x.status, cancelled: x.cancelledOrders, total: x.totalOrders }))}
          />
        </div>
        {cancelTableRows.length > RATE_LIMIT && (
          <ShowMoreToggle expanded={rateOpen} onToggle={() => setRateOpen(v => !v)} hiddenCount={cancelTableRows.length - RATE_LIMIT} controls="cancel-rate-chart" moreLabel="ดูร้านค้าเพิ่มเติม" />
        )}
        <div className="berry-legend">
          <span><i style={{ background: '#e3f9e5' }}></i>ปกติ &lt; {RATE_WARN}%</span>
          <span><i style={{ background: '#fff3d6' }}></i>เฝ้าระวัง {RATE_WARN}-{RATE_ALERT}%</span>
          <span><i style={{ background: '#fde2e1' }}></i>แจ้งเตือน &gt; {RATE_ALERT}%</span>
        </div>
      </div>
      <div id="cancel-alert-list" className="berry-panel" style={{ flex: '1 1 320px' }}>
        <div className="berry-panel-header">
          <div>
            <h3 style={{ margin: 0 }}>Cancellation Alert</h3>
            <div className="berry-panel-caption">อิงข้อมูล {ALERT_WINDOW_DAYS} วันย้อนหลัง</div>
          </div>
        </div>
        {alertStores.length === 0 ? (
          <div className="berry-empty-note">ไม่มีร้านที่เกินเกณฑ์ใน {ALERT_WINDOW_DAYS} วันล่าสุด</div>
        ) : (
          <>
        {alertStores.slice(0, alertOpen ? alertStores.length : ALERT_LIMIT).map((x, i) => (
          <div className={`berry-alert-item${i >= ALERT_LIMIT ? ' berry-reveal' : ''}`} key={x.storeId}>
            <Icon name="cancel" size={20} color="#FF4D4F" />
            <div>
              <div className="alert-title">{x.storeName}</div>
              <div className="alert-sub">อัตราการยกเลิก {x.rate}% ({x.cancelledOrders}/{x.totalOrders} ออเดอร์) สูงกว่าเกณฑ์ {RATE_ALERT}%</div>
              <div className="alert-link" onClick={() => openStoreCancel(x.storeId)}>
                ดูออเดอร์ที่ยกเลิก →
              </div>
            </div>
          </div>
        ))}
        {alertStores.length > ALERT_LIMIT && (
          <ShowMoreToggle expanded={alertOpen} onToggle={() => setAlertOpen(v => !v)} hiddenCount={alertStores.length - ALERT_LIMIT} controls="cancel-alert-list" moreLabel="ดูร้านที่เกินเกณฑ์ทั้งหมด" />
        )}
          </>
        )}
      </div>
    </div>

    <div className="berry-panel">
      <div className="berry-panel-header">
        <div>
          <h3 style={{ margin: 0 }}>รายงานออเดอร์ยกเลิก</h3>
          <div className="berry-panel-caption">{cancelStoreName} · {cancelPeriodLabel}</div>
        </div>
        <Badge tone={rowsAll.length ? 'bad' : 'ok'}>{fmtMoney(rowsAll.length)} ออเดอร์</Badge>
      </div>

      {rowsAll.length === 0 ? (
        <div className="berry-empty-note">ช่วงเวลานี้ไม่มีออเดอร์ที่ถูกยกเลิก</div>
      ) : (
        <>
          <div className="berry-mini-stats">
            <div className="berry-mini-stat"><span className="lbl">ออเดอร์ที่ยกเลิก</span><span className="val">{fmtMoney(rowsAll.length)}</span></div>
            <div className="berry-mini-stat"><span className="lbl">มูลค่าที่เสียไป</span><span className="val">฿{fmtMoney(lostAmount)}</span>{rejectedCount > 0 && <span className="berry-subtle">ไม่รวมสลิปถูกปฏิเสธ {fmtMoney(rejectedCount)} ออเดอร์ (ร้านไม่ได้รับเงิน)</span>}</div>
            <div className="berry-mini-stat"><span className="lbl">เหตุผลที่พบบ่อยสุด</span><span className="val" style={{ fontSize: 14 }}>{reasons[0][0]} ({reasons[0][1]})</span></div>
          </div>

          <div className="berry-chip-row">
            <button className={`berry-chip ${activeReason === '' ? 'active' : ''}`} onClick={() => { setCancelReasonFilter(''); setCancelShowAll(false); }}>
              ทุกเหตุผล ({rowsAll.length})
            </button>
            {reasons.map(([reason, n]) => (
              <button key={reason} className={`berry-chip ${activeReason === reason ? 'active' : ''}`} onClick={() => { setCancelReasonFilter(reason); setCancelShowAll(false); }}>
                {reason} ({n})
              </button>
            ))}
          </div>

          <div id="cancel-orders-table" style={{ overflowX: 'auto' }}>
            <table className="berry-table stack-sm">
              <thead>
                <tr>
                  <th>วันที่ / เวลา</th><th>คิว</th>{showStoreCol && <th>ร้านค้า</th>}<th>ลูกค้า</th><th>ยอดออเดอร์</th><th>เหตุผลการยกเลิก</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rowsShown.map(({ o, info, reason }, i) => (
                  <tr key={o.OrderID} className={`berry-row-click${String(cancelDetailId) === String(o.OrderID) ? ' is-selected' : ''}${i >= 8 ? ' berry-reveal' : ''}`} onClick={() => setCancelDetailId(o.OrderID)}>
                    <td title={info.known ? 'เวลาที่ยกเลิก' : 'ไม่พบบันทึกเวลายกเลิก แสดงเวลาที่สั่งแทน'} style={{ whiteSpace: 'nowrap', color: info.known ? undefined : 'var(--berry-text-muted)' }}>
                      {fmtDateTime(info.time)}
                    </td>
                    <td><b>{o.QueueNo}</b></td>
                    {showStoreCol && <td>{o.StoreName}</td>}
                    <td>{customerNameOf(o)}</td>
                    <td>฿{fmtMoney2(o.TotalAmount)}{isPaymentRejected(o) && <div className="berry-subtle">ไม่นับเป็นมูลค่าที่เสีย</div>}</td>
                    <td>{reason}</td>
                    <td style={{ color: 'var(--berry-purple)', whiteSpace: 'nowrap', fontWeight: 600 }}>รายละเอียด →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rowsFiltered.length > 8 && (
            <ShowMoreToggle expanded={cancelShowAll} onToggle={() => setCancelShowAll(v => !v)} hiddenCount={rowsFiltered.length - 8} controls="cancel-orders-table" moreLabel="ดูออเดอร์ที่ยกเลิกทั้งหมด" />
          )}
        </>
      )}
    </div>

    {detailOrder && (
      <div className="berry-modal-overlay" onClick={() => setCancelDetailId(null)}>
        <div className="berry-modal-content wide" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
          <div className="berry-modal-header">
            <h3 style={{ margin: 0 }}>ออเดอร์ที่ยกเลิก · คิว {detailOrder.QueueNo}</h3>
            <button className="berry-icon-btn" aria-label="ปิด" onClick={() => setCancelDetailId(null)}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="berry-modal-body">
            <div className="berry-info-grid">
              <div><div className="k">ร้านค้า</div><div className="v">{detailOrder.StoreName || '-'}</div></div>
              <div><div className="k">ลูกค้า</div><div className="v">{customerNameOf(detailOrder)}</div></div>
              <div><div className="k">ผู้กดยกเลิก</div><div className="v">{detailInfo.by} <span className="berry-subtle">· {detailInfo.label}</span></div></div>
              <div><div className="k">ช่องทางชำระเงิน</div><div className="v">{detailOrder.PaymentMethod || '-'}
                {(() => {
                  const cash = (detailOrder.Payments || []).find(p => p.CashReceived != null);
                  return cash ? <span className="berry-subtle"> · รับ ฿{Number(cash.CashReceived).toLocaleString('th-TH')} ทอน ฿{Number(cash.ChangeGiven || 0).toLocaleString('th-TH')}</span> : null;
                })()}
              </div></div>
              <div><div className="k">วันที่ / เวลาที่สั่ง</div><div className="v">{fmtDateTh(detailOrder.CreatedAt)} เวลา {fmtTimeOnly(detailOrder.CreatedAt)} น.</div></div>
              <div>
                <div className="k">วันที่ / เวลาที่ยกเลิก</div>
                <div className="v">
                  {detailInfo.known ? `${fmtDateTh(detailInfo.time)} เวลา ${fmtTimeOnly(detailInfo.time)} น.` : <span style={{ color: 'var(--berry-text-muted)', fontWeight: 500 }}>ไม่พบบันทึกเวลายกเลิกในระบบ</span>}
                </div>
              </div>
              <div className="full"><div className="k">เหตุผลการยกเลิก</div><div className="v">{String(detailOrder.CancelReason || '').trim() || 'ไม่ระบุเหตุผล'}</div></div>
              {detailOrder.Note && <div className="full"><div className="k">หมายเหตุจากลูกค้า</div><div className="v">{detailOrder.Note}</div></div>}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="berry-table">
                <thead><tr><th>เมนู</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ราคา/หน่วย</th><th style={{ textAlign: 'right' }}>รวม</th></tr></thead>
                <tbody>
                  {detailItems.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--berry-text-muted)' }}>ไม่พบรายการเมนูของออเดอร์นี้</td></tr>
                  )}
                  {detailItems.map((it, i) => {
                    const qty = Number(it.Qty ?? it.Quantity ?? 1);
                    const unit = Number(it.UnitPrice ?? it.Price ?? 0);
                    return (
                      <tr key={i}>
                        <td>{it.ProductName || it.MenuName || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{qty}</td>
                        <td style={{ textAlign: 'right' }}>฿{fmtMoney2(unit)}</td>
                        <td style={{ textAlign: 'right' }}>฿{fmtMoney2(qty * unit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>ยอดรวมออเดอร์</td><td style={{ textAlign: 'right', fontWeight: 700 }}>฿{fmtMoney2(detailOrder.TotalAmount)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
  );
}
