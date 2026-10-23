import { T, searchInputStyle, inputStyle } from '../theme';
import { useCallback, useEffect, useState } from 'react';
import { parseOrderDate } from '../lib/dates';
import { thaiDateTime } from '../lib/format';
import { callApi } from '../lib/api';
import { useIsNarrow, Icon, Card, Button, EmptyState } from '../components/ui';
import { AppealDecisionModal, LiftModal, PendingAppeals, SuspendModal, SuspensionBadge, SuspensionHistory } from '../components/suspension';

// ===== ข้อมูลผู้ใช้
export const historyThStyle = { padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' };

export const historyTdStyle = { padding: '16px', textAlign: 'left', verticalAlign: 'top', fontSize: '13px', color: T.text };

export function CustomerInfoPage({ ctx }) {
    const { API, pushToast } = ctx;
    const isCompact = useIsNarrow(700);
    const [query, setQuery] = useState(''), [customers, setCustomers] = useState([]), [loading, setLoading] = useState(false), [searched, setSearched] = useState(false), [error, setError] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [activities, setActivities] = useState([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityError, setActivityError] = useState('');
    // ระงับบัญชี : ประวัติของลูกค้าที่เปิดดู, อุทธรณ์รอพิจารณา, หน้าต่างระงับ/ปลด/ตอบอุทธรณ์
    const [suspensions, setSuspensions] = useState([]);
    const [suspensionsLoading, setSuspensionsLoading] = useState(false);
    const [suspensionsError, setSuspensionsError] = useState('');
    const [appeals, setAppeals] = useState([]);
    const [suspendTarget, setSuspendTarget] = useState(null);   // { customer, mode, customDays, reason, busy, error }
    const [liftTarget, setLiftTarget] = useState(null);         // { customer, note, busy, error }
    const [decision, setDecision] = useState(null);             // { appeal, approve, response, busy, error }

    const loadAppeals = useCallback(async () => {
        try {
            const data = await callApi(`${API}/api/executive/suspension-appeals`);
            setAppeals(Array.isArray(data) ? data : []);
        } catch (err) { console.debug('โหลดอุทธรณ์ไม่สำเร็จ:', err.message); }
    }, [API]);
    useEffect(() => { loadAppeals(); }, [loadAppeals]);

    const loadSuspensions = async (userId) => {
        setSuspensionsLoading(true); setSuspensionsError('');
        try {
            const data = await callApi(`${API}/api/executive/customers/${userId}/suspensions`);
            setSuspensions(Array.isArray(data) ? data : []);
        } catch (err) { setSuspensions([]); setSuspensionsError(err.message); }
        finally { setSuspensionsLoading(false); }
    };

    // หลังระงับ/ปลด/ตอบอุทธรณ์ : อัปเดตสถานะในผลค้นหา + ประวัติของคนที่เปิดอยู่ + รายการอุทธรณ์
    const refreshCustomer = async (userId) => {
        try {
            const data = await callApi(`${API}/api/executive/customers?search=${userId}`);
            const fresh = (Array.isArray(data) ? data : []).find(c => c.UserId === userId);
            if (fresh) {
                setCustomers(list => list.map(c => (c.UserId === userId ? fresh : c)));
                setSelectedCustomer(c => (c && c.UserId === userId ? fresh : c));
            }
        } catch (err) { console.debug('โหลดสถานะลูกค้าใหม่ไม่สำเร็จ:', err.message); }
        if (selectedCustomer?.UserId === userId) loadSuspensions(userId);
        loadAppeals();
    };

    const submitSuspend = async () => {
        const s = suspendTarget;
        if (!s || s.busy) return;
        const reason = s.reason.trim();
        const days = s.mode === 'none' ? null : s.mode === 'custom' ? Number(s.customDays) : s.mode;
        if (reason.length < 5) return setSuspendTarget(v => ({ ...v, error: 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร' }));
        if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 365)) return setSuspendTarget(v => ({ ...v, error: 'ระยะเวลาต้องเป็นจำนวนวัน 1–365' }));
        setSuspendTarget(v => ({ ...v, busy: true, error: '' }));
        try {
            const data = await callApi(`${API}/api/executive/customers/${s.customer.UserId}/suspend`, { method: 'POST', body: JSON.stringify({ reason, days }) });
            setSuspendTarget(null);
            pushToast?.(data?.message || 'ระงับบัญชีแล้ว');
            refreshCustomer(s.customer.UserId);
        } catch (err) { setSuspendTarget(v => v && ({ ...v, busy: false, error: err.message })); }
    };

    const submitLift = async () => {
        const s = liftTarget;
        if (!s || s.busy) return;
        setLiftTarget(v => ({ ...v, busy: true, error: '' }));
        try {
            const data = await callApi(`${API}/api/executive/customers/${s.customer.UserId}/unsuspend`, { method: 'POST', body: JSON.stringify({ note: s.note.trim() || null }) });
            setLiftTarget(null);
            pushToast?.(data?.message || 'ปลดระงับแล้ว');
            refreshCustomer(s.customer.UserId);
        } catch (err) { setLiftTarget(v => v && ({ ...v, busy: false, error: err.message })); }
    };

    const submitDecision = async () => {
        const s = decision;
        if (!s || s.busy) return;
        const response = s.response.trim();
        if (!s.approve && response.length < 5) return setDecision(v => ({ ...v, error: 'กรุณาระบุเหตุผลที่ไม่อนุมัติอย่างน้อย 5 ตัวอักษร' }));
        setDecision(v => ({ ...v, busy: true, error: '' }));
        try {
            const data = await callApi(`${API}/api/executive/suspensions/${s.appeal.SuspensionId}/appeal`, { method: 'POST', body: JSON.stringify({ approve: s.approve, response: response || null }) });
            setDecision(null);
            pushToast?.(data?.message || 'บันทึกผลอุทธรณ์แล้ว');
            refreshCustomer(s.appeal.UserId);
        } catch (err) { setDecision(v => v && ({ ...v, busy: false, error: err.message })); }
    };

    const searchCustomers = async (keywordOverride) => {
    const keyword = (keywordOverride ?? query).trim();
    if (!keyword) {
        setCustomers([]); setSearched(false); setError(''); setSelectedCustomer(null); setActivities([]); setActivityError(''); return;
    }
    setSelectedCustomer(null); setActivities([]); setActivityError(''); setLoading(true); setError('');
    try {
        const data = await callApi(`${API}/api/executive/customers?search=${encodeURIComponent(keyword)}`);
        setCustomers(Array.isArray(data) ? data : []); setSearched(true);
    } catch (err) {
        setCustomers([]); setSearched(true); setError(err.message);
    } finally { setLoading(false); }
};
    const openCustomer = async (customer) => {
    setSelectedCustomer(customer); setActivities([]); setActivityLoading(true); setActivityError('');
    loadSuspensions(customer.UserId);
    try {
        const [orders, reviews, issues] = await Promise.all([
            callApi(`${API}/api/orders?user_id=${customer.UserId}`),
            callApi(`${API}/api/executive/customers/${customer.UserId}/reviews`),
            callApi(`${API}/api/executive/customers/${customer.UserId}/issues`)
        ]);
        const orderEvents = (Array.isArray(orders) ? orders : []).map(order => ({ type: 'order', id: `order-${order.OrderID}`, date: order.CreatedAt || order.OrderTime, data: order }));
        const reviewEvents = (Array.isArray(reviews) ? reviews : []).map(review => ({ type: 'review', id: `review-${review.ReviewId}`, date: review.CreatedAt, data: review }));
        const issueEvents = (Array.isArray(issues) ? issues : []).map(issue => ({ type: 'issue', id: `issue-${issue.ReportID}`, date: issue.CreatedAt, data: issue }));
        const combined = [...orderEvents, ...reviewEvents, ...issueEvents].sort((a, b) => {
        const aTime = parseOrderDate(a.date)?.getTime() || 0;
        const bTime = parseOrderDate(b.date)?.getTime() || 0;
        return bTime - aTime;
    });
        setActivities(combined);
    } catch (err) { setActivityError(err.message); }
    finally { setActivityLoading(false); }};
    return (
        <Card title="ค้นหาข้อมูลผู้ใช้" subtitle="ค้นหาเฉพาะบัญชี Customer ด้วย User ID, Username หรือชื่อผู้ใช้">
            <PendingAppeals appeals={appeals}
                onDecide={(appeal, approve) => setDecision({ appeal, approve, response: '', busy: false, error: '' })}
                onOpen={(appeal) => { setQuery(String(appeal.UserId)); searchCustomers(String(appeal.UserId)); }}/>
            <form onSubmit={e => { e.preventDefault(); searchCustomers(); }} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', flex: '1 1 320px' }}>
                    <Icon name="search" size={17} color={T.muted}/>
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="User ID, Username หรือชื่อผู้ใช้" style={{ ...searchInputStyle, padding: '11px 0', width: '100%' }}/>
                </div>
                <Button type="submit" icon="search" disabled={loading || !query.trim()}>{loading ? 'กำลังค้นหา...' : 'ค้นหา'}</Button>
            </form>

            {error && <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: T.radiusMd, background: T.redSoft, color: T.down, fontSize: '13px' }}>{error}</div>}
            {!loading && searched && !error && customers.length === 0 && <EmptyState text="ไม่พบ Customer ที่ตรงกับคำค้นหา" minHeight="150px"/>}

            {customers.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
    {customers.map(customer => <div key={customer.UserId} style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '16px', background: T.surface }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {customer.FullName || 'ไม่ระบุชื่อ'}
            <SuspensionBadge customer={customer}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: '12px', minWidth: 0 }}>
            <div><strong>User ID:</strong> {customer.UserId}</div>
            <div><strong>Username:</strong> {customer.Username || '—'}</div>
            <div><strong>Role:</strong> {customer.Role || '—'}</div>
            <div><strong>Email:</strong> {customer.Email || '—'}</div>
            <div><strong>Phone:</strong> {customer.Phone || '—'}</div>
            {customer.IsSuspended && <div style={{ gridColumn: '1 / -1', color: T.down }}><strong>เหตุผลที่ระงับ:</strong> {customer.SuspendReason}</div>}
        </div>
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button icon="history" onClick={() => openCustomer(customer)}>ดูข้อมูลและประวัติ</Button>
            {customer.IsSuspended
                ? <Button variant="soft" icon="check" onClick={() => setLiftTarget({ customer, note: '', busy: false, error: '' })}>ปลดระงับ</Button>
                : <Button variant="danger" icon="ban" onClick={() => setSuspendTarget({ customer, mode: 7, customDays: '', reason: '', busy: false, error: '' })}>ระงับบัญชี</Button>}
        </div>
    </div>)}
</div>}

