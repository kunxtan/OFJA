import { useState, useEffect, useRef } from 'react';
import { fmtMoney } from '../../lib/format';

// กราฟเส้นแนวโน้มยอดขาย (แบบเดียวกับหน้า Executive) ชี้ที่จุดเพื่อดูยอดขายของช่วงนั้น
export function SalesLineChart({ buckets }) {
  const [hover, setHover] = useState(null);
  // วาดเต็มกล่องที่ CSS กำหนด (หน้าจอใหญ่ = สูงเท่าที่เหลือในหน้า) : วัดขนาดจริงแล้ววาด 1:1 ตัวหนังสือไม่ยืด/หด
  const boxRef = useRef(null);
  const [size, setSize] = useState({ w: 880, h: 300 });
  const data = buckets || [];
  const hasData = data.length > 0;
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(prev => (Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1) ? prev : { w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]); // กล่องว่าง -> กล่องกราฟ เป็นคนละ element ต้องผูกใหม่
  if (!hasData) {
    return <div ref={boxRef} className="od-line-chart empty">ช่วงเวลานี้ยังไม่มีออเดอร์ที่สำเร็จ</div>;
  }
  const narrow = size.w < 520;
  const W = Math.max(size.w, 240), H = Math.max(size.h, 140), L = narrow ? 40 : 52, R = narrow ? 12 : 16, TOP = 12, BOT = 30;
  const gw = W - L - R, gh = H - TOP - BOT;
  const maxValue = Math.max(...data.map(b => b.sales), 1);
  const xAt = (i) => (data.length === 1 ? L + gw / 2 : L + (i / (data.length - 1)) * gw);
  const yAt = (v) => TOP + gh - (v / maxValue) * gh;
  const linePath = data.map((b, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(b.sales)}`).join(' ');
  const areaPath = `${linePath} L ${xAt(data.length - 1)} ${TOP + gh} L ${xAt(0)} ${TOP + gh} Z`;
  // ป้ายแกน X ห่างกันอย่างน้อย ~64px ; ป้ายสุดท้ายแสดงเสมอ จึงซ่อนป้ายก่อนหน้าที่อยู่ใกล้เกินไป
  const slot = data.length > 1 ? gw / (data.length - 1) : gw;
  const labelStep = Math.max(1, Math.ceil(64 / slot));
  const shortNumber = (n) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(Math.round(n));
  const hoverBucket = hover !== null ? data[hover] : null;
  const hoverRatio = hover !== null ? xAt(hover) / W : 0;

  return (
    <div ref={boxRef} className="od-line-chart">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, display: 'block' }} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="ownerAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF724C" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#FF724C" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map(i => {
          const ratio = i / 4;
          const y = TOP + gh * ratio;
          return (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--berry-border)" strokeWidth="1" />
              <text x={L - 12} y={y + 4} textAnchor="end" fontSize="11" fill="var(--berry-text-muted)">{shortNumber(maxValue * (1 - ratio))}</text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#ownerAreaFill)" />
        <path d={linePath} fill="none" stroke="var(--berry-purple)" strokeWidth="2.4" strokeLinejoin="round" />

        {data.map((b, i) => (
          <g key={b.key}>
            {(i === data.length - 1 || (i % labelStep === 0 && (data.length - 1 - i) * slot >= 56)) && (
              <text x={xAt(i)} y={H - 10} textAnchor={data.length > 1 && i === 0 ? 'start' : data.length > 1 && i === data.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--berry-text-muted)">{b.label}</text>
            )}
            <circle cx={xAt(i)} cy={yAt(b.sales)} r={hover === i ? 5.5 : 3} fill={hover === i ? 'var(--berry-purple)' : 'var(--berry-paper)'} stroke="var(--berry-purple)" strokeWidth="2" />
            <rect
              x={xAt(i) - gw / data.length / 2}
              y={TOP}
              width={Math.max(gw / data.length, 10)}
              height={gh}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
              style={{ cursor: 'pointer' }}
            />
          </g>
        ))}

        {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={TOP} y2={TOP + gh} stroke="var(--berry-purple)" strokeDasharray="4 4" strokeWidth="1" />}
        <line x1={L} x2={W - R} y1={TOP + gh} y2={TOP + gh} stroke="var(--berry-border)" />
      </svg>

      {hoverBucket && (
        <div
          className="berry-chart-tooltip"
          style={{
            left: `${hoverRatio * 100}%`,
            transform: hoverRatio > 0.7 ? 'translateX(-92%)' : hoverRatio < 0.3 ? 'translateX(-8%)' : 'translateX(-50%)'
          }}
        >
          <div style={{ color: 'var(--berry-text-dark)', fontWeight: 700, fontSize: '13px' }}>{hoverBucket.label}</div>
          <div style={{ color: 'var(--berry-text-dark)', fontSize: '13px', marginTop: '4px' }}>
            ยอดขาย {fmtMoney(hoverBucket.sales)} บาท · {fmtMoney(hoverBucket.count)} ออเดอร์
          </div>
        </div>
      )}
    </div>
  );
}
