import { pad2 } from '../../../../lib/dates';
import { useState } from 'react';
import { Icon, useEscapeToClose } from '../../components/ui';

// --- เวลาร้าน: เลือกชั่วโมง/นาที ได้เฉพาะในช่วงเวลาศูนย์อาหาร ---
export const hhmmToMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export const minToHhmm = (n) => `${pad2(Math.floor(n / 60))}:${pad2(n % 60)}`;

export function StoreTimeSelect({ value, onChange, disabled, min, max, presets = [], label }) {
  const [h, m] = (value || '00:00').split(':');
  const hours = [];
  for (let x = Math.floor(min / 60); x <= Math.floor(max / 60); x += 1) hours.push(pad2(x));
  const minutes = Array.from({ length: 12 }, (_, i) => pad2(i * 5));
  const minuteOptions = minutes.includes(m) ? minutes : [...minutes, m].sort();
  return (
    <div className="ss-time">
      <div className="ss-time-row">
        <select aria-label={`${label} ชั่วโมง`} value={h} disabled={disabled} onChange={e => onChange(`${e.target.value}:${m}`)}>
          {(hours.includes(h) ? hours : [...hours, h].sort()).map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="colon">:</span>
        <select aria-label={`${label} นาที`} value={m} disabled={disabled} onChange={e => onChange(`${h}:${e.target.value}`)}>
          {minuteOptions.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="unit">น.</span>
      </div>
      {presets.length > 0 && (
        <div className="ss-presets">
          {presets.map(t => (
            <button key={t} type="button" disabled={disabled} className={value === t ? 'active' : ''} onClick={() => onChange(t)}>{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- ตั้งเวลาเปิด-ปิดร้านอัตโนมัติ (อยู่ในเวลาทำการศูนย์อาหารที่ผู้บริหารตั้ง) ---
export function StoreScheduleModal({ fcOpen, fcClose, hasOwnHours, openTime, closeTime, onClose, onSubmit }) {
  const [useOwn, setUseOwn] = useState(Boolean(hasOwnHours));
  const [open, setOpen] = useState(openTime || fcOpen);
  const [close, setClose] = useState(closeTime || fcClose);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);
  const min = hhmmToMin(fcOpen);
  const max = hhmmToMin(fcClose);
  const hourly = [];
  for (let t = Math.ceil(min / 60) * 60; t <= max; t += 60) hourly.push(minToHhmm(t));

  const submit = async (e) => {
    e.preventDefault();
    if (useOwn) {
      const o = hhmmToMin(open), c = hhmmToMin(close);
      if (o >= c) { setError('เวลาปิดต้องอยู่หลังเวลาเปิด'); return; }
      if (o < min || c > max) { setError(`เวลาร้านต้องอยู่ในเวลาทำการของศูนย์อาหาร (${fcOpen}–${fcClose} น.)`); return; }
    }
    setSaving(true);
    try {
      await onSubmit(useOwn ? { open_time: open, close_time: close } : {});
    } catch (err) {
      setError(err.message || 'บันทึกเวลาไม่สำเร็จ');
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal ss-modal" role="dialog" aria-modal="true" aria-labelledby="ss-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <span className="mf-head-icon"><Icon name="clock" size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="ss-title">ตั้งเวลาเปิด-ปิดร้าน</h3>
            <p>ร้านเปิดและปิดรับออเดอร์เองตามเวลานี้ทุกวัน</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="mf-body">
            <div className="ss-choice" role="radiogroup" aria-label="แหล่งเวลาเปิด-ปิดร้าน">
              <button type="button" role="radio" aria-checked={!useOwn} className={!useOwn ? 'active' : ''} disabled={saving} onClick={() => { setUseOwn(false); setError(''); }}>
                <strong>ตามเวลาศูนย์อาหาร</strong>
                <span>{fcOpen}–{fcClose} น. (ผู้บริหารกำหนด)</span>
              </button>
              <button type="button" role="radio" aria-checked={useOwn} className={useOwn ? 'active' : ''} disabled={saving} onClick={() => { setUseOwn(true); setError(''); }}>
                <strong>กำหนดเวลาร้านเอง</strong>
                <span>ภายในเวลาศูนย์อาหาร</span>
              </button>
            </div>
            {useOwn && (
              <>
                <div className="mf-field">
                  <label>เวลาเปิดอัตโนมัติ <span className="req">*</span></label>
                  <StoreTimeSelect label="เวลาเปิด" value={open} onChange={v => { setOpen(v); setError(''); }} disabled={saving} min={min} max={max} presets={hourly.slice(0, 5)} />
                  <div className="mf-hint">ร้านเริ่มรับออเดอร์ใหม่ตั้งแต่เวลานี้</div>
                </div>
                <div className="mf-field">
                  <label>เวลาปิดอัตโนมัติ <span className="req">*</span></label>
                  <StoreTimeSelect label="เวลาปิด" value={close} onChange={v => { setClose(v); setError(''); }} disabled={saving} min={min} max={max} presets={hourly.slice(-5)} />
                  <div className="mf-hint">ถึงเวลานี้ ร้านหยุดรับออเดอร์ใหม่</div>
                </div>
              </>
            )}
            <div className="ss-note">ปิดตามเวลาจะหยุดรับออเดอร์ใหม่เท่านั้น ออเดอร์ที่รับไว้แล้วทำต่อได้ตามปกติ ; ถ้าศูนย์อาหารปิด ร้านจะปิดตามด้วยเสมอ</div>
            {error && <div className="mf-form-error">{error}</div>}
          </div>
          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className="mf-btn primary" disabled={saving}>
              {saving ? <span className="berry-spinner" /> : <Icon name="check" size={17} />}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
