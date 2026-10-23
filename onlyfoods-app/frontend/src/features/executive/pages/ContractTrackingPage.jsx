import { useCallback, useEffect, useState } from 'react';
import { T, FONT_STACK, h3Style, captionStyle, toolbarStyle, tableStyle, thStyle, trStyle, tdStyle, inputStyle, formDateInputStyle, smallBtn } from '../theme';
import { money, thaiDateTime } from '../lib/format';
import { todayISO } from '../../../lib/dates';
import { callApi } from '../lib/api';
import { Card, Badge, Button, Modal, Field, EmptyState } from '../components/ui';
import { contractEndISO, addYearsMinusOneDayISO, minusOneDayISO, addMonthsToISO } from '../lib/dates';

// ===== ติดตามสัญญา: ดูช่วงสัญญา แก้วันสิ้นสุด และเปิดสัญญารอบใหม่ =====
// กติกา (ต้องตรงกับ backend/routers/stores.py):
//  - ระบบเก็บแค่วันเริ่ม/วันสิ้นสุด เอกสารสัญญาจริงอยู่นอกระบบ ไม่มีการระงับสิทธิ์ในหน้านี้
//  - สัญญามีผลถึง 23:59:59 น. ของวันสิ้นสุด เลยจากนั้น = หมดสัญญา รับออเดอร์ใหม่ไม่ได้
//    ยังมีออเดอร์ค้าง = ร้านเคลียร์ต่อได้จนจบ ; จบแล้ว พนักงานล็อก เจ้าของดูได้อย่างเดียว 30 วัน
//  - ตัดสัญญาย้อนหลังได้ไม่เกินเมื่อวาน (ปุ่ม "ตัดสัญญาทันที")
//  - ยังไม่หมด -> "แก้วันสิ้นสุด" (ต้องมีเหตุผล) ; หมดแล้ว -> กดปุ่ม "หมดสัญญา" เพื่อเปิดรอบใหม่ 1 ปี
//  - ทุกการแก้ถูกบันทึก (ใคร / เมื่อไหร่ / วันเดิม -> วันใหม่ / เหตุผล) ดูได้จากปุ่ม "ประวัติ"
export const CONTRACT_ACTION_LABEL = {
    CREATE_STORE: 'กำหนดสัญญาตอนเพิ่มร้าน',
    RENEW_CONTRACT: 'ต่อสัญญา (ระบบเดิม)',
    CONTRACT_EXTEND: 'ขยายวันสิ้นสุด',
    CONTRACT_SHORTEN: 'ลดวันสิ้นสุด',
    CONTRACT_END_BACKDATED: 'แก้ให้จบย้อนหลัง',
    CONTRACT_RESTART: 'เปิดสัญญารอบใหม่',
    AUTO_DELETE_STORE: 'ระบบลบร้านอัตโนมัติ',
    DELETE_STORE: 'ลบร้าน'
};

export const CONTRACT_REASON_MIN = 5;

