import { T, FONT_STACK, SELECT_CHEVRON, h3Style, captionStyle, toolbarStyle, tableStyle, thStyle, trStyle, tdStyle, inputStyle } from '../theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AUDIT_VERBS, auditCodesMatching, formatAuditDetails } from '../../../lib/auditText';
import { thaiDateTime } from '../lib/format';
import { callApi } from '../lib/api';
import { Icon, Card, Button } from '../components/ui';

// ===== ประวัติการดำเนินการ: ตรวจสอบกิจกรรมสำคัญในระบบ =====
// ค้นหา/กรองที่ backend (ค้นได้ทั้งตาราง) แล้วโหลดทีละ AUDIT_PAGE_SIZE รายการ กด "โหลดเพิ่ม" เพื่อดูเก่ากว่า
export const AUDIT_PAGE_SIZE = 100;

// ชื่อภาษาไทยของการดำเนินการ (ใช้ทั้งแสดงผลและแปลงคำค้นภาษาไทยเป็น ActionCode ส่งให้ backend)

// กลุ่มของการกระทำ : ต้องตรงกับ _AUDIT_GROUPS ใน backend/routers/reports.py (เช็คตามลำดับ กลุ่มแรกที่ตรงชนะ)
export const AUDIT_GROUP_WORDS = [
    ['store', ['STORE', 'SUSPEND']],
    ['account', ['ACCOUNT', 'USER', 'STAFF', 'PASSWORD']],
    ['payment', ['SLIP', 'PAYMENT', 'REFUND']],
    ['order', ['ORDER', 'CANCEL', 'STATUS', 'QUEUE', 'PRINT']]
];

export const AUDIT_GROUP_META = {
    store: { label: 'ร้านค้า', bg: T.primarySoft, color: T.primaryDark },
    account: { label: 'บัญชีผู้ใช้', bg: T.deepSoft, color: T.deep },
    payment: { label: 'การชำระเงิน', bg: T.accentSoft, color: T.accentDark },
    order: { label: 'ออเดอร์', bg: T.greenSoft, color: T.up },
    other: { label: 'อื่น ๆ', bg: '#F2F3F7', color: T.text }
};

// ตัวกรองหน้า Audit Log : ชิปกลุ่ม + ช่องเลือกการกระทำ ทรงเดียวกัน (มนสุด สูง 36px)
export const auditChipStyle = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: '7px', height: '36px', boxSizing: 'border-box',
    border: `1px solid ${active ? T.primary : T.line}`, backgroundColor: active ? T.primarySoft : T.surface,
    color: active ? T.primaryDark : T.text, borderRadius: '999px', padding: '0 14px',
    fontSize: '12.5px', fontWeight: 600, fontFamily: FONT_STACK, cursor: 'pointer', whiteSpace: 'nowrap',
    transition: 'background .15s ease, border-color .15s ease'
});

export const auditActionSelectStyle = (active) => ({
    ...auditChipStyle(active), appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', outline: 'none',
    minWidth: '210px', paddingLeft: '36px', paddingRight: '36px',
    backgroundImage: active ? 'none' : SELECT_CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center'
});

export const auditGroupOf = (action) => {
    const key = String(action || '').toUpperCase();
    return AUDIT_GROUP_WORDS.find(([, words]) => words.some((word) => key.includes(word)))?.[0] || 'other';
};

