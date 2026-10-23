// ชิ้นส่วนหน้าจอพื้นฐานของหน้าผู้บริหาร (การ์ด ปุ่ม modal toast ฟิลด์ ตัวเลือกเวลา)
import { useEffect, useState } from 'react';
import { h3Style, captionStyle, cardStyle, cardHeadStyle, T, FONT_STACK, iconButtonStyle, overlayStyle, modalStyle, modalHeadStyle, modalFootStyle, bodyStyle, popupNoticeOverlayStyle, popupNoticeStyle, popupNoticeIconStyle, popupNoticeCloseStyle, SELECT_CHEVRON, inputStyle } from '../theme';

export function useIsNarrow(breakpoint = 960) {
    const [narrow, setNarrow] = useState(typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);
    useEffect(() => {
        const onResize = () => setNarrow(window.innerWidth < breakpoint);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [breakpoint]);
    return narrow;
}

// ===== ไอคอนที่ใช้ในหน้า Executive =====
export const ICON_PATHS = {
    overview: 'M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z',
    trend: 'M3 17l6-6 4 4 8-8M21 7v5h-5',
    store: 'M4 9h16M4 9l1-4h14l1 4M5 9v11h14V9M9 20v-6h6v6',
    account: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    bell: 'M18 16V11a6 6 0 10-12 0v5l-2 3h16zM10 22h4',
    search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
    menu: 'M4 7h16M4 12h16M4 17h16',
    close: 'M6 6l12 12M18 6L6 18',
    download: 'M12 3v12M7 11l5 5 5-5M4 21h16',
    calendar: 'M7 3v4M17 3v4M3 9h18M5 5h14v16H5z',
    edit: 'M4 20h4l10-10-4-4L4 16zM14 6l4 4',
    eyeOff: 'M3 3l18 18M10.6 6.1A10.9 10.9 0 0112 6c6.5 0 10 6 10 6a17.6 17.6 0 01-3.2 3.9M6.6 6.6C3.8 8.3 2 12 2 12s3.5 6 10 6a9.7 9.7 0 004.4-1M9.9 9.9a3 3 0 004.2 4.2',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2',
    mail: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 7l9 6 9-6',
    lock: 'M5 13a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2zM8 11V7a4 4 0 118 0v4',
    chat: 'M3 20l1.3-3.9A8 8 0 1112 20a8.1 8.1 0 01-4.6-1.4z',
    alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 15a3 3 0 100-6 3 3 0 000 6z',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
    power: 'M12 3v9M7 6a8 8 0 1010 0',
    ban: 'M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8',
    plus: 'M12 5v14M5 12h14',
    check: 'M4 12l5 5L20 6',
    key: 'M14 7a4 4 0 11-3.6 5.8L4 19v3h3l1-1h2v-2h2v-2l1.4-1.4A4 4 0 0114 7z',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
    refresh: 'M4 12a8 8 0 0113.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.7L4 16M4 20v-4h4',
    settings: 'M10.3 4.3c.4-1.7 2.9-1.7 3.4 0a1.7 1.7 0 002.5 1.1c1.6-.9 3.4.8 2.4 2.4a1.7 1.7 0 001.1 2.6c1.7.4 1.7 2.9 0 3.3a1.7 1.7 0 00-1.1 2.6c.9 1.5-.8 3.3-2.4 2.4a1.7 1.7 0 00-2.5 1c-.4 1.8-2.9 1.8-3.4 0a1.7 1.7 0 00-2.5-1c-1.6.9-3.3-.9-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.3a1.7 1.7 0 001-2.6c-.9-1.6.8-3.3 2.4-2.4a1.7 1.7 0 002.5-1.1zM9 12a3 3 0 106 0 3 3 0 00-6 0',
    logout: 'M14 8V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h7a2 2 0 002-2v-2M9 12h12l-3-3M18 15l3-3',
    filter: 'M4 5h16l-6 7.5V18l-4 2v-7.5z',
    history: 'M3 12a9 9 0 109-9 9.2 9.2 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2',
    refund: 'M3 12a9 9 0 103-6.7M3 4v5h5M12 8v8M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2 0 2.6 5 1.4 5 4 0 1.2-1.1 2-2.5 2-1.1 0-2.1-.6-2.5-1.5',
    arrowRight: 'M5 12h14M13 6l6 6-6 6',
    arrowUp: 'M7 17L17 7M7 7h10v10',
    arrowDown: 'M7 7l10 10M17 7v10H7'
};

export function greetingText() {
    const h = new Date().getHours();
    if (h < 12)
        return 'สวัสดีตอนเช้า';
    if (h < 17)
        return 'สวัสดีตอนบ่าย';
    return 'สวัสดีตอนเย็น';
}

export function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 2.2, style }) {
    const d = ICON_PATHS[name] || ICON_PATHS.info;
    return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block', ...style }} aria-hidden="true">
      <path d={d}/>
    </svg>);
}

