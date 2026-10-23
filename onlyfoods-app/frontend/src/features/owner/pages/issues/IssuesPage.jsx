import { hoursSince, fmtMoney, formatHours } from '../../lib/format';
import { ISSUE_OPEN_STATES, ISSUE_TYPE_ICON } from './issueMeta';
import { parseOrderDate } from '../../lib/dates';
import { PageHeader, Icon, Skeleton } from '../../components/ui';
import { IssueCard } from './IssueCard';
import { IssueRespondModal } from './IssueRespondModal';

// หน้ารายงานปัญหาจากลูกค้า : กรองตามประเภท/สถานะ ตอบกลับ
// ข้อมูลและ state อยู่ที่ OwnerView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function IssuesPage({
  issuesSummary, issueRange, issueSearch, issues, issueStatusFilter, issueFilter, issueSort, loaded,
  setIssueFilter, setIssueStatusFilter, setIssueRange, setIssueSort, setIssueSearch, issueBusyId,
  updateIssueStatus, setIssueRespond, issueRespond
}) {
  const sm = issuesSummary || {};
  const byStatus = sm.by_status || {};
  const pending = (byStatus.OPEN || 0) + (byStatus.IN_PROGRESS || 0);
  const days = issueRange === 'all' ? null : Number(issueRange);
  const q = issueSearch.trim().toLowerCase();
  const inRange = issues.filter(i => days === null || hoursSince(i.CreatedAt) <= days * 24);
  const shown = inRange
    .filter(i => issueStatusFilter === 'all'
      || (issueStatusFilter === 'pending' ? ISSUE_OPEN_STATES.includes(i.IssueStatus) : i.IssueStatus === issueStatusFilter))
    .filter(i => issueFilter === 'all' || i.TypeCode === issueFilter)
    .filter(i => !q || String(i.Description || '').toLowerCase().includes(q)
      || String(i.QueueNo || '').toLowerCase().includes(q)
      || (i.items || []).some(it => String(it.ProductName || '').toLowerCase().includes(q)))
    .sort((a, b) => {
      const ta = parseOrderDate(a.CreatedAt)?.getTime() || 0;
      const tb = parseOrderDate(b.CreatedAt)?.getTime() || 0;
      return issueSort === 'old' ? ta - tb : tb - ta;
    });
  const statusCount = (id) => inRange.filter(i => id === 'all' ? true
    : id === 'pending' ? ISSUE_OPEN_STATES.includes(i.IssueStatus) : i.IssueStatus === id).length;
  const statusTabs = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'pending', label: 'ต้องจัดการ', tone: 'red' },
    { id: 'IN_PROGRESS', label: 'กำลังดำเนินการ' },
    { id: 'RESOLVED', label: 'แก้ไขแล้ว', tone: 'green' },
    { id: 'REJECTED', label: 'ไม่รับเรื่อง' },
  ];
  const trend = (sm.last30 || 0) - (sm.prev30 || 0);
  const kpis = [
    { tone: 'red', icon: 'alert', value: fmtMoney(pending), label: 'เรื่องที่ต้องจัดการ', sub: byStatus.OPEN ? `ยังไม่รับเรื่อง ${byStatus.OPEN}` : null },
    { tone: 'green', icon: 'check', value: fmtMoney(byStatus.RESOLVED || 0), label: 'แก้ไขแล้ว' },
    { tone: 'blue', icon: 'clock', value: formatHours(sm.avg_resolve_hours), label: 'เวลาปิดเรื่องเฉลี่ย' },
    { tone: 'amber', icon: 'trend', value: fmtMoney(sm.last30 || 0), label: 'เรื่องใหม่ 30 วันล่าสุด',
      sub: sm.prev30 || sm.last30 ? `${trend > 0 ? '▲' : trend < 0 ? '▼' : '='} ${Math.abs(trend)} จาก 30 วันก่อน` : null },
  ];
  const maxType = Math.max(1, ...(sm.by_type || []).map(t => t.count));
  return (
    <>
      <PageHeader title="รายงานปัญหาจากลูกค้า" subtitle="ติดตาม ตอบกลับ และปิดเรื่องที่ลูกค้าแจ้งเข้ามา" icon="alert">
        <span className={`op-count-chip ${pending ? 'danger' : ''}`}>{pending ? `ต้องจัดการ ${fmtMoney(pending)} เรื่อง` : `${fmtMoney(issues.length)} รายการ`}</span>
      </PageHeader>

      <div className="rv-privacy"><Icon name="lock" size={15} /> เพื่อความเป็นส่วนตัวของลูกค้า ระบบไม่แสดงชื่อ เบอร์ หรือเลขคิวของผู้แจ้ง เห็นแค่เมนู วันที่ และช่วงเวลาของออเดอร์ ตอบกลับลูกค้าได้ผ่านปุ่มในแต่ละเรื่อง</div>

      <div className="sf-stats">
        {kpis.map(k => (
          <div key={k.label} className={`sf-stat tone-${k.tone === 'red' ? 'orange' : k.tone}`}>
            <span className="icon"><Icon name={k.icon} size={20} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="value">{loaded.issues ? k.value : <Skeleton height={22} width={40} />}</div>
              <div className="label">{k.label}</div>
              {k.sub && <div className="sub">{k.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {(sm.by_type || []).length > 0 && (
        <section className="rv-menu-card">
          <h4 className="sf-section-title"><Icon name="pie" size={16} /> ประเภทปัญหาที่พบ <span className="rv-hint">กดเพื่อกรองเฉพาะประเภทนั้น</span></h4>
          <div className="is-types">
            {sm.by_type.map(t => {
              const active = issueFilter === t.TypeCode;
              return (
                <button key={t.TypeCode} type="button" className={`is-type-row ${active ? 'active' : ''}`}
                  onClick={() => setIssueFilter(active ? 'all' : t.TypeCode)}>
                  <span className="is-type-name"><Icon name={ISSUE_TYPE_ICON[t.TypeCode] || 'alert'} size={14} /> {t.IssueType}</span>
                  <span className="rv-bar-track"><span className="rv-bar-fill tone-amber" style={{ width: `${(t.count / maxType) * 100}%` }} /></span>
                  <span className="is-type-count">{t.count}{t.open > 0 && <em> · ค้าง {t.open}</em>}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="mm-toolbar mm-wrap-tabs">
        <div className="mm-tabs" role="tablist" aria-label="กรองตามสถานะ">
          {statusTabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={issueStatusFilter === t.id}
              className={`mm-tab ${issueStatusFilter === t.id ? 'active' : ''} ${t.tone ? `tone-${t.tone}` : ''}`}
              onClick={() => setIssueStatusFilter(t.id)}>
              {t.tone && <span className="dot" />}{t.label}<span className="count">{statusCount(t.id)}</span>
            </button>
          ))}
        </div>
        <div className="rv-chips">
          <select className="mm-select" value={issueFilter} onChange={e => setIssueFilter(e.target.value)} aria-label="ประเภทปัญหา">
            <option value="all">ทุกประเภท</option>
            {(sm.by_type || []).map(t => <option key={t.TypeCode} value={t.TypeCode}>{t.IssueType}</option>)}
          </select>
          <select className="mm-select" value={issueRange} onChange={e => setIssueRange(e.target.value)} aria-label="ช่วงเวลา">
            <option value="7">7 วันล่าสุด</option>
            <option value="30">30 วันล่าสุด</option>
            <option value="all">ทุกช่วงเวลา</option>
          </select>
          <select className="mm-select" value={issueSort} onChange={e => setIssueSort(e.target.value)} aria-label="เรียงลำดับ">
            <option value="new">ใหม่ก่อน</option>
            <option value="old">ค้างนานก่อน</option>
          </select>
        </div>
        <div className="mm-search">
          <Icon name="search" size={16} />
          <input value={issueSearch} onChange={e => setIssueSearch(e.target.value)} placeholder="ค้นหาในรายละเอียด เลขคิว หรือชื่อเมนู..." aria-label="ค้นหารายงานปัญหา" />
          {issueSearch && <button type="button" onClick={() => setIssueSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>}
        </div>
      </div>

      {!loaded.issues ? (
        <div className="rv-grid">{[0, 1, 2].map(k => <Skeleton key={k} height={260} radius={16} />)}</div>
      ) : shown.length === 0 ? (
        <div className="sf-empty">
          <span className="icon"><Icon name={issues.length ? 'search' : 'check'} size={28} /></span>
          <h3>{issues.length === 0 ? 'ยังไม่มีลูกค้าแจ้งปัญหา' : issueStatusFilter === 'pending' ? 'ไม่มีเรื่องค้าง เยี่ยมมาก!' : 'ไม่มีรายงานที่ตรงกับตัวกรอง'}</h3>
          <p>{issues.length === 0 ? 'เมื่อลูกค้าแจ้งปัญหาเกี่ยวกับร้าน จะแสดงที่นี่ พร้อมปุ่มตอบกลับ' : 'ลองเปลี่ยนช่วงเวลา สถานะ หรือประเภทปัญหา'}</p>
        </div>
      ) : (
        <div className="rv-grid">
          {shown.map(i => (
            <IssueCard key={i.IssueReportId} issue={i} busy={issueBusyId === i.IssueReportId}
              onAction={(issue, target) => (target === 'IN_PROGRESS' && issue.IssueStatus === 'OPEN'
                ? updateIssueStatus(issue, 'IN_PROGRESS', issue.AdminNote || '')
                : setIssueRespond({ issue, target }))} />
          ))}
        </div>
      )}
      {issueRespond && (
        <IssueRespondModal issue={issueRespond.issue} target={issueRespond.target}
          onClose={() => setIssueRespond(null)}
          onSubmit={async (target, note) => { await updateIssueStatus(issueRespond.issue, target, note, true); setIssueRespond(null); }} />
      )}
    </>
  );
}
