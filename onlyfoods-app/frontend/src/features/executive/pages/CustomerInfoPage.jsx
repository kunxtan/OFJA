import { T, searchInputStyle, inputStyle } from '../theme';
import { useState } from 'react';
import { parseOrderDate } from '../lib/dates';
import { thaiDateTime } from '../lib/format';
import { callApi } from '../lib/api';
import { useIsNarrow, Icon, Card, Button, EmptyState } from '../components/ui';

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
    const searchCustomers = async () => {
    const keyword = query.trim();
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
        <div style={{ fontSize: '16px', fontWeight: 700, color: T.ink, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {customer.FullName || 'ไม่ระบุชื่อ'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: '12px', minWidth: 0 }}>
            <div><strong>User ID:</strong> {customer.UserId}</div>
            <div><strong>Username:</strong> {customer.Username || '—'}</div>
            <div><strong>Role:</strong> {customer.Role || '—'}</div>
            <div><strong>Email:</strong> {customer.Email || '—'}</div>
            <div><strong>Phone:</strong> {customer.Phone || '—'}</div>
        </div>
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button icon="history" onClick={() => openCustomer(customer)}>ดูข้อมูลและประวัติ</Button>
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

</Card>
);
}