// ===== UI Components กลาง เช่น Card, Button, Modal, Toast =====
export function Card({ title, subtitle, right, children, style }) {
    return (<section className="of-card" style={{ ...cardStyle, ...style }}>
      {(title || right) && (<header style={cardHeadStyle}>
          <div style={{ minWidth: 0 }}>
            {title && <h3 style={h3Style}>{title}</h3>}
            {subtitle && <p style={captionStyle}>{subtitle}</p>}
          </div>
          {right}
        </header>)}
      {children}
    </section>);
}

export function CardDecorCircles({ color }) {
    return (<>
      <span style={{ position: 'absolute', width: '210px', height: '210px', borderRadius: '50%', background: color, opacity: 0.5, top: '-85px', right: '-95px' }}/>
      <span style={{ position: 'absolute', width: '210px', height: '210px', borderRadius: '50%', background: color, opacity: 0.5, top: '-125px', right: '-15px' }}/>
    </>);
}

export function CardDecorWave() {
    return (<span style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden="true">
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        <path d="M0 52 C 40 12, 60 92, 100 52 C 140 12, 160 92, 200 52 L 200 100 L 0 100 Z" fill="rgba(255,255,255,0.12)"/>
      </svg>
    </span>);
}

export function CardIconBox({ icon, background, color = '#FFFFFF', size = 44 }) {
    return (<div style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: T.radiusMd,
            background,
            color,
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            zIndex: 2
        }}>
      <Icon name={icon} size={22} color={color}/>
    </div>);
}

// แถบเตือนบรรทัดเดียว : danger = มีปัญหาแล้ว (แดง) · warn = เตือนให้เตรียมตัว (เหลือง)
export function AlertBanner({ tone = 'danger', children, style }) {
    const color = tone === 'warn' ? '#9A6400' : T.down;
    return (<div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderRadius: T.radiusMd, background: tone === 'warn' ? T.accentSoft : T.redSoft, color, fontSize: '13px', fontWeight: 600, lineHeight: 1.6, ...style }}>
      <Icon name="alert" size={17} color={color} style={{ marginTop: '2px' }}/>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>);
}

