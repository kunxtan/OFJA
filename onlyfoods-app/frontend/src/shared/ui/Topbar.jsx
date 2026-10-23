import { useState } from 'react';

// แถบด้านบนแบบเดียวกันทุกบทบาท (ต้นแบบ = หน้าเจ้าของร้าน) : โลโก้ OnlyFoods + ป้ายสถานะ + กระดิ่ง + ชิปผู้ใช้
// แต่ละหน้ายังถือ state / dropdown ของตัวเอง ไฟล์นี้มีแค่หน้าตา
// สีทั้งหมดเป็นตัวแปร --oft-* : หน้าครัวโหมดมืดส่งค่าของธีมมาแทนได้ (style={{ '--oft-bg': ... }})

const ICONS = {
  bell: <><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></>,
  settings: <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543 .94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543 .826-3.31 2.37-2.37c1 .608 2.296 .07 2.572-1.065z" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></>,
};

export function TopbarIcon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

// ตัวอักษรแรกของชื่อ (ข้ามสระหน้า เ แ โ ใ ไ : "เสี่ยฟลุ้ค" -> "ส")
export const initialOf = (name, fallback = 'U') =>
  String(name || '').trim().replace(/^[เแโใไ]+/, '').charAt(0).toUpperCase() || fallback;

export function TopbarStyles() {
  return <style>{TOPBAR_CSS}</style>;
}

export function BrandLogo({ onClick, title = 'กลับหน้าแรก' }) {
  if (!onClick) return <span className="oft-logo static">Only<span>Foods</span></span>;
  return (
    <button type="button" className="oft-logo" onClick={onClick} title={title}>
      Only<span>Foods</span>
    </button>
  );
}

// ป้ายสถานะ : tone = green | amber | red | neutral ; short = ข้อความสั้นบนมือถือ ; hideOnPhone = ซ่อนบนจอแคบ ; onClick = กดได้
export function StatusPill({ tone = 'green', label, short, pulse = false, hideOnPhone = false, onClick, title, children }) {
  const className = `oft-pill tone-${tone}${pulse ? ' pulse' : ''}${onClick ? ' clickable' : ''}${hideOnPhone ? ' oft-hide-phone' : ''}`;
  const body = (<>
    <span className="dot" />
    <span className="full">{label}</span>
    {short && <span className="short">{short}</span>}
    {children}
  </>);
  return onClick
    ? <button type="button" className={className} onClick={onClick} title={title || label}>{body}</button>
    : <span className={className} title={title || label}>{body}</span>;
}

// ปุ่ม ☰ : หมุนทุกครั้งที่กด / กลายเป็น X ตอนเปิดเมนูบนมือถือ
export function BurgerButton({ open, onToggle, ...rest }) {
  const [spin, setSpin] = useState(0);
  return (
    <button type="button" className={`oft-icon-btn orange oft-burger${open ? ' is-open' : ''}`}
      onClick={() => { setSpin(d => d + 180); onToggle(); }}
      aria-label={open ? 'ซ่อนแถบเมนู' : 'แสดงแถบเมนู'} aria-expanded={open} {...rest}>
      <span className="lines" style={{ transform: `rotate(${spin}deg)` }} aria-hidden="true"><span /><span /><span /></span>
    </button>
  );
}