export function ContractTrackingPage({ ctx }) {
    const { API, search, pushToast, focusStoreId, clearFocusStore, reloadStores } = ctx;
    const [stores, setStores] = useState([]);
    const [loadingContracts, setLoadingContracts] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    // modal แก้/เปิดสัญญา : { mode: 'edit' | 'restart', store }
    const [dialog, setDialog] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [ackBackdate, setAckBackdate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    // modal ประวัติ
    const [historyStore, setHistoryStore] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const loadContracts = useCallback(async () => {
        setLoadingContracts(true);
        try {
            const data = await callApi(`${API}/api/stores`);
            setStores(Array.isArray(data) ? data : []);
            setLoadError('');
        }
        catch (err) {
            setLoadError(err.message);
        }
        finally {
            setLoadingContracts(false);
        }
    }, [API]);

    useEffect(() => {
        loadContracts();
    }, [loadContracts]);

    const today = todayISO();
    const fmt = (value) => (value ? String(value).slice(0, 10) : '—');

    // สถานะคำนวณจาก backend (ContractState / ContractDaysLeft) เพื่อให้ตรงกับที่ระบบล็อกจริง
    const contractInfo = (store) => {
        const state = store.ContractState;
        const days = store.ContractDaysLeft;
        if (state === 'NONE' || !store.ContractEndDate)
            return { key: 'missing', label: 'ยังไม่ระบุสัญญา', tone: 'neutral', bg: '#F2F3F7', color: T.muted };
        if (state === 'UPCOMING')
            return { key: 'upcoming', label: 'ยังไม่เริ่มสัญญา', tone: 'neutral', bg: T.deepSoft, color: T.deep };
        if (state === 'EXPIRED')
            return store.IsClearingOrders
                ? { key: 'expired', label: 'หมดสัญญา · เคลียร์ออเดอร์', tone: 'danger', bg: T.redSoft, color: T.down }
                : { key: 'expired', label: 'หมดสัญญา', tone: 'danger', bg: T.redSoft, color: T.down };
        if (days === 0)
            return { key: 'soon', label: 'หมดคืนนี้ 23:59 น.', tone: 'warn', bg: T.accentSoft, color: T.accentDark };
        if (days <= 30)
            return { key: 'soon', label: 'ใกล้หมดสัญญา', tone: 'warn', bg: T.accentSoft, color: T.accentDark };
        return { key: 'active', label: 'สัญญาปกติ', tone: 'ok', bg: T.greenSoft, color: T.up };
    };

    const remainingText = (store) => {
        const days = store.ContractDaysLeft;
        if (store.ContractState === 'UPCOMING') {
            const start = new Date(`${fmt(store.ContractStartDate)}T00:00:00`);
            const now = new Date(`${today}T00:00:00`);
            return `เริ่มใน ${Math.round((start - now) / 86400000)} วัน`;
        }
        if (days === null || days === undefined) return '—';
        if (days < 0) return `หมดมาแล้ว ${Math.abs(days)} วัน`;
        if (days === 0) return 'วันสุดท้าย';
        return `${money(days)} วัน`;
    };

    const enriched = stores.map((s) => ({ ...s, contract: contractInfo(s) }));
    const filtered = enriched
        .filter((s) => !focusStoreId || String(s.StoreId) === String(focusStoreId))
        .filter((s) => statusFilter === 'all' || s.contract.key === statusFilter)
        .filter((s) => String(s.StoreName || '').toLowerCase().includes(search))
        .sort((a, b) => {
            const ae = a.ContractEndDate ? String(a.ContractEndDate).slice(0, 10) : '9999-12-31';
            const be = b.ContractEndDate ? String(b.ContractEndDate).slice(0, 10) : '9999-12-31';
            return ae.localeCompare(be);
        });
    const countOf = (key) => enriched.filter((s) => s.contract.key === key).length;
    const filters = [
        ['all', 'ทั้งหมด'],
        ['active', 'สัญญาปกติ'],
        ['soon', 'ใกล้หมดสัญญา'],
        ['upcoming', 'ยังไม่เริ่ม'],
        ['expired', 'หมดสัญญา'],
        ['missing', 'ยังไม่ระบุ']
    ];
    const focusedStore = focusStoreId ? enriched.find((s) => String(s.StoreId) === String(focusStoreId)) : null;

    // ---------- เปิด/ปิด modal ----------
    const openEdit = (store) => {
        setDialog({ mode: 'edit', store });
        setEndDate(fmt(store.ContractEndDate));
        setReason('');
        setAckBackdate(false);
        setFormError('');
    };
    const openRestart = (store) => {
        setDialog({ mode: 'restart', store });
        setStartDate(today);
        setEndDate(addYearsMinusOneDayISO(today, 1));
        setReason('');
        setAckBackdate(false);
        setFormError('');
    };
    const closeDialog = () => {
        if (!saving) setDialog(null);
    };

    const dStore = dialog?.store;
    const isEdit = dialog?.mode === 'edit';
    const oldEnd = dStore ? fmt(dStore.ContractEndDate) : '';
    const dStart = isEdit ? fmt(dStore?.ContractStartDate) : startDate;
    const isBackdate = isEdit && endDate && endDate < today;
    const yesterday = minusOneDayISO(today);
    const reasonOk = reason.trim().length >= CONTRACT_REASON_MIN;

    // เปลี่ยนวันเริ่มรอบใหม่ -> วันสิ้นสุดเลื่อนตามเป็น 1 ปีจากวันเริ่ม
    const changeStart = (value) => {
        setStartDate(value);
        setEndDate(addYearsMinusOneDayISO(value, 1));
        setFormError('');
    };

    const validate = () => {
        if (!isEdit && (!startDate || startDate < today)) return 'วันเริ่มสัญญาต้องเป็นวันนี้หรือหลังจากนี้';
        if (!endDate) return 'กรุณาเลือกวันสิ้นสุดสัญญา';
        if (Number(endDate.slice(0, 4)) > 2400) return 'กรุณาระบุปีเป็น ค.ศ. (เช่น 2026 ไม่ใช่ 2569)';
        if (endDate <= dStart) return `วันสิ้นสุดต้องหลังวันเริ่มสัญญา (${dStart})`;
        if (isEdit && endDate === oldEnd) return 'วันสิ้นสุดใหม่ยังเป็นวันเดิม';
        if (!reasonOk) return `กรุณาระบุเหตุผลอย่างน้อย ${CONTRACT_REASON_MIN} ตัวอักษร`;
        if (isEdit && endDate < yesterday) return `ตัดสัญญาย้อนหลังได้ไม่เกินเมื่อวาน (${yesterday})`;
        if (isBackdate && !ackBackdate) return 'กรุณาติ๊กยืนยันว่าเข้าใจผลของการแก้วันย้อนหลัง';
        return '';
    };

    const submit = async () => {
        const problem = validate();
        if (problem) {
            setFormError(problem);
            return;
        }
        setSaving(true);
        setFormError('');
        try {
            const data = isEdit
                ? await callApi(`${API}/api/stores/${dStore.StoreId}/contract`, {
                    method: 'PUT',
                    body: JSON.stringify({ contract_end_date: endDate, reason: reason.trim() })
                })
                : await callApi(`${API}/api/stores/${dStore.StoreId}/contract/restart`, {
                    method: 'POST',
                    body: JSON.stringify({ contract_start_date: startDate, contract_end_date: endDate, reason: reason.trim() })
                });
            pushToast(data?.message || 'บันทึกสัญญาเรียบร้อยแล้ว');
            setDialog(null);
            await loadContracts();
            if (reloadStores) await reloadStores();
        }
        catch (err) {
            setFormError(err.message);
        }
        finally {
            setSaving(false);
        }
    };

    const openHistory = async (store) => {
        setHistoryStore(store);
        setHistory([]);
        setHistoryLoading(true);
        try {
            const data = await callApi(`${API}/api/stores/${store.StoreId}/contract-history`);
            setHistory(Array.isArray(data) ? data : []);
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
        finally {
            setHistoryLoading(false);
        }
    };

    // ---------- ส่วนแสดงผล ----------
    const pill = (info) => (
      <span style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: '999px', background: info.bg, color: info.color, fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>
        {info.label}
      </span>
    );
    const quickChip = (label, value) => (
      <button key={label} type="button" onClick={() => { setEndDate(value); setFormError(''); }} style={{
            border: `1px solid ${endDate === value ? T.primary : T.line}`,
            background: endDate === value ? T.primarySoft : T.surface,
            color: endDate === value ? T.primaryDark : T.text,
            borderRadius: '999px', padding: '7px 12px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK
        }}>{label}</button>
    );
    const rangeBox = (label, start, end, tone) => (
      <div style={{ flex: 1, minWidth: '200px', padding: '13px 15px', borderRadius: T.radiusMd, border: `1px solid ${tone === 'danger' ? T.down : tone === 'new' ? T.primary : T.line}`, background: tone === 'danger' ? T.redSoft : tone === 'new' ? T.primarySoft : '#FAFBFD' }}>
        <div style={{ fontSize: '12px', color: T.muted, marginBottom: '5px' }}>{label}</div>
        <div style={{ fontSize: '15.5px', fontWeight: 700, color: T.ink }}>
          {start} <span style={{ color: T.muted, padding: '0 6px' }}>→</span> {end || '—'}
        </div>
        <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '4px' }}>มีผลถึง 23:59:59 น. ของวันสิ้นสุด</div>
      </div>
    );

    return (<>
      {focusedStore && (
        <div style={{ marginBottom: '16px', padding: '12px 14px', border: `1px solid ${T.primary}`, borderRadius: T.radiusMd, background: T.primarySoft, display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ color: T.primaryDark }}>กำลังดูสัญญาร้าน {focusedStore.StoreName}</strong>
            <div style={{ ...captionStyle, marginTop: '3px' }}>เปิดมาจากหน้าอื่นของระบบ</div>
          </div>
          <Button variant="ghost" onClick={clearFocusStore}>ดูสัญญาทุกร้าน</Button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: '16px', marginBottom: '16px' }}>
        {[
            ['สัญญาปกติ', countOf('active'), T.greenSoft, T.up],
            ['ใกล้หมด ≤ 30 วัน', countOf('soon'), T.accentSoft, T.accentDark],
            ['หมดสัญญา', countOf('expired'), T.redSoft, T.down],
            ['ยังไม่เริ่ม / ไม่ระบุ', countOf('upcoming') + countOf('missing'), '#F2F3F7', T.muted]
        ].map(([label, value, bg, color]) => (
          <Card key={label} style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '12.5px', color: T.muted, fontWeight: 600 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'end', gap: '7px', marginTop: '8px' }}>
              <span style={{ fontSize: '28px', lineHeight: 1, fontWeight: 700, color }}>{value}</span>
              <span style={{ fontSize: '12px', color: T.muted }}>ร้าน</span>
            </div>
            <div style={{ height: '4px', borderRadius: '99px', background: bg, marginTop: '14px' }}/>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: '16px' }}>
        <div style={{ ...toolbarStyle, gap: '12px', alignItems: 'center' }}>
          <div>
            <h3 style={h3Style}>สัญญาร้านค้า</h3>
            <p style={captionStyle}>สัญญามีผลถึง 23:59:59 น. ของวันสิ้นสุด · หมดแล้วร้านปิดและพนักงานล็อกอัตโนมัติ เจ้าของดูข้อมูลได้อย่างเดียว 30 วัน · เอกสารสัญญาจัดการนอกระบบ</p>
          </div>
          <Button icon="refresh" variant="ghost" onClick={loadContracts} disabled={loadingContracts}>
            {loadingContracts ? 'กำลังโหลด...' : 'รีเฟรช'}
          </Button>
        </div>
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '16px' }}>
          {filters.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStatusFilter(id)} style={{
                border: `1px solid ${statusFilter === id ? T.primary : T.line}`,
                background: statusFilter === id ? T.primarySoft : T.surface,
                color: statusFilter === id ? T.primaryDark : T.text,
                borderRadius: '999px', padding: '9px 13px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK
            }}>{label}</button>
          ))}
        </div>
      </Card>

      <Card>
        {loadError ? (
          <div style={{ padding: '24px', color: T.down, background: T.redSoft, borderRadius: T.radiusMd }}>{loadError}</div>
        ) : loadingContracts && !stores.length ? (
          <EmptyState text="กำลังโหลดข้อมูลสัญญา..."/>
        ) : filtered.length === 0 ? (
          <EmptyState text="ไม่พบข้อมูลสัญญาตามเงื่อนไขที่เลือก"/>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: '880px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>ร้านค้า</th>
                  <th style={{ ...thStyle, width: '230px' }}>ช่วงสัญญา</th>
                  <th style={{ ...thStyle, width: '150px' }}>คงเหลือ</th>
                  <th style={{ ...thStyle, width: '170px' }}>สถานะสัญญา</th>
                  <th style={{ ...thStyle, width: '250px', textAlign: 'right' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((store) => {
                    const key = store.contract.key;
                    return (
                  <tr key={store.StoreId} style={trStyle}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, color: T.ink }}>{store.StoreName}</div>
                      <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '3px' }}>รหัสร้าน #{store.StoreId}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, color: T.ink, whiteSpace: 'nowrap' }}>
                        {fmt(store.ContractStartDate)} <span style={{ color: T.muted, padding: '0 4px' }}>→</span> {fmt(store.ContractEndDate)}
                      </div>
                      {store.ContractEndDate && <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '3px' }}>สิ้นสุด 23:59:59 น.</div>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: key === 'expired' ? T.down : T.text, fontWeight: key === 'expired' ? 700 : 500 }}>{remainingText(store)}</div>
                      {key === 'expired' && store.AutoDeleteInDays !== null && store.AutoDeleteInDays !== undefined && (
                        <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '3px' }}>ลบอัตโนมัติใน {Math.max(0, store.AutoDeleteInDays)} วัน</div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {pill(store.contract)}
                      {Number(store.OpenOrderCount || 0) > 0 && key === 'expired' && (
                        <div style={{ fontSize: '11.5px', color: T.accentDark, marginTop: '5px', fontWeight: 600 }}>ออเดอร์ค้าง {store.OpenOrderCount} รายการ</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap' }}>
                        {key === 'expired' ? (
                          <Button variant="danger" icon="ban" onClick={() => openRestart(store)} style={smallBtn} title="ร้านนี้ต่อสัญญาภายนอกแล้ว? กดเพื่อเปิดสัญญารอบใหม่">
                            หมดสัญญา
                          </Button>
                        ) : key === 'missing' ? (
                          <Button variant="soft" icon="plus" onClick={() => openRestart(store)} style={smallBtn}>
                            กำหนดสัญญา
                          </Button>
                        ) : (
                          <Button variant="soft" icon="edit" onClick={() => openEdit(store)} style={smallBtn}>
                            แก้วันสิ้นสุด
                          </Button>
                        )}
                        <Button variant="ghost" icon="history" onClick={() => openHistory(store)} style={smallBtn}>
                          ประวัติ
                        </Button>
                      </div>
                    </td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---------- modal แก้วันสิ้นสุด / เปิดสัญญารอบใหม่ ---------- */}
      <Modal open={Boolean(dialog)} width={620} onClose={closeDialog}
        title={isEdit ? 'แก้วันสิ้นสุดสัญญา' : (dStore?.ContractState === 'NONE' ? 'กำหนดสัญญาร้าน' : 'เปิดสัญญารอบใหม่')}
        subtitle={dStore ? `ร้าน ${dStore.StoreName}` : ''}
        footer={<>
          <Button variant="ghost" onClick={closeDialog} disabled={saving}>ยกเลิก</Button>
          <Button icon="check" variant={isBackdate ? 'danger' : 'primary'} onClick={submit} disabled={saving || !endDate || !reasonOk}>
            {saving ? 'กำลังบันทึก...' : isEdit ? (isBackdate ? 'ยืนยันตัดสัญญาย้อนหลัง' : 'บันทึกวันสิ้นสุดใหม่') : 'เปิดสัญญารอบใหม่'}
          </Button>
        </>}>
        {dStore && (<div>
          {!isEdit && dStore.ContractState === 'EXPIRED' && (
            <div style={{ padding: '12px 14px', borderRadius: T.radiusMd, background: T.redSoft, color: T.down, fontSize: '12.5px', lineHeight: 1.6, marginBottom: '14px' }}>
              สัญญาเดิมหมดเมื่อ {oldEnd} 23:59:59 น. ร้านเปิดขายไม่ได้ — ใช้ปุ่มนี้เมื่อร้านต่อสัญญากับศูนย์อาหารภายนอกแล้วเท่านั้น
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {dStore.ContractEndDate && rangeBox(isEdit ? 'สัญญาปัจจุบัน' : 'สัญญาเดิม', fmt(dStore.ContractStartDate), oldEnd, 'old')}
            {rangeBox(isEdit ? 'หลังแก้ไข' : 'สัญญารอบใหม่', dStart, endDate, isBackdate ? 'danger' : 'new')}
          </div>

          {!isEdit && (
            <Field label="วันเริ่มสัญญารอบใหม่ (ปี ค.ศ.)" required hint="ค่าเริ่มต้นคือวันนี้ เลือกวันข้างหน้าได้ ย้อนหลังไม่ได้">
              <input type="date" value={startDate} min={today}
                onChange={(e) => changeStart(e.target.value)}
                style={formDateInputStyle}/>
            </Field>
          )}
          <Field label="วันสิ้นสุดสัญญาใหม่ (ปี ค.ศ.)" required
            hint={isEdit ? 'วันเริ่มสัญญาคงเดิม แก้ได้เฉพาะวันสิ้นสุด' : 'ค่าเริ่มต้น 1 ปีนับจากวันเริ่ม ปรับตามเอกสารจริงได้'}>
            <input type="date" value={endDate} min={isEdit ? yesterday : startDate}
              onChange={(e) => { setEndDate(e.target.value); setFormError(''); setAckBackdate(false); }}
              style={formDateInputStyle}/>
          </Field>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', margin: '-4px 0 16px' }}>
            {isEdit
                ? [quickChip('+6 เดือน', addMonthsToISO(oldEnd, 6)), quickChip('+1 ปี', addMonthsToISO(oldEnd, 12)), quickChip('คืนค่าเดิม', oldEnd), quickChip('ตัดสัญญาทันที', yesterday)]
                : [quickChip('6 เดือน', contractEndISO(startDate, 6)), quickChip('1 ปี', addYearsMinusOneDayISO(startDate, 1)), quickChip('2 ปี', addYearsMinusOneDayISO(startDate, 2))]}
          </div>

          <Field label="เหตุผล / อ้างอิงเอกสาร" required
            hint={`บันทึกเป็นหลักฐานพร้อมชื่อผู้แก้และเวลา แก้ภายหลังไม่ได้ (${reason.trim().length}/255)`}>
            <textarea value={reason} rows={3} maxLength={255}
              onChange={(e) => { setReason(e.target.value); setFormError(''); }}
              placeholder={isEdit ? 'เช่น ต่อสัญญาตามหนังสือเลขที่ 12/2569 ลงวันที่ 1 ต.ค. 2569' : 'เช่น ชนะประมูลรอบปี 2570 ตามประกาศเลขที่ 3/2569'}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: FONT_STACK }}/>
          </Field>

          {isBackdate && (
            <div style={{ padding: '13px 15px', borderRadius: T.radiusMd, background: T.redSoft, border: `1px solid ${T.down}33`, marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: T.down, marginBottom: '4px' }}>วันสิ้นสุดอยู่ก่อนวันนี้ = ร้านหมดสัญญาทันที</div>
              <div style={{ fontSize: '12px', color: T.text, lineHeight: 1.6 }}>
                                ร้านจะถูกปิดและรับออเดอร์ใหม่ไม่ได้ทันทีหลังบันทึก พนักงานร้านถูกออกจากระบบ เจ้าของร้านดูข้อมูลได้อย่างเดียวไม่เกิน 30 วันหลังวันสิ้นสุด ออเดอร์และยอดขายเดิมยังอยู่ครบ
                {Number(dStore.OpenOrderCount || 0) > 0 && <b> · ตอนนี้ยังมีออเดอร์ค้าง {dStore.OpenOrderCount} รายการ ร้านจะยังเคลียร์ออเดอร์ได้ เมื่อจบครบพนักงานจะถูกออกจากระบบเอง</b>}
              </div>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', fontSize: '12.5px', fontWeight: 600, color: T.ink, cursor: 'pointer' }}>
                <input type="checkbox" checked={ackBackdate} onChange={(e) => { setAckBackdate(e.target.checked); setFormError(''); }}/>
                เข้าใจแล้ว ต้องการตัดสัญญาย้อนหลัง
              </label>
            </div>
          )}

          {formError && (
            <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: T.radiusMd, background: T.redSoft, color: T.down, fontSize: '12.5px', fontWeight: 600 }}>
              {formError}
            </div>
          )}
        </div>)}
      </Modal>

      {/* ---------- modal ประวัติสัญญา ---------- */}
      <Modal open={Boolean(historyStore)} width={680} onClose={() => setHistoryStore(null)}
        title="ประวัติสัญญา" subtitle={historyStore ? `ร้าน ${historyStore.StoreName} · บันทึกทุกครั้งที่มีการกำหนดหรือแก้วันสัญญา` : ''}>
        {historyLoading ? (
          <EmptyState text="กำลังโหลดประวัติ..." minHeight="140px"/>
        ) : history.length === 0 ? (
          <EmptyState text="ยังไม่มีประวัติการแก้สัญญา" minHeight="140px"/>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {history.map((h) => {
                const oldV = h.OldValue || {};
                const newV = h.NewValue || {};
                const danger = ['CONTRACT_END_BACKDATED', 'AUTO_DELETE_STORE', 'DELETE_STORE'].includes(h.ActionCode);
                return (
              <div key={h.AuditLogId} style={{ padding: '13px 15px', border: `1px solid ${T.line}`, borderLeft: `4px solid ${danger ? T.down : T.primary}`, borderRadius: T.radiusMd, background: T.surface }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Badge tone={danger ? 'danger' : 'ok'}>{CONTRACT_ACTION_LABEL[h.ActionCode] || h.ActionCode}</Badge>
                  <span style={{ fontSize: '12px', color: T.muted }}>{thaiDateTime(h.CreatedAt)}</span>
                </div>
                {(oldV.end || newV.end) && (
                  <div style={{ marginTop: '9px', fontSize: '13.5px', color: T.ink, fontWeight: 600 }}>
                    {oldV.end ? `${fmt(oldV.start)} → ${fmt(oldV.end)}` : '—'}
                    {newV.end && <><span style={{ color: T.muted, padding: '0 8px' }}>เป็น</span>{fmt(newV.start)} → {fmt(newV.end)}</>}
                  </div>
                )}
                {newV.reason && <div style={{ marginTop: '6px', fontSize: '12.5px', color: T.text }}>เหตุผล: {newV.reason}</div>}
                <div style={{ marginTop: '6px', fontSize: '12px', color: T.muted }}>
                  โดย {h.PerformedByName ? `${h.PerformedByName} (${h.PerformedByUsername})` : 'ระบบอัตโนมัติ'}
                </div>
              </div>);
            })}
          </div>
        )}
      </Modal>
    </>);
}
