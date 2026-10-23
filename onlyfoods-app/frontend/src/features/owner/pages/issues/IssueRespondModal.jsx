import { useState } from 'react';
import { Icon, useEscapeToClose } from '../../components/ui';
import { ISSUE_TYPE_ICON, ISSUE_STATUS_UI, ISSUE_QUICK_REPLIES } from './issueMeta';

// --- อัปเดตสถานะ + ข้อความตอบกลับลูกค้า ---
export function IssueRespondModal({ issue, target, onClose, onSubmit }) {
  const st = ISSUE_STATUS_UI[target];
  const [note, setNote] = useState(issue.AdminNote || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);
  const needNote = target === 'REJECTED';

  const submit = async (e) => {
    e.preventDefault();
    if (needNote && !note.trim()) { setError('กรุณาระบุเหตุผลที่ไม่รับเรื่อง ลูกค้าจะเห็นข้อความนี้'); return; }
    setSaving(true);
    try {
      await onSubmit(target, note.trim());
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal" role="dialog" aria-modal="true" aria-labelledby="is-respond-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className={`is-type-icon tone-${st.tone}`}><Icon name={ISSUE_TYPE_ICON[issue.TypeCode] || 'alert'} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="is-respond-title">เปลี่ยนเป็น “{st.label}”</h3>
            <p>{issue.IssueType}{issue.QueueNo ? ` · คิว ${issue.QueueNo}` : ''} · ผู้แจ้ง {issue.ReporterName}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด"><Icon name="close" size={18} /></button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="mf-body">
            <div className="is-quote small">{issue.Description}</div>
            <div className="mf-field">
              <label htmlFor="is-note">
                ข้อความตอบกลับลูกค้า {needNote ? <span className="req">*</span> : <span className="optional">ไม่บังคับ</span>}
                <span className="mf-counter">{note.length}/500</span>
              </label>
              <textarea id="is-note" rows={4} maxLength={500} value={note} disabled={saving}
                onChange={e => { setNote(e.target.value); setError(''); }}
                placeholder={needNote ? 'เช่น ตรวจสอบแล้วไม่พบปัญหาตามที่แจ้ง' : 'เช่น ร้านแก้ไขเรียบร้อยแล้ว ขอบคุณที่แจ้งค่ะ'} autoFocus />
              {(ISSUE_QUICK_REPLIES[target] || []).length > 0 && (
                <div className="is-quick">
                  {ISSUE_QUICK_REPLIES[target].map(t => (
                    <button key={t} type="button" className="is-quick-btn" onClick={() => { setNote(t); setError(''); }} disabled={saving}>{t}</button>
                  ))}
                </div>
              )}
              <div className="mf-hint">ลูกค้าจะได้รับการแจ้งเตือน และเห็นข้อความนี้ในหน้าประวัติการแจ้งปัญหา</div>
            </div>
            {error && <div className="mf-form-error">{error}</div>}
          </div>
          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className={`mf-btn ${target === 'REJECTED' ? 'danger' : 'primary'}`} disabled={saving}>
              {saving ? <span className="berry-spinner" /> : <Icon name="check" size={17} />}
              {saving ? 'กำลังบันทึก...' : 'บันทึกและแจ้งลูกค้า'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
