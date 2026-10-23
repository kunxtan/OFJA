import { fmtMoney, dayLabel, fmtTimeOnly, fmtMoney2 } from '../lib/format';
import { Icon, Badge } from '../components/ui';
import { AUDIT_CATS, AUDIT_ROW_BG, AUDIT_PAGE } from '../lib/audit';
import React from 'react';

// หน้าบันทึกการดำเนินการ (audit log)
// ข้อมูลและ state อยู่ที่ AccountantView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function AuditPage({
  logs, auditSearch, setAuditSearch, setAuditLimit, auditCat, setAuditCat, auditCatCounts, auditLimit,
  auditFiltered, auditGroups, loadError, auditHasMore, loadOlderLogs, auditLoadingOlder, auditRows
}) {
  return (
    <div className="berry-dashboard-grid">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h2 style={{ margin: 0 }}>ประวัติการทำรายการทั้งหมด (Audit Log)</h2>
                      <div style={{ color: 'var(--berry-text-muted)', fontSize: 13 }}>ข้อมูลอ้างอิงเพื่อความโปร่งใส บันทึกแบบแก้ไขย้อนหลังไม่ได้ • โหลดแล้ว {fmtMoney(logs.length)} รายการล่าสุด</div>
                    </div>
                    <span className="berry-readonly-badge"><Icon name="audit" size={16} color="#fff" /> Read Only - แก้ไขย้อนหลังไม่ได้</span>
                  </div>

                  <div className="berry-panel">
                    <input
                      className="berry-input"
                      style={{ width: '100%' }}
                      placeholder="ค้นหา: เหตุการณ์, ผู้ทำรายการ, คิว, ร้านค้า, รายละเอียด หรือวันที่..."
                      value={auditSearch}
                      onChange={e => { setAuditSearch(e.target.value); setAuditLimit(100); }}
                    />
                    <div className="berry-chip-row" style={{ marginTop: 12, marginBottom: 0 }}>
                      {AUDIT_CATS.map(([id, label]) => (
                        <button key={id} className={`berry-chip ${auditCat === id ? 'active' : ''}`} onClick={() => { setAuditCat(id); setAuditLimit(100); }}>
                          {label} ({auditCatCounts[id] || 0})
                        </button>
                      ))}
                    </div>
                    <div className="berry-legend" style={{ marginTop: 12 }}>
                      <span><i style={{ background: '#FF4D4F' }}></i>แถวสีแดง: ยกเลิกออเดอร์ (Cancelled)</span>
                      <span><i style={{ background: '#00C853' }}></i>แถวสีเขียว: ออเดอร์สำเร็จ (Completed)</span>
                    </div>
                  </div>

                  <div className="berry-panel">
                    <div className="berry-panel-header">
                      <div>
                        <h3 style={{ margin: 0 }}>ประวัติการทำรายการในระบบ</h3>
                        <div className="berry-panel-caption">แสดง {fmtMoney(Math.min(auditLimit, auditFiltered.length))} จาก {fmtMoney(auditFiltered.length)} รายการ · เรียงจากล่าสุด</div>
                      </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="berry-table audit-table stack-sm">
                        <thead><tr><th>เวลา</th><th>เหตุการณ์</th><th>ออเดอร์</th><th>ผู้ทำรายการ</th><th>รายละเอียด</th></tr></thead>
                        <tbody>
                          {auditGroups.map(g => (
                            <React.Fragment key={g.key || 'unknown'}>
                              <tr className="audit-day"><td colSpan={5}>{dayLabel(g.key)} <span>· {g.rows.length} รายการ</span></td></tr>
                              {g.rows.map(r => (
                                <tr key={r.key} style={{ background: AUDIT_ROW_BG[r.tone] }}>
                                  <td className="audit-time">{fmtTimeOnly(r.time)}</td>
                                  <td><Badge tone={r.tone}>{r.label}</Badge></td>
                                  <td>
                                    {r.queue ? (
                                      <div>
                                        <b>คิว {r.queue}</b>{r.amount != null && <span className="audit-sub"> · ฿{fmtMoney2(r.amount)}</span>}
                                        <div className="audit-sub">{r.storeName}</div>
                                      </div>
                                    ) : <span className="audit-sub">—</span>}
                                  </td>
                                  <td>{r.by}</td>
                                  <td title={r.details}>{r.summary || <span className="audit-sub">—</span>}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                          {auditFiltered.length === 0 && (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--berry-text-muted)' }}>
                              {auditSearch.trim() || auditCat !== 'all'
                                ? 'ไม่พบรายการที่ตรงกับเงื่อนไข'
                                : loadError ? 'ยังโหลดข้อมูลไม่สำเร็จ (ดูข้อความแจ้งเตือนด้านบน)' : 'ยังไม่มีประวัติการทำรายการในฐานข้อมูล'}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {auditFiltered.length > auditLimit && (
                      <div style={{ padding: '12px 16px 0' }}>
                        <button className="berry-btn" style={{ width: '100%' }} onClick={() => setAuditLimit(l => l + 100)}>
                          แสดงเพิ่ม (เหลืออีก {fmtMoney(auditFiltered.length - auditLimit)} รายการ)
                        </button>
                      </div>
                    )}
                    {auditHasMore && (
                      <div style={{ padding: '12px 16px 0' }}>
                        <button className="berry-btn" style={{ width: '100%' }} onClick={loadOlderLogs} disabled={auditLoadingOlder}>
                          {auditLoadingOlder ? 'กำลังโหลด…' : `โหลดประวัติที่เก่ากว่านี้จากฐานข้อมูล (ทีละ ${AUDIT_PAGE} รายการ)`}
                        </button>
                      </div>
                    )}
                    {auditRows.some(r => r.derived) && (
                      <div style={{ padding: '8px 16px 14px', fontSize: 12, color: 'var(--berry-text-muted)' }}>
                        หมายเหตุ: บางแถวสร้างจากข้อมูลออเดอร์จริงในฐานข้อมูล เนื่องจากไม่พบบันทึกในตาราง AuditLog ของรายการนั้น จึงระบุผู้ทำรายการได้เพียงร้านหรือลูกค้า ไม่ระบุตัวพนักงาน
                      </div>
                    )}
                  </div>
                </div>
  );
}
