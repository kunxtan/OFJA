import { Badge, Button, Modal, EmptyState } from './ui';
import { useEffect, useState } from 'react';
import { T, captionStyle } from '../theme';
import { money2, thaiDateTime } from '../lib/format';
import { callApi } from '../lib/api';

// ===== รายงานปัญหา (ผู้บริหารดูอย่างเดียว) : สถานะ / หน้าต่างรายละเอียด / หน้ารวมทุกร้าน =====
export const ISSUE_STATUS_META = {
    OPEN: { label: 'รอดำเนินการ', tone: 'danger' },
    IN_PROGRESS: { label: 'กำลังดำเนินการ', tone: 'warn' },
    RESOLVED: { label: 'แก้ไขแล้ว', tone: 'ok' },
    REJECTED: { label: 'ไม่รับเรื่อง', tone: 'neutral' }
};

export function IssueStatusBadge({ status }) {
    const meta = ISSUE_STATUS_META[status] || { label: status || '-', tone: 'neutral' };
    return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function IssueDetailModal({ API, issueId, onClose }) {
    const [state, setState] = useState({ loading: false, error: '', data: null });
    useEffect(() => {
        if (!issueId) return undefined;
        let cancelled = false;
        setState({ loading: true, error: '', data: null });
        callApi(`${API}/api/executive/issues/${issueId}`)
            .then((data) => { if (!cancelled) setState({ loading: false, error: '', data }); })
            .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message, data: null }); });
        return () => { cancelled = true; };
    }, [API, issueId]);
    const d = state.data;
    const row = (label, value) => (<div style={{ minWidth: 0 }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ color: T.ink, fontSize: '13.5px', fontWeight: 600, marginTop: '2px' }}>{value || '—'}</div>
    </div>);
    const sectionTitle = (text) => <div style={{ color: T.muted, fontSize: '12.5px', fontWeight: 700, margin: '18px 0 8px' }}>{text}</div>;
    return (<Modal open={Boolean(issueId)} title={d ? `รายงานปัญหา #${d.IssueReportId}` : 'รายงานปัญหา'} subtitle={d ? `${d.StoreName} · ${d.IssueType}` : ''} onClose={onClose} width={640}
      footer={<>
        <span style={{ ...captionStyle, marginRight: 'auto' }}>ผู้บริหารดูได้อย่างเดียว · ร้านเป็นผู้อัปเดตสถานะ</span>
        <Button variant="ghost" onClick={onClose}>ปิด</Button>
      </>}>
      {state.loading && <EmptyState text="กำลังโหลดรายละเอียด..." minHeight="160px"/>}
      {state.error && <EmptyState text={state.error} minHeight="160px"/>}
      {d && (<div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <IssueStatusBadge status={d.IssueStatus}/>
          <span style={captionStyle}>แจ้งเมื่อ {thaiDateTime(d.CreatedAt)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '12px', marginTop: '14px' }}>
          {row('ร้าน', d.StoreName)}
          {row('ผู้แจ้ง', d.CustomerName)}
          {row('ออเดอร์', d.OrderID ? `${d.QueueNo ? `คิว ${d.QueueNo} · ` : ''}#${d.OrderID}` : 'ไม่ได้ระบุออเดอร์')}
          {d.Order && row('สถานะออเดอร์ / ยอด', `${d.Order.StatusNameTh} · ${money2(d.Order.TotalAmount)} บาท`)}
        </div>

        {sectionTitle('ข้อความจากลูกค้า')}
        <div style={{ padding: '11px 13px', borderRadius: T.radiusMd, background: T.bg, color: T.text, fontSize: '13.5px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
          {d.Description || '-'}
        </div>

        {d.items.length > 0 && (<>
          {sectionTitle('รายการอาหารในออเดอร์')}
          <div style={{ display: 'grid', gap: '4px' }}>
            {d.items.map((it, idx) => (<div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: T.text }}>
              <span>{it.ProductName}</span><span style={{ color: T.muted }}>x{it.Qty}</span>
            </div>))}
          </div>
        </>)}

        {sectionTitle('การตอบกลับของร้าน')}
        {d.AdminNote ? (<div style={{ padding: '11px 13px', borderRadius: T.radiusMd, border: `1px solid ${T.line}`, fontSize: '13.5px', color: T.text, lineHeight: 1.6 }}>
          {d.AdminNote}
          {d.HandledByName && <div style={{ ...captionStyle, marginTop: '6px' }}>โดย {d.HandledByName}</div>}
        </div>) : <div style={captionStyle}>ร้านยังไม่ได้ตอบกลับ</div>}

        {sectionTitle('ลำดับเหตุการณ์')}
        <div style={{ display: 'grid', gap: '0' }}>
          {d.Timeline.map((t, idx) => (<div key={idx} style={{ display: 'flex', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', marginTop: '5px', background: idx === d.Timeline.length - 1 ? T.primary : T.line }}/>
              {idx < d.Timeline.length - 1 && <span style={{ width: '2px', flex: 1, background: T.line }}/>}
            </div>
            <div style={{ paddingBottom: '12px', minWidth: 0 }}>
              <div style={{ color: T.ink, fontSize: '13.5px', fontWeight: 600 }}>{t.Label}</div>
              <div style={captionStyle}>{thaiDateTime(t.At)} · {t.By}</div>
              {t.Note && <div style={{ color: T.text, fontSize: '13px', marginTop: '3px' }}>“{t.Note}”</div>}
            </div>
          </div>))}
        </div>
      </div>)}
    </Modal>);
}

export const ISSUE_RANGES = [['7', '7 วันล่าสุด'], ['30', '30 วันล่าสุด'], ['90', '90 วันล่าสุด'], ['all', 'ทั้งหมด'], ['custom', 'กำหนดช่วงเอง']];

export const ISSUE_STATUS_TABS = [['all', 'ทั้งหมด'], ['pending', 'ต้องจัดการ'], ['IN_PROGRESS', 'กำลังดำเนินการ'], ['RESOLVED', 'แก้ไขแล้ว'], ['REJECTED', 'ไม่รับเรื่อง']];
