import { Icon } from '../../components/ui';

// --- การ์ดควบคุมร้าน (แบบเดียวกับการควบคุมศูนย์อาหารของผู้บริหาร) ---
// state: OPEN / PAUSED / CLOSED ; mode: AUTO = ตามเวลา, OPEN/CLOSED = กดเองถึง overrideUntil
export const STORE_STATE_META = {
  OPEN: { tone: 'green', label: 'ร้านเปิดรับออเดอร์' },
  PAUSED: { tone: 'amber', label: 'หยุดรับออเดอร์ชั่วคราว' },
  CLOSED: { tone: 'red', label: 'ร้านปิดอยู่' },
};

export function StoreControlCard({ state, blockedReason, mode, openTime, closeTime, hasOwnHours, overrideUntil, pausedUntil, busy, onOpen, onClose, onPause, onResume, onAuto, onSettings }) {
  const meta = STORE_STATE_META[state] || STORE_STATE_META.CLOSED;
  const clock = (value) => (value ? String(value).slice(11, 16) : '');
  const hours = openTime && closeTime ? `${openTime}–${closeTime} น.` : '';
  let detail;
  if (blockedReason) detail = blockedReason;
  else if (state === 'PAUSED') detail = `หยุดรับถึง ${clock(pausedUntil)} น. หรือจนกว่าจะกดเปิดรับต่อ`;
  else if (mode === 'CLOSED') detail = overrideUntil ? `ปิดเองถึง ${clock(overrideUntil)} น. แล้วกลับไปเปิด-ปิดตามเวลา` : 'ปิดไว้จนกว่าจะกดเปิดร้าน';
  else if (mode === 'OPEN') detail = `เปิดเองถึง ${clock(overrideUntil)} น. แล้วกลับไปเปิด-ปิดตามเวลา`;
  else detail = `เวลาร้าน ${hours} · ${hasOwnHours ? 'เปิด-ปิดอัตโนมัติ' : 'ตามเวลาศูนย์อาหาร'}`;

  return (
    <section id="owner-store-control" className={`od-control tone-${meta.tone}`} aria-label="การควบคุมร้าน">
      <div className="od-control-head">
        <span className="od-control-icon"><Icon name="power" size={19} /></span>
        <div className="od-control-text">
          <div className="status"><span className="dot" />{meta.label}</div>
          <div className="detail" title={state === 'PAUSED' ? `${detail} · ออเดอร์ที่รับแล้วทำต่อได้ตามปกติ` : detail}>{detail}</div>
        </div>
        <button type="button" className="od-control-gear" onClick={onSettings} title={`ตั้งเวลาเปิด-ปิดร้าน${hours ? ` (ตอนนี้ ${hours})` : ''}`} aria-label="ตั้งเวลาเปิด-ปิดร้าน">
          <Icon name="settings" size={17} />
        </button>
      </div>
      <div className="od-control-actions">
        {state === 'CLOSED' && (
          <button type="button" className="od-cbtn primary" onClick={onOpen} disabled={busy || Boolean(blockedReason)}>
            <Icon name="power" size={15} /> เปิดร้าน
          </button>
        )}
        {state === 'PAUSED' && (
          <button type="button" className="od-cbtn primary" onClick={onResume} disabled={busy}>
            <Icon name="check" size={15} /> เปิดรับออเดอร์ต่อ
          </button>
        )}
        {state === 'OPEN' && (
          <button type="button" className="od-cbtn amber" onClick={onPause} disabled={busy}>
            <Icon name="clock" size={15} /> หยุดรับชั่วคราว
          </button>
        )}
        {state !== 'CLOSED' && (
          <button type="button" className="od-cbtn danger" onClick={onClose} disabled={busy}>
            <Icon name="power" size={15} /> ปิดร้าน
          </button>
        )}
        {mode !== 'AUTO' && (
          <button type="button" className="od-cbtn ghost" onClick={onAuto} disabled={busy} title="ยกเลิกที่กดเอง กลับไปเปิด-ปิดตามเวลา">
            ตามเวลา
          </button>
        )}
      </div>
    </section>
  );
}
