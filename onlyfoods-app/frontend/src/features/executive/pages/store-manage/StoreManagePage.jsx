import { useCallback, useEffect, useState } from 'react';
import { T, FONT_STACK, captionStyle, tableStyle, thStyle, trStyle, tdStyle, storeThumbStyle, smallBtn } from '../../theme';
import { money } from '../../lib/format';
import { forceCloseMessage, callApi } from '../../lib/api';
import { Card, Badge, Button } from '../../components/ui';
import { isContractSoon, contractLeftLabel } from '../../lib/sales';
import { EMPTY_STORE_FORM, validateStoreForm } from './storeForm';
import { StoreFormModal } from './StoreFormModal';
import { StoreDetailModal } from './StoreDetailModal';

// แถบกรองสถานะหน้าจัดการร้านค้า — แต่ละร้านอยู่ได้กลุ่มเดียว: หมดสัญญา > ระงับสิทธิ์ > เปิด > ปิด
export const STORE_MANAGE_FILTERS = [
    ['all', 'ทั้งหมด'],
    ['open', 'เปิดอยู่'],
    ['closed', 'ปิดอยู่'],
    ['suspended', 'ระงับสิทธิ์'],
    ['expired', 'หมดสัญญา']
];

export const storeManageStatusKey = (s) => s.ContractState === 'EXPIRED' ? 'expired'
    : s.IsSuspended ? 'suspended'
    : s.IsOpen ? 'open'
    : 'closed';

