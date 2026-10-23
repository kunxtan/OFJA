import { useRef, useState } from 'react';

export const MAX_SLIP_MB = 5;

export const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
  fr.readAsDataURL(file);
});

export const fmtBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// ช่องแนบสลิปโอน : ลากไฟล์มาวาง / คลิกเลือก -> การ์ดตัวอย่าง (เปลี่ยนรูป / นำออก) ; ไม่มีครอป (สลิปต้องเห็นครบทั้งใบ)
export function SlipPicker({ slip, onPick, onClear, disabled, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const openPicker = () => { if (!disabled) inputRef.current?.click(); };
  return (
    <div className="rf-slip-field">
      <input ref={inputRef} type="file" accept="image/*" hidden disabled={disabled}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      {slip ? (
        <div className="rf-slip-card">
          <button type="button" className="rf-slip-thumb" onClick={() => window.open(slip.dataUrl, '_blank', 'noopener')} title="ดูรูปเต็ม">
            <img src={slip.dataUrl} alt="สลิปโอนที่เลือก" />
          </button>
          <div className="rf-slip-meta">
            <div className="name" title={slip.name}>{slip.name}</div>
            <div className="sub">{fmtBytes(slip.size)}{slip.width ? ` · ${slip.width}×${slip.height}px` : ''}</div>
            <div className="rf-slip-actions">
              <button type="button" className="rf-mini-btn" onClick={openPicker} disabled={disabled}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 9l5 -5l5 5" /><path d="M12 4l0 12" /></svg>
                เปลี่ยนรูป
              </button>
              <button type="button" className="rf-mini-btn danger" onClick={onClear} disabled={disabled}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>
                นำรูปออก
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`rf-dropzone ${dragging ? 'dragging' : ''} ${error ? 'has-error' : ''}`}
          role="button" tabIndex={disabled ? -1 : 0} aria-label="แนบสลิปโอนเงินคืน"
          onClick={openPicker}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
          onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f && !disabled) onPick(f); }}
        >
          <span className="rf-dropzone-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" />
              <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />
            </svg>
          </span>
          <div className="rf-dropzone-title"><span>คลิกเพื่อเลือกสลิป</span> หรือลากไฟล์มาวางที่นี่</div>
          <div className="rf-dropzone-hint">PNG, JPG, WEBP · ไม่เกิน {MAX_SLIP_MB} MB</div>
        </div>
      )}
    </div>
  );
}

// ขนาดรูป (แสดงในการ์ดตัวอย่าง) ; อ่านไม่ได้ก็ไม่เป็นไร
export const imageSize = (dataUrl) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
  img.onerror = () => resolve({});
  img.src = dataUrl;
});
