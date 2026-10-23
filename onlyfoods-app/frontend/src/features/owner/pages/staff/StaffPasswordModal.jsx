import { useState } from 'react';
import { Icon, useEscapeToClose } from '../../components/ui';
import { passwordChecks } from './staffUtils';
import { StaffAvatar } from './StaffAvatar';
import { PasswordInput, PasswordRules } from './PasswordFields';

// --- เจ้าของร้านตั้งรหัสผ่านใหม่ให้พนักงาน (ปลดล็อกบัญชีด้วย) ---
export function StaffPasswordModal({ staff, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);

  const submit = async (e) => {
    e.preventDefault();
    if (!passwordChecks(password, confirm).every(c => c.ok)) {
      setError('กรุณาตั้งรหัสผ่านให้ผ่านทุกเงื่อนไขด้านล่าง');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err.message || 'ตั้งรหัสผ่านไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal" role="dialog" aria-modal="true" aria-labelledby="sf-pw-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <StaffAvatar name={staff.FullName} src={staff.ProfileImageUrl} id={staff.UserId} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="sf-pw-title">รีเซ็ตรหัสผ่าน</h3>
            <p>{staff.FullName} · @{staff.Username}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="mf-body sf-modal">
            {staff.IsLocked && (
              <div className="sf-lock-note"><Icon name="lock" size={16} /> บัญชีนี้ถูกล็อกจากการใส่รหัสผิดหลายครั้ง ตั้งรหัสใหม่แล้วจะปลดล็อกทันที</div>
            )}
            <div className="mf-field">
              <label htmlFor="sf-new-pw">รหัสผ่านใหม่ <span className="req">*</span></label>
              <PasswordInput id="sf-new-pw" value={password} onChange={e => setPassword(e.target.value)} show={show}
                onToggleShow={() => setShow(v => !v)} disabled={saving} placeholder="อย่างน้อย 8 ตัว" />
            </div>
            <div className="mf-field">
              <label htmlFor="sf-new-pw2">ยืนยันรหัสผ่านใหม่ <span className="req">*</span></label>
              <PasswordInput id="sf-new-pw2" value={confirm} onChange={e => setConfirm(e.target.value)} show={show}
                onToggleShow={() => setShow(v => !v)} disabled={saving} placeholder="พิมพ์อีกครั้ง" />
            </div>
            <PasswordRules password={password} confirm={confirm} />
            <div className="sf-note"><Icon name="alert" size={16} /> แจ้งรหัสผ่านใหม่ให้พนักงานโดยตรง และแนะนำให้เปลี่ยนเองหลังเข้าสู่ระบบ</div>
            {error && <div className="mf-form-error">{error}</div>}
          </div>
          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className="mf-btn primary" disabled={saving}>
              {saving ? <span className="berry-spinner" /> : <Icon name="key" size={17} />}
              {saving ? 'กำลังบันทึก...' : 'ตั้งรหัสผ่านใหม่'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