// ===== จัดการร้านค้า: เพิ่ม แก้ไข เปิด/ปิด ระงับ และลบร้าน =====
export function StoreManagePage({ ctx }) {
    const { API, user, stores, search, pushToast, ask, askForceClose, reloadStores, focusStoreId, clearFocusStore, navigateTo } = ctx;
    const [details, setDetails] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState('create');
    const [viewStoreId, setViewStoreId] = useState(null);
    const [storeAccounts, setStoreAccounts] = useState([]);
    const [form, setForm] = useState(EMPTY_STORE_FORM);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const loadDetails = useCallback(async () => {
        try {
            const data = await callApi(`${API}/api/stores`);
            setDetails(Array.isArray(data) ? data : []);
        }
        catch (err) {
            console.debug('โหลดรายละเอียดร้านไม่สำเร็จ:', err.message);
        }
    }, [API]);
    const loadStoreAccounts = useCallback(async () => {
        try {
            const data = await callApi(`${API}/api/store-accounts`);
            setStoreAccounts(Array.isArray(data) ? data : []);
        }
        catch (err) {
            console.debug('โหลดบัญชีเจ้าของร้านไม่สำเร็จ:', err.message);
        }
    }, [API]);

    useEffect(() => {
        loadDetails();
        loadStoreAccounts();
    }, [loadDetails, loadStoreAccounts]);
    const detailOf = (storeId) => details.find((d) => String(d.StoreId) === String(storeId)) || {};
    const openView = (store) => {setViewStoreId(store.StoreId);};
        const [statusFilter, setStatusFilter] = useState('all');
    useEffect(() => { setStatusFilter('all'); }, [focusStoreId]);
    const searchedRows = stores
        .filter((s) => !focusStoreId || String(s.StoreId) === String(focusStoreId))
        .filter((s) => String(s.StoreName || '').toLowerCase().includes(search));
    const countOf = (key) => searchedRows.filter((s) => storeManageStatusKey(s) === key).length;
    const rows = statusFilter === 'all'
        ? searchedRows
        : searchedRows.filter((s) => storeManageStatusKey(s) === statusFilter);
    const activeFilterLabel = STORE_MANAGE_FILTERS.find(([id]) => id === statusFilter)?.[1];
    const openCreate = () => {
        setMode('create');
        setForm(EMPTY_STORE_FORM);
        setErrors({});
        setModalOpen(true);
    };
    // [CROSS-NAV] หากเข้ามาจากหน้ายอดขายรายร้าน ให้กรองตารางไว้ที่ร้านนั้น โดยไม่เปิดฟอร์มแก้ไขอัตโนมัติ

    const submitForm = async () => {
        const found = validateStoreForm(form, mode);
        setErrors(found);
        if (Object.keys(found).length) {
            pushToast('ยังกรอกข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบช่องที่มีข้อความสีแดง', 'error');
            return;
        }
        const payload = {
            store_name: form.name.trim(),
            queue_code: (form.queueCode || '').trim().toUpperCase() || null,
            category: form.category,
            contact_name: form.contactName.trim(),
            contact_phone: form.phone.replace(/\D/g, ''),
            contact_line: form.lineId.trim(),
            contact_email: form.email.trim(),
            description: form.description.trim(),
            image_url: form.imageData,
            contract_start_date: form.contractStartDate || null,
            contract_end_date: form.contractEndDate || null,
            performed_by: 'Executive',
            ...(mode === 'create' ? {
                owner_full_name: form.contactName.trim(),
                owner_username: form.ownerUsername.trim(),
                owner_password: form.ownerPassword
            } : {})
        };
        const send = async (path, method) => callApi(`${API}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        setSaving(true);
        try {
            const isEdit = mode === 'edit';
            const fullPath = isEdit ? `/api/stores/${form.StoreId}/full` : '/api/stores/full';
            const basicPath = isEdit ? `/api/stores/${form.StoreId}` : '/api/stores';
            const method = isEdit ? 'PUT' : 'POST';
            if (isEdit) {
                try {
                    await send(fullPath, method);
                    pushToast('บันทึกการแก้ไขร้านค้าแล้ว');
                }
                catch (fullError) {
                    if (!/endpoint/i.test(fullError.message))
                        throw fullError;
                    await send(basicPath, method);
                    pushToast('บันทึกได้เฉพาะชื่อร้าน — เพิ่มโค้ดจาก main_additions.py ในหลังบ้านก่อน จึงจะเก็บข้อมูลรายละเอียดได้', 'warn');
                }
            }
            else {
                await send(fullPath, method);
                pushToast('เพิ่มร้านค้าและบัญชีเจ้าของร้านเรียบร้อยแล้ว');
            }
            setModalOpen(false);
            await reloadStores();
            await loadDetails();
            await loadStoreAccounts();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
        finally {
            setSaving(false);
        }
    };
    const accountOf = (storeId) =>
        storeAccounts.find((a) => String(a.StoreId) === String(storeId) && a.Role === 'Shop Owner') || null;

    const saveStoreField = async (store, patch) => {
        if (!store) return false;
        const d = detailOf(store.StoreId);
        const payload = {
            store_name: patch.StoreName,
            category: patch.Category,
            contact_name: patch.ContactName,
            contact_phone: patch.ContactPhone,
            contact_line: patch.ContactLine,
            contact_email: patch.ContactEmail,
            description: patch.Description,
            image_url: patch.ImageUrl !== undefined
            ? patch.ImageUrl
            : (d.ImageUrl || ''),
            contract_start_date: d.ContractStartDate ? String(d.ContractStartDate).slice(0, 10) : null,
            contract_end_date: d.ContractEndDate ? String(d.ContractEndDate).slice(0, 10) : null,
            performed_by: 'Executive'
        };
        setSaving(true);
        try {
            await callApi(`${API}/api/stores/${store.StoreId}/full`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            pushToast(`บันทึกข้อมูลร้าน ${store.StoreName} แล้ว`);
            await reloadStores();
            await loadDetails();
            return true;
        }
        catch (err) {
            pushToast(err.message, 'error');
            return false;
        }
        finally {
            setSaving(false);
        }
    };

    const saveAccountField = async (account, key, value) => {
        if (!account) return false;
        const payload = { performed_by: 'Executive' };
        if (key === 'FullName') payload.full_name = value;
        if (key === 'Username') payload.username = value;
        if (key === 'Password') payload.password = value;
        setSaving(true);
        try {
            await callApi(`${API}/api/store-accounts/${account.UserId}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            pushToast('บันทึกบัญชีเจ้าของร้านแล้ว');
            const data = await callApi(`${API}/api/store-accounts`);
            setStoreAccounts(Array.isArray(data) ? data : []);
            return true;
        }
        catch (err) {
            pushToast(err.message, 'error');
            return false;
        }
        finally {
            setSaving(false);
        }
    };

    const toggleStore = async (store) => {
        const closing = Boolean(store.IsOpen);
        if (!closing && Boolean(store.IsSuspended)) {
            pushToast(`ร้าน ${store.StoreName} ถูกระงับสิทธิ์ กรุณาปลดระงับก่อนเปิดร้าน`, 'warn');
            return;
        }
        let onOpenOrders = '';
        if (closing) {
            let pending = [];
            try { pending = await callApi(`${API}/api/stores/${store.StoreId}/open-orders`); }
            catch (err) { pushToast(err.message, 'error'); return; }
            if (Array.isArray(pending) && pending.length) {
                const choice = await askForceClose({ kind: 'store', title: `ปิดร้าน "${store.StoreName}"`, orders: pending });
                if (!choice) return;
                onOpenOrders = `&on_open_orders=${choice}`;
            }
        }
        const ok = onOpenOrders || await ask({
            title: closing ? 'ปิดร้านค้า' : 'เปิดร้านค้า',
            message: `ยืนยัน${closing ? 'ปิด' : 'เปิด'}ร้าน "${store.StoreName}" ใช่หรือไม่`,
            warning: closing ? 'ลูกค้าจะสั่งอาหารจากร้านนี้ไม่ได้จนกว่าจะเปิดใหม่' : null,
            confirmText: closing ? 'ปิดร้าน' : 'เปิดร้าน',
            danger: closing
        });
        if (!ok)
            return;
        try {
            const data = await callApi(`${API}/api/stores/${store.StoreId}/toggle?performed_by=Executive&open=${!closing}${onOpenOrders}`, { method: 'PUT' });
            pushToast(forceCloseMessage(`${closing ? 'ปิด' : 'เปิด'}ร้าน ${store.StoreName} แล้ว`, data?.forced));
            await reloadStores();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
    };
    const suspendStore = async (store) => {
        const suspending = !store.IsSuspended;
        const ok = await ask({
            title: suspending ? 'ระงับสิทธิ์ร้านค้า' : 'ปลดระงับสิทธิ์',
            message: `ยืนยัน${suspending ? 'ระงับสิทธิ์' : 'ปลดระงับสิทธิ์'}ร้าน "${store.StoreName}" ใช่หรือไม่`,
            warning: suspending
                ? 'ร้านจะขายไม่ได้ชั่วคราว แต่ข้อมูลและยอดขายเดิมยังอยู่ครบ'
                : null,
            confirmText: suspending ? 'ระงับสิทธิ์' : 'ปลดระงับ',
            danger: suspending
        });
        if (!ok)
            return;
        try {
            await callApi(`${API}/api/stores/${store.StoreId}/suspend?performed_by=Executive`, { method: 'PUT' });
            pushToast(`${suspending ? 'ระงับสิทธิ์' : 'ปลดระงับ'}ร้าน ${store.StoreName} แล้ว`);
            await reloadStores();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
    };
    const deleteStore = async (store) => {
        const ok = await ask({
            title: 'ลบร้านค้าออกจากระบบ',
            message: `ยืนยันลบร้าน "${store.StoreName}" ออกจากระบบใช่หรือไม่`,
            warning: 'ร้านและเมนูจะหายจากหน้าลูกค้า แต่ประวัติออเดอร์และยอดขายยังเก็บไว้ ; ถ้ายังมีออเดอร์หรือเงินคืนลูกค้าค้างอยู่ ระบบจะไม่ยอมให้ลบ (ถ้าแค่อยากหยุดขายชั่วคราว ให้ใช้ระงับสิทธิ์แทน)',
            confirmText: 'ลบร้านค้า',
            danger: true
        });
        if (!ok)
            return;
        try {
            await callApi(`${API}/api/stores/${store.StoreId}`, { method: 'DELETE' });
            pushToast(`ลบร้าน ${store.StoreName} แล้ว`);
            await reloadStores();
            await loadDetails();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
    };
    const focusedStore = focusStoreId ? stores.find((s) => String(s.StoreId) === String(focusStoreId)) : null;

    return (<>
      {focusedStore && (<div style={{ marginBottom: '16px', padding: '12px 14px', border: `1px solid ${T.primary}`, borderRadius: T.radiusMd, background: T.primarySoft, display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: T.primaryDark }}>กำลังจัดการร้าน {focusedStore.StoreName}</strong>
          <div style={{ ...captionStyle, marginTop: '3px' }}>แสดงร้านที่เลือกจากหน้ายอดขายรายร้าน · เลือกแก้ไขจากปุ่มในตารางได้</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="ghost"
            icon="arrow-left"
            onClick={() => navigateTo('store-sales', focusedStore.StoreId)}
            title={`กลับไปดูยอดขายของร้าน ${focusedStore.StoreName}`}
            style={{ padding: '9px 14px', fontWeight: 600, borderColor: T.line, boxShadow: '0 1px 2px rgba(18,25,38,.04)' }}
          >
            กลับไปยอดขายรายร้าน
          </Button>
          <Button variant="ghost" onClick={clearFocusStore} style={{ padding: '9px 14px' }}>แสดงร้านค้าทั้งหมด</Button>
        </div>
      </div>)}
            <Card title="รายชื่อร้านค้าทั้งหมด" subtitle={`${money(rows.length)} ร้านที่แสดงอยู่ · ใช้ช่องค้นหาด้านบนเพื่อกรองรายชื่อ`}
        right={<Button icon="plus" onClick={openCreate}>เพิ่มร้านค้า</Button>}>
                  <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {STORE_MANAGE_FILTERS.map(([id, label]) => {
            const active = statusFilter === id;
            const count = id === 'all' ? searchedRows.length : countOf(id);
            return (<button key={id} type="button" onClick={() => setStatusFilter(id)} aria-pressed={active} style={{
                border: `1px solid ${active ? T.primary : T.line}`,
                background: active ? T.primarySoft : T.surface,
                color: active ? T.primaryDark : T.text,
                borderRadius: '999px', padding: '9px 13px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: FONT_STACK
            }}>{label} ({money(count)})</button>);
          })}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ร้านค้า</th>
                <th style={thStyle}>ประเภท</th>
                <th style={thStyle}>ติดต่อ</th>
                <th style={thStyle}>สถานะ</th>
                <th style={thStyle}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
            const d = detailOf(s.StoreId);
            return (<tr key={s.StoreId} style={trStyle}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {d.ImageUrl ? (<img src={d.ImageUrl} alt="" style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: T.radiusMd,
                        objectFit: 'cover',
                        border: `1px solid ${T.line}`
                    }}/>) : (<div style={storeThumbStyle}>
                            {String(s.StoreName || '?').charAt(0)}
                          </div>)}
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ color: T.ink }}>{s.StoreName}</strong>
                          <div style={captionStyle}>รหัสร้าน #{s.StoreId}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>{d.Category || <span style={{ color: T.muted }}>—</span>}</td>
                    <td style={tdStyle}>
                      {d.ContactPhone ? (<>
                          <div>{d.ContactPhone}</div>
                          {d.ContactLine && <div style={captionStyle}>LINE {d.ContactLine}</div>}
                        </>) : (<span style={{ color: T.muted }}>—</span>)}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                               {s.ContractState === 'EXPIRED'
                            ? <Badge tone="danger">{s.IsClearingOrders ? 'หมดสัญญา · เคลียร์ออเดอร์' : 'หมดสัญญา'}</Badge>
                            : <Badge tone={s.IsOpen ? 'ok' : 'neutral'}>{s.IsOpen ? 'เปิด' : 'ปิด'}</Badge>}
                         {s.ContractState === 'UPCOMING' && <Badge tone="neutral">ยังไม่เริ่มสัญญา</Badge>}
                        {isContractSoon(s) && (<button type="button" onClick={() => navigateTo('contract-tracking', s.StoreId)} title="สัญญาใกล้หมด กดเพื่อไปจัดการสัญญา" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_STACK }}>
                          <Badge tone="warn">{contractLeftLabel(s.ContractDaysLeft)}</Badge>
                        </button>)}
                        {s.ContractState === 'NONE' && <Badge tone="warn">ไม่มีสัญญา</Badge>}
                        {Boolean(s.IsSuspended) && <Badge tone="danger">ระงับสิทธิ์</Badge>}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <Button variant="soft" icon="eye" onClick={() => openView(s)}style={smallBtn} title="ดูข้อมูลร้าน">
                          ดู/แก้ไข
                        </Button>
                                                {s.ContractState && s.ContractState !== 'ACTIVE' ? (
                          <Button
                            variant={s.ContractState === 'EXPIRED' ? 'danger' : 'ghost'}
                            icon="calendar"
                            onClick={() => navigateTo('contract-tracking', s.StoreId)}
                            title="ร้านเปิดได้เฉพาะช่วงสัญญา กดเพื่อไปจัดการสัญญา"
                            style={smallBtn}
                          >
                            {s.ContractState === 'EXPIRED' ? 'หมดสัญญา' : s.ContractState === 'UPCOMING' ? 'รอเริ่มสัญญา' : 'กำหนดสัญญา'}
                          </Button>
                        ) : (
                          <Button
                            variant="soft"
                            icon="power"
                            onClick={() => toggleStore(s)}
                            disabled={!s.IsOpen && Boolean(s.IsSuspended)}
                            title={!s.IsOpen && Boolean(s.IsSuspended) ? 'กรุณาปลดระงับสิทธิ์ก่อนเปิดร้าน' : undefined}
                            style={smallBtn}
                          >
                            {s.IsOpen ? 'ปิดร้าน' : 'เปิดร้าน'}
                          </Button>
                        )}
                       {s.ContractState !== 'EXPIRED' && (
                          <Button variant="soft" icon="ban" onClick={() => suspendStore(s)} style={smallBtn}>
                            {s.IsSuspended ? 'ปลดระงับ' : 'ระงับสิทธิ์'}
                          </Button>
                        )}
                        <Button variant="danger" icon="trash" onClick={() => deleteStore(s)} style={smallBtn}>
                          ลบ
                        </Button>
                      </div>
                    </td>
                  </tr>);
        })}
              {rows.length === 0 && (<tr>
                  <td colSpan="5" style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                                        {statusFilter !== 'all' && searchedRows.length > 0
                      ? `ไม่มีร้านสถานะ “${activeFilterLabel}”`
                      : 'ไม่พบร้านค้าที่ตรงกับคำค้นหา'}
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <StoreFormModal open={modalOpen} mode={mode} form={form} setForm={setForm} errors={errors} setErrors={setErrors} saving={saving} onClose={() => setModalOpen(false)} onSubmit={submitForm}/>
        <StoreDetailModal
        store={stores.find((s) => String(s.StoreId) === String(viewStoreId))}
        detail={detailOf(viewStoreId)}
        account={accountOf(viewStoreId)}
        open={Boolean(viewStoreId)}
        onClose={() => setViewStoreId(null)}
        saving={saving}
        pushToast={pushToast}
        onSaveStore={(patch) => saveStoreField(stores.find((s) => String(s.StoreId) === String(viewStoreId)), patch)}
        onSaveAccount={(key, value) => saveAccountField(accountOf(viewStoreId), key, value)}
      />
    </>);
}
