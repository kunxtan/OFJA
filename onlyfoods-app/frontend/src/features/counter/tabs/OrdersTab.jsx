import { useNow } from '../../../shared/hooks/useNow';
import { PALETTE } from '../theme';
import { fmtMoney, isWalkInOrder } from '../lib';
import AuthImage from '../../../shared/ui/AuthImage';
import { Badge, Icon } from '../components/ui';

// แท็บคิวออเดอร์ : ตรวจสลิป เรียกคิว ส่งมอบ ลูกค้าไม่มารับ
// ข้อมูลและ state อยู่ที่ CounterView ส่งมาเป็น props (แท็บไม่ดึงข้อมูลเอง)
export default function OrdersTab({
  printerStatus, setPrinterStatus, verifyingOrders, orders, isTopUpSlip, slipToCheck, setViewingSlip, apiBase,
  verifySlip, openRejectSlip, queueSearchRef, queueQuery, setQueueQuery, searching, queueTabs, activeOrders,
  queueTab, setQueueTab, handoverOrder, getStatusBadgeTone, getStatusLabel, getElapsedLabel, recallBusy,
  recallQueue, handoverBusy, handOver, shownOrders, endedMatch, currentQueueTab, canMarkNoShow, isPickupWarning,
  beforeEta, fmtClock, PICKUP_WARNING_MINUTES, fmtPhone, reminderNote, getRemainingLabel, openNoShowModal,
  NO_SHOW_UNLOCK_MINUTES, etaMs, noShowUnlockAt, noShowCountdown, openPrintConfirm, viewCustomerProfile,
  openOutModal, openCancelModal
}) {
  useNow(1000); // render ใหม่ทุกวินาที : นับถอยหลังปุ่มลูกค้าไม่มารับ / เวลาที่รอของแต่ละคิว
  return (
    <div className="cv-stack">
                  <div className="cv-printer-control">
                    <span>🖨️ Mock Printer: <b>{printerStatus}</b></span>
                    <button className="cv-btn btn-ghost" onClick={() => setPrinterStatus(v => v === 'READY' ? 'OFFLINE' : 'READY')}>
                      เปลี่ยนเป็น {printerStatus === 'READY' ? 'OFFLINE' : 'READY'}
                    </button>
                  </div>
                  <div className="cv-stat-grid">
                    <div className="cv-card cv-bg-coral">
                      <div className="cv-decor-circle-1" />
                      <div className="cv-stat-body">
                        <h2>{verifyingOrders.length}</h2>
                        <p>สลิปที่ต้องตรวจสอบ</p>
                      </div>
                    </div>
                    <div className="cv-card cv-bg-yellow">
                      <div className="cv-stat-body">
                        <h2>{orders.filter(o => ['Pending', 'Cooking'].includes(o.Status)).length}</h2>
                        <p>คิวที่ครัวกำลังปรุง</p>
                      </div>
                    </div>
                    <div className="cv-card cv-bg-dark">
                      <div className="cv-stat-body">
                        <h2>{orders.filter(o => o.Status === 'Ready').length}</h2>
                        <p>อาหารพร้อมส่งมอบ</p>
                      </div>
                    </div>
                  </div>

                  {/* สลิปรอตรวจ */}
                  <div className="cv-card">
                    <div className="cv-card-head">
                      <div>
                        <h3>1. ตรวจสอบสลิปโอนเงิน (รอยืนยันเพื่อส่งเข้าครัว)</h3>
                        <div className="caption">ลูกค้าชำระเงินออนไลน์แล้ว รอการยืนยันยอดเงิน</div>
                      </div>
                    </div>
                    <div className="cv-table-wrapper">
                      <table className="cv-table">
                        <thead>
                          <tr>
                            <th>คิว</th>
                            <th>ยอดชำระ</th>
                            <th>หลักฐานสลิป</th>
                            <th style={{ textAlign: 'right' }}>การดำเนินการ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {verifyingOrders.length === 0 ? (
                            <tr><td colSpan="4" className="empty-state">ไม่มีรายการรอตรวจสอบสลิปในขณะนี้</td></tr>
                          ) : (
                            verifyingOrders.map(o => (
                              <tr key={o.OrderID}>
                                <td><span className="queue-pill">{o.QueueNo}</span></td>
                                <td className="bold" style={{ color: PALETTE.coral, fontSize: '16px' }}>
                                  ฿{fmtMoney(isTopUpSlip(o) ? o.TopUpAmount : o.TotalAmount)}
                                  {isTopUpSlip(o) && <div className="caption" style={{ fontWeight: 600 }}>ส่วนต่างเปลี่ยนเมนู</div>}
                                </td>
                                <td>
                                  {slipToCheck(o) ? (
                                    <div onClick={() => setViewingSlip(o)} className="slip-thumb">
                                      <AuthImage apiBase={apiBase} src={slipToCheck(o)} alt="Slip" />
                                      <span>ตรวจสลิป + รายการอาหาร</span>
                                    </div>
                                  ) : <span style={{ color: PALETTE.red, fontWeight: 'bold' }}>ไม่มีสลิป</span>}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button onClick={() => setViewingSlip(o)} className="cv-btn btn-dark" style={{ marginRight: '8px' }}>
                                    🔎 ตรวจรายการ
                                  </button>
                                  <button onClick={() => verifySlip(o.OrderID, true)} className="cv-btn btn-success-light" style={{ marginRight: '8px' }}>
                                    ✅ ยืนยัน
                                  </button>
                                  <button onClick={() => openRejectSlip(o)} className="cv-btn btn-danger-light">
                                    ❌ ปฏิเสธ
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* คิวที่กำลังดำเนินการ */}
                  <div className="cv-card">
                    <div className="cv-card-head">
                      <div>
                        <h3>2. คิวคำสั่งซื้อที่กำลังดำเนินการ</h3>
                        <div className="caption">ลูกค้ามารับ: ถามเลขคิว แล้วพิมพ์ในช่องค้นหา · คิวเก่าอยู่บนสุด</div>
                      </div>
                    </div>
                    <div className="queue-search">
                      <span className="queue-search-icon">🔍</span>
                      <input
                        ref={queueSearchRef}
                        value={queueQuery}
                        onChange={e => setQueueQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') setQueueQuery(''); }}
                        placeholder="พิมพ์เลขคิวที่ลูกค้าบอก เช่น 12"
                        inputMode="numeric"
                        aria-label="ค้นหาเลขคิว"
                      />
                      {searching && <button className="cv-btn btn-ghost" onClick={() => { setQueueQuery(''); queueSearchRef.current?.focus(); }}>ล้าง</button>}
                    </div>
                    {!searching && (
                      <div className="queue-tabs" role="tablist">
                        {queueTabs.map(t => {
                          const n = activeOrders.filter(t.match).length;
                          return (
                            <button key={t.id} role="tab" aria-selected={queueTab === t.id}
                              className={`queue-tab ${queueTab === t.id ? 'active' : ''} ${t.id === 'attention' && n ? 'alert' : ''}`}
                              onClick={() => setQueueTab(t.id)}>
                              {t.label} <span className="queue-tab-count">{n}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {handoverOrder && (
                      <div className={`handover-card ${handoverOrder.Status === 'Ready' ? 'ready' : ''}`}>
                        <div className="handover-main">
                          <div className="handover-queue">{handoverOrder.QueueNo}</div>
                          <div>
                            <div className="handover-name">
                              {isWalkInOrder(handoverOrder) ? 'ลูกค้า Walk-in' : (handoverOrder.CustomerName || handoverOrder.UserName || '-')}
                            </div>
                            <div className="handover-items">
                              {(handoverOrder.items || []).map(it => `${it.ProductName} ×${it.Qty}`).join(', ')}
                            </div>
                            <div className="handover-status">
                              <Badge tone={getStatusBadgeTone(handoverOrder.Status)}>{getStatusLabel(handoverOrder.Status)}</Badge>
                              {handoverOrder.Status === 'Ready' && <span> พร้อมมาแล้ว {getElapsedLabel(handoverOrder.ReadyAt)}</span>}
                            </div>
                          </div>
                        </div>
                        {handoverOrder.Status === 'Ready' ? (
                          <div className="handover-actions">
                            <button className="cv-btn btn-ghost cv-btn-lg" disabled={recallBusy === handoverOrder.OrderID}
                              onClick={() => recallQueue(handoverOrder)} title="แจ้งเตือนลูกค้าอีกครั้ง + จอเรียกคิวกระพริบ">
                              📢 เรียกคิวซ้ำ
                            </button>
                            <button className="cv-btn btn-success cv-btn-lg" disabled={handoverBusy === handoverOrder.OrderID}
                              onClick={() => handOver(handoverOrder)}>
                              {handoverBusy === handoverOrder.OrderID ? 'กำลังบันทึก...' : `✅ ส่งมอบ ${handoverOrder.QueueNo}`}
                            </button>
                          </div>
                        ) : (
                          <div className="handover-wait">ยังส่งมอบไม่ได้ — แจ้งลูกค้าว่าอาหาร{getStatusLabel(handoverOrder.Status)}</div>
                        )}
                      </div>
                    )}
                    {searching && shownOrders.length > 1 && (
                      <div className="queue-search-hint">พบ {shownOrders.length} คิว — พิมพ์ตัวอักษรร้านนำหน้าเพื่อระบุให้ชัด</div>
                    )}
                    <div className="cv-table-wrapper">
                      <table className="cv-table">
                        <thead>
                          <tr>
                            <th>คิว</th>
                            <th>รายการอาหาร</th>
                            <th>สถานะ</th>
                            <th>จัดการออเดอร์</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shownOrders.length === 0 ? (
                            <tr><td colSpan="4" className="empty-state">
                              {searching
                                ? (endedMatch
                                  ? `คิว ${endedMatch.QueueNo} ${endedMatch.Status === 'Completed' ? 'ส่งมอบไปแล้ว' : endedMatch.Status === 'Verifying_Slip' ? 'ยังรอตรวจสลิป (ดูตารางด้านบน)' : getStatusLabel(endedMatch.Status)}`
                                  : `ไม่พบคิว "${queueQuery.trim()}" ในร้านนี้`)
                                : activeOrders.length === 0 ? 'ไม่มีคิวที่กำลังดำเนินการ' : `ไม่มีคิวในแท็บ "${currentQueueTab.label}"`}
                            </td></tr>
                          ) : (
                            shownOrders.map(o => {
                              const isPendingCancel = o.Status === 'Pending_Cancellation';
                              return (
                                <tr key={o.OrderID}>
                                  <td>
                                    <div className="queue-pill bold">{o.QueueNo}</div>
                                    {isWalkInOrder(o) && <span className="walkin-tag">Walk-in</span>}
                                  </td>
                                  <td>
                                    {o.items?.map((it, idx) => (
                                      <div key={idx} className="item-row">
                                        • {it.ProductName} <b style={{ color: PALETTE.coral }}>x{it.Qty}</b>
                                        {it.ItemNote && <span className="item-note">({it.ItemNote})</span>}
                                      </div>
                                    ))}
                                    {o.Note && <div className="order-note">โน้ต: {o.Note}</div>}
                                  </td>
                                  <td>
                                    <Badge tone={getStatusBadgeTone(o.Status)}>{getStatusLabel(o.Status)}</Badge>
                                    {o.Status === 'Ready' && (
                                      <div style={{ marginTop: '6px' }}>
                                        <Badge tone={canMarkNoShow(o) ? 'danger' : isPickupWarning(o.ReadyAt) && !beforeEta(o) ? 'warning' : 'neutral'}>
                                          รอมาแล้ว {getElapsedLabel(o.ReadyAt)}
                                        </Badge>
                                        {beforeEta(o) && (
                                          <div className="pickup-eta" role="status">
                                            🕒 ลูกค้าแจ้งจะมาถึง <b>{fmtClock(o.LatePickupArrivalTime)} น.</b>
                                            <span className="pickup-sub">ยังไม่ต้องโทร · ตัดคิวได้หลังเวลานี้</span>
                                          </div>
                                        )}
                                        {isPickupWarning(o.ReadyAt) && !beforeEta(o) && (
                                          <div className="pickup-warning" role="alert">
                                            {isWalkInOrder(o) ? (
                                              <>⚠️ ครบ {PICKUP_WARNING_MINUTES} นาทียังไม่มารับ<br />ลูกค้า Walk-in: เรียกด้วยเสียงหน้าร้าน</>
                                            ) : (
                                              <>
                                                {o.LatePickupArrivalTime
                                                  ? <>⚠️ เลยเวลาที่ลูกค้าแจ้ง ({fmtClock(o.LatePickupArrivalTime)} น.) — โทรหาลูกค้า<br /></>
                                                  : <>⚠️ ครบ {PICKUP_WARNING_MINUTES} นาทียังไม่มารับ — โทรหาลูกค้า<br /></>}
                                                <b className="pickup-phone">{o.CustomerPhone ? fmtPhone(o.CustomerPhone) : 'ไม่มีเบอร์โทรในระบบ'}</b>
                                                <span className="pickup-sub">
                                                  {o.LatePickupArrivalTime ? 'ลูกค้าแจ้งเวลามารับเองแล้ว ระบบจึงไม่ส่งเตือนซ้ำ' : reminderNote(o)}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {o.Status !== 'Ready' && o.LatePickupArrivalTime && (
                                      <div className="pickup-eta compact">🕒 ลูกค้าแจ้งจะมาถึง <b>{fmtClock(o.LatePickupArrivalTime)} น.</b></div>
                                    )}
                                    {isPendingCancel && (
                                      <div style={{ fontSize: '11px', color: PALETTE.coral, fontWeight: '700', marginTop: '4px' }}>
                                        เหลือเวลา: {getRemainingLabel(o.CancelDeadline)}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <div className="cv-action-buttons">
                                      {o.Status === 'Ready' && (
                                        <>
                                          <button onClick={() => handOver(o)} className="cv-btn btn-success" disabled={handoverBusy === o.OrderID}>
                                            ✅ ส่งมอบอาหาร
                                          </button>
                                          <button onClick={() => recallQueue(o)} className="cv-btn btn-ghost" disabled={recallBusy === o.OrderID}
                                            title="แจ้งเตือนลูกค้าอีกครั้ง + จอเรียกคิวกระพริบ">
                                            📢 เรียกคิวซ้ำ
                                          </button>
                                          <button
                                            onClick={() => openNoShowModal(o)}
                                            disabled={!canMarkNoShow(o)}
                                            className="cv-btn btn-danger"
                                            title={beforeEta(o)
                                              ? `ลูกค้าขอมารับภายใน ${fmtClock(o.LatePickupArrivalTime)} น. กดได้หลังเวลานี้`
                                              : `กดได้เมื่อเกิน ${NO_SHOW_UNLOCK_MINUTES} นาทีหลังอาหารเสร็จ (พนักงานตัดสินใจเอง ระบบไม่ตัดให้)`}
                                          >
                                            🚫 {canMarkNoShow(o)
                                              ? 'ลูกค้าไม่มารับอาหาร'
                                              : beforeEta(o) && etaMs(o) >= noShowUnlockAt(o)
                                                ? `ลูกค้าขอมาถึง ${fmtClock(o.LatePickupArrivalTime)} น. (อีก ${noShowCountdown(o)})`
                                                : `ลูกค้าไม่มารับ (อีก ${noShowCountdown(o)})`}
                                          </button>
                                        </>
                                      )}
                                      <button onClick={() => openPrintConfirm(o, 'REPRINT')} className="cv-btn-icon" title="พิมพ์ใบสั่งซื้อ (ต้องยืนยัน)"><Icon name="print" size={16} /></button>
                                      <button onClick={() => viewCustomerProfile(o)} className="cv-btn-icon" title="ข้อมูลลูกค้า"><Icon name="user" size={16} /></button>

                                      {/* ของหมด/ยกเลิกใช้ได้เฉพาะคิวที่ยังไม่เสร็จ */}
                                      {/* walk-in ไม่มีลูกค้าในระบบให้ตอบกลับ จึงยกเลิกได้อย่างเดียว */}
                                      {!isPendingCancel && !isWalkInOrder(o) && ['Pending', 'Cooking'].includes(o.Status) && (
                                        <button onClick={() => openOutModal(o)} className="cv-btn btn-warning-light">
                                          ⚠️ ของหมด
                                        </button>
                                      )}
                                      {['Pending', 'Cooking', 'Pending_Cancellation', 'Awaiting_Top_Up'].includes(o.Status) && (
                                        <button onClick={() => openCancelModal(o)} className="cv-btn btn-danger-light">
                                          ❌ ยกเลิก
                                        </button>
                                      )}
                                      {o.Status === 'Ready' && (
                                        <span className="action-lock-note">อาหารเสร็จแล้ว</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
  );
}
