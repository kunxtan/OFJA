import { T, inputStyle, bodyStyle, captionStyle, cancelChipStyle } from '../theme';
import { thaiDateTime } from '../lib/format';
import { Badge, Button, Modal, Field, Icon } from './ui';

// ===== ระงับบัญชีลูกค้า : ระงับได้เฉพาะ Customer, ต้องมีเหตุผล, กำหนดวันหรือไม่มีกำหนด, ครบกำหนดปลดเอง
export const SUSPEND_DAY_OPTIONS = [1, 3, 7, 14, 30];

export const SUSPEND_REASON_PRESETS = [
    'สั่งอาหารแล้วไม่มารับซ้ำหลายครั้ง',
    'ใช้สลิปปลอมหรือสลิปซ้ำ',
    'พฤติกรรมผิดปกติซ้ำ',
    'พฤติกรรมไม่เหมาะสมกับร้านค้า/พนักงาน',
];

const textareaStyle = { ...inputStyle, minHeight: '84px', resize: 'vertical', lineHeight: 1.5 };
const noteBoxStyle = { display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 14px', borderRadius: T.radiusMd, background: T.bg, color: T.text, fontSize: '12.5px', lineHeight: 1.55, marginBottom: '14px' };

export const untilText = (endAt) => (endAt ? `ถึง ${thaiDateTime(endAt)}` : 'ไม่มีกำหนด');

const STATE_META = {
    ACTIVE: { tone: 'danger', text: 'กำลังระงับ' },
    LIFTED: { tone: 'neutral', text: 'ปลดระงับแล้ว' },
    APPEAL_APPROVED: { tone: 'ok', text: 'ปลดจากอุทธรณ์' },
    EXPIRED: { tone: 'neutral', text: 'ครบกำหนด' },
};

const APPEAL_META = {
    PENDING: { tone: 'warn', text: 'รอพิจารณา' },
    APPROVED: { tone: 'ok', text: 'อนุมัติ' },
    REJECTED: { tone: 'danger', text: 'ไม่อนุมัติ' },
};

export function SuspensionBadge({ customer }) {
    if (!customer?.IsSuspended) return null;
    return (<span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <Badge tone="danger">ถูกระงับ · {untilText(customer.SuspendedUntil)}</Badge>
      {customer.AppealStatus === 'PENDING' && <Badge tone="warn">มีอุทธรณ์รอพิจารณา</Badge>}
    </span>);
}

// วันปลดโดยประมาณ (ฝั่ง server คำนวณจริงตอนกดยืนยัน)
function previewEnd(days) {
    if (!days) return null;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}

export function SuspendModal({ state, setState, onSubmit }) {
    const open = Boolean(state);
    const s = state || {};
    const days = s.mode === 'none' ? null : s.mode === 'custom' ? Number(s.customDays) || 0 : s.mode;
    const set = (patch) => setState(prev => prev && ({ ...prev, ...patch, error: '' }));
    const close = () => !s.busy && setState(null);
    return (<Modal open={open} title="ระงับบัญชีลูกค้า" width={520} onClose={close}
        subtitle={open ? `${s.customer.FullName || 'ไม่ระบุชื่อ'} · @${s.customer.Username} · User ID ${s.customer.UserId}` : ''}
        footer={<>
          <Button variant="ghost" onClick={close} disabled={s.busy}>ยกเลิก</Button>
          <Button variant="danger" icon="ban" onClick={onSubmit} disabled={s.busy}>{s.busy ? 'กำลังบันทึก...' : 'ยืนยันระงับบัญชี'}</Button>
        </>}>
      {open && (<>
        <div style={noteBoxStyle}>
          <Icon name="info" size={17} color={T.muted} style={{ flexShrink: 0, marginTop: '1px' }}/>
          <span>ระหว่างถูกระงับ ลูกค้ายังเข้าสู่ระบบ ดูออเดอร์ และยื่นอุทธรณ์ได้ แต่<strong>สั่งอาหารใหม่ รีวิว และแจ้งปัญหาไม่ได้</strong> ·
            ออเดอร์ที่ค้างอยู่<strong>ไม่ถูกยกเลิก</strong> ร้านทำต่อตามขั้นตอนปกติ · ลูกค้าได้รับแจ้งเตือนทันที และบันทึกลง Audit Log</span>
        </div>

        <Field label="ระยะเวลาระงับ" required as="div" hint={days ? `ปลดระงับอัตโนมัติประมาณ ${thaiDateTime(previewEnd(days))}` : s.mode === 'none' ? 'ระงับจนกว่าผู้บริหารจะกดปลดระงับ' : ''}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {SUSPEND_DAY_OPTIONS.map(n => (<button key={n} type="button" disabled={s.busy} onClick={() => set({ mode: n })} style={cancelChipStyle(s.mode === n)}>{n} วัน</button>))}
            <button type="button" disabled={s.busy} onClick={() => set({ mode: 'custom' })} style={cancelChipStyle(s.mode === 'custom')}>กำหนดเอง</button>
            <button type="button" disabled={s.busy} onClick={() => set({ mode: 'none' })} style={cancelChipStyle(s.mode === 'none')}>ไม่มีกำหนด</button>
          </div>
          {s.mode === 'custom' && (<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
            <input type="number" min={1} max={365} value={s.customDays} disabled={s.busy} autoFocus
              onChange={e => set({ customDays: e.target.value })} style={{ ...inputStyle, width: '110px' }}/>
            <span style={{ fontSize: '13px', color: T.muted }}>วัน (1–365)</span>
          </div>)}
        </Field>

        <Field label="เหตุผลที่ระงับ" required error={s.error} hint="ลูกค้าจะเห็นเหตุผลนี้ในการแจ้งเตือนและหน้าโปรไฟล์">
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {SUSPEND_REASON_PRESETS.map(text => (<button key={text} type="button" disabled={s.busy} onClick={() => set({ reason: text })}
                style={{ ...cancelChipStyle(s.reason === text), padding: '5px 11px', fontSize: '12px' }}>{text}</button>))}
          </div>
          <textarea value={s.reason} maxLength={255} disabled={s.busy} placeholder="ระบุเหตุผล อย่างน้อย 5 ตัวอักษร"
            onChange={e => set({ reason: e.target.value })} style={textareaStyle}/>
        </Field>
      </>)}
    </Modal>);
}

export function LiftModal({ state, setState, onSubmit }) {
    const open = Boolean(state);
    const s = state || {};
    const close = () => !s.busy && setState(null);
    return (<Modal open={open} title="ปลดระงับบัญชีลูกค้า" width={460} onClose={close}
        subtitle={open ? `${s.customer.FullName || 'ไม่ระบุชื่อ'} · @${s.customer.Username}` : ''}
        footer={<>
          <Button variant="ghost" onClick={close} disabled={s.busy}>ยกเลิก</Button>
          <Button icon="check" onClick={onSubmit} disabled={s.busy}>{s.busy ? 'กำลังบันทึก...' : 'ปลดระงับ'}</Button>
        </>}>
      {open && (<>
        <p style={{ ...bodyStyle, margin: '0 0 12px' }}>
          ระงับอยู่ {untilText(s.customer.SuspendedUntil)} · เหตุผล: {s.customer.SuspendReason || '—'}
        </p>
        <Field label="หมายเหตุถึงลูกค้า (ถ้ามี)" error={s.error}>
          <input value={s.note} maxLength={255} disabled={s.busy} autoFocus placeholder="เช่น ลูกค้าชี้แจงแล้ว"
            onChange={e => setState(prev => prev && ({ ...prev, note: e.target.value, error: '' }))} style={inputStyle}/>
        </Field>
      </>)}
    </Modal>);
}

export function AppealDecisionModal({ state, setState, onSubmit }) {
    const open = Boolean(state);
    const s = state || {};
    const a = s.appeal || {};
    const close = () => !s.busy && setState(null);
    return (<Modal open={open} title={s.approve ? 'อนุมัติอุทธรณ์ (ปลดระงับ)' : 'ไม่อนุมัติอุทธรณ์'} width={500} onClose={close}
        subtitle={open ? `${a.CustomerName || 'ไม่ระบุชื่อ'} · @${a.Username}` : ''}
        footer={<>
          <Button variant="ghost" onClick={close} disabled={s.busy}>ยกเลิก</Button>
          <Button variant={s.approve ? 'primary' : 'danger'} icon={s.approve ? 'check' : 'close'} onClick={onSubmit} disabled={s.busy}>
            {s.busy ? 'กำลังบันทึก...' : s.approve ? 'อนุมัติและปลดระงับ' : 'ไม่อนุมัติ'}
          </Button>
        </>}>
      {open && (<>
        <div style={{ ...noteBoxStyle, display: 'block' }}>
          <div style={{ fontWeight: 700, color: T.ink, marginBottom: '4px' }}>คำอุทธรณ์</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{a.AppealText}</div>
          <div style={{ ...captionStyle, marginTop: '8px' }}>ถูกระงับเพราะ: {a.Reason} · {untilText(a.EndAt)}</div>
        </div>
        <Field label="ข้อความถึงลูกค้า" required={!s.approve} error={s.error}
          hint={s.approve ? 'ไม่บังคับ ลูกค้าจะเห็นในการแจ้งเตือน' : 'ลูกค้าจะเห็นเหตุผลนี้ บัญชียังถูกระงับต่อจนครบกำหนด'}>
          <textarea value={s.response} maxLength={500} disabled={s.busy} autoFocus
            onChange={e => setState(prev => prev && ({ ...prev, response: e.target.value, error: '' }))} style={textareaStyle}/>
        </Field>
      </>)}
    </Modal>);
}

export function PendingAppeals({ appeals, onDecide, onOpen }) {
    if (!appeals.length) return null;
    return (<div style={{ marginBottom: '20px', border: `1px solid ${T.amberSoft}`, borderRadius: T.radiusMd, background: '#FFFCF3', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: T.ink, marginBottom: '10px' }}>
        <Icon name="chat" size={17} color="#8A5A00"/> คำอุทธรณ์รอพิจารณา ({appeals.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {appeals.map(a => (<div key={a.SuspensionId} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <button type="button" onClick={() => onOpen(a)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: T.ink, fontSize: '14px', fontFamily: 'inherit' }}>
                {a.CustomerName || 'ไม่ระบุชื่อ'} <span style={{ color: T.muted, fontWeight: 500 }}>@{a.Username} · User ID {a.UserId}</span>
              </button>
              <div style={{ ...captionStyle, margin: '2px 0 0' }}>ระงับเพราะ: {a.Reason} · {untilText(a.EndAt)} · ยื่นเมื่อ {thaiDateTime(a.AppealAt)}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="ghost" icon="close" style={{ padding: '7px 12px', fontSize: '12.5px' }} onClick={() => onDecide(a, false)}>ไม่อนุมัติ</Button>
              <Button icon="check" style={{ padding: '7px 12px', fontSize: '12.5px' }} onClick={() => onDecide(a, true)}>อนุมัติ (ปลดระงับ)</Button>
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '13px', color: T.text, whiteSpace: 'pre-wrap' }}>“{a.AppealText}”</div>
        </div>))}
      </div>
    </div>);
}

