import { useEffect } from 'react';
import { Icon } from './ui';

// --- กล่องยืนยันการลบ (แทน window.confirm ของเบราว์เซอร์) ---
export function ConfirmDeleteDialog({ state, busy, onCancel, onConfirm }) {
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, busy, onCancel]);

  if (!state) return null;
  return (
    <div className="berry-confirm-overlay" onClick={() => { if (!busy) onCancel(); }}>
      <div className="berry-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="berry-confirm-title" onClick={e => e.stopPropagation()}>
        <div className={`berry-confirm-icon tone-${state.tone || 'danger'}`}><Icon name={state.icon || 'trash'} size={28} /></div>
        <h3 id="berry-confirm-title">{state.title}</h3>
        <p>
          {state.prefix} <strong>"{state.name}"</strong> {state.suffix}
        </p>
        {state.warn !== null && <div className="berry-confirm-warn">{state.warn || 'การลบนี้ไม่สามารถย้อนกลับได้'}</div>}
        <div className="berry-confirm-actions">
          <button type="button" className="berry-confirm-btn cancel" onClick={onCancel} disabled={busy} autoFocus>
            {state.blocked ? 'รับทราบ' : 'ยกเลิก'}
          </button>
          {!state.blocked && (
            <button type="button" className="berry-confirm-btn danger" onClick={onConfirm} disabled={busy}>
              {busy ? <span className="berry-spinner" /> : <Icon name={state.icon || 'trash'} size={16} />}
              {busy ? (state.busyText || 'กำลังลบ...') : state.confirmText || 'ยืนยันการลบ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- แอนิเมชันติ๊กถูกกลางจอ หลังทำรายการสำเร็จ ---
export function SuccessOverlay({ state }) {
  if (!state) return null;
  return (
    <div className={`berry-success-overlay ${state.leaving ? 'leaving' : ''}`} role="status" aria-live="polite">
      <div className="berry-success-card">
        <svg className="berry-success-check" viewBox="0 0 52 52" aria-hidden="true">
          <circle className="circle" cx="26" cy="26" r="24" fill="none" />
          <path className="tick" fill="none" d="M15 27 l7 7 l15 -15" />
        </svg>
        <div className="berry-success-title">{state.title}</div>
        {state.detail && <div className="berry-success-detail">{state.detail}</div>}
      </div>
    </div>
  );
}
