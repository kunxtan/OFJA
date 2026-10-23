import { useEffect, useRef, useState } from 'react';
import { T, FONT_STACK, captionStyle, tableStyle, thStyle, thRightStyle, trStyle, tdStyle, tdRightStyle, inputStyle, formDateInputStyle } from '../theme';
import { money, thaiDateTime, daysAgoISO, formatHoursTh } from '../lib/format';
import { todayISO } from '../../../lib/dates';
import { callApi } from '../lib/api';
import { Card, EmptyState } from '../components/ui';
import { IssueStatusBadge, IssueDetailModal, ISSUE_RANGES, ISSUE_STATUS_TABS } from '../components/issues';
import { IconInput } from './store-manage/formParts';

export function IssueReportsPage({ ctx }) {
    const { API, stores, focusStoreId, clearFocusStore } = ctx;
    const [storeId, setStoreId] = useState(focusStoreId || '');
    const [query, setQuery] = useState('');
    const [range, setRange] = useState('30');
    const [customStart, setCustomStart] = useState(() => daysAgoISO(29));
    const [customEnd, setCustomEnd] = useState(todayISO());
    const [typeCode, setTypeCode] = useState('');
    const [status, setStatus] = useState('pending');
    // ยังไม่ได้กดแท็บเอง = เลือกแท็บให้ : มีเรื่องค้าง -> "ต้องจัดการ" ; ไม่มี -> "ทั้งหมด"
    const autoTab = useRef(true);
    const [state, setState] = useState({ loading: true, error: '', issues: [], summary: null });
    const [openIssueId, setOpenIssueId] = useState(null);

    // มาจากปุ่มของหน้าอื่น (กระดิ่ง / Dashboard / ยอดขายรายร้าน) = เลือกร้านนั้นไว้ให้
    useEffect(() => {
        if (focusStoreId) {
            setStoreId(focusStoreId);
            clearFocusStore();
        }
    }, [focusStoreId, clearFocusStore]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (storeId) params.set('store_id', storeId);
        if (typeCode) params.set('type_code', typeCode);
        if (range === 'custom') {
            if (customStart) params.set('date_from', customStart);
            if (customEnd) params.set('date_to', customEnd);
        } else if (range !== 'all') {
            params.set('date_from', daysAgoISO(Number(range) - 1));
        }
        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: '' }));
        callApi(`${API}/api/executive/issues?${params}`)
                        .then((data) => {
                if (cancelled) return;
                setState({ loading: false, error: '', issues: data.issues || [], summary: data.summary || null });
                if (autoTab.current) setStatus(data.summary?.pending ? 'pending' : 'all');
            })
            .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message, issues: [], summary: null }); });
        return () => { cancelled = true; };
    }, [API, storeId, typeCode, range, customStart, customEnd]);

    const sm = state.summary || {};
    const byStatus = sm.by_status || {};
    const countOf = (id) => (id === 'all' ? (sm.total || 0) : id === 'pending' ? (sm.pending || 0) : (byStatus[id] || 0));
    const q = query.trim().toLowerCase().replace(/^#/, '');
    const rows = state.issues
        .filter((i) => status === 'all' || (status === 'pending' ? i.IsOpen : i.IssueStatus === status))
        .filter((i) => !q || `${i.QueueNo || ''} ${i.OrderID || ''} ${i.StoreName} ${i.IssueType} ${i.CustomerName} ${i.Description}`.toLowerCase().includes(q));
    // เรื่องที่ต้องจัดการ: เก่าสุดขึ้นก่อน จะได้ไม่จมหาย ; แท็บอื่น: ใหม่สุดขึ้นก่อน
    const shown = status === 'pending' ? [...rows].reverse() : rows;

        const stat = (label, value, sub, color, first = false, small = false) => (<div style={{ padding: '4px 18px', borderLeft: first ? 'none' : `1px solid ${T.line}`, minWidth: 0 }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ color: color || T.ink, fontSize: small ? '16px' : '22px', lineHeight: small ? '30px' : 1.4, fontWeight: 700, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ ...captionStyle, fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>);
    const chip = (active) => ({ border: `1px solid ${active ? T.primary : T.line}`, background: active ? T.primarySoft : T.surface, color: active ? T.primaryDark : T.text, borderRadius: '999px', padding: '7px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: FONT_STACK });

    return (<>
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', margin: '0 -18px 0 -18px' }}>
          {stat('ต้องจัดการ', money(sm.pending || 0), byStatus.IN_PROGRESS ? `กำลังดำเนินการ ${money(byStatus.IN_PROGRESS)}` : null, sm.pending ? T.down : T.ink, true)}
          {stat(`ค้างเกิน ${sm.stale_hours || 24} ชม.`, money(sm.stale || 0), null, sm.stale ? T.down : T.ink)}
          {stat('เวลาปิดเรื่องเฉลี่ย', formatHoursTh(sm.avg_resolve_hours))}
          {stat('ปัญหาที่พบบ่อยสุด', sm.top_type?.IssueType || '—', sm.top_type ? `${money(sm.top_type.count)} เรื่อง` : null, null, false, true)}
        </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px' }}>
          <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
            <IconInput icon="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขคิว เลขออเดอร์ ชื่อลูกค้า หรือข้อความ..."/>
          </div>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '200px' }}>
            <option value="">ทุกร้าน</option>
            {stores.map((st) => <option key={st.StoreId} value={String(st.StoreId)}>{st.StoreName}</option>)}
          </select>
          <select value={range} onChange={(e) => setRange(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            {ISSUE_RANGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          {range === 'custom' && (<>
            <input type="date" value={customStart} max={customEnd || undefined} onChange={(e) => setCustomStart(e.target.value)} style={{ ...formDateInputStyle, width: 'auto' }}/>
            <input type="date" value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.target.value)} style={{ ...formDateInputStyle, width: 'auto' }}/>
          </>)}
          <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value="">ทุกประเภทปัญหา</option>
            {(sm.types || []).map((t) => <option key={t.TypeCode} value={t.TypeCode}>{t.IssueType}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '12px' }}>
            {ISSUE_STATUS_TABS.map(([id, label]) => (<button key={id} type="button" onClick={() => { autoTab.current = false; setStatus(id); }} style={chip(status === id)}>
            {label} ({money(countOf(id))})
          </button>))}
        </div>
      </Card>

      <Card title="รายการรายงานปัญหา" subtitle={status === 'pending' ? 'เรียงเรื่องที่ค้างนานสุดขึ้นก่อน · กดที่แถวเพื่อดูรายละเอียด' : 'เรียงใหม่สุดขึ้นก่อน · กดที่แถวเพื่อดูรายละเอียด'}>
        {state.loading ? <EmptyState text="กำลังโหลดรายงานปัญหา..."/>
          : state.error ? <EmptyState text={state.error}/>
          : shown.length === 0 ? <EmptyState text={q ? `ไม่พบรายงานที่ตรงกับ “${query.trim()}”` : status === 'pending' ? 'ไม่มีเรื่องที่ต้องจัดการในช่วงนี้' : 'ไม่พบรายงานปัญหาตามตัวกรอง'}/>
          : (<div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: '720px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>วันที่แจ้ง</th>
                  <th style={thStyle}>ร้าน</th>
                  <th style={thStyle}>ปัญหา</th>
                  <th style={thStyle}>สถานะ</th>
                  <th style={thRightStyle}>ระยะเวลา</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (<tr key={i.IssueReportId} onClick={() => setOpenIssueId(i.IssueReportId)} style={{ ...trStyle, cursor: 'pointer' }}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: T.muted }}>{thaiDateTime(i.CreatedAt)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: T.ink }}>{i.StoreName}</td>
                  <td style={tdStyle}>
                    <div style={{ color: T.ink }}>{i.IssueType}</div>
                    <div style={{ ...captionStyle, maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i.QueueNo ? `คิว ${i.QueueNo} · ` : ''}{i.Description}
                    </div>
                  </td>
                  <td style={tdStyle}><IssueStatusBadge status={i.IssueStatus}/></td>
                  <td style={{ ...tdRightStyle, whiteSpace: 'nowrap', color: i.IsStale ? T.down : T.text, fontWeight: i.IsStale ? 700 : 400 }}>
                    {i.IsOpen ? `ค้างมา ${formatHoursTh(i.AgeHours)}` : `ปิดใน ${formatHoursTh(i.ResolveHours)}`}
                  </td>
                </tr>))}
              </tbody>
            </table>
          </div>)}
      </Card>

      <IssueDetailModal API={API} issueId={openIssueId} onClose={() => setOpenIssueId(null)}/>
    </>);
}
