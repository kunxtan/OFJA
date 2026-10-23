import { useState } from 'react';
import { Icon, useEscapeToClose } from '../../components/ui';

// --- ลบถาวร: ลบข้อมูลส่วนตัวทิ้ง (เก็บแถวไว้ให้ประวัติออเดอร์อ้างถึง) ต้องพิมพ์ชื่อผู้ใช้ยืนยัน ---
export function StaffEraseModal({ staff, onClose, onSubmit }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);
  const matches = typed.trim() === staff.Username;

  const submit = async (e) => {
    e.preventDefault();
    if (!matches) {
      setError('ชื่อผู้ใช้ที่พิมพ์ไม่ตรงกับบัญชีนี้');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(typed.trim());
    } catch (err) {
      setError(err.message || 'ลบไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal" role="alertdialog" aria-modal="true" aria-labelledby="sf-erase-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className="mf-head-icon sf-danger-icon"><Icon name="trash" size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="sf-erase-title">ลบพนักงานถาวร</h3>
            <p>{staff.FullName} · @{staff.Username}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="mf-body sf-modal">
            <div className="sf-erase-warn">
              <strong><Icon name="alert" size={16} /> การลบนี้ย้อนกลับไม่ได้</strong>
              <ul>
                <li>ลบชื่อ เบอร์โทร อีเมล รูปโปรไฟล์ และรหัสผ่านของพนักงานคนนี้ออกจากระบบ</li>
                <li>บัญชีจะเข้าสู่ระบบไม่ได้อีก และเปิดใช้งานกลับไม่ได้</li>
                <li>ชื่อผู้ใช้ <b>@{staff.Username}</b> จะว่าง นำไปตั้งให้พนักงานคนใหม่ได้</li>
              </ul>
            </div>
            <div className="sf-note">
              <Icon name="history" size={16} />
              ประวัติออเดอร์ที่พนักงานคนนี้เคยดำเนินการยังอยู่ครบ จะแสดงเป็น "พนักงานที่ถูกลบ #{staff.UserId}"
            </div>
            <div className="mf-field">
              <label htmlFor="sf-erase-confirm">พิมพ์ <b className="sf-mono">{staff.Username}</b> เพื่อยืนยัน</label>
              <input
                id="sf-erase-confirm"
                type="text"
                value={typed}
                onChange={e => { setTyped(e.target.value); setError(''); }}
                placeholder="พิมพ์ชื่อผู้ใช้ด้านบนให้ตรงทุกตัวอักษร"
                autoComplete="off"
                spellCheck={false}
                className={error ? 'invalid' : ''}
                disabled={saving}
                autoFocus
              />
            </div>
            {error && <div className="mf-form-error">{error}</div>}
          </div>
          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className="mf-btn danger" disabled={saving || !matches}>
              {saving ? <span className="berry-spinner" /> : <Icon name="trash" size={17} />}
              {saving ? 'กำลังลบ...' : 'ลบถาวร'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
