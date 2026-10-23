// กราฟเส้น / โดนัท / bullet ของหน้าฝ่ายบัญชี
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useTapAway } from './ui';
import { STORE_COLORS, RATE_WARN, RATE_ALERT } from '../lib/constants';
import { fmtMoney, fmtRate } from '../lib/format';

/* Line chart — มีเส้น Grid + แกน Y มองเห็นตลอด และ มี Custom Tooltip เมื่อ Hover */
export function BerryLineChart({ data, height = 220, valueFormat, axisFormat, color = '#FF724C' }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const wrapRef = useRef(null);
  const [boxW, setBoxW] = useState(600);
  const isEmpty = !data || data.length === 0;
  // วัดความกว้างจริงของกราฟ เพื่อวาดตามสัดส่วนจริง (ตัวอักษรไม่ถูกบีบบนจอแคบ)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = () => setBoxW(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    apply();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', apply);
      return () => window.removeEventListener('resize', apply);
    }
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isEmpty]);
  useTapAway(wrapRef, () => setHoverIndex(null));

  if (!data || data.length === 0) {
    return <div className="berry-empty-note" style={{ height }}>ยังไม่มีข้อมูล</div>;
  }

  // แกน Y: เลือกจำนวนช่อง (3-6) ที่ทำให้แกนสูงสุดใกล้ค่าสูงสุดของข้อมูลที่สุด ให้พีคอยู่ใกล้ขอบบน
  // ขั้นของแกนปัดเป็นพหุคูณของ unit; ตั้งแต่หลักพัน unit >= 100 เพื่อให้ป้าย k มีทศนิยม 1 ตำแหน่งพอดี (เช่น 1.4k)
  const rawMax = Math.max(1, ...data.map(d => d.value));
  const exp = Math.floor(Math.log10(rawMax));
  const unit = rawMax >= 1000 ? Math.max(100, Math.pow(10, exp - 1)) : Math.max(1, 5 * Math.pow(10, exp - 1));
  let TICKS = 4, niceStep = 0, max = Infinity;
  [4, 5, 3, 6].forEach(n => {
    const step = Math.max(unit, Math.ceil(rawMax / n / unit) * unit);
    if (step * n < max) { TICKS = n; niceStep = step; max = step * n; }
  });
  // ป้ายแกน Y: ตั้งแต่หลักพันใช้ k ทศนิยม 1 ตำแหน่ง เพื่อประหยัดพื้นที่ (tooltip ยังแสดงเต็ม)
  const fmtAxis = axisFormat || ((v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))));
  const w = boxW, h = Math.max(height, 160), padY = 20, padBottom = 30;
  const padX = w < 420 ? 38 : 45;
  const stepX = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + (1 - d.value / max) * (h - padY - padBottom),
    ...d
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${h - padBottom} L ${points[0].x.toFixed(1)} ${h - padBottom} Z` : '';
  const labelEvery = Math.max(1, Math.ceil(data.length / (w < 420 ? 4 : 7)));

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: h, width: '100%' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ overflow: 'visible', display: 'block', maxWidth: '100%' }}>
        <defs>
          <linearGradient id="themeLineArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 1. เส้น Grid และแกน Y */}
        {Array.from({ length: TICKS + 1 }, (_, i) => i / TICKS).map(ratio => {
          const yPos = padY + ratio * (h - padY - padBottom);
          const val = max * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padX} y1={yPos} x2={w - padX} y2={yPos} stroke="rgba(42, 44, 65, 0.12)" strokeDasharray="4 4" />
              <text x={padX - 8} y={yPos + 4} fontSize="11" fill="rgba(42, 44, 65, 0.6)" textAnchor="end">
                {fmtAxis(val)}
              </text>
            </g>
          );
        })}

        {/* 2. กราฟหลัก */}
        <path d={areaPath} fill="url(#themeLineArea)" stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" />

        {/* 3. จุดข้อมูล และพื้นที่รับเมาส์ */}
        {points.map((p, i) => (
          <g key={i}>
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text x={p.x} y={h - 10} fontSize="11" fill="rgba(42, 44, 65, 0.6)" textAnchor="middle">
                {p.label}
              </text>
            )}
            
            <circle 
              cx={p.x} cy={p.y} 
              r={hoverIndex === i ? 5 : 3} 
              fill={hoverIndex === i ? '#FFFFFF' : color}
              stroke={color} 
              strokeWidth={hoverIndex === i ? 2 : 0}
              style={{ transition: 'all 0.2s ease' }} 
            />
            
            <rect
              x={p.x - stepX / 2} y={0} 
              width={stepX || w} height={h} 
              fill="transparent"
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHoverIndex(i); }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHoverIndex(null); }}
              onPointerDown={(e) => { if (e.pointerType !== 'mouse') setHoverIndex(i); }}
              style={{ cursor: 'crosshair' }}
            />
          </g>
        ))}
      </svg>

      {/* 4. Custom Tooltip */}
      {hoverIndex !== null && (
        <div
          style={{
            position: 'absolute',
            left: `calc(${(points[hoverIndex].x / w) * 100}%)`,
            top: `calc(${(points[hoverIndex].y / h) * 100}%)`,
            transform: `translate(-${points[hoverIndex].x / w < 0.14 ? 12 : points[hoverIndex].x / w > 0.86 ? 88 : 50}%, -120%)`,
            background: '#2A2C41',
            color: '#FFFFFF',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(42, 44, 65, 0.2)',
            zIndex: 10,
            transition: 'top 0.1s, left 0.1s'
          }}
        >
          <div style={{ color: '#FDBF50', fontSize: '11px', marginBottom: '2px', fontWeight: 'bold' }}>
            {points[hoverIndex].label}
          </div>
          <div style={{ fontWeight: '700', fontSize: '14px' }}>
            {valueFormat ? valueFormat(points[hoverIndex].value) : points[hoverIndex].value}
          </div>
          <div style={{
            position: 'absolute', bottom: '-4px', left: points[hoverIndex].x / w < 0.14 ? '12%' : points[hoverIndex].x / w > 0.86 ? '88%' : '50%', transform: 'translateX(-50%)',
            width: '0', height: '0', borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid #2A2C41'
          }} />
        </div>
      )}
    </div>
  );
}

// สีของร้าน: ใช้พาเลตเดิม ถ้าร้านเกิน 8 ร้านจะวนสีเดิมในเฉดอ่อน/เข้มขึ้นเพื่อให้ยังแยกกันออก
export const donutShade = (hex, cycle) => {
  if (!cycle) return hex;
  const n = parseInt(hex.slice(1), 16);
  const base = [n >> 16, (n >> 8) & 255, n & 255];
  const mix = cycle % 2 ? [255, 255, 255] : [42, 44, 65];
  return `#${base.map((c, i) => Math.round(c + (mix[i] - c) * 0.38).toString(16).padStart(2, '0')).join('')}`;
};

