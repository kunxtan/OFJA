import { useNow } from '../../../shared/hooks/useNow';
import { PALETTE } from '../theme';
import { isWalkInOrder, fmtMoney } from '../lib';
import { Badge } from '../components/ui';

// แท็บประวัติออเดอร์วันนี้
// ข้อมูลและ state อยู่ที่ CounterView ส่งมาเป็น props (แท็บไม่ดึงข้อมูลเอง)
export default function HistoryTab({
  historyDate, dateKey, setHistoryDate, historyQuery, setHistoryQuery, historyFilters, historyFilter,
  setHistoryFilter, historyDay, historyOrders, pastHistory, historyFilterNow, getStatusBadgeTone,
  getStatusLabel, viewCustomerProfile, openPrintConfirm, canReprint
}) {
  const nowTick = useNow(60000); // เปลี่ยนวันตอนเที่ยงคืน
  return (
    <div className="cv-card">
                  <div className="cv-card-head">
                    <div>
                      <h3>ประวัติออเดอร์ทั้งหมดของวัน</h3>
                      <div className="caption">ดูประวัติลูกค้า และสั่งพิมพ์ใบเสร็จซ้ำ (ต้องกดยืนยันก่อนพิมพ์ทุกครั้ง)</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="date"
                        value={historyDate}
                        max={dateKey(nowTick)}
                        onChange={e => e.target.value && setHistoryDate(e.target.value)}
                        style={{ padding: '8px 10px', borderRadius: '10px', border: `1px solid ${PALETTE.border}`, fontFamily: 'inherit' }}
                      />
                      <button className="cv-btn btn-ghost" onClick={() => setHistoryDate(dateKey(nowTick))}>วันนี้</button>
                    </div>
                  </div>
                  <div className="queue-search">
                    <span className="queue-search-icon">🔍</span>
                    <input
                      value={historyQuery}
                      onChange={e => setHistoryQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') setHistoryQuery(''); }}
                      placeholder="ค้นหาเลขคิว เช่น 12 หรือชื่อลูกค้า"
                      aria-label="ค้นหาประวัติออเดอร์"
                    />
                    {historyQuery.trim() && <button className="cv-btn btn-ghost" onClick={() => setHistoryQuery('')}>ล้าง</button>}
                  </div>
                  <div className="queue-tabs" role="tablist" aria-label="กรองตามสถานะ">
                    {historyFilters.map(f => (
                      <button key={f.id} role="tab" aria-selected={historyFilter === f.id}
                        className={`queue-tab ${historyFilter === f.id ? 'active' : ''}`}
                        onClick={() => setHistoryFilter(f.id)}>
                        {f.label} <span className="queue-tab-count">{historyDay.filter(f.match).length}</span>
                      </button>
                    ))}
                  </div>
                  <div className="cv-table-wrapper">
                    <table className="cv-table">
                      <thead>
                        <tr>
                          <th>คิว</th>
                          <th>เวลาสั่ง</th>
                          <th>ส่งมอบเมื่อ</th>
                          <th>ลูกค้า</th>
                          <th>รายการอาหาร</th>
                          <th>ยอดรวม</th>
                          <th>สถานะ</th>
                          <th style={{ textAlign: 'right' }}>การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyOrders.length === 0 ? (
                          <tr><td colSpan="8" className="empty-state">{pastHistory.loading && pastHistory.date === historyDate ? 'กำลังโหลด...'
                            : historyDay.length === 0 ? 'ไม่มีออเดอร์ในวันที่เลือก'
                            : historyQuery.trim() ? `ไม่พบ "${historyQuery.trim()}" ในสถานะ "${historyFilterNow.label}"`
                            : `ไม่มีออเดอร์สถานะ "${historyFilterNow.label}" ในวันที่เลือก`}</td></tr>
                        ) : (
                          historyOrders.map(o => (
                            <tr key={o.OrderID}>
                              <td>
                                <span className="queue-pill bold">{o.QueueNo}</span>
                                {isWalkInOrder(o) && <span className="walkin-tag">Walk-in</span>}
                              </td>
                              <td>{o.CreatedAt ? new Date(o.CreatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                              <td>{o.DeliveredAt ? new Date(o.DeliveredAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                              <td>{o.CustomerName || o.UserName || 'ลูกค้า Walk-in'}</td>
                              <td>{o.items?.map(i => `${i.ProductName} (x${i.Qty})`).join(', ')}</td>
                              <td className="bold">฿{fmtMoney(o.TotalAmount)}</td>
                              <td><Badge tone={getStatusBadgeTone(o.Status)}>{getStatusLabel(o.Status)}</Badge></td>
                              <td>
                                <div className="cv-stale-actions" style={{ justifyContent: 'flex-end' }}>
                                  <button onClick={() => viewCustomerProfile(o)} className="cv-btn btn-dark">👤 ประวัติลูกค้า</button>
                                  <button
                                    onClick={() => openPrintConfirm(o, 'REPRINT')}
                                    disabled={!canReprint(o)}
                                    className="cv-btn btn-ghost"
                                    title={canReprint(o) ? 'พิมพ์ใบสั่งซื้อ (ต้องยืนยัน)' : 'ออเดอร์นี้ไม่สามารถพิมพ์ได้'}
                                  >
                                    🖨️ พิมพ์ใบเสร็จ
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
  );
}
