import { BerryStatCard, ShowMoreToggle, Icon } from '../components/ui';
import { fmtMoney, fmtDayTh, fmtRate } from '../lib/format';
import { BerryLineChart } from '../components/charts';

// หน้ายอดขายรายร้าน : ตาราง/รายละเอียดร้าน เมนูขายดี
// ข้อมูลและ state อยู่ที่ AccountantView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function SalesPage({
  salesStoreFilter, setSalesStoreFilter, setDetailStoreId, setSalesRowsOpen, salesStoreSummary, salesRange,
  setSalesCustomStart, salesStart, setSalesCustomEnd, salesEnd, setSalesMonth, setSalesRange, salesMonth,
  salesCustomStart, salesCustomEnd, showToast, salesTotals, salesTrend, salesMenuRows, salesRowsOpen,
  SALES_LIMIT, salesFilteredRows, detailStoreId, detailStoreMenus, menusOpen, MENU_LIMIT, setMenusOpen
}) {
  return (
    <div className="berry-dashboard-grid">
                  <div className="berry-panel berry-filter-row">
                    <label>ร้านค้า:</label>
                    <select className="berry-input" value={salesStoreFilter} onChange={e => { setSalesStoreFilter(e.target.value); setDetailStoreId(null); setSalesRowsOpen(false); }}>
                      <option value="all">ทุกร้านค้า</option>
                      {salesStoreSummary.map(s => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
                    </select>

                    <label>ช่วงเวลา:</label>
                    <div className="berry-toggle-pills">
                      {[['today', 'วันนี้'], [7, '7 วัน'], [14, '14 วัน'], [30, '30 วัน'], ['month', 'เลือกเดือน'], ['custom', 'กำหนดเอง']].map(([val, label]) => (
                        <button
                          key={val}
                          className={salesRange === val ? 'active' : ''}
                          onClick={() => {
                            // กดกำหนดเอง -> เริ่มจากช่วงวันที่ที่กำลังดูอยู่ แล้วค่อยแก้ต่อ
                            if (val === 'custom') { setSalesCustomStart(salesStart); setSalesCustomEnd(salesEnd); }
                            if (val === 'month') setSalesMonth(String(salesEnd || '').slice(0, 7));
                            setSalesRange(val);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {salesRange === 'month' && (
                      <>
                        <label>เดือน:</label>
                        <input type="month" className="berry-input" value={salesMonth} max={new Date().toISOString().slice(0, 7)}
                          onChange={e => setSalesMonth(e.target.value)} aria-label="เลือกเดือนที่ต้องการดู" />
                      </>
                    )}

                    {salesRange === 'custom' && (
                      <>
                        <label>ตั้งแต่วันที่:</label>
                        <input
                          type="date"
                          className="berry-input"
                          value={salesCustomStart}
                          max={salesCustomEnd || undefined}
                          onChange={e => setSalesCustomStart(e.target.value)}
                        />

                        <label>ถึงวันที่:</label>
                        <input
                          type="date"
                          className="berry-input"
                          value={salesCustomEnd}
                          min={salesCustomStart || undefined}
                          onChange={e => setSalesCustomEnd(e.target.value)}
                        />

                        <button className="berry-btn primary" onClick={() => showToast('อัปเดตตารางยอดขายแล้ว')}>
                          ค้นหา
                        </button>
                      </>
                    )}
                  </div>

                  <div className="berry-stats-row-4">
                    <BerryStatCard bgTone="orange" label="ยอดขายรวม" value={`฿${fmtMoney(salesTotals.gross)}`} />
                    <BerryStatCard bgTone="dark" label="ยอดขายสุทธิ" value={`฿${fmtMoney(salesTotals.net)}`} />
                    <BerryStatCard label="Orders สำเร็จ" value={fmtMoney(salesTotals.completed)} />
                    <BerryStatCard label="Orders ยกเลิก" value={fmtMoney(salesTotals.cancelled)} />
                  </div>

                  {/* PO: เจ้าของโรงอาหารไม่ต้องการดูอันดับเมนูขายดี จึงเหลือแค่กราฟยอดขายเมื่อเลือกร้าน */}
                  <div className="berry-chart-row">
                    {salesStoreFilter !== 'all' && (
                      <div className="berry-panel" style={{ flex: '1 1 380px', minWidth: 0 }}>
                        <div className="berry-panel-header">
                          <div>
                            <div className="berry-growth-title">ยอดขายตามช่วงเวลา</div>
                            <div className="berry-panel-caption">
                              {salesStoreSummary.find(x => String(x.storeId) === String(salesStoreFilter))?.storeName || ''} • {salesStart === salesEnd ? 'รายชั่วโมง' : 'รายวัน'}
                            </div>
                          </div>
                        </div>
                        <BerryLineChart data={salesTrend} height={290} valueFormat={(v) => `฿${fmtMoney(v)}`} axisFormat={(v) => (v >= 1000 ? `฿${(v / 1000).toFixed(1)}k` : `฿${Math.round(v)}`)} />
                      </div>
                    )}

                  </div>

                  {salesStoreFilter !== 'all' ? (
                  <div className="berry-panel">
                    <div className="berry-panel-header">
                      <div>
                        <h3 style={{ margin: 0 }}>ตารางยอดขายรายเมนู</h3>
                        <div className="berry-panel-caption">
                          {salesStoreSummary.find(x => String(x.storeId) === String(salesStoreFilter))?.storeName || ''} • {salesStart === salesEnd ? fmtDayTh(salesStart) : `${fmtDayTh(salesStart)} – ${fmtDayTh(salesEnd)}`} • เรียงตามยอดสุทธิ
                        </div>
                      </div>
                    </div>
                    {salesMenuRows.length === 0 ? (
                      <div className="berry-empty-note">ไม่พบข้อมูลเมนูของร้านนี้ในช่วงเวลาที่เลือก</div>
                    ) : (
                      <>
                        <div id="sales-menu-table" style={{ overflowX: 'auto' }}>
                          <table className="berry-table stack-sm">
                            <thead>
                              <tr>
                                <th>ชื่อเมนู</th>
                                <th>จำนวนที่ขายได้</th>
                                <th>ยอดขาย</th>
                                <th>จำนวนที่ยกเลิก</th>
                                <th>ยอดที่ยกเลิก</th>
                                <th>ยอดสุทธิ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {salesMenuRows.slice(0, salesRowsOpen ? salesMenuRows.length : SALES_LIMIT).map((m, i) => (
                                <tr key={m.name} className={i >= SALES_LIMIT ? 'berry-reveal' : undefined}>
                                  <td><b>{m.name}</b></td>
                                  <td>{fmtMoney(m.soldQty)}</td>
                                  <td>฿{fmtMoney(m.recorded)}</td>
                                  <td style={{ color: m.cancelledQty > 0 ? 'var(--berry-red)' : 'var(--berry-text-muted)' }}>{fmtMoney(m.cancelledQty)}</td>
                                  <td style={{ color: m.cancelledAmount > 0 ? 'var(--berry-red)' : 'var(--berry-text-muted)' }}>฿{fmtMoney(m.cancelledAmount)}</td>
                                  <td style={{ fontWeight: 700 }}>฿{fmtMoney(m.netSales)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {salesMenuRows.length > SALES_LIMIT && (
                          <ShowMoreToggle expanded={salesRowsOpen} onToggle={() => setSalesRowsOpen(v => !v)} hiddenCount={salesMenuRows.length - SALES_LIMIT} controls="sales-menu-table" moreLabel="ดูเมนูเพิ่มเติม" />
                        )}
                        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--berry-text-muted)' }}>
                          ยอดขาย = ยอดรวมก่อนหักยกเลิก (ออเดอร์ที่สำเร็จ + ออเดอร์ที่ยกเลิก) • ยอดสุทธิ = ยอดขาย − ยอดที่ยกเลิก • ออเดอร์ที่สลิปถูกปฏิเสธ (ร้านไม่ได้รับเงิน) ไม่นับในยอดเงิน แต่จำนวนที่ยกเลิกยังนับรวม
                        </div>
                      </>
                    )}
                  </div>
                  ) : (
                  <div className="berry-panel">
                    <div className="berry-panel-header">
                      <div>
                        <h3 style={{ margin: 0 }}>ตารางยอดขายรายร้าน</h3>
                        {/* แสดงข้อความเรียงลำดับเฉพาะตอนเลือก "ทุกร้านค้า" — เลือกร้านเดียวไม่ต้องแสดง */}
                        {salesStoreFilter === 'all' && (
                          <div className="berry-panel-caption">เรียงตามยอดขายสุทธิ</div>
                        )}
                      </div>
                    </div>
                    <div id="sales-table" style={{ overflowX: 'auto' }}>
                      <table className="berry-table stack-sm">
                        <thead>
                          <tr>
                            <th>ร้านค้า</th>
                            <th>ออเดอร์สำเร็จ</th>
                            <th>ยอดขายรวม</th>
                            <th>ยกเลิก</th>
                            <th>ยอดสุทธิ</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesFilteredRows.slice(0, salesRowsOpen ? salesFilteredRows.length : SALES_LIMIT).map((s, i) => (
                            <tr key={s.storeId} className={i >= SALES_LIMIT ? 'berry-reveal' : undefined}>
                              <td><b>{s.storeName}</b></td>
                              <td>{fmtMoney(s.completedOrders)}</td>
                              <td>฿{fmtMoney(s.grossSales)}</td>
                              <td style={{ color: s.status === 'na' ? 'var(--berry-text-muted)' : s.status === 'bad' ? 'var(--berry-red)' : s.status === 'warn' ? '#D99B00' : 'var(--berry-green)' }}>
                              {fmtMoney(s.cancelledOrders)} ({fmtRate(s.rate)})
                              </td>
                              <td style={{ fontWeight: 700 }}>฿{fmtMoney(s.netSales)}</td>
                              <td>
                                {/* เปิด Modal แสดงรายละเอียดเมนู */}
                                <span className="berry-link" onClick={() => setDetailStoreId(s.storeId)}>
                                  ดูรายละเอียด →
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {salesFilteredRows.length > SALES_LIMIT && (
                      <ShowMoreToggle expanded={salesRowsOpen} onToggle={() => setSalesRowsOpen(v => !v)} hiddenCount={salesFilteredRows.length - SALES_LIMIT} controls="sales-table" moreLabel="ดูร้านค้าเพิ่มเติม" />
                    )}
                  </div>
                  )}

                  {/* ===== Modal ดูรายละเอียดเมนูขายดีสำหรับร้านที่เลือก ===== */}
                  {detailStoreId && (
                    <div className="berry-modal-overlay" onClick={() => setDetailStoreId(null)}>
                      <div className="berry-modal-content" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="berry-modal-header">
                          <h3>รายละเอียดเมนู: {salesStoreSummary.find(s => s.storeId === detailStoreId)?.storeName || 'ไม่ทราบชื่อร้าน'}</h3>
                          <button className="berry-icon-btn" aria-label="ปิด" onClick={() => setDetailStoreId(null)}>
                            <Icon name="close" size={20} />
                          </button>
                        </div>
                        <div className="berry-modal-body">
                          {detailStoreMenus.length === 0 ? (
                            <div className="berry-empty-note">ไม่พบข้อมูลเมนูที่ขายได้ของร้านนี้ในช่วงเวลาที่เลือก</div>
                          ) : (
                            <>
                            <table className="berry-table" id="menu-table">
                              <thead>
                                <tr>
                                  <th>ชื่อเมนู</th>
                                  <th style={{ textAlign: 'right' }}>จำนวนที่ขายได้</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detailStoreMenus.slice(0, menusOpen ? detailStoreMenus.length : MENU_LIMIT).map((m, idx) => (
                                  <tr key={idx} className={idx >= MENU_LIMIT ? 'berry-reveal' : undefined}>
                                    <td>{m.name}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{fmtMoney(m.qty)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {detailStoreMenus.length > MENU_LIMIT && (
                              <ShowMoreToggle expanded={menusOpen} onToggle={() => setMenusOpen(v => !v)} hiddenCount={detailStoreMenus.length - MENU_LIMIT} controls="menu-table" moreLabel="ดูเมนูเพิ่มเติม" />
                            )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
  );
}
