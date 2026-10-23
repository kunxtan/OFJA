// ชิ้นส่วนหน้าจอพื้นฐานของหน้าเจ้าของร้าน (ไอคอน ป้าย หัวหน้า skeleton ตัวเลขเปรียบเทียบ)
import { useEffect } from 'react';

// --- Icons ---
export function Icon({ name, size = 20 }) {
  const paths = {
    dashboard: <><path d="M4 4h6v8H4z" /><path d="M4 16h6v4H4z" /><path d="M14 12h6v8h-6z" /><path d="M14 4h6v4h-6z" /></>,
    menu: <><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></>,
    cancel: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 12l6 0" /></>,
    history: <><path d="M12 8l0 4l2 2" /><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" /></>,
    check: <><path d="M5 12l5 5l10 -10" /></>,
    power: <><path d="M7 6a7.75 7.75 0 1 0 10 0" /><line x1="12" y1="4" x2="12" y2="12" /></>,
    settings: <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543 .94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543 .826-3.31 2.37-2.37c1 .608 2.296 .07 2.572-1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></>,
    clock: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 7v5l3 3" /></>,
    flame: <><path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z" /></>,
    bell: <><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/></>,
    user: <><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></>,
    logout: <><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></>,
    plus: <><path d="M12 5l0 14" /><path d="M5 12l14 0" /></>,
    crop: <><path d="M8 5v10a1 1 0 0 0 1 1h10" /><path d="M5 8h10a1 1 0 0 1 1 1v10" /></>,
    trend: <><path d="M3 17l6 -6l4 4l8 -8" /><path d="M14 7l7 0l0 7" /></>,
    arrowUp: <><path d="M12 5l0 14" /><path d="M18 11l-6 -6" /><path d="M6 11l6 -6" /></>,
    arrowDown: <><path d="M12 5l0 14" /><path d="M18 13l-6 6" /><path d="M6 13l6 6" /></>,
    arrowRight: <><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></>,
    receipt: <><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2" /><path d="M9 7h6" /><path d="M9 11h6" /><path d="M13 15h2" /></>,
    percent: <><path d="M17 17m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M7 7m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M6 18l12 -12" /></>,
    coin: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M14.8 9a2 2 0 0 0 -1.8 -1h-2a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4h-2a2 2 0 0 1 -1.8 -1" /><path d="M12 7v10" /></>,
    pie: <><path d="M10 3.2a9 9 0 1 0 10.8 10.8a1 1 0 0 0 -1 -1h-6.8a2 2 0 0 1 -2 -2v-7a.9 .9 0 0 0 -1 -.8" /><path d="M15 3.5a9 9 0 0 1 5.5 5.5h-4.5a1 1 0 0 1 -1 -1v-4.5" /></>,
    award: <><path d="M12 9m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0" /><path d="M12 15l3.4 5.89l1.598 -3.233l3.598 .232l-3.4 -5.889" /><path d="M6.802 12l-3.4 5.89l3.598 -.233l1.598 3.232l3.4 -5.889" /></>,
    grid: <><path d="M4 4h6v6h-6z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6h-6z" /><path d="M14 14h6v6h-6z" /></>,
    list: <><path d="M9 6l11 0" /><path d="M9 12l11 0" /><path d="M9 18l11 0" /><path d="M5 6l0 .01" /><path d="M5 12l0 .01" /><path d="M5 18l0 .01" /></>,
    close: <><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></>,
    upload: <><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 9l5 -5l5 5" /><path d="M12 4l0 12" /></>,
    search: <><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" /></>,
    box: <><path d="M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9l8 -4.5" /><path d="M12 12l8 -4.5" /><path d="M12 12v9" /><path d="M12 12l-8 -4.5" /></>,
    soldout: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M5.7 5.7l12.6 12.6" /></>,
    photo: <><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></>,
    trash: <><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></>,
    edit: <><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></>,
    users: <><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></>,
    star: <><path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z" /></>,
    alert: <><path d="M12 9v2m0 4v.01M5.07 19H18.93c1.93 0 2.89-2.34 1.53-3.71L13.53 4.29c-.77-1.34-2.29-1.34-3.06 0L3.54 15.29c-1.36 1.37-.4 3.71 1.53 3.71z"/></>,
    calendar: <><path d="M7 3v4M17 3v4M3 9h18M5 5h14v16H5z" /></>,
    phone: <><path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" /></>,
    mail: <><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z" /><path d="M3 7l9 6l9 -6" /></>,
    key: <><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z" /><path d="M15 9h.01" /></>,
    lock: <><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></>,
    eye: <><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></>,
    eyeOff: <><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></>,
    activity: <><path d="M3 12h4l3 8l4 -16l3 8h4" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function Badge({ tone, children }) {
  return <span className={`berry-badge tone-${tone}`}>{children}</span>;
}

// หัวหน้าแบบเดียวกันทุกหน้า: ชื่อหน้า + คำอธิบาย + ปุ่ม/ข้อมูลด้านขวา
export function PageHeader({ title, subtitle, icon, children }) {
  return (
    <div className="op-page-head">
      <div className="op-page-title">
        {icon && <span className="op-page-icon"><Icon name={icon} size={22} /></span>}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children && <div className="op-page-actions">{children}</div>}
    </div>
  );
}

// กล่องเทาวิ่งระหว่างโหลดข้อมูลครั้งแรก
export function Skeleton({ height = 16, width = '100%', radius = 8, style }) {
  return <span className="op-skel" style={{ height, width, borderRadius: radius, ...style }} />;
}

// ป้ายเปรียบเทียบกับช่วงก่อนหน้า (▲ เขียว / ▼ แดง ; invert = ยิ่งน้อยยิ่งดี เช่นการยกเลิก)
export function DeltaChip({ delta, label, suffix = '%', invert = false, solid = false, hasPreviousData, hint }) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) {
    return <div className={`od-delta-empty ${solid ? 'on-solid' : ''}`}>{hint || (hasPreviousData === false ? 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ' : 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ')}</div>;
  }
  const flat = Math.abs(delta) < 0.05;
  const good = invert ? delta <= 0 : delta >= 0;
  const tone = flat ? 'flat' : good ? 'up' : 'down';
  const abs = Math.abs(delta);
  return (
    <div className={`od-delta ${tone} ${solid ? 'on-solid' : ''}`}>
      <Icon name={flat ? 'arrowRight' : delta > 0 ? 'arrowUp' : 'arrowDown'} size={13} />
      {delta < 0 ? '-' : ''}{Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(1)}{suffix}
      <span>{label}</span>
    </div>
  );
}

// aside = ตัวเลขรองด้านขวาในการ์ดเดียวกัน { value, label } (เช่น จำนวนยกเลิก + อัตราการยกเลิก)
export function KpiSmall({ tone, icon, value, unit, label, aside, className = '', children }) {
  return (
    <div className={`od-kpi ${className}`}>
      <div className="od-kpi-main">
        <div className={`od-kpi-icon tone-${tone}`}><Icon name={icon} size={20} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="od-kpi-value">{value}{unit && <small>{unit}</small>}</div>
          <div className="od-kpi-label">{label}</div>
        </div>
        {aside && (
          <div className="od-kpi-aside">
            <div className={`od-kpi-value tone-${tone}`}>{aside.value}</div>
            <div className="od-kpi-label">{aside.label}</div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function useEscapeToClose(onClose, disabled) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !disabled) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, disabled]);
}