export function BellButton({ count = 0, active = false, onClick, label = 'การแจ้งเตือน', ...rest }) {
  return (
    <button type="button" className={`oft-icon-btn amber oft-bell${active ? ' active' : ''}${count > 0 ? ' has-unread' : ''}`}
      onClick={onClick} aria-label={count > 0 ? `${label} ${count} รายการใหม่` : label} aria-expanded={active} {...rest}>
      <span className="bell-icon" key={count}><TopbarIcon name="bell" /></span>
      {count > 0 && <span className="oft-badge">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

export function UserChip({ name, role, image, onClick, expanded }) {
  return (
    <button type="button" className="oft-user" onClick={onClick} aria-label="เมนูบัญชีผู้ใช้" aria-expanded={expanded}>
      <span className="oft-avatar">
        {image ? <img src={image} alt="" /> : initialOf(name)}
      </span>
      <span className="oft-user-text">
        <span className="oft-user-name">{name}</span>
        {role && <span className="oft-user-role">{role}</span>}
      </span>
      <TopbarIcon name="settings" size={17} />
    </button>
  );
}

const TOPBAR_CSS = `
.oft-bar {
  --oft-bg: #FFFFFF; --oft-border: #E6E8F0; --oft-ink: #2A2C41; --oft-muted: #8A8FA6;
  --oft-orange: #FF724C; --oft-orange-soft: #FFEAE3;
  --oft-green: #17A673; --oft-green-soft: #E3F6EE; --oft-red: #E2452F; --oft-red-soft: #FDEAE6;
  --oft-amber: #E2A430; --oft-amber-soft: #FFF4DE; --oft-chip: #EDEEF4; --oft-chip-hover: #E2E4EE;
  min-height: 80px; padding: 0 24px; box-sizing: border-box; flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  background: var(--oft-bg); border-bottom: 1px solid var(--oft-border); color: var(--oft-ink);
  font-family: 'Roboto', 'Sarabun', sans-serif;
  transition: background-color 0.25s ease, border-color 0.25s ease;
}
.oft-bar *, .oft-bar *::before, .oft-bar *::after { box-sizing: border-box; }
.oft-left, .oft-right { display: flex; align-items: center; gap: 16px; min-width: 0; }
.oft-right { flex-shrink: 0; }
.oft-brand { display: flex; align-items: center; gap: 14px; white-space: nowrap; min-width: 0; }

/* โลโก้ : ใช้ได้นอกแถบด้วย (หน้าลูกค้า) จึงมีค่าสำรองของสี */
.oft-logo {
  padding: 0; border: none; background: transparent; cursor: pointer; white-space: nowrap;
  font-family: 'Roboto', 'Sarabun', sans-serif; font-size: 27px; font-weight: 900; letter-spacing: -0.5px; line-height: 1;
  color: var(--oft-ink, #2A2C41);
}
.oft-logo span { color: var(--oft-orange, #FF724C); }
/* หน้าลูกค้าบังคับ Sarabun ทุกตัวด้วย !important : โลโก้ต้องเป็นฟอนต์เดียวกับทุกหน้า */
.oft-logo.oft-logo, .oft-logo span { font-family: 'Roboto', 'Sarabun', sans-serif !important; }
.oft-logo.static { cursor: default; }
.oft-logo:focus-visible { outline: 2px solid var(--oft-orange, #FF724C); outline-offset: 3px; border-radius: 4px; }

/* ป้ายสถานะ */
.oft-pill {
  --pill: var(--oft-green); --pill-soft: var(--oft-green-soft);
  display: inline-flex; align-items: center; gap: 7px; padding: 6px 13px; min-width: 0;
  border-radius: 999px; border: 1px solid color-mix(in srgb, var(--pill) 25%, transparent);
  background: var(--pill-soft); color: var(--pill);
  font-family: inherit; font-size: 12.5px; font-weight: 700; white-space: nowrap;
  transition: background 0.3s ease, color 0.3s ease, border-color 0.2s ease;
}
.oft-pill.tone-amber { --pill: var(--oft-amber); --pill-soft: var(--oft-amber-soft); }
.oft-pill.tone-red { --pill: var(--oft-red); --pill-soft: var(--oft-red-soft); }
.oft-pill.tone-neutral { --pill: var(--oft-ink); --pill-soft: var(--oft-chip); border-color: transparent; }
.oft-pill .full { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.oft-pill .short { display: none; }
.oft-pill .dot { position: relative; width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.oft-pill.tone-neutral .dot { display: none; }
.oft-pill.pulse .dot::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: currentColor; animation: oftPulse 1.8s ease-out infinite; }
@keyframes oftPulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.6); opacity: 0; } }
.oft-pill.clickable { cursor: pointer; }
.oft-pill.clickable:hover { border-color: currentColor; }
.oft-pill.clickable:focus-visible { outline: 2px solid var(--oft-orange); outline-offset: 2px; }

/* ปุ่มไอคอน */
.oft-icon-btn {
  position: relative; width: 38px; height: 38px; flex-shrink: 0; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 9px; cursor: pointer; font-family: inherit;
  -webkit-tap-highlight-color: transparent; transition: background 0.25s ease, color 0.25s ease, transform 0.15s ease;
}
.oft-icon-btn.orange { background: var(--oft-orange-soft); color: var(--oft-orange); }
.oft-icon-btn.amber { background: var(--oft-amber-soft); color: var(--oft-amber); }
.oft-icon-btn.neutral { background: var(--oft-chip); color: var(--oft-ink); }
@media (hover: hover) {
  .oft-icon-btn.orange:hover { background: var(--oft-orange); color: #FFFFFF; }
  .oft-icon-btn.amber:hover { background: var(--oft-amber); color: #FFFFFF; }
  .oft-icon-btn.neutral:hover { background: var(--oft-chip-hover); }
}
.oft-icon-btn:active { transform: scale(0.92); }
.oft-icon-btn:focus { outline: none; }
.oft-icon-btn:focus-visible { outline: 2px solid var(--oft-orange); outline-offset: 2px; }

.oft-burger .lines { position: relative; display: block; width: 18px; height: 14px; transition: transform 0.5s cubic-bezier(0.68, -0.4, 0.27, 1.4); }
.oft-burger .lines span { position: absolute; left: 0; width: 100%; height: 2px; border-radius: 2px; background: currentColor; transition: top 0.3s ease 0.1s, transform 0.3s ease, opacity 0.2s ease, width 0.3s ease; }
.oft-burger .lines span:nth-child(1) { top: 0; }
.oft-burger .lines span:nth-child(2) { top: 6px; width: 72%; }
.oft-burger .lines span:nth-child(3) { top: 12px; }
@media (hover: hover) { .oft-burger:hover .lines span:nth-child(2) { width: 100%; } }

.oft-bell .bell-icon { display: grid; place-items: center; }
.oft-bell.has-unread .bell-icon { animation: oftBellRing 1s ease-in-out; transform-origin: 50% 10%; }
.oft-bell.active { background: var(--oft-amber); color: #FFFFFF; }
@keyframes oftBellRing {
  0%, 100% { transform: rotate(0); }
  15% { transform: rotate(14deg); } 30% { transform: rotate(-12deg); }
  45% { transform: rotate(9deg); } 60% { transform: rotate(-6deg); } 75% { transform: rotate(3deg); }
}
.oft-badge {
  position: absolute; top: -6px; right: -6px; height: 18px; min-width: 18px; padding: 0 4px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9px; border: 2px solid var(--oft-bg); background: var(--oft-red); color: #FFFFFF;
  font-size: 10px; font-weight: 700; line-height: 1;
}

/* ชิปข้อมูลทั่วไป (นาฬิกา / จำนวนคิว / ปุ่มเปิดรายการ) */
.oft-chip {
  display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; min-height: 38px;
  border-radius: 999px; border: none; background: var(--oft-chip); color: var(--oft-ink);
  font-family: inherit; font-size: 13px; font-weight: 600; white-space: nowrap;
}
button.oft-chip { cursor: pointer; transition: background 0.2s ease; }
button.oft-chip:hover { background: var(--oft-chip-hover); }
.oft-chip.accent { background: var(--oft-orange-soft); color: var(--oft-orange); font-weight: 700; }
button.oft-chip.accent:hover { background: var(--oft-orange); color: #FFFFFF; }
.oft-chip b { color: var(--oft-orange); font-weight: 800; }

/* ชิปผู้ใช้ */
.oft-user {
  display: flex; align-items: center; gap: 9px; max-width: 250px; padding: 6px 12px 6px 6px;
  border: none; border-radius: 999px; background: var(--oft-chip); color: var(--oft-ink);
  font-family: inherit; cursor: pointer; transition: background 0.2s ease;
}
.oft-user:hover { background: var(--oft-chip-hover); }
.oft-user > svg { flex-shrink: 0; }
.oft-avatar {
  width: 34px; height: 34px; min-width: 34px; display: grid; place-items: center; overflow: hidden;
  border-radius: 50%; background: var(--oft-orange); color: #FFFFFF; font-size: 14px; font-weight: 700;
}
.oft-avatar img { width: 100%; height: 100%; object-fit: cover; }
.oft-user-text { display: flex; flex-direction: column; min-width: 0; text-align: left; }
.oft-user-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oft-user-role { font-size: 11.5px; color: var(--oft-muted); white-space: nowrap; }

@media (max-width: 768px) {
  .oft-bar { min-height: 64px; padding: 0 14px; }
  .oft-burger.is-open { background: var(--oft-orange); color: #FFFFFF; }
  .oft-burger.is-open .lines span { transition: top 0.3s ease, transform 0.3s ease 0.15s, opacity 0.2s ease; }
  .oft-burger.is-open .lines span:nth-child(1) { top: 6px; transform: rotate(45deg); }
  .oft-burger.is-open .lines span:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .oft-burger.is-open .lines span:nth-child(3) { top: 6px; transform: rotate(-45deg); }
}
@media (max-width: 600px) {
  .oft-bar { gap: 8px; }
  .oft-left { gap: 10px; }
  .oft-right { gap: 8px; }
  .oft-brand { gap: 8px; }
  .oft-logo { font-size: 21px; }
  .oft-pill { padding: 5px 9px; font-size: 11.5px; }
  .oft-pill:has(.short) .full { display: none; }
  .oft-hide-phone { display: none; }
  .oft-pill .short { display: inline; }
  .oft-user { padding: 5px; }
  .oft-user-text, .oft-user > svg { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .oft-burger .lines, .oft-burger .lines span { transition: none !important; }
  .oft-pill.pulse .dot::after, .oft-bell.has-unread .bell-icon { animation: none; }
}
`;