export function KpiCard({ label, value, unit, delta, deltaLabel, deltaSuffix = '%', hint, hasPreviousData = null, highlight, variant, icon = 'trend', tone = 'blue', size = 'md', invertDelta = false }) {
    const hasDelta = delta !== null && delta !== undefined;
    const showComparison = hasDelta;
    const rising = hasDelta && delta >= 0;
    const positive = hasDelta && (invertDelta ? delta <= 0 : delta >= 0);
    const kind = variant || (highlight ? 'purple' : 'plain');
    const solid = kind === 'purple' || kind === 'blue';
    const small = size === 'sm';
    const solidBg = kind === 'purple'
        ? `linear-gradient(135deg, ${T.primary} 0%, ${T.primaryDark} 100%)`
        : `linear-gradient(135deg, ${T.deep} 0%, ${T.deepDark} 100%)`;
    const iconTones = {
        blue: { bg: T.deepSoft, fg: T.deep },
        amber: { bg: T.amberSoft, fg: T.amber },
        purple: { bg: T.primarySoft, fg: T.primary },
        green: { bg: T.greenSoft, fg: T.up }
    };
    const iconTone = iconTones[tone] || iconTones.blue;
    return (<div className="of-card" style={{...cardStyle,padding:small? '18px 20px': '22px',minHeight:solid? '172px':small? '116px': '150px',height: '100%',background:solid?solidBg:T.surface,color:solid? '#FFFFFF':T.text,overflow: 'hidden',position: 'relative',display: 'flex',flexDirection: 'column',justifyContent: 'center'}}>
      {kind === 'purple' && <CardDecorCircles color={T.primaryDark}/>}
      {kind === 'blue' && <CardDecorWave />}
      {kind === 'blue' && <CardDecorCircles color={T.deepDark}/>}

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '14px' }}>
        {solid ? (<CardIconBox icon={icon} background={kind === 'purple' ? T.primaryDark : T.deepDark}/>) : (<div style={{width:small? '44px': '48px',height:small? '44px': '48px',minWidth:small? '44px': '48px',borderRadius:T.radiusMd,background:iconTone.bg,color:iconTone.fg,display: 'grid',placeItems: 'center'}}>
            <Icon name={icon} size={22} color={iconTone.fg}/>
          </div>)}

        <div style={{ minWidth: 0 }}>
          <div style={{fontSize:small? '22px': '26px',fontWeight:700,lineHeight:1.2,color:solid? '#FFFFFF':T.ink}}>
            {value}
            {unit && (<span style={{fontSize: '13.5px',fontWeight:500,marginLeft: '5px',color:solid? 'rgba(255,255,255,.80)':T.muted}}>
                {unit}
              </span>)}
          </div>
          <div style={{marginTop: '3px',fontSize: '13px',color:solid? 'rgba(255,255,255,.85)':T.muted}}>
            {label}
          </div>
        </div>
      </div>

      {showComparison ? (<div style={{position: 'relative',zIndex:2,marginTop:small? '10px': '14px',display: 'inline-flex',alignItems: 'center',gap: '6px',alignSelf: 'flex-start',padding: '5px 10px',borderRadius: '999px',fontSize: '12.5px',fontWeight:700,background:hasDelta&&delta===0?(solid? 'rgba(255,255,255,.18)': '#F1F3F7'):positive?(solid? 'rgba(220,252,231,.96)':T.greenSoft):(solid? 'rgba(254,226,226,.96)':T.redSoft),color:hasDelta&&delta===0?(solid? '#FFFFFF':T.muted):positive?T.up:T.down}}>
         <Icon name={hasDelta && delta === 0 ? 'arrowRight' : rising ? 'arrowUp' : 'arrowDown'} size={13}/>
                    <>{Number.isInteger(Math.abs(delta)) ? Math.abs(delta).toFixed(0) : Math.abs(delta).toFixed(1)}{deltaSuffix}</>
          {<span style={{fontWeight:500,opacity:solid&&delta===0?0.85:1,color:delta===0?(solid? '#FFFFFF':T.muted):positive?T.up:T.down}}>
            {deltaLabel}
          </span>}
        </div>) : (<div style={{position: 'relative',zIndex:2,marginTop:small? '10px': '14px',fontSize: '12.5px',color:solid ? 'rgba(255,255,255,.80)' : T.muted}}>
          {hasPreviousData === false ? 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ' : hint || 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ'}
        </div>)}
    </div>);
}

export function Badge({ tone = 'neutral', children }) {
    const palette = {
        ok: { color: T.up, background: T.greenSoft },
        warn: { color: '#8A5A00', background: T.amberSoft },
        danger: { color: T.down, background: T.redSoft },
        neutral: { color: T.muted, background: T.trackSoft }
    }[tone];
    return (<span style={{...palette,padding: '4px 11px',borderRadius: '999px',fontSize: '12px',fontWeight:700,whiteSpace: 'nowrap',display: 'inline-block'}}>
      {children}
    </span>);
}

export function Button({ variant = 'primary', icon, children, style, ...rest }) {
    const variants = {
        primary: { background: T.primary, color: '#FFFFFF', border: `1px solid ${T.primary}` },
        accent: { background: T.accent, color: T.ink, border: `1px solid ${T.accent}` },
        ghost: { background: T.surface, color: T.text, border: `1px solid ${T.line}` },
        soft: { background: T.primarySoft, color: T.primaryDark, border: `1px solid ${T.primarySoft}` },
        danger: { background: T.redSoft, color: T.down, border: `1px solid ${T.redSoft}` },
        dark: { background: T.deep, color: '#FFFFFF', border: `1px solid ${T.deep}` }
    };
    return (<button type="button" {...rest} style={{...variants[variant],display: 'inline-flex',alignItems: 'center',gap: '7px',padding: '10px 18px',borderRadius:T.radiusMd,fontSize: '13.5px',fontWeight:600,fontFamily:FONT_STACK,cursor:rest.disabled? 'not-allowed': 'pointer',opacity:rest.disabled?0.55:1,...style}}>
      {icon && <Icon name={icon} size={16}/>}
      {children}
    </button>);
}

