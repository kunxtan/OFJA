import { STORE_PASSWORD_MIN, STORE_PASSWORD_MAX } from './store-manage/storeForm';
import { useState } from 'react';
import { T, h3Style, bodyStyle, captionStyle, toolbarStyle, tableStyle, thStyle, trStyle, tdStyle, inputStyle, twoColStyle, smallBtn } from '../theme';
import { money } from '../lib/format';
import { callApi } from '../lib/api';
import { Icon, Card, Badge, Button, Modal, Field } from '../components/ui';
import { FormSectionTitle, IconInput, PasswordField, PasswordChecklist, OwnerRoleCard } from './store-manage/formParts';
import { storeAccountsQuery } from '../lib/queries';
import { useCachedApi } from '../../../lib/apiCache';
import { SkeletonRows } from '../../../shared/ui/Skeleton';

export const ROLE_LABEL = {
    'Shop Owner': 'เจ้าของร้าน',
};

export const EMPTY_ACCOUNT_FORM = {
    storeId: '',
    role: 'Shop Owner',
    fullName: '',
    username: '',
    password: '',
    confirm: ''
};

export function validateAccountForm(form, mode) {
    const errors = {};
    if (!form.storeId)
        errors.storeId = 'กรุณาเลือกร้านค้าที่ผูกกับบัญชีนี้';
    if (!form.role)
        errors.role = 'กรุณาเลือกตำแหน่ง';
    const fullName = form.fullName.trim();
    if (!fullName)
        errors.fullName = 'กรุณากรอกชื่อ-นามสกุลผู้ใช้';
    else if (fullName.length > 100)
        errors.fullName = 'ชื่อต้องไม่เกิน 100 ตัวอักษร';
    if (mode === 'create') {
        const username = form.username.trim();
        if (!username)
            errors.username = 'กรุณากรอกชื่อผู้ใช้';
        else if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
            errors.username = 'ใช้ได้เฉพาะ a-z, 0-9 และ _ ความยาว 4–20 ตัว (ห้ามเว้นวรรค)';
        }
    }
    if (!form.password)
        errors.password = 'กรุณากรอกรหัสผ่าน';
    else if (form.password.length < STORE_PASSWORD_MIN)
        errors.password = `รหัสผ่านต้องยาวอย่างน้อย ${STORE_PASSWORD_MIN} ตัวอักษร`;
    else if (form.password.length > STORE_PASSWORD_MAX)
        errors.password = `รหัสผ่านต้องไม่เกิน ${STORE_PASSWORD_MAX} ตัวอักษร`;
    else if (/\s/.test(form.password))
        errors.password = 'รหัสผ่านห้ามมีช่องว่าง';
    if (form.confirm !== form.password)
        errors.confirm = 'ยืนยันรหัสผ่านไม่ตรงกัน';
    return errors;
}