{selectedCustomer && <div style={{ marginTop: '24px', paddingTop: '22px', borderTop: `1px solid ${T.line}` }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: T.ink }}>ประวัติพฤติกรรม</div>
            <div style={{ marginTop: '4px', fontSize: '13px', color: T.muted }}>{selectedCustomer.FullName || 'ไม่ระบุชื่อ'} • User ID: {selectedCustomer.UserId} • {selectedCustomer.Username || 'ไม่ระบุ Username'}</div>
        </div>
        {!activityLoading && !activityError && <div style={{ fontSize: '13px', color: T.muted }}>ทั้งหมด {activities.length} รายการ</div>}
    </div>

    <SuspensionHistory items={suspensions} loading={suspensionsLoading} error={suspensionsError}/>
    <div style={{ fontSize: '16px', fontWeight: 700, color: T.ink, marginBottom: '10px' }}>กิจกรรมการใช้งาน</div>

    {activityLoading && <div style={{ padding: '28px 0', textAlign: 'center', color: T.muted }}>กำลังโหลดประวัติ...</div>}
    {activityError && <div style={{ padding: '12px 14px', borderRadius: T.radiusMd, background: T.redSoft, color: T.down }}>{activityError}</div>}
    {!activityLoading && !activityError && activities.length === 0 && <EmptyState text="ยังไม่มีประวัติการใช้งาน" minHeight="140px"/>}

    {!activityLoading && !activityError && activities.length > 0 && <div style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, overflowX: 'auto', background: T.surface }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead><tr style={{ borderBottom: `1px solid ${T.line}` }}>
                <th style={historyThStyle}>วันและเวลา</th><th style={historyThStyle}>กิจกรรม</th><th style={historyThStyle}>ร้านค้า</th><th style={historyThStyle}>รายละเอียด</th><th style={historyThStyle}>สถานะ / ประเภท</th>
            </tr></thead>
            <tbody>
                {activities.map(activity => {
                    const data = activity.data;
                    let activityName = '', storeName = data.StoreName || '—', detail = '', badgeText = '', badgeStyle = { background: T.surface2, color: T.text };

                    if (activity.type === 'order') {
                        activityName = 'สั่งอาหาร';
                        detail = (data.items || []).map(item => `${item.ProductName} × ${item.Qty}`).join(', ') || 'ไม่มีรายละเอียดเมนู';
                        if (data.CancelReason) detail += ` • เหตุผลการยกเลิก: ${data.CancelReason}`;
                        badgeText = data.Status || 'Order';
                        const status = String(data.Status || '').toLowerCase();
                        if (status === 'completed') badgeStyle = { background: '#E8F7EF', color: '#18864B' };
                        else if (status === 'cancelled' || status === 'canceled') badgeStyle = { background: '#FFF0EB', color: '#D95432' };
                    }

                    if (activity.type === 'review') {
                        activityName = 'รีวิว';
                        detail = `คะแนน ${data.Rating ?? '—'}/5`;
                        if (data.Comment) detail += ` • ${data.Comment}`;
                        badgeText = 'รีวิว';
                        badgeStyle = { background: '#FFF5D9', color: '#A66B00' };
                    }

                    if (activity.type === 'issue') {
                        activityName = 'แจ้งปัญหา';
                        detail = data.Description || 'ไม่มีรายละเอียด';
                        if (data.AdminNote) detail += ` • หมายเหตุ: ${data.AdminNote}`;
                        badgeText = data.IssueType || 'แจ้งปัญหา';
                        badgeStyle = { background: '#FFF0EB', color: '#D95432' };
                    }

                    return <tr key={activity.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                        <td style={historyTdStyle}><div style={{ color: T.muted, whiteSpace: 'nowrap' }}>{activity.date ?  thaiDateTime(activity.date): 'ไม่ระบุวันที่'}</div></td>
                        <td style={historyTdStyle}><div style={{ fontWeight: 700, color: T.ink }}>{activityName}</div></td>
                        <td style={historyTdStyle}>{storeName}</td>
                        <td style={{ ...historyTdStyle, minWidth: '280px' }}>{detail}</td>
                        <td style={historyTdStyle}><span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', ...badgeStyle }}>{badgeText}</span></td>
                    </tr>;
                })}
            </tbody>
        </table>
    </div>}
</div>}

<SuspendModal state={suspendTarget} setState={setSuspendTarget} onSubmit={submitSuspend}/>
<LiftModal state={liftTarget} setState={setLiftTarget} onSubmit={submitLift}/>
<AppealDecisionModal state={decision} setState={setDecision} onSubmit={submitDecision}/>
</Card>
);
}