export const storeColorAt = (i) => donutShade(STORE_COLORS[i % STORE_COLORS.length], Math.floor(i / STORE_COLORS.length));

export const DONUT_PAGE_SIZE = 6;

// เลขหน้าสำหรับ pagination: แสดงทุกหน้าถ้าไม่เกิน 7 หน้า ไม่เช่นนั้นย่อด้วย "…"
export function pagerItems(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const keep = [...new Set([0, count - 1, page - 1, page, page + 1])].filter(p => p >= 0 && p < count).sort((x, y) => x - y);
  const out = [];
  keep.forEach((p, i) => { if (i && p - keep[i - 1] > 1) out.push(`gap-${p}`); out.push(p); });
  return out;
}

/* Donut Chart + รายการร้าน (แบ่งหน้าละ 6 ร้าน)
   - วงกลมและ % คำนวณจาก "ทุกร้าน" เสมอ การเปลี่ยนหน้าเปลี่ยนเฉพาะรายการด้านข้าง
   - สีของร้านเดียวกันทั้งในวงกลม รายการ และ tooltip */
export function BerryDonutChart({ data, valueFormat, height = 240, centerLabel = 'ยอดสุทธิรวม', pageSize = DONUT_PAGE_SIZE, unitLabel = 'ร้านค้า' }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [page, setPage] = useState(0);
  const donutRef = useRef(null);
  useTapAway(donutRef, () => setHoverIndex(null));
  const listId = useRef(`donut-list-${Math.random().toString(36).slice(2, 8)}`).current;
  const itemCount = (data || []).length;
  useEffect(() => { setPage(0); setHoverIndex(null); }, [itemCount]);

  const fmt = (v) => (valueFormat ? valueFormat(v) : v);
  const items = (data || []).map((d, i) => ({ ...d, idx: i, value: Number(d.value || 0), color: d.color || storeColorAt(i) }));
  const total = items.reduce((sum, d) => sum + d.value, 0);
  const pctOf = (v) => (total > 0 ? ((v / total) * 100).toFixed(1) : '0.0');

  if (items.length === 0 || total <= 0) {
    return <div className="berry-empty-note" style={{ minHeight: height }}>ยังไม่มียอดขายในช่วงเวลานี้</div>;
  }

  const size = 190, center = size / 2, radius = 62, strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;
  const arcs = items.filter(d => d.value > 0).map(d => {
    const ratio = d.value / total;
    const arc = { ...d, dashArray: `${ratio * circumference} ${circumference - ratio * circumference}`, offset: -acc * circumference };
    acc += ratio;
    return arc;
  });

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const from = safePage * pageSize;
  const pageItems = items.slice(from, from + pageSize);
  const active = hoverIndex !== null ? items[hoverIndex] : null;
  const goPage = (p) => { setPage(Math.max(0, Math.min(pageCount - 1, p))); setHoverIndex(null); };
  const jumpToItem = (idx) => setPage(Math.floor(idx / pageSize));
  const mouseOnly = (fn) => (e) => { if (e.pointerType === 'mouse') fn(); };
  const touchSelect = (idx) => (e) => {
    if (e.pointerType === 'mouse') return;
    setHoverIndex(cur => (cur === idx ? null : idx));
    jumpToItem(idx);
  };

  return (
    <div ref={donutRef} className="berry-donut">
    <div className="berry-donut-wrap" style={{ minHeight: height }}>
      <div className="berry-donut-chart" role="img" aria-label={`สัดส่วนยอดขายสุทธิของ ${items.length} ${unitLabel} รวม ${fmt(total)}`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={center} cy={center} r={radius} fill="transparent" stroke="var(--berry-border)" strokeWidth={strokeWidth} opacity="0.45" />
          <g transform={`rotate(-90 ${center} ${center})`}>
            {arcs.map(arc => (
              <circle
                key={arc.key ?? arc.idx}
                cx={center} cy={center} r={radius} fill="transparent"
                stroke={arc.color}
                strokeWidth={hoverIndex === arc.idx ? strokeWidth + 5 : strokeWidth}
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
                style={{ transition: 'stroke-width 0.18s ease, opacity 0.18s ease', cursor: 'pointer', opacity: hoverIndex === null || hoverIndex === arc.idx ? 1 : 0.35 }}
                onPointerEnter={mouseOnly(() => setHoverIndex(arc.idx))}
                onPointerLeave={mouseOnly(() => setHoverIndex(null))}
                onPointerDown={touchSelect(arc.idx)}
                onClick={() => jumpToItem(arc.idx)}
              />
            ))}
          </g>
        </svg>
        <div className="berry-donut-center">
          <span className="berry-donut-center-label" title={active ? active.label : undefined}>{active ? active.label : centerLabel}</span>
          <span className="berry-donut-center-value">{fmt(active ? active.value : total)}</span>
          <span className="berry-donut-center-sub" style={active ? { color: active.color, fontWeight: 700 } : undefined}>
            {active ? `${pctOf(active.value)}%` : `${items.length} ${unitLabel}`}
          </span>
        </div>
      </div>

      <div className="berry-donut-side">
        <ul id={listId} className="berry-donut-list" style={pageCount > 1 ? { minHeight: pageSize * 34 } : undefined}>
          {pageItems.map(it => (
            <li
              key={it.key ?? it.idx}
              tabIndex={0}
              className={`berry-donut-row${hoverIndex === it.idx ? ' is-active' : ''}${it.value <= 0 ? ' is-zero' : ''}`}
              aria-label={`${it.label} ยอดสุทธิ ${fmt(it.value)} ${pctOf(it.value)}%`}
              onPointerEnter={mouseOnly(() => setHoverIndex(it.idx))}
              onPointerLeave={mouseOnly(() => setHoverIndex(null))}
              onPointerDown={(e) => { if (e.pointerType !== 'mouse') setHoverIndex(cur => (cur === it.idx ? null : it.idx)); }}
              onFocus={() => setHoverIndex(it.idx)}
              onBlur={() => setHoverIndex(cur => (cur === it.idx ? null : cur))}
            >
              <span className="dot" style={{ backgroundColor: it.color }} />
              <span className="name" title={it.label}>{it.label}</span>
              <span className="amt">{fmt(it.value)}</span>
              <span className="pct">{pctOf(it.value)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>

    {/* pagination: อยู่ใต้รายการร้าน และจัดกึ่งกลางทั้งการ์ด */}
    {pageCount > 1 && (
      <nav className="berry-pager" aria-label="เปลี่ยนหน้ารายชื่อร้านค้า" aria-controls={listId}>
        <span className="berry-pager-info" aria-live="polite">แสดง {from + 1}–{from + pageItems.length} จาก {items.length} {unitLabel}</span>
        <div className="berry-pager-controls">
          <button type="button" className="berry-pager-btn nav" disabled={safePage === 0} onClick={() => goPage(safePage - 1)} aria-label="หน้าก่อนหน้า">‹ ก่อนหน้า</button>
          {pagerItems(safePage, pageCount).map(p => (typeof p === 'string'
            ? <span key={p} className="berry-pager-gap" aria-hidden="true">…</span>
            : <button type="button" key={p} className={`berry-pager-btn${p === safePage ? ' active' : ''}`} aria-label={`หน้า ${p + 1}`} aria-current={p === safePage ? 'page' : undefined} onClick={() => goPage(p)}>{p + 1}</button>
          ))}
          <button type="button" className="berry-pager-btn nav" disabled={safePage === pageCount - 1} onClick={() => goPage(safePage + 1)} aria-label="หน้าถัดไป">ถัดไป ›</button>
        </div>
      </nav>
    )}
    </div>
  );
}

/* Bullet chart */
export const BULLET_LEVEL = {
  bad: { text: `แจ้งเตือน (> ${RATE_ALERT}%)`, color: 'var(--berry-red)' },
  warn: { text: `เฝ้าระวัง (${RATE_WARN}-${RATE_ALERT}%)`, color: 'var(--berry-amber)' },
  ok: { text: `ปกติ (< ${RATE_WARN}%)`, color: 'var(--berry-green)' },
};

// data: [{ label, value (rate %), status, cancelled, total }]
// Tooltip: ชี้เมาส์ / แตะ (จอสัมผัส) / โฟกัสด้วยคีย์บอร์ด ที่แถวของร้าน — วางแบบ fixed และบีบให้อยู่ในหน้าจอเสมอ จึงไม่ถูกตัดโดยกรอบกราฟ
export function BerryBulletChart({ data, target = RATE_ALERT, warn = RATE_WARN }) {
  const max = Math.max(20, target + 5, ...data.map(d => (typeof d.value === 'number' ? d.value : 0)));
  const pct = (v) => `${Math.min(100, ((v || 0) / max) * 100)}%`;
  const wrapRef = useRef(null);
  const tipRef = useRef(null);
  const [active, setActive] = useState(null);   // { i, x, y } จุดอ้างอิงเป็นพิกเซลของหน้าจอ
  const [pos, setPos] = useState(null);         // { left, top } หลังวัดขนาด tooltip แล้ว
  const hide = () => { setActive(null); setPos(null); };
  useTapAway(wrapRef, hide);

  // ปิดเมื่อเลื่อนหน้า/ปรับขนาด/กด Esc (ตำแหน่ง fixed จะเพี้ยนถ้าไม่ปิด)
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); document.removeEventListener('keydown', onKey); };
  }, [active]);

  // วาง tooltip เหนือจุดอ้างอิง (ถ้าไม่พอให้ไปอยู่ด้านล่าง) และบีบไม่ให้เกินขอบจอ
  useLayoutEffect(() => {
    if (!active || !tipRef.current) return;
    const M = 8;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const { width: w, height: h } = tipRef.current.getBoundingClientRect();
    let left = active.x - w / 2;
    left = Math.max(M, Math.min(left, vw - w - M));
    let top = active.y - h - 14;
    if (top < M) top = active.y + 18;
    top = Math.max(M, Math.min(top, vh - h - M));
    setPos({ left, top });
  }, [active]);

  const showFromEvent = (i, e) => setActive({ i, x: e.clientX, y: e.clientY });
  const showFromRow = (i, el) => { const r = el.getBoundingClientRect(); setActive({ i, x: r.left + r.width / 2, y: r.top + r.height / 2 }); };
  const cur = active ? data[active.i] : null;
  const level = cur && cur.status && BULLET_LEVEL[cur.status];

  return (
    <div className="berry-bullet-list" ref={wrapRef}>
      {data.length === 0 ? (
        <div className="berry-empty-note">ยังไม่มีข้อมูล</div>
      ) : data.map((d, i) => (
        <div
          className={`berry-bullet-row${active && active.i === i ? ' is-active' : ''}`}
          key={i}
          tabIndex={0}
          aria-describedby={active && active.i === i ? 'berry-bullet-tip' : undefined}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') showFromEvent(i, e); }}
          onPointerMove={(e) => { if (e.pointerType === 'mouse') showFromEvent(i, e); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') hide(); }}
          onPointerDown={(e) => { if (e.pointerType !== 'mouse') { if (active && active.i === i) hide(); else showFromEvent(i, e); } }}
          onFocus={(e) => {
            // แสดงเฉพาะเมื่อโฟกัสด้วยคีย์บอร์ด (การคลิก/แตะใช้ pointer ด้านบน กันแสดงซ้อน/กระพริบ)
            let kb = true;
            try { kb = e.currentTarget.matches(':focus-visible'); } catch (err) { kb = true; }
            if (kb) showFromRow(i, e.currentTarget);
          }}
          onBlur={(e) => { if (!wrapRef.current || !wrapRef.current.contains(e.relatedTarget)) hide(); }}
        >
          <div className="berry-bullet-label" title={d.label}>{d.label}</div>
          <div className="berry-bullet-track">
            <div className="berry-bullet-zones">
              <div className="berry-bullet-zone zone-ok" style={{ width: pct(warn) }} />
              <div className="berry-bullet-zone zone-warn" style={{ width: `calc(${pct(target)} - ${pct(warn)})` }} />
              <div className="berry-bullet-zone zone-bad" style={{ width: `calc(100% - ${pct(target)})` }} />
            </div>
            <div
              className="berry-bullet-bar"
              style={{ width: d.value === null || d.value === undefined ? '0%' : pct(d.value), background: d.status === 'bad' ? 'var(--berry-red)' : d.status === 'warn' ? 'var(--berry-amber)' : 'var(--berry-green)' }}
            />
            <div className="berry-bullet-target" style={{ left: pct(target) }} title={`เกณฑ์แจ้งเตือน ${target}%`} />
          </div>
          <div className="berry-bullet-value">{fmtRate(d.value)}</div>
        </div>
      ))}

      {cur && (
        <div
          ref={tipRef}
          id="berry-bullet-tip"
          role="tooltip"
          className="berry-bullet-tip"
          style={{ left: pos ? pos.left : 0, top: pos ? pos.top : 0, visibility: pos ? 'visible' : 'hidden' }}
        >
          <div className="tip-store">{cur.label}</div>
          <div className="tip-grid">
            <span>อัตราการยกเลิก</span><b>{fmtRate(cur.value)}</b>
            <span>ออเดอร์ที่ยกเลิก</span><b>{fmtMoney(cur.cancelled)} ออเดอร์</b>
            <span>ออเดอร์ที่บันทึกทั้งหมด</span><b>{fmtMoney(cur.total)} ออเดอร์</b>
          </div>
          {level ? (
            <div className="tip-level"><i style={{ background: level.color }} />{level.text}</div>
          ) : (
            <div className="tip-level muted">ยังไม่มีข้อมูลให้คำนวณ (N/A)</div>
          )}
        </div>
      )}
    </div>
  );
}
