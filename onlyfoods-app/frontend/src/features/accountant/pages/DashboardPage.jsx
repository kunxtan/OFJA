import { fmtThaiMonth, fmtDayTh, fmtDateTime, fmtMoney, fmtRate, dateOnly, statusLabel } from '../lib/format';
import { BerryStatCard, Badge, ShowMoreToggle } from '../components/ui';
import { RATE_ALERT, RATE_WARN } from '../lib/constants';
import { BerryLineChart, BerryDonutChart } from '../components/charts';

// หน้าภาพรวมฝ่ายบัญชี : ยอดขาย แนวโน้ม สัดส่วนร้าน อัตรายกเลิก
// ข้อมูลและ state อยู่ที่ AccountantView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function DashboardPage({
  trendDays, dashMonth, periodStats, lastUpdated, dashCustomStart, dashCustomEnd, setDashRangeError,
  setTrendDays, setDashMonth, todayStr, changeDashStart, changeDashEnd, dashRangeError, hourlyTrend, setPage,
  watchRows, watchOpen, WATCH_LIMIT, setWatchOpen, topStores
}) {
  return (
    <div className="berry-dashboard-grid">
                  <div className="berry-dashboard-toprow">
                    <div>
                      <h2 style={{ margin: 0 }}>ภาพรวมศูนย์อาหาร</h2>
                      <div style={{ color: 'var(--berry-text-muted)', fontSize: 13 }}>
                        ยอดขายและอัตรายกเลิกของ {trendDays === 'today' ? 'วันนี้' : trendDays === 'month' ? `เดือน ${fmtThaiMonth(dashMonth)}`
                          : trendDays === 'custom' ? (periodStats.bounds.days === 1
                            ? `วันที่ ${fmtDayTh(periodStats.bounds.currStart)} · เทียบกับวันที่ ${fmtDayTh(periodStats.bounds.prevStart)}`
                            : `${fmtDayTh(periodStats.bounds.currStart)} – ${fmtDayTh(periodStats.bounds.currEnd)} (${periodStats.bounds.days} วัน) · เทียบกับ ${fmtDayTh(periodStats.bounds.prevStart)} – ${fmtDayTh(periodStats.bounds.prevEnd)}`)
                          : `${trendDays} วันล่าสุด`}
                      </div>
                    </div>
                    {lastUpdated && (
                      <div className="berry-updated-stamp">อัปเดตล่าสุด: {fmtDateTime(lastUpdated)}</div>
                    )}
                  </div>

                  <div className="berry-stats-row-4">
                    <BerryStatCard
                      bgTone="orange"
                      label="ยอดขายสุทธิรวม"
                      value={`฿${fmtMoney(periodStats.curr.net)}`} 
                      delta={periodStats.deltaNet}
                      compareLabel={periodStats.compareLabel}
                    />
                    <BerryStatCard
                      bgTone="dark"
                      label="จำนวนออเดอร์ที่สำเร็จ"
                      value={fmtMoney(periodStats.curr.completed)}
                      delta={periodStats.deltaOrders}
                      compareLabel={periodStats.compareLabel}
                    />
                    <BerryStatCard
                      label="จำนวนออเดอร์ที่ยกเลิก"
                      value={fmtMoney(periodStats.curr.cancelled)}
                      delta={periodStats.deltaCancelled}
                      invertDelta
                      compareLabel={periodStats.compareLabel}
                    />
                    <BerryStatCard
                      label="อัตราการยกเลิก"
                      value={fmtRate(periodStats.curr.rate)}
                      tone={periodStats.curr.rate === null ? undefined : periodStats.curr.rate > RATE_ALERT ? 'red' : periodStats.curr.rate >= RATE_WARN ? 'amber' : 'green'}
                      delta={periodStats.deltaRate}
                      deltaSuffix="pp"
                      invertDelta
                      compareLabel={periodStats.compareLabel}
                    />
                  </div>

                  <div className="berry-chart-row">
                    <div className="berry-panel" style={{ flex: '2 1 600px' }}>
                      <div className="berry-panel-header">
                        <div>
                          <div className="berry-growth-title">ยอดขายตามช่วงเวลา</div>
                          <div className="berry-panel-caption">แนวโน้มยอดขายที่สำเร็จแล้ว{trendDays === 'custom' ? ` • ${dashCustomStart === dashCustomEnd ? 'รายชั่วโมง' : 'รายวัน'}` : ''}</div>
                        </div>
                        <div className="berry-toggle-pills">
                          {[['today', 'วันนี้'], [7, '7 วัน'], [14, '14 วัน'], [30, '30 วัน'], ['month', 'เลือกเดือน'], ['custom', 'กำหนดเอง']].map(([val, label]) => (
                            <button
                              key={val}
                              className={trendDays === val ? 'active' : ''}
                              onClick={() => { setDashRangeError(''); setTrendDays(val); }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {trendDays === 'month' && (
                          <div className="berry-range-row">
                            <label htmlFor="dash-month">เดือน:</label>
                            <input id="dash-month" type="month" className="berry-input" aria-label="เลือกเดือน" value={dashMonth}
                              max={dateOnly(new Date()).slice(0, 7)} onChange={e => e.target.value && setDashMonth(e.target.value)} />
                          </div>
                        )}
                        {trendDays === 'custom' && (
                          <div className="berry-range-row">
                            <label htmlFor="dash-range-start">ตั้งแต่วันที่</label>
                            <input id="dash-range-start" type="date" className="berry-input" aria-label="วันที่เริ่มต้น" value={dashCustomStart}
                              max={todayStr} onChange={e => changeDashStart(e.target.value)} />
                            <label htmlFor="dash-range-end">ถึงวันที่</label>
                            <input id="dash-range-end" type="date" className="berry-input" aria-label="วันที่สิ้นสุด" value={dashCustomEnd}
                              min={dashCustomStart} max={todayStr} onChange={e => changeDashEnd(e.target.value)} />
                            {dashRangeError && <div className="berry-range-error" role="alert">{dashRangeError}</div>}
                          </div>
                        )}
                      </div>
                      <BerryLineChart data={hourlyTrend} height={290} valueFormat={(v) => `฿${fmtMoney(v)}`} axisFormat={(v) => (v >= 1000 ? `฿${(v / 1000).toFixed(1)}k` : `฿${Math.round(v)}`)} />
                    </div>
                    <div className="berry-panel" style={{ flex: '1 1 420px' }}>
                      <div className="berry-panel-header">
                        <div>
                          <div className="berry-growth-title">รายได้สุทธิแยกร้าน</div>
                          <div className="berry-panel-caption">สัดส่วน (%) และยอดขายสุทธิของแต่ละร้าน</div>
                        </div>
                      </div>

                      {/* วงกลมใช้ข้อมูลทุกร้าน (ไม่ตัดเหลือแค่หน้าที่เห็น) ร้านที่ยอดเป็น 0 ยังอยู่ในรายการ */}
                      <BerryDonutChart
                        data={[...periodStats.curr.storesData]
                          .filter(s => s.netSales > 0 || !s.isDeleted)
                          .sort((x, y) => y.netSales - x.netSales || String(x.storeName).localeCompare(String(y.storeName), 'th'))
                          .map(s => ({ key: s.storeId, label: s.storeName, value: s.netSales }))}
                        valueFormat={(v) => `฿${fmtMoney(v)}`}
                      />
                    </div>
                  </div>

                  <div className="berry-panel">
                    <div className="berry-panel-header">
                      <div>
                        <h3 style={{ margin: 0 }}>ร้านค้าที่ต้องเฝ้าระวัง</h3>
                        <div className="berry-panel-caption">อัตรายกเลิกในช่วงเวลาที่เลือกด้านบน</div>
                      </div>
                      <span className="berry-link" onClick={() => setPage('cancel')}>ดูการวิเคราะห์ทั้งหมด →</span>
                    </div>
                    <div id="watch-table" style={{ overflowX: 'auto' }}>
                      <table className="berry-table stack-sm">
                        <thead>
                          <tr>
                            <th>ร้าน</th>
                            <th>ORDERS</th>
                            <th>ยอดขายรวม</th> 
                            <th>ยอดขายสุทธิ</th> 
                            <th>CANCEL</th>
                            <th>RATE</th>
                            <th>สถานะ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {watchRows.slice(0, watchOpen ? watchRows.length : WATCH_LIMIT).map((s, i) => (
                            <tr key={s.storeId} className={i >= WATCH_LIMIT ? 'berry-reveal' : undefined}>
                              <td><b>{s.storeName}</b></td>
                              <td>{fmtMoney(s.totalOrders)}</td>
                              <td>฿{fmtMoney(s.grossSales)}</td> 
                              <td style={{ fontWeight: 600 }}>฿{fmtMoney(s.netSales)}</td> 
                              <td>{fmtMoney(s.cancelledOrders)}</td>
                              <td>{fmtRate(s.rate)}</td>
                              <td><Badge tone={s.status === 'na' ? 'neutral' : s.status}>{statusLabel(s.status)}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {watchRows.length > WATCH_LIMIT && (
                      <ShowMoreToggle expanded={watchOpen} onToggle={() => setWatchOpen(v => !v)} hiddenCount={watchRows.length - WATCH_LIMIT} controls="watch-table" moreLabel="ดูร้านค้าเพิ่มเติม" />
                    )}
                  </div>

                  <div className="berry-panel">
                    <div className="berry-panel-header">
                      <div>
                        <h3 style={{ margin: 0 }}>ร้านค้ายอดนิยม</h3>
                        <div className="berry-panel-caption">Top 5 เรียงตามยอดขายสุทธิ</div>
                      </div>
                      <span className="berry-link" onClick={() => setPage('sales')}>ดูสรุปยอดขาย →</span>
                    </div>
                    {topStores.length === 0 ? (
                      <div className="berry-empty-note">ยังไม่มีข้อมูลยอดขายในช่วงเวลานี้</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="berry-table stack-sm">
                          <thead>
                            <tr>
                              <th>อันดับ</th>
                              <th>ร้าน</th>
                              <th>ออเดอร์สำเร็จ</th>
                              <th>ยอดขายรวม</th>
                              <th>ยอดขายสุทธิ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topStores.map((s, i) => (
                              <tr key={s.storeId}>
                                <td>#{i + 1}</td>
                                <td><b>{s.storeName}</b></td>
                                <td>{fmtMoney(s.completedOrders)}</td>
                                <td>฿{fmtMoney(s.grossSales)}</td>
                                <td style={{ fontWeight: 600 }}>฿{fmtMoney(s.netSales)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
  );
}
