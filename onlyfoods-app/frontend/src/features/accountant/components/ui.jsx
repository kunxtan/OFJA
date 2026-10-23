// ชิ้นส่วนหน้าจอพื้นฐานของหน้าฝ่ายบัญชี + hook ช่วยจอเล็ก
import { useEffect, useLayoutEffect } from 'react';

/* ---------------- SVG Icon Helper ---------------- */
export function Icon({ name, size = 18, color = 'currentColor' }) {
  const paths = {
    berry: <><circle cx="6" cy="12" r="3" fill="#FF724C"/><circle cx="12" cy="7" r="3" fill="#FDBF50"/><circle cx="18" cy="12" r="3" fill="#FF724C"/><circle cx="12" cy="17" r="3" fill="#2A2C41"/></>,
    dashboard: <><path d="M4 4h6v8H4z" /><path d="M4 16h6v4H4z" /><path d="M14 12h6v8h-6z" /><path d="M14 4h6v4h-6z" /></>,
    sales: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>,
    cancel: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    refund: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v8M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2 0 2.6 5 1.4 5 4 0 1.2-1.1 2-2.5 2-1.1 0-2.1-.6-2.5-1.5" /></>,
    close: <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>,
    audit: <><path d="M9 12h6M9 16h6M9 8h6" /><rect x="4" y="3" width="16" height="18" rx="2" /></>,
    report: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
    menu: <><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></>,
    settings: <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543 .94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543 .826-3.31 2.37-2.37c1 .608 2.296 .07 2.572-1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></>,
    logout: <><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></>,
    dots: <><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></>,
    arrowUp: <><path d="M7 17L17 7M17 7H7M17 7V17"/></>,
    arrowDown: <><path d="M7 7l10 10M17 17H7M17 17V7"/></>,
    wallet: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    bag: <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    check_icon: <><path d="M5 12l5 5l10 -10" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.berry}</svg>;
}

export function Badge({ tone, children }) {
  return <span className={`berry-badge tone-${tone}`}>{children}</span>;
}

/* ============================================================
   FOODKA THEME COMPONENTS
   ============================================================ */

export function BerryStatCard({ label, value, tone, delta, deltaSuffix = '%', invertDelta = false, compareLabel, primary, bgTone }) {
  let deltaEl = null;
  
  // เช็คว่าพื้นหลังเป็นสีทึบหรือไม่
  const isDarkBg = bgTone === 'orange' || bgTone === 'dark';

  if (delta === null) {
  deltaEl = (
    <div className="berry-stat-delta">
      <span>N/A</span>
      {compareLabel && (
        <span
          className="berry-stat-delta-caption"
          style={{
            color: isDarkBg ? '#f3f3f3' : 'var(--berry-text-muted)'
          }}
        >
          ไม่มีข้อมูลช่วงก่อนหน้า
        </span>
      )}
    </div>
  );
} else if (delta !== undefined) {
  const isFlat = delta === 0;
  const isPositive = delta > 0;
  const isGood = isFlat ? null : (invertDelta ? !isPositive : isPositive);

  let color = isFlat
    ? 'var(--berry-text-muted)'
    : isGood
      ? 'var(--berry-green)'
      : 'var(--berry-red)';

  if (isDarkBg) {
    color = isFlat
      ? 'rgba(255,255,255,0.7)'
      : isGood
        ? '#a7f3d0'
        : '#fecaca';
  }

  deltaEl = (
    <div className="berry-stat-delta" style={{ color }}>
      {!isFlat && (
        <Icon
          name={isPositive ? 'arrowUp' : 'arrowDown'}
          size={12}
          color={color}
        />
      )}
      <span>{isFlat ? 'ไม่เปลี่ยนแปลง' : `${Math.abs(delta)}${deltaSuffix}`}</span>
      {compareLabel && (
        <span
          className="berry-stat-delta-caption"
          style={isDarkBg ? { color: 'rgba(255,255,255,0.6)' } : {}}
        >
          {compareLabel}
        </span>
      )}
    </div>
  );
  }

  // สร้าง Style ให้แต่ละการ์ดตาม bgTone ที่กำหนด
  let cardStyle = {};
  let valStyle = tone ? { color: `var(--berry-${tone})` } : {};
  let labelStyle = {};

  if (bgTone === 'orange') {
    cardStyle = { backgroundColor: '#FF724C', color: '#FFFFFF', borderColor: '#FF724C' };
    valStyle = { color: '#FFFFFF' };
    labelStyle = { color: 'rgba(255, 255, 255, 0.9)' };
  } else if (bgTone === 'dark') {
    cardStyle = { backgroundColor: '#2A2C41', color: '#FFFFFF', borderColor: '#2A2C41' };
    valStyle = { color: '#FFFFFF' };
    labelStyle = { color: 'rgba(255, 255, 255, 0.9)' };
  }

  return (
    <div className={`berry-small-card berry-stat-card ${primary && !isDarkBg ? 'primary' : ''}${bgTone ? ` bg-${bgTone}` : ''}`} style={cardStyle}>
      <div className="berry-stat-value" style={valStyle}>{value}</div>
      <div className="berry-stat-label" style={labelStyle}>{label}</div>
      {deltaEl}
    </div>
  );
}

/* ปุ่ม ดูเพิ่มเติม / แสดงน้อยลง สำหรับส่วนที่ข้อมูลเยอะ */
export function ShowMoreToggle({ expanded, onToggle, hiddenCount, controls, moreLabel = 'ดูเพิ่มเติม', lessLabel = 'แสดงน้อยลง' }) {
  return (
    <button type="button" className="berry-showmore" aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
      <span>{expanded ? lessLabel : `${moreLabel} (${hiddenCount})`}</span>
      <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
    </button>
  );
}

/* ============================================================
   RESPONSIVE / ACCESSIBILITY HELPERS
   ============================================================ */
// แตะนอกกราฟเพื่อปิด tooltip (จอสัมผัสไม่มี hover)
export function useTapAway(ref, onAway) {
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onAway(); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [ref, onAway]);
}

export const A11Y_CLICKABLE = '.berry-nav-item, .berry-user-chip, .dropdown-item, .berry-select-card, .alert-link, .berry-link, .berry-row-click';

// ทำให้ element ที่คลิกได้ใช้คีย์บอร์ดได้ (Enter/Space) และใส่ data-label ให้ตารางที่เปลี่ยนเป็นการ์ดบนมือถือ
// ทำที่เดียวแทนการแก้ทีละจุด (ไม่กระทบ logic เดิม)
export function useResponsiveEnhancements(rootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll(A11Y_CLICKABLE).forEach(el => {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (el.tagName !== 'TR' && !el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (el.classList.contains('berry-nav-item')) {
        if (el.classList.contains('active')) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
      }
    });
    root.querySelectorAll('table.stack-sm').forEach(table => {
      const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [...tr.children];
        if (cells.length !== heads.length) return;
        cells.forEach((td, i) => { if (td.getAttribute('data-label') !== heads[i]) td.setAttribute('data-label', heads[i]); });
      });
    });
    if (!root.__a11yBound) {
      root.__a11yBound = true;
      root.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest && e.target.closest(A11Y_CLICKABLE);
        if (el && el === e.target) { e.preventDefault(); el.click(); }
      });
    }
  });
}
