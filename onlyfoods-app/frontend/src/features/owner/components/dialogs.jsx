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

// --- ปรับเมนูเป็นของหมดตอนยังมีออเดอร์ค้างที่สั่งเมนูนั้น : เลือกแจ้งลูกค้า หรือปิดเมนูอย่างเดียว (แบบเดียวกับหน้าร้าน) ---
//  state: { products: [{ ProductId, ProductName }], notifiable: [order], silent: [order], unknown: ดึงออเดอร์ไม่สำเร็จ }
export function StockOutDialog({ state, busy, onCancel, onConfirm }) {
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, busy, onCancel]);

  if (!state) return null;
  const { products, notifiable, silent, unknown } = state;
  const single = products.length === 1;
  const canNotify = unknown || notifiable.length > 0;
  return (
    <div className="berry-confirm-overlay" onClick={() => { if (!busy) onCancel(); }}>
      <div className="berry-confirm-dialog berry-stock-dialog" role="alertdialog" aria-modal="true" aria-labelledby="berry-stock-title" onClick={e => e.stopPropagation()}>
        <div className="berry-confirm-icon tone-danger"><Icon name="soldout" size={28} /></div>
        <h3 id="berry-stock-title">{single ? 'ปรับเป็นสินค้าหมด?' : `ปรับ ${products.length} เมนูเป็นสินค้าหมด?`}</h3>
        <p>
          ลูกค้าจะสั่ง <strong>{products.map(p => `"${p.ProductName}"`).join(', ')}</strong> ไม่ได้จนกว่าจะเปิดขายอีกครั้ง
        </p>
        {unknown ? (
          <div className="berry-stock-affected">
            <b>ตรวจออเดอร์ที่ค้างอยู่ไม่สำเร็จ</b>
            <small>ถ้ากดแจ้งลูกค้า ระบบจะแจ้งเฉพาะออเดอร์ลูกค้าออนไลน์ที่ยังไม่ปรุงเสร็จให้เปลี่ยนเมนูหรือยกเลิกรับเงินคืน</small>
          </div>
        ) : notifiable.length > 0 && (
          <div className="berry-stock-affected">
            <b>มี {notifiable.length} ออเดอร์ที่ยังไม่ปรุงเสร็จสั่ง{single ? 'เมนูนี้' : 'เมนูเหล่านี้'}อยู่</b>
            <div className="berry-stock-queues">
              {notifiable.map(o => <span key={o.OrderID} className="berry-stock-queue">{o.QueueNo}</span>)}
            </div>
            <small>ถ้าแจ้งลูกค้า: ลูกค้าเลือกเปลี่ยนเมนูหรือยกเลิกรับเงินคืนภายใน 15 นาที เลยเวลาแล้วระบบยกเลิกให้อัตโนมัติ (เจ้าของร้านโอนเงินคืนให้ลูกค้า)</small>
          </div>
        )}
        {!unknown && silent.length > 0 && (
          <div className="berry-confirm-warn">
            ไม่แจ้งอัตโนมัติ {silent.length} ออเดอร์ (Walk-in / ปรุงเสร็จแล้ว / รอตรวจสลิป): {silent.map(o => o.QueueNo).join(', ')} — แจ้งหน้าร้านให้คุยกับลูกค้าเองหากจำเป็น
          </div>
        )}
        <div className={`berry-confirm-actions ${canNotify ? 'with-notify' : ''}`}>
          <button type="button" className="berry-confirm-btn cancel" onClick={onCancel} disabled={busy} autoFocus>ยกเลิก</button>
          {canNotify && (
            <button type="button" className="berry-confirm-btn cancel" onClick={() => onConfirm(false)} disabled={busy}>ปิดเมนูอย่างเดียว</button>
          )}
          <button type="button" className="berry-confirm-btn danger" onClick={() => onConfirm(canNotify)} disabled={busy}>
            {busy ? <span className="berry-spinner" /> : <Icon name={canNotify ? 'bell' : 'soldout'} size={16} />}
            {busy ? 'กำลังบันทึก...'
              : unknown ? 'ปิดเมนู + แจ้งลูกค้า (ถ้ามี)'
                : canNotify ? `ปิดเมนู + แจ้งลูกค้า ${notifiable.length} ออเดอร์` : 'ยืนยันปรับเป็นสินค้าหมด'}
          </button>
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