// ===== บัญชีร้านค้า: สร้างและจัดการบัญชีผู้ใช้ของร้าน =====
export function StoreAccountsPage({ ctx }) {
    const { API, user, stores, search, pushToast, ask } = ctx;
    // บัญชีร้าน : cache ชุดเดียวกับหน้าจัดการร้าน (กลับเข้าหน้านี้เห็นทันที แล้วโหลดใหม่อยู่ข้างหลัง)
    const [accountsKey, accountsFetcher] = storeAccountsQuery(API);
    const accountsState = useCachedApi(accountsKey, accountsFetcher, { pollMs: 30000 });
    const accounts = accountsState.data || [];
    const loadError = accountsState.error;
    const loadAccounts = accountsState.reload;
    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState('create');
    const [form, setForm] = useState(EMPTY_ACCOUNT_FORM);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const storeName = (id,account = null) => { if (account?.StoreName) {   return account.StoreName;}
    return stores.find( (s) => String(s.StoreId) === String(id)  )?.StoreName || '—'; };
    const rows = accounts.filter((a) => {
        if (a.Role !== 'Shop Owner') return false;
        const storeStillActive = stores.some((s) => String(s.StoreId) === String(a.StoreId)   );
        if (!storeStillActive) return false;
        const text = `${a.Username} ${a.FullName} ${storeName(a.StoreId, a)}`.toLowerCase();
        return text.includes(search);
    });
    const openCreate = () => {
        if (!stores.length) {
            pushToast('ยังไม่มีร้านค้าในระบบ ให้เพิ่มร้านค้าก่อนจึงจะออกบัญชีได้', 'warn');
            return;
        }
        setMode('create');
        setForm(EMPTY_ACCOUNT_FORM);
        setErrors({});
        setModalOpen(true);
    };
    const openResetPassword = (account) => {
        setMode('password');
        setForm({
            storeId: account.StoreId || '',
            role: account.Role,
            fullName: account.FullName,
            username: account.Username,
            password: '',
            confirm: '',
            userId: account.UserId
        });
        setErrors({});
        setModalOpen(true);
    };
    const submit = async () => {
        const found = validateAccountForm(form, mode);
        setErrors(found);
        if (Object.keys(found).length) {
            pushToast('ยังกรอกข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบช่องที่มีข้อความสีแดง', 'error');
            return;
        }
        setSaving(true);
        try {
            if (mode === 'password') {
                await callApi(`${API}/api/store-accounts/${form.userId}/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: form.password,
                        full_name: form.fullName.trim(),
                        role: form.role,
                        store_id: Number(form.storeId),
                        performed_by: 'Executive'
                    })
                });
                pushToast('อัปเดตบัญชีร้านค้าเรียบร้อยแล้ว');
            }
            else {
                await callApi(`${API}/api/store-accounts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: form.username.trim(),
                        password: form.password,
                        full_name: form.fullName.trim(),
                        role: form.role,
                        store_id: Number(form.storeId),
                        performed_by: 'Executive'
                    })
                });
                pushToast('สร้างบัญชีให้ร้านค้าเรียบร้อยแล้ว');
            }
            setModalOpen(false);
            await loadAccounts();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
        finally {
            setSaving(false);
        }
    };
    const removeAccount = async (account) => {
        const ok = await ask({
            title: 'ลบบัญชีผู้ใช้',
            message: `ยืนยันลบบัญชี "${account.Username}" (${account.FullName}) ใช่หรือไม่`,
            warning: 'ผู้ใช้รายนี้จะเข้าสู่ระบบไม่ได้อีก',
            confirmText: 'ลบบัญชี',
            danger: true
        });
        if (!ok)
            return;
        try {
            await callApi(`${API}/api/store-accounts/${account.UserId}`, { method: 'DELETE' });
            pushToast('ลบบัญชีเรียบร้อยแล้ว');
            await loadAccounts();
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
    };
    const update = (key) => (e) => {
        setForm((prev) => ({ ...prev, [key]: e.target.value }));
        setErrors((prev) => ({ ...prev, [key]: undefined }));
    };
    return (<>
      <Card style={{ marginBottom: '16px' }}>
        <div style={toolbarStyle}>
          <div>
            <h3 style={h3Style}>บัญชีสำหรับร้านค้า</h3>
            <p style={captionStyle}>
              ออกชื่อผู้ใช้และรหัสผ่านให้ร้าน แล้วร้านจะล็อกอินไปเพิ่มเมนูและจัดการออเดอร์ของตัวเองได้
            </p>
          </div>
          <Button icon="plus" onClick={openCreate}>
            สร้างบัญชีร้านค้า
          </Button>
        </div>
      </Card>

      {loadError && (<Card style={{ marginBottom: '16px', borderLeft: `4px solid ${T.accent}` }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Icon name="info" size={18} color="#9A6400"/>
            <div>
              <strong style={{ color: T.ink }}>ยังใช้งานหน้านี้ไม่ได้</strong>
              <p style={{ ...bodyStyle, margin: '6px 0 0' }}>{loadError}</p>
              
            </div>
          </div>
        </Card>)}

      <Card title="รายชื่อบัญชีเจ้าของร้าน" subtitle={`${accountsState.loading ? '–' : money(rows.length)} บัญชีเจ้าของร้านที่แสดงอยู่`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ชื่อผู้ใช้</th>
                <th style={thStyle}>ชื่อ-นามสกุล</th>
                <th style={thStyle}>ตำแหน่ง</th>
                <th style={thStyle}>ร้านค้า</th>
                <th style={thStyle}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (<tr key={a.UserId} style={trStyle}>
                  <td style={tdStyle}>
                    <strong style={{ color: T.ink }}>{a.Username}</strong>
                  </td>
                  <td style={tdStyle}>{a.FullName}</td>
                  <td style={tdStyle}>
                    <Badge tone={a.Role === 'Shop Owner' ? 'warn' : 'neutral'}>
                      {ROLE_LABEL[a.Role] || a.Role}
                    </Badge>
                  </td>
                  <td style={tdStyle}> <div>{storeName(a.StoreId,a)}</div> 
                  {Boolean(a.StoreIsDeleted) && ( <div style={{marginTop: '4px',fontSize: '12px',fontWeight: 700,color: '#E2452F'  }}>ร้านถูกลบแล้ว </div>)}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <Button variant="ghost" icon="key" disabled={Boolean(a.StoreIsDeleted)} onClick={() => openResetPassword(a)} style={smallBtn}>
                        ตั้งรหัสใหม่
                      </Button>
                      <Button variant="danger" icon="trash" disabled={Boolean(a.StoreIsDeleted)} onClick={() => removeAccount(a)} style={smallBtn}>
                        ลบ
                      </Button>
                    </div>
                  </td>
                </tr>))}
              {accountsState.loading && (<tr>
                  <td colSpan="5" style={{ padding: 0 }}><SkeletonRows rows={4} columns={[2, 3, 1, 2, 2]} label="กำลังโหลดบัญชีร้าน"/></td>
                </tr>)}
              {!accountsState.loading && rows.length === 0 && (<tr>
                  <td colSpan="5" style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                    ยังไม่มีบัญชีเจ้าของร้านในระบบ
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} title={mode === 'password' ? 'แก้ไขบัญชีร้านค้า' : 'สร้างบัญชีให้ร้านค้า'} subtitle="ช่องที่มีเครื่องหมาย * ต้องกรอกให้ครบก่อนจึงจะบันทึกได้" onClose={() => setModalOpen(false)} footer={<>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button icon="check" onClick={submit} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </>}>
                <FormSectionTitle icon="store">ร้านค้า</FormSectionTitle>
        <Field label="ร้านค้า" required error={errors.storeId}>
          <select value={form.storeId} onChange={update('storeId')} style={inputStyle}>
            <option value="">— เลือกร้านค้า —</option>
            {stores.map((s) => (<option key={s.StoreId} value={s.StoreId}>
                {s.StoreName}
              </option>))}
          </select>
        </Field>

        <FormSectionTitle icon="key">บัญชีเข้าสู่ระบบ</FormSectionTitle>
        <OwnerRoleCard/>
        <Field label="ชื่อ-นามสกุลเจ้าของร้าน" required error={errors.fullName}>
          <IconInput icon="account" value={form.fullName} onChange={update('fullName')} maxLength={100} placeholder="เช่น สมชาย ใจดี"/>
        </Field>
        <Field label="ชื่อผู้ใช้ (username)" required error={errors.username} hint={mode === 'password' ? 'แก้ชื่อผู้ใช้ไม่ได้' : 'a-z, 0-9 และ _ ความยาว 4–20 ตัว ห้ามซ้ำกับบัญชีอื่น'}>
          <IconInput icon="account" value={form.username} disabled={mode === 'password'} onChange={(e) => { setForm((prev) => ({ ...prev, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) })); setErrors((prev) => ({ ...prev, username: undefined })); }} autoComplete="off" placeholder="เช่น owner_shop" style={mode === 'password' ? { background: '#F3F3F8', color: T.muted } : undefined}/>
        </Field>
        <div style={twoColStyle}>
          <Field label={mode === 'password' ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'} required error={errors.password}>
            <PasswordField value={form.password} onChange={(e) => { setForm((prev) => ({ ...prev, password: e.target.value.replace(/\s/g, '') })); setErrors((prev) => ({ ...prev, password: undefined })); }} show={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder={`อย่างน้อย ${STORE_PASSWORD_MIN} ตัว`}/>
          </Field>
          <Field label="ยืนยันรหัสผ่าน" required error={errors.confirm}>
            <PasswordField value={form.confirm} onChange={(e) => { setForm((prev) => ({ ...prev, confirm: e.target.value.replace(/\s/g, '') })); setErrors((prev) => ({ ...prev, confirm: undefined })); }} show={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder="พิมพ์อีกครั้ง"/>
          </Field>
        </div>
        <PasswordChecklist password={form.password} confirm={form.confirm}/>
      </Modal>
    </>);
}