export function Modal({ open, title, subtitle, onClose, children, footer, width = 620 }) {
    useEffect(() => {
        if (!open)
            return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open)
        return null;
    return (<div style={overlayStyle} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={{ ...modalStyle, maxWidth: `${width}px` }} role="dialog" aria-modal="true">
        <div style={modalHeadStyle}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ ...h3Style, fontSize: '18px' }}>{title}</h3>
            {subtitle && <p style={captionStyle}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="ปิด">
            <Icon name="close" size={18} color={T.muted}/>
          </button>
        </div>
        <div style={{ padding: '18px 22px', maxHeight: '64vh', overflowY: 'auto' }}>
          {children}
        </div>
        {footer && <div style={modalFootStyle}>{footer}</div>}
      </div>
    </div>);
}

export function ConfirmDialog({ state, onCancel, onConfirm }) {
    return (<Modal open={Boolean(state)} title={state?.title || ''} onClose={onCancel} width={460} footer={<>
          <Button variant="ghost" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} onClick={onConfirm} icon="check">
            {state?.confirmText || 'ยืนยัน'}
          </Button>
        </>}>
      <p style={{ ...bodyStyle, margin: 0 }}>{state?.message}</p>
      {state?.warning && (<p style={{ ...captionStyle, color: T.down, marginTop: '10px' }}>{state.warning}</p>)}
    </Modal>);
}

// ปิดร้าน/ศูนย์อาหารตอนยังมีออเดอร์ค้าง (กฎ PO 1) : ผู้บริหารเลือกว่าจะให้ทำต่อจนเสร็จ หรือยกเลิกทั้งหมดและคืนเงิน
export function ForceCloseDialog({ state, onCancel, onChoose }) {
    const orders = state?.orders || [];
    const unverified = orders.filter((o) => o.status === 'VERIFYING_SLIP' || o.status === 'AWAITING_TOP_UP').length;
    const byStore = orders.reduce((acc, o) => {
        (acc[o.store_name] = acc[o.store_name] || []).push(o);
        return acc;
    }, {});
    return (<Modal open={Boolean(state)} title={state?.title || ''} onClose={onCancel} width={520} footer={<>
          <Button variant="ghost" onClick={onCancel}>ยังไม่ปิด</Button>
          <Button variant="primary" onClick={() => onChoose('finish')} icon="check">ปิดรับใหม่ ทำต่อให้เสร็จ</Button>
          <Button variant="danger" onClick={() => onChoose('cancel')} icon="ban" style={{ background: T.down, color: '#FFFFFF', borderColor: T.down }}>ยกเลิกทั้งหมดและคืนเงิน</Button>
        </>}>
      <div style={{ background: T.redSoft, border: `1px solid ${T.down}`, borderRadius: '12px', padding: '12px 14px' }}>
        <p style={{ ...bodyStyle, margin: 0, color: T.down, fontWeight: 700 }}>
          ยังมีออเดอร์ที่ยังไม่จบ {orders.length} ออเดอร์{state?.kind === 'court' ? ` ใน ${Object.keys(byStore).length} ร้าน` : ''}
        </p>
        <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
          {Object.entries(byStore).map(([name, list]) => (<div key={name} style={{ ...captionStyle, color: T.text }}>
              {state?.kind === 'court' && <b>{name}: </b>}
              {list.map((o) => `${o.queue} (${o.status_label})`).join(', ')}
            </div>))}
        </div>
      </div>
      <p style={{ ...captionStyle, color: T.text, marginTop: '12px', lineHeight: 1.7 }}>
        ทั้งสองแบบ ลูกค้าจะสั่งออเดอร์ใหม่ไม่ได้ทันที<br/>
        <b>ทำต่อให้เสร็จ:</b> ร้านทำและส่งมอบออเดอร์ที่ค้างต่อได้ตามปกติ<br/>
        <b>ยกเลิกทั้งหมดและคืนเงิน:</b> ยกเลิกทุกออเดอร์ข้างบน ระบบสร้างรายการคืนเงินและแจ้งลูกค้าให้มารับเงินหรือเลือกให้ร้านโอนคืน
      </p>
      {unverified > 0 && (<p style={{ ...captionStyle, color: '#B45309', marginTop: '8px' }}>
          มี {unverified} ออเดอร์ที่ลูกค้าแนบสลิปแล้วแต่ร้านยังไม่ได้ตรวจ ถ้ายกเลิก รายการคืนเงินจะติดป้าย "สลิปยังไม่ได้ตรวจ" ร้านต้องตรวจสลิปก่อนจึงคืนเงินได้
        </p>)}
    </Modal>);
}