const historyCell = { padding: '12px 14px', textAlign: 'left', verticalAlign: 'top', fontSize: '13px', color: T.text };
const historyHead = { ...historyCell, fontWeight: 700, whiteSpace: 'nowrap', color: T.ink };

function liftedText(h) {
    if (h.State === 'ACTIVE') return '—';
    if (h.State === 'EXPIRED') return `ระบบปลดอัตโนมัติ ${thaiDateTime(h.LiftedAt || h.EndAt)}`;
    return `${h.LiftedByName || '—'} · ${thaiDateTime(h.LiftedAt)}${h.LiftNote ? ` · ${h.LiftNote}` : ''}`;
}

export function SuspensionHistory({ items, loading, error }) {
    return (<div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '16px', fontWeight: 700, color: T.ink, marginBottom: '10px' }}>ประวัติการระงับบัญชี</div>
      {loading && <div style={{ padding: '14px 0', color: T.muted, fontSize: '13px' }}>กำลังโหลด...</div>}
      {error && <div style={{ padding: '12px 14px', borderRadius: T.radiusMd, background: T.redSoft, color: T.down, fontSize: '13px' }}>{error}</div>}
      {!loading && !error && items.length === 0 && <div style={{ padding: '12px 14px', borderRadius: T.radiusMd, background: T.bg, color: T.muted, fontSize: '13px' }}>ไม่เคยถูกระงับบัญชี</div>}
      {!loading && !error && items.length > 0 && (<div style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, overflowX: 'auto', background: T.surface }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead><tr style={{ borderBottom: `1px solid ${T.line}` }}>
            <th style={historyHead}>ระงับเมื่อ</th><th style={historyHead}>ระยะเวลา</th><th style={historyHead}>เหตุผล</th>
            <th style={historyHead}>ผู้ดำเนินการ</th><th style={historyHead}>สถานะ</th><th style={historyHead}>ปลดระงับ</th><th style={historyHead}>อุทธรณ์</th>
          </tr></thead>
          <tbody>
            {items.map(h => {
                const st = STATE_META[h.State] || STATE_META.EXPIRED;
                const ap = APPEAL_META[h.AppealStatus];
                return (<tr key={h.SuspensionId} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td style={{ ...historyCell, whiteSpace: 'nowrap', color: T.muted }}>{thaiDateTime(h.StartAt)}</td>
                  <td style={{ ...historyCell, whiteSpace: 'nowrap' }}>{untilText(h.EndAt)}</td>
                  <td style={{ ...historyCell, minWidth: '180px' }}>{h.Reason}</td>
                  <td style={{ ...historyCell, whiteSpace: 'nowrap' }}>{h.SuspendedByName}</td>
                  <td style={historyCell}><Badge tone={st.tone}>{st.text}</Badge></td>
                  <td style={{ ...historyCell, minWidth: '160px' }}>{liftedText(h)}</td>
                  <td style={{ ...historyCell, minWidth: '200px' }}>
                    {!h.AppealStatus ? '—' : (<>
                      <Badge tone={ap.tone}>{h.AppealStatus === 'PENDING' && h.State !== 'ACTIVE' ? 'ปิดพร้อมการปลดระงับ' : ap.text}</Badge>
                      <div style={{ marginTop: '6px', whiteSpace: 'pre-wrap' }}>“{h.AppealText}”</div>
                      {h.AppealResponse && <div style={{ ...captionStyle, marginTop: '4px' }}>ตอบโดย {h.ReviewedByName || '—'}: {h.AppealResponse}</div>}
                    </>)}
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>)}
    </div>);
}