export function AuditHistoryPage({ ctx }) {
    const { API } = ctx;
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('');  // กรองการกระทำเดียว เช่น CANCEL_ORDER
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const requestNo = useRef(0);  // พิมพ์เร็ว ๆ แล้วผลเก่ากลับมาทีหลัง -> ทิ้ง

    const auditUrl = useCallback((offset) => {
        const params = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), offset: String(offset) });
        const keyword = query.trim().toLowerCase();
        if (keyword) {
            params.set('q', keyword);
            const codes = auditCodesMatching(keyword);
            if (codes.length) params.set('actions', codes.join(','));
        }
                if (filter !== 'all') params.set('group', filter);
        if (actionFilter) params.set('action', actionFilter);
        return `${API}/api/audit-logs?${params}`;
    }, [API, query, filter, actionFilter]);

    const loadLogs = useCallback(async () => {
        const no = ++requestNo.current;
        setLoadingLogs(true);
        try {
            const data = await callApi(auditUrl(0));
            if (no !== requestNo.current) return;
            const rows = Array.isArray(data) ? data : [];
            setLogs(rows);
            setHasMore(rows.length === AUDIT_PAGE_SIZE);
            setLoadError('');
        }
        catch (err) {
            if (no === requestNo.current) setLoadError(err.message);
        }
        finally {
            if (no === requestNo.current) setLoadingLogs(false);
        }
    }, [auditUrl]);

    const loadMore = async () => {
        const no = requestNo.current;
        setLoadingMore(true);
        try {
            const data = await callApi(auditUrl(logs.length));
            if (no !== requestNo.current) return;
            const rows = Array.isArray(data) ? data : [];
            setLogs((prev) => {
                const seen = new Set(prev.map((log) => log.LogID));
                return [...prev, ...rows.filter((log) => !seen.has(log.LogID))];
            });
            setHasMore(rows.length === AUDIT_PAGE_SIZE);
        }
        catch (err) {
            setLoadError(err.message);
        }
        finally {
            setLoadingMore(false);
        }
    };

    // พิมพ์ค้นหา/เปลี่ยนตัวกรอง -> รอหยุดพิมพ์ 0.35 วิ แล้วค้นที่ backend ใหม่
    useEffect(() => {
        const timer = setTimeout(loadLogs, 350);
        return () => clearTimeout(timer);
    }, [loadLogs]);

        const actionMeta = (action) => AUDIT_GROUP_META[auditGroupOf(action)];

    
    const actionName = (action) => {
        const names = {
            CREATE_STORE: 'CREATE STORE',
            UPDATE_STORE: 'UPDATE STORE',
            DELETE_STORE: 'DELETE STORE',
            OPEN_STORE: 'OPEN STORE',
            CLOSE_STORE: 'CLOSE STORE',
            SUSPEND_STORE: 'SUSPEND STORE',
            UNSUSPEND_STORE: 'UNSUSPEND STORE',
            RENEW_CONTRACT: 'RENEW CONTRACT',
            OPEN_FOOD_COURT: 'OPEN FOOD COURT',
            UPDATE_FOOD_COURT_SCHEDULE: 'UPDATE FOOD COURT SCHEDULE',
            FOOD_COURT_AUTO_MODE: 'RESTORE AUTOMATIC MODE',
            CLOSE_FOOD_COURT: 'CLOSE FOOD COURT',
            CREATE_ACCOUNT: 'CREATE ACCOUNT',
            CREATE_STORE_ACCOUNT: 'CREATE STORE ACCOUNT',
            UPDATE_STORE_ACCOUNT: 'UPDATE STORE ACCOUNT',
            DELETE_STORE_ACCOUNT: 'DELETE STORE ACCOUNT',
            UPDATE_ACCOUNT: 'UPDATE ACCOUNT',
            DELETE_ACCOUNT: 'DELETE ACCOUNT',
            RESET_PASSWORD: 'RESET PASSWORD',
            VERIFY_SLIP_APPROVE: 'APPROVE PAYMENT SLIP',
            VERIFY_SLIP_REJECT: 'REJECT PAYMENT SLIP',
            CREATE_ORDER: 'CREATE ORDER',
            UPDATE_STATUS: 'UPDATE ORDER STATUS',
            PRINT_ORDER: 'PRINT ORDER',
            RECALL_QUEUE: 'RECALL QUEUE',
            CANCEL_REQUEST: 'REQUEST ORDER CANCELLATION',
            CUSTOMER_CANCEL_ORDER: 'CUSTOMER CANCEL ORDER',
            CANCEL_ORDER: 'CANCEL ORDER'
        };

        return names[String(action || '').toUpperCase()]
            || String(action || '-').replaceAll('_', ' ');
    };

    const filtered = logs;  // backend ค้น/กรองมาให้แล้ว

    const filters = [
        ['all', 'ทั้งหมด'],
        ['store', 'ร้านค้า'],
        ['account', 'บัญชีผู้ใช้'],
        ['order', 'ออเดอร์'],
        ['payment', 'การชำระเงิน']
    ];
    // ตัวเลือกการกระทำ : เฉพาะที่อยู่ในกลุ่มที่เลือก
    const actionOptions = Object.keys(AUDIT_VERBS).filter((code) => filter === 'all' || auditGroupOf(code) === filter);

    return (<>
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ ...toolbarStyle, gap: '14px', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={h3Style}>กิจกรรมล่าสุด</h3>
            <p style={captionStyle}>แสดงประวัติการดำเนินการสำคัญล่าสุดที่ถูกบันทึกไว้ในระบบ</p>
          </div>
          <Button icon="refresh" tone="secondary" onClick={loadLogs} disabled={loadingLogs}>
            {loadingLogs ? 'กำลังโหลด...' : 'รีเฟรช'}
          </Button>
        </div>

                <div style={{ position: 'relative', marginTop: '18px' }}>
          <Icon name="search" size={17} color={T.muted} style={{position: 'absolute',left: '13px',top: '50%',transform: 'translateY(-50%)'}}/>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาการดำเนินการ ผู้ดำเนินการ หรือรายละเอียด..."
            style={{ ...inputStyle, width: '100%', paddingLeft: '40px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            {filters.map(([id, label]) => (<button key={id} type="button" onClick={() => { setFilter(id); setActionFilter(''); }} style={auditChipStyle(filter === id)}>
              {AUDIT_GROUP_META[id] && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: AUDIT_GROUP_META[id].color }}/>}
              {label}
            </button>))}
          </div>
          <span style={{ width: '1px', height: '24px', background: T.line }}/>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Icon name="filter" size={15} color={actionFilter ? T.primaryDark : T.muted} style={{ position: 'absolute', left: '14px', pointerEvents: 'none' }}/>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={auditActionSelectStyle(Boolean(actionFilter))} aria-label="กรองตามการกระทำ">
              <option value="">ทุกการกระทำ</option>
              {actionOptions.map((code) => <option key={code} value={code}>{AUDIT_VERBS[code]}</option>)}
            </select>
            {actionFilter && (<button type="button" onClick={() => setActionFilter('')} aria-label="ล้างตัวกรองการกระทำ" style={{ position: 'absolute', right: '8px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: T.surface, color: T.primaryDark, display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0 }}>
              <Icon name="close" size={12}/>
            </button>)}
          </div>
        </div>
      </Card>

      <Card>
        {loadError ? (<div style={{padding: '24px',borderRadius:T.radiusMd,background:T.redSoft,color:T.down,fontSize: '14px'}}>{loadError}</div>) : loadingLogs ? (<div style={{padding: '48px 20px',textAlign: 'center',color:T.muted,fontSize: '14px'}}>กำลังโหลดประวัติการดำเนินการ...</div>) : filtered.length === 0 ? (<div style={{padding: '48px 20px',textAlign: 'center',color:T.muted}}>
          <div style={{width: '48px',height: '48px',margin: '0 auto 12px',borderRadius: '50%',background:T.primarySoft,display: 'grid',placeItems: 'center',color:T.primary}}><Icon name="history" size={23}/></div>
          <div style={{ fontWeight: 600, color: T.text, marginBottom: '4px' }}>ไม่พบประวัติการดำเนินการ</div>
          <div style={{ fontSize: '13px' }}>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</div>
        </div>) : (<div style={{ overflowX: 'auto' }}>
          <table style={{ ...tableStyle, minWidth: '820px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '160px' }}>วันและเวลา</th>
                <th style={{ ...thStyle, width: '190px' }}>การดำเนินการ</th>
                <th style={{ ...thStyle, width: '150px' }}>ผู้ดำเนินการ</th>
                <th style={thStyle}>รายละเอียด</th>
                <th style={{ ...thStyle, width: '120px' }}>ประเภท</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                  const meta = actionMeta(log.Action);
                  return (<tr key={log.LogID} style={trStyle}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: T.muted }}>
                      {thaiDateTime(log.CreatedAt)}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: T.ink }}>{actionName(log.Action)}</div>
                      <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '3px' }}>
                        #{log.LogID}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <span style={{width: '30px',height: '30px',borderRadius: '50%',display: 'grid',placeItems: 'center',background:T.deepSoft,color:T.deep,fontSize: '12px',fontWeight:700,flexShrink:0}}>{String(log.PerformerRole || log.PerformedBy || 'E').charAt(0).toUpperCase()}</span>
                        <span style={{ fontWeight: 500, color: T.text }}>{log.PerformerRole || log.PerformedBy || '—'}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, lineHeight: 1.55 }}>{formatAuditDetails(log)}</td>
                    <td style={tdStyle}>
                      <span style={{display: 'inline-flex',alignItems: 'center',padding: '6px 10px',borderRadius: '999px',background:meta.bg,color:meta.color,fontSize: '11.5px',fontWeight:600,whiteSpace: 'nowrap'}}>{meta.label}</span>
                    </td>
                  </tr>);
              })}
            </tbody>
                    </table>
        </div>)}
        {!loadError && !loadingLogs && logs.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '16px', fontSize: '12.5px', color: T.muted }}>
            <span>แสดง {logs.length} รายการ{hasMore ? '' : ' (ครบแล้ว)'}</span>
            {hasMore && (
              <Button tone="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่ม'}
              </Button>
            )}
          </div>
        )}
      </Card>
    </>);
}
