import { useState } from 'react';
import { Icon, useEscapeToClose } from '../../components/ui';
import { STAFF_USERNAME_RE, STAFF_PHONE_RE, STAFF_EMAIL_RE, STAFF_PASSWORD_MIN, STAFF_PASSWORD_MAX, STAFF_ROLE_INFO, passwordChecks } from './staffUtils';
import { phoneDigits, formatPhone, thaiDateTime } from '../../lib/format';
import { PasswordInput, PasswordRules } from './PasswordFields';
import { AvatarUpload } from './AvatarUpload';

// --- ฟอร์มเพิ่ม/แก้ไขพนักงาน (ฟิลด์ตามตาราง User: ชื่อ, เบอร์, อีเมล, รูป, ตำแหน่ง, ชื่อผู้ใช้, รหัสผ่าน) ---
export function StaffFormModal({ mode, staff, onClose, onSubmit }) {
  const isEdit = mode === 'edit';
  const originalImage = isEdit ? (staff?.ProfileImageUrl || '') : '';
  const [form, setForm] = useState(() => ({
    fullName: isEdit ? staff.FullName || '' : '',
    phone: isEdit ? formatPhone(staff.Phone || '') : '',
    email: isEdit ? staff.Email || '' : '',
    role: isEdit && STAFF_ROLE_INFO[staff.Role] ? staff.Role : 'Front Staff',
    username: isEdit ? staff.Username || '' : '',
    password: '',
    confirm: '',
  }));
  const [image, setImage] = useState(originalImage);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);

  const update = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    // แก้ช่องไหน ล้าง error ของช่องนั้น (รหัสผ่านล้างช่องยืนยันด้วย)
    setErrors(prev => {
      const related = key === 'password' ? ['password', 'confirm'] : [key];
      if (!related.some(k => prev[k]) && !prev.form) return prev;
      const next = { ...prev, form: undefined };
      related.forEach(k => { next[k] = undefined; });
      return next;
    });
  };
  const set = (key) => (e) => update(key, e.target.value);

  const validate = () => {
    const next = {};
    const name = form.fullName.trim();
    if (!name) next.fullName = 'กรุณากรอกชื่อ-นามสกุล';
    else if (name.length > 100) next.fullName = 'ชื่อ-นามสกุลต้องไม่เกิน 100 ตัวอักษร';
    const phone = phoneDigits(form.phone);
    if (!phone) next.phone = 'กรุณากรอกเบอร์โทรศัพท์';
    else if (!STAFF_PHONE_RE.test(phone)) next.phone = 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0';
    const email = form.email.trim();
    if (email && (email.length > 100 || !STAFF_EMAIL_RE.test(email))) next.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    if (!isEdit) {
      const username = form.username.trim();
      if (!username) next.username = 'กรุณากรอกชื่อผู้ใช้';
      else if (!STAFF_USERNAME_RE.test(username)) next.username = 'ชื่อผู้ใช้ไม่ถูกต้อง: ใช้ได้เฉพาะ a-z, 0-9 และ _ ยาว 4–20 ตัว';
      if (!form.password) next.password = 'กรุณาตั้งรหัสผ่าน';
      else if (!passwordChecks(form.password, form.password).slice(0, 2).every(c => c.ok)) {
        next.password = `รหัสผ่านต้องยาว ${STAFF_PASSWORD_MIN}–${STAFF_PASSWORD_MAX} ตัว และห้ามมีช่องว่าง`;
      }
      if (form.password !== form.confirm) next.confirm = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
    }
    return next;
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;
    const payload = {
      fullName: form.fullName.trim(),
      phone: phoneDigits(form.phone),
      email: form.email.trim(),
      role: form.role,
    };
    if (isEdit) {
      // null = ไม่เปลี่ยนรูป ; '' = ลบรูป ; data URL = รูปใหม่
      payload.profile_img = image === originalImage ? null : image;
    } else {
      payload.username = form.username.trim();
      payload.password = form.password;
      payload.profile_img = image || null;
    }
    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setErrors({ form: err.message || 'บันทึกไม่สำเร็จ' });
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal sf-modal" role="dialog" aria-modal="true" aria-labelledby="sf-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className="mf-head-icon"><Icon name={isEdit ? 'edit' : 'users'} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="sf-title">{isEdit ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}</h3>
            <p>{isEdit ? `บัญชี @${staff.Username} · สร้างเมื่อ ${thaiDateTime(staff.CreatedAt)}` : 'กรอกข้อมูลพนักงานและตั้งบัญชีสำหรับเข้าสู่ระบบ'}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="mf-body">
            <section className="sf-section">
              <AvatarUpload image={image} name={form.fullName} onChange={setImage} disabled={saving} />
            </section>

            <section className="sf-section">
              <h4 className="sf-section-title"><Icon name="user" size={16} /> ข้อมูลส่วนตัว</h4>
              <div className="sf-grid-2">
                <div className="mf-field full">
                  <label htmlFor="sf-name">ชื่อ-นามสกุล <span className="req">*</span></label>
                  <input id="sf-name" type="text" value={form.fullName} onChange={set('fullName')} maxLength={100}
                    placeholder="เช่น สมหมาย ใจดี" className={errors.fullName ? 'invalid' : ''} disabled={saving} autoFocus />
                  {errors.fullName && <div className="mf-field-error">{errors.fullName}</div>}
                </div>
                <div className="mf-field">
                  <label htmlFor="sf-phone">เบอร์โทรศัพท์ <span className="req">*</span></label>
                  <div className="sf-input-wrap with-icon">
                    <span className="sf-input-icon"><Icon name="phone" size={16} /></span>
                    <input id="sf-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')}
                      onBlur={() => setForm(prev => ({ ...prev, phone: formatPhone(prev.phone) }))} maxLength={14}
                      placeholder="08X-XXX-XXXX" className={errors.phone ? 'invalid' : ''} disabled={saving} autoComplete="off" />
                  </div>
                  {errors.phone && <div className="mf-field-error">{errors.phone}</div>}
                </div>
                <div className="mf-field">
                  <label htmlFor="sf-email">อีเมล <span className="optional">ไม่บังคับ</span></label>
                  <div className="sf-input-wrap with-icon">
                    <span className="sf-input-icon"><Icon name="mail" size={16} /></span>
                    <input id="sf-email" type="email" value={form.email} onChange={set('email')} maxLength={100}
                      placeholder="name@example.com" className={errors.email ? 'invalid' : ''} disabled={saving} autoComplete="off" />
                  </div>
                  {errors.email && <div className="mf-field-error">{errors.email}</div>}
                </div>
              </div>
            </section>

            <section className="sf-section">
              <h4 className="sf-section-title"><Icon name="award" size={16} /> ตำแหน่ง</h4>
              <div className="sf-roles" role="radiogroup" aria-label="ตำแหน่งพนักงาน">
                {Object.entries(STAFF_ROLE_INFO).map(([value, info]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={form.role === value}
                    className={`sf-role tone-${info.tone} ${form.role === value ? 'active' : ''}`}
                    onClick={() => update('role', value)}
                    disabled={saving}
                  >
                    <span className="sf-role-icon"><Icon name={info.icon} size={18} /></span>
                    <span className="sf-role-text">
                      <strong>{info.label}</strong>
                      <small>{info.desc}</small>
                    </span>
                    <span className="sf-role-check"><Icon name="check" size={12} /></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="sf-section">
              <h4 className="sf-section-title"><Icon name="key" size={16} /> บัญชีเข้าสู่ระบบ</h4>
              <div className="mf-field">
                <label htmlFor="sf-username">ชื่อผู้ใช้ (username) {!isEdit && <span className="req">*</span>}</label>
                <div className="sf-input-wrap with-icon">
                  <span className="sf-input-icon"><Icon name="user" size={16} /></span>
                  <input id="sf-username" type="text" value={form.username}
                    onChange={e => update('username', e.target.value.replace(/\s/g, ''))}
                    maxLength={20} placeholder="เช่น front01" className={errors.username ? 'invalid' : ''}
                    disabled={saving || isEdit} autoComplete="off" />
                </div>
                {errors.username
                  ? <div className="mf-field-error">{errors.username}</div>
                  : <div className="mf-hint">{isEdit ? 'ชื่อผู้ใช้เปลี่ยนไม่ได้หลังสร้างบัญชี' : 'ใช้ a-z, 0-9 และ _ ความยาว 4–20 ตัว (ใช้ตอนเข้าสู่ระบบ)'}</div>}
              </div>

              {isEdit ? (
                <div className="sf-note"><Icon name="lock" size={16} /> ถ้าพนักงานลืมรหัสผ่าน ใช้ปุ่ม "รีเซ็ตรหัสผ่าน" ที่การ์ดของพนักงาน</div>
              ) : (
                <>
                  <div className="sf-grid-2">
                    <div className="mf-field">
                      <label htmlFor="sf-password">รหัสผ่าน <span className="req">*</span></label>
                      <PasswordInput id="sf-password" value={form.password} onChange={set('password')} show={showPassword}
                        onToggleShow={() => setShowPassword(v => !v)} invalid={errors.password} disabled={saving} placeholder="อย่างน้อย 8 ตัว" />
                      {errors.password && <div className="mf-field-error">{errors.password}</div>}
                    </div>
                    <div className="mf-field">
                      <label htmlFor="sf-confirm">ยืนยันรหัสผ่าน <span className="req">*</span></label>
                      <PasswordInput id="sf-confirm" value={form.confirm} onChange={set('confirm')} show={showPassword}
                        onToggleShow={() => setShowPassword(v => !v)} invalid={errors.confirm} disabled={saving} placeholder="พิมพ์อีกครั้ง" />
                      {errors.confirm && <div className="mf-field-error">{errors.confirm}</div>}
                    </div>
                  </div>
                  <PasswordRules password={form.password} confirm={form.confirm} />
                </>
              )}
            </section>

            {errors.form && <div className="mf-form-error">{errors.form}</div>}
          </div>

          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className="mf-btn primary" disabled={saving}>
              {saving ? <span className="berry-spinner" /> : <Icon name="check" size={17} />}
              {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มพนักงาน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