export function ToastStack({ toasts, onDismiss }) {
    if (!toasts.length) return null;
    const t = toasts[toasts.length - 1];
    const isError = t.type === 'error';
    const isWarn = t.type === 'warn';
    const accent = isError ? T.down : isWarn ? '#D98C00' : T.up;
    const soft = isError ? T.redSoft : isWarn ? T.accentSoft : T.greenSoft;
    const title = isError ? 'ทำรายการไม่สำเร็จ' : isWarn ? 'กรุณาตรวจสอบข้อมูล' : 'ทำรายการสำเร็จ';
    return (<div style={popupNoticeOverlayStyle}>
      <div style={{ ...popupNoticeStyle, borderTop: `5px solid ${accent}` }}>
        <div style={{ ...popupNoticeIconStyle, background: soft }}>
          <Icon name={isError ? 'ban' : isWarn ? 'info' : 'check'} size={30} color={accent}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: T.ink, fontSize: '18px', fontWeight: 700 }}>{title}</div>
          <div style={{ color: T.text, fontSize: '14px', lineHeight: 1.65, marginTop: '6px' }}>{t.message}</div>
        </div>
        <button type="button" onClick={() => onDismiss(t.id)} style={popupNoticeCloseStyle} aria-label="ปิดการแจ้งเตือน">
          <Icon name="close" size={18} color={T.muted}/>
        </button>
      </div>
    </div>);
}

export function Field({ label, required, error, hint, children, as: Tag = 'label' }) {
    return (<Tag style={{ display: 'block', marginBottom: '14px' , width: '100%',minWidth: 0 ,maxWidth: '100%',boxSizing: 'border-box'}}>
      <span style={{ ...captionStyle, color: T.text, fontWeight: 600, display: 'block' }}>
        {label}
        {required && <span style={{ color: T.down, marginLeft: '3px' }}>*</span>}
      </span>
      <div style={{ marginTop: '6px' }}>{children}</div>
      {hint && !error && <span style={{ ...captionStyle, fontSize: '11.5px' }}>{hint}</span>}
      {error && (<span style={{ ...captionStyle, color: T.down, fontSize: '11.5px', fontWeight: 600 }}>
          {error}
        </span>)}
    </Tag>);
}

export function EmptyState({ text, minHeight = '200px' }) {
    return (<div style={{minHeight,display: 'grid',placeItems: 'center',color:T.muted,fontSize: '13.5px'}}>
      {text}
    </div>);
}

// ===== ตัวเลือกเวลา (ชั่วโมง : นาที) + ปุ่มลัด ใช้แทน <input type="time"> =====
export const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

export const MINUTES = Array.from({ length: 60 }, (_, i) => String(i ).padStart(2, '0'));

export function TimeSelect({ value, onChange, disabled, presets = [] }) {
    const [h = '00', m = '00'] = (value || '00:00').split(':');
    const minuteOptions = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort();
    const selStyle = {
        ...inputStyle,
        width: '100%', minWidth: 0, boxSizing: 'border-box',
        fontSize: '16px',
        padding: '11px 30px 11px 12px',
        appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
        backgroundImage: SELECT_CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center',
        cursor: 'pointer',
    };
    return (<div style={{ width: '100%', minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr) auto', alignItems: 'center', gap: '8px' }}>
        <select aria-label="ชั่วโมง" value={h} disabled={disabled} onChange={e => onChange(`${e.target.value}:${m}`)} style={selStyle}>
          {HOURS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span style={{ fontWeight: 700, fontSize: '18px', color: T.ink }}>:</span>
        <select aria-label="นาที" value={m} disabled={disabled} onChange={e => onChange(`${h}:${e.target.value}`)} style={selStyle}>
          {minuteOptions.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <span style={{ color: T.muted, fontSize: '13px' }}>น.</span>
      </div>
      {presets.length > 0 && (<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
        {presets.map(p => (<button key={p} type="button" disabled={disabled} onClick={() => onChange(p)} style={{
            padding: '7px 12px', minHeight: '36px', borderRadius: '999px', fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
            border: `1px solid ${value === p ? T.primary : T.line}`,
            background: value === p ? T.primary : T.surface,
            color: value === p ? '#fff' : T.text,
          }}>{p}</button>))}
      </div>)}
    </div>);
}
