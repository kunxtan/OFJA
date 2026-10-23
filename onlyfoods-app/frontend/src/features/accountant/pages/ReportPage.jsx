import { REPORT_TYPES } from '../lib/report';
import { THAI_MONTHS, fmtMoney, fmtRate } from '../lib/format';
import { ShowMoreToggle } from '../components/ui';

// หน้าส่งออกรายงาน XLSX
// ข้อมูลและ state อยู่ที่ AccountantView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function ReportPage({
  reportType, setReportType, reportMode, setReportMode, reportMonthEff, hasReportYears, setReportMonth,
  reportMaxMonth, yearSelect, customStart, customEnd, todayStr, setCustomStart, setCustomEnd, reportStoreFilter,
  setReportStoreFilter, reportStoreOptions, reportPeriodLabel, rangeStart, rangeEnd, reportOrders,
  reportColumns, reportSummary, reportRowsOpen, REPORT_LIMIT, setReportRowsOpen, reportFormat, setReportFormat,
  exportReport
}) {
  return (
    <div className="berry-dashboard-grid">
                  <div className="berry-panel">
                    <div className="berry-panel-header"><h3>1. เลือกประเภทรายงาน</h3></div>
                    <div className="berry-select-grid">
                      {REPORT_TYPES.map(rt => (
                        <div
                          key={rt.id}
                          className={`berry-select-card ${reportType === rt.id ? 'active' : ''}`}
                          onClick={() => setReportType(rt.id)}
                        >
                          <div className="sc-title">{rt.title}</div>
                          <div className="sc-sub">{rt.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="berry-panel berry-filter-row">
                    <div>
                      <label style={{ display: 'block', marginBottom: 4 }}>ช่วงเวลา</label>
                      <div className="berry-toggle-pills">
                        {[['month', 'รายเดือน'], ['year', 'รายปี'], ['custom', 'กำหนดเอง']].map(([val, label]) => (
                          <button key={val} className={reportMode === val ? 'active' : ''} onClick={() => setReportMode(val)}>{label}</button>
                        ))}
                      </div>
                    </div>
                    {reportMode === 'month' && (
                      <>
                        <div>
                          <label style={{ display: 'block', marginBottom: 4 }}>เดือน</label>
                          <select className="berry-input" value={reportMonthEff} disabled={!hasReportYears} onChange={e => setReportMonth(Number(e.target.value))}>
                            {THAI_MONTHS.map((m, i) => (i + 1 <= reportMaxMonth ? <option key={m} value={i + 1}>{m}</option> : null))}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: 4 }}>ปี</label>
                          {yearSelect}
                        </div>
                      </>
                    )}
                    {reportMode === 'year' && (
                      <div>
                        <label style={{ display: 'block', marginBottom: 4 }}>ปี</label>
                        {yearSelect}
                      </div>
                    )}
                    {reportMode === 'custom' && (
                      <>
                        <div>
                          <label style={{ display: 'block', marginBottom: 4 }}>ตั้งแต่วันที่</label>
                          <input type="date" className="berry-input" value={customStart} max={customEnd || todayStr}
                            onChange={e => { const v = e.target.value; if (!v) return; const nv = v > todayStr ? todayStr : v; setCustomStart(nv); if (nv > customEnd) setCustomEnd(nv); }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: 4 }}>ถึงวันที่ (ล่าสุดได้ถึงวันนี้)</label>
                          <input type="date" className="berry-input" value={customEnd} min={customStart || undefined} max={todayStr}
                            onChange={e => { const v = e.target.value; if (!v) return; const nv = v > todayStr ? todayStr : v; setCustomEnd(nv); if (nv < customStart) setCustomStart(nv); }} />
                        </div>
                      </>
                    )}
                    <div>
                      <label style={{ display: 'block', marginBottom: 4 }}>ร้านค้า</label>
                      <select className="berry-input" value={reportStoreFilter} onChange={e => setReportStoreFilter(e.target.value)}>
                        <option value="all">ทุกร้านค้า</option>
                        {reportStoreOptions.map(s => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
                      </select>
                    </div>
                  </div>

                  {!hasReportYears && reportMode !== 'custom' && (
                    <div className="berry-empty-note" role="status">ยังไม่มีข้อมูลทางการเงินในระบบ จึงยังไม่มีปีให้เลือก (เมื่อมีออเดอร์ ปีนั้นจะปรากฏในตัวเลือกโดยอัตโนมัติ)</div>
                  )}

                  <div className="berry-panel">
                    <div className="berry-panel-header">
                      <h3>2. ตัวอย่างรายงานก่อน Export</h3>
                      <span style={{ fontSize: 12, color: 'var(--berry-text-muted)' }}>{reportPeriodLabel} · {rangeStart} ถึง {rangeEnd}</span>
                    </div>
                    {reportOrders.length === 0 && (
                      <div className="berry-empty-note" role="status" style={{ marginBottom: 12 }}>ไม่พบข้อมูลออเดอร์ในช่วงเวลาที่เลือก</div>
                    )}
                    <div id="report-preview-table" style={{ overflowX: 'auto' }}>
                      <table className="berry-table">
                        <thead><tr>{reportColumns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
                        <tbody>
                          {reportSummary.length === 0 && (
                            <tr><td colSpan={reportColumns.length} style={{ textAlign: 'center', color: 'var(--berry-text-muted)' }}>ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>
                          )}
                          {reportSummary.slice(0, reportRowsOpen ? reportSummary.length : REPORT_LIMIT).map((s, i) => (
                            <tr key={s.storeId} className={i >= REPORT_LIMIT ? 'berry-reveal' : undefined}>
                              {reportColumns.map(c => (
                                <td key={c.key}>
                                  {c.money ? `฿${fmtMoney(s[c.key])}` : c.percent ? fmtRate(s[c.key]) : s[c.key]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {reportSummary.length > REPORT_LIMIT && (
                      <>
                        <ShowMoreToggle expanded={reportRowsOpen} onToggle={() => setReportRowsOpen(v => !v)} hiddenCount={reportSummary.length - REPORT_LIMIT} controls="report-preview-table" moreLabel="ดูตัวอย่างเพิ่มเติม" />
                        <div className="berry-panel-caption" style={{ marginTop: 8, textAlign: 'center' }}>ไฟล์ที่ส่งออกจะมีครบทุกร้าน ({reportSummary.length} แถว) ไม่ว่าจะขยายตัวอย่างหรือไม่</div>
                      </>
                    )}
                  </div>

                  <div className="berry-panel">
                    <div className="berry-panel-header"><h3>3. เลือกรูปแบบไฟล์ Export</h3></div>
                    <div className="berry-select-grid">
                      <div
                        className={`berry-select-card ${reportFormat === 'csv' ? 'active' : ''}`}
                        style={{ textAlign: 'center' }}
                        onClick={() => setReportFormat('csv')}
                      >
                        <div className="sc-title">CSV (.csv)</div>
                        <div className="sc-sub">ไฟล์ข้อมูลสากล</div>
                      </div>
                      <div
                        className={`berry-select-card ${reportFormat === 'xlsx' ? 'active' : ''}`}
                        style={{ textAlign: 'center' }}
                        onClick={() => setReportFormat('xlsx')}
                      >
                        <div className="sc-title">Excel (.xlsx)</div>
                        <div className="sc-sub">ไฟล์ Excel</div>
                      </div>
                    </div>
                    <button className="berry-btn primary" style={{ width: '100%', marginTop: 20, padding: '12px' }} onClick={exportReport}>
                      Export Report
                    </button>
                  </div>
                </div>
  );
}
