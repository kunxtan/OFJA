import { useEffect, useMemo, useState } from 'react';
import { T, captionStyle } from '../theme';
import { money, thaiDateTime } from '../lib/format';
import { parseOrderDate } from '../lib/dates';
import { callApi } from '../lib/api';
import { Card, Badge, Button, EmptyState } from './ui';
import { IssueStatusBadge, IssueDetailModal } from './issues';

// ===== รายงานปัญหาร้านค้า: ตรวจสอบข้อร้องเรียนของแต่ละร้าน =====
export function StoreIssueReportSection({ ctx, storeId, style }) {
    const { API } = ctx;
    const [state, setState] = useState({ loading: false, error: null, rows: [] });
    const [typeFilter, setTypeFilter] = useState('all');
    const [openIssueId, setOpenIssueId] = useState(null);

    useEffect(() => {
        setTypeFilter('all');
    }, [storeId]);

    useEffect(() => {
        if (!storeId) {
            setState({ loading: false, error: null, rows: [] });
            return undefined;
        }
        let cancelled = false;
        setState({ loading: true, error: null, rows: [] });
        callApi(`${API}/api/reports/issue/store/${storeId}`)
            .then((data) => {
            if (!cancelled)
                setState({ loading: false, error: null, rows: Array.isArray(data) ? data : [] });
        })
            .catch((err) => {
            if (!cancelled)
                setState({ loading: false, error: err.message, rows: [] });
        });
        return () => {
            cancelled = true;
        };
    }, [API, storeId]);

    // รายงานปัญหาเป็นข้อมูล all-time ของร้าน ไม่ผูกกับตัวกรองวันที่ของยอดขาย
    const reports = useMemo(() => [...state.rows].sort((a, b) => {
        const aTime = parseOrderDate(a.CreatedAt)?.getTime() || 0;
        const bTime = parseOrderDate(b.CreatedAt)?.getTime() || 0;
        return bTime - aTime;
    }), [state.rows]);

    const issueTypes = useMemo(() => [...new Set(reports
        .map((r) => String(r.IssueType || '').trim())
        .filter(Boolean))], [reports]);

    const filteredReports = useMemo(() => {
        if (typeFilter === 'all') return reports;
        return reports.filter((r) => String(r.IssueType || '') === typeFilter);
    }, [reports, typeFilter]);

    const filterChip = (active) => ({
        border: `1px solid ${active ? T.primary : T.line}`,
        background: active ? T.primarySoft : '#FFF',
        color: active ? T.primaryDark : T.text,
        borderRadius: '999px',
        padding: '7px 12px',
        fontSize: '12.5px',
        fontWeight: active ? 700 : 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap'
    });

    return (<Card
      title="รายงานปัญหาจากลูกค้า"
      subtitle="รายงานทั้งหมดของร้านนี้ "
      style={{ margin: 0, ...style }}
            right={reports.length > 0 ? (<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Badge tone="warn">{money(reports.length)} รายการ</Badge>
        <Button variant="ghost" onClick={() => ctx.navigateTo('issue-reports', storeId)} style={{ padding: '7px 12px', fontSize: '12.5px' }}>ดูในหน้ารายงานปัญหา</Button>
      </div>) : null}
    >
      {state.loading && <EmptyState text="กำลังโหลดรายงานปัญหา..."/>}
      {!state.loading && state.error && <EmptyState text={state.error}/>} 
      {!state.loading && !state.error && reports.length === 0 && <EmptyState text="ร้านนี้ยังไม่มีรายงานปัญหาจากลูกค้า"/>}
      {!state.loading && !state.error && reports.length > 0 && (<div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ ...captionStyle, marginRight: '2px' }}>ประเภทปัญหา:</span>
          <button type="button" onClick={() => setTypeFilter('all')} style={filterChip(typeFilter === 'all')}>
            ทั้งหมด ({money(reports.length)})
          </button>
          {issueTypes.map((type) => (<button key={type} type="button" onClick={() => setTypeFilter(type)} style={filterChip(typeFilter === type)}>
            {type} ({money(reports.filter((r) => String(r.IssueType || '') === type).length)})
          </button>))}
        </div>

        {filteredReports.length > 0 ? (<div style={{ display: 'grid', gap: '10px' }}>
                    {filteredReports.map((report) => (<div key={report.ReportID} role="button" tabIndex={0} title="กดเพื่อดูสถานะและรายละเอียด"
            onClick={() => setOpenIssueId(report.ReportID)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenIssueId(report.ReportID); }}
            style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '13px 14px', background: '#FFF', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                 <strong style={{ color: T.ink, fontSize: '14px' }}>{report.IssueType || 'ไม่ระบุประเภท'}</strong>
                  <IssueStatusBadge status={report.IssueStatus}/>
                  {report.QueueNo && <Badge tone="neutral">คิว {report.QueueNo}</Badge>}
                </div>
                <div style={{ ...captionStyle, marginTop: '4px' }}>
                  ผู้แจ้ง: {report.CustomerName || `User ${report.UserId}`}
                  {report.OrderID ? ` · Order #${report.OrderID}` : ''}
                </div>
              </div>
              <span style={captionStyle}>{thaiDateTime(report.CreatedAt)}</span>
            </div>
            <p style={{ margin: '9px 0 0', color: T.text, fontSize: '13.5px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {report.Description || '-'}
            </p>
            {report.AdminNote && (<div style={{ marginTop: '9px', padding: '9px 11px', borderRadius: T.radiusMd, background: T.deepSoft, color: T.text, fontSize: '13px' }}>
              <strong>หมายเหตุ:</strong> {report.AdminNote}
            </div>)}
          </div>))}
                </div>) : <EmptyState text={`ยังไม่มีรายงานประเภท “${typeFilter}”`}/>} 
      </div>)}
      <IssueDetailModal API={API} issueId={openIssueId} onClose={() => setOpenIssueId(null)}/>
    </Card>);
}
