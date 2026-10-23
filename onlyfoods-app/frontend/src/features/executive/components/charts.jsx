import { useState } from 'react';
import { T, tooltipStyle, captionStyle } from '../theme';
import { money, shortNumber } from '../lib/format';
import { bucketExtremes } from '../lib/sales';
import { EmptyState } from './ui';

// ===== กราฟและตัวเลือกสำหรับแสดงข้อมูลยอดขาย =====
export function SalesLineChart({ buckets, showStoreDetail = true }) {
    const [hover, setHover] = useState(null);
    const data = buckets || [];
    if (!data.length)
        return <EmptyState text="ช่วงเวลานี้ยังไม่มีออเดอร์ที่สำเร็จ"/>;
    const W = 880;
    const H = 320;
    const L = 66;
    const R = 22;
    const TOP = 22;
    const BOT = 46;
    const gw = W - L - R;
    const gh = H - TOP - BOT;
    const maxValue = Math.max(...data.map((b) => b.sales), 1);
    const xAt = (i) => (data.length === 1 ? L + gw / 2 : L + (i / (data.length - 1)) * gw);
    const yAt = (v) => TOP + gh - (v / maxValue) * gh;
    const linePath = data.map((b, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(b.sales)}`).join(' ');
    const areaPath = `${linePath} L ${xAt(data.length - 1)} ${TOP + gh} L ${xAt(0)} ${TOP + gh} Z`;
    const labelStep = Math.max(1, Math.ceil(data.length / 10));
    const hoverBucket = hover !== null ? data[hover] : null;
    const extremes = hoverBucket ? bucketExtremes(hoverBucket) : { best: null, worst: null };
    return (<div style={{ position: 'relative', marginTop: '10px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="ofAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.primary} stopOpacity="0.26"/>
            <stop offset="100%" stopColor={T.primary} stopOpacity="0.02"/>
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((i) => {
            const ratio = i / 4;
            const y = TOP + gh * ratio;
            return (<g key={i}>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke={T.line} strokeWidth="1"/>
              <text x={L - 12} y={y + 4} textAnchor="end" fontSize="11" fill={T.muted}>
                {shortNumber(maxValue * (1 - ratio))}
              </text>
            </g>);
        })}

        <path d={areaPath} fill="url(#ofAreaFill)"/>
        <path d={linePath} fill="none" stroke={T.primary} strokeWidth="2.4" strokeLinejoin="round"/>

        {data.map((b, i) => (<g key={b.key}>
            {i % labelStep === 0 || i === data.length - 1 ? (<text x={xAt(i)} y={H - 16} textAnchor="middle" fontSize="11" fill={T.muted}>
                {b.label}
              </text>) : null}
            <circle cx={xAt(i)} cy={yAt(b.sales)} r={hover === i ? 5.5 : 3} fill={hover === i ? T.primary : T.surface} stroke={T.primary} strokeWidth="2"/>
            <rect x={xAt(i) - gw / Math.max(data.length, 1) / 2} y={TOP} width={Math.max(gw / Math.max(data.length, 1), 10)} height={gh} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} style={{ cursor: 'pointer' }}/>
          </g>))}

        {hover !== null && (<line x1={xAt(hover)} x2={xAt(hover)} y1={TOP} y2={TOP + gh} stroke={T.primary} strokeDasharray="4 4" strokeWidth="1"/>)}
        <line x1={L} x2={W - R} y1={TOP + gh} y2={TOP + gh} stroke={T.line}/>
      </svg>

      {hoverBucket && (<div style={{
                ...tooltipStyle,
                left: `${(xAt(hover) / W) * 100}%`,
                transform: xAt(hover) / W > 0.7
                    ? 'translateX(-92%)'
                    : xAt(hover) / W < 0.3
                        ? 'translateX(-8%)'
                        : 'translateX(-50%)'
            }}>
          <div style={{ color: T.ink, fontWeight: 700, fontSize: '13px' }}>
            {hoverBucket.label}
          </div>
          <div style={{ color: T.text, fontSize: '13px', marginTop: '4px' }}>
            ยอดขาย {money(hoverBucket.sales)} บาท · {money(hoverBucket.count)} ออเดอร์
          </div>
          {showStoreDetail && (<div style={{ marginTop: '7px', borderTop: `1px solid ${T.line}`, paddingTop: '7px' }}>
              {extremes.best ? (<div style={{ fontSize: '12.5px', color: T.text }}>
                  ขายดีสุด: <strong>{extremes.best.name}</strong> {money(extremes.best.sales)} บาท
                </div>) : (<div style={{ fontSize: '12.5px', color: T.muted }}>ช่วงนี้ยังไม่มียอดขาย</div>)}
              {extremes.worst && (<div style={{ fontSize: '12.5px', color: T.muted, marginTop: '2px' }}>
                  น้อยสุด: {extremes.worst.name} {money(extremes.worst.sales)} บาท
                </div>)}
            </div>)}
        </div>)}
    </div>);
}

export function StoreDonutChart({ rows }) {
    const [hoveredStore, setHoveredStore] = useState(null);
    const raw = (rows || []).filter((r) => Number(r.sales) > 0);
    if (!raw.length)
        return <EmptyState text="ช่วงเวลานี้ยังไม่มียอดขาย"/>;
    const top = raw.slice(0, 8);
    const restSales = raw.slice(8).reduce((sum, r) => sum + Number(r.sales || 0), 0);
    const list = restSales > 0
        ? [...top, { StoreId: 'other', StoreName: 'ร้านอื่น ๆ', sales: restSales }]
        : top;
    const total = list.reduce((sum, r) => sum + Number(r.sales || 0), 0) || 1;
    const COLORS = ['#FF724C', '#FDBF50', '#2A2C41', '#FF9E84', '#FFD98C', '#585B78', '#E8552D', '#D19A28', '#B9BCCD'];
    let cumulative = 0;
    const gradientStops = list.map((r, i) => {
        const start = cumulative;
        cumulative += (Number(r.sales || 0) / total) * 100;
        return `${COLORS[i % COLORS.length]} ${start}% ${cumulative}%`;
    }).join(', ');
    const hoveredShare = hoveredStore ? (Number(hoveredStore.sales || 0) / total) * 100 : null;
    const hoverDonut = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy);
        if (distance < rect.width * 0.327 || distance > rect.width / 2) {
            setHoveredStore(null);
            return;
        }
        const percent = ((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360) / 3.6;
        let sum = 0;
        const match = list.find((r) => {
            sum += (Number(r.sales || 0) / total) * 100;
            return percent <= sum;
        });
        setHoveredStore(match || list[list.length - 1]);
    };
    return (<div style={{display: 'flex',flexWrap: 'wrap',gap: '18px',alignItems: 'center',marginTop: '8px',width: '100%',minWidth:0,overflow: 'hidden'}}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '250px', margin: '0 auto', flex: '1 1 220px', minWidth: 0, aspectRatio: '1 / 1' }}>
        <div aria-label="สัดส่วนยอดขายแยกร้าน" onMouseMove={hoverDonut} onMouseLeave={() => setHoveredStore(null)} style={{ position: 'absolute', width: '87%', aspectRatio: '1 / 1', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: `conic-gradient(${gradientStops})`, cursor: 'pointer' }}>
          <div style={{ position: 'absolute', width: '65.5%', aspectRatio: '1 / 1', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: T.surface, pointerEvents: 'none' }}/>
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center', padding: '0 48px' }}>
          {hoveredStore ? (<div>
            <div style={{ color: T.ink, fontSize: '12px', fontWeight: 700, lineHeight: 1.35 }}>{hoveredStore.StoreName}</div>
            <strong style={{ display: 'block', color: T.ink, fontSize: '20px', marginTop: '4px' }}>{money(hoveredStore.sales)}</strong>
            <span style={{ color: T.muted, fontSize: '11.5px' }}>บาท · {hoveredShare.toFixed(1)}%</span>
          </div>) : (<div>
            <div style={{ ...captionStyle, margin: 0 }}>ยอดขายรวม</div>
            <strong style={{ display: 'block', color: T.ink, fontSize: '21px', marginTop: '3px' }}>{money(total)}</strong>
            <span style={{ color: T.muted, fontSize: '12px' }}>บาท</span>
          </div>)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', minWidth: 0, flex: '1 1 240px', width: '100%', overflow: 'hidden' }}>
        {list.map((r, i) => {
            const share = ((+r.sales || 0) / total) * 100;
            const active = hoveredStore && String(hoveredStore.StoreId ?? hoveredStore.StoreName) === String(r.StoreId ?? r.StoreName);
            return (<div key={r.StoreId ?? r.StoreName} onMouseEnter={() => setHoveredStore(r)} onMouseLeave={() => setHoveredStore(null)} style={{ display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr) minmax(46px, auto)', gap: '8px', alignItems: 'center', width: '100%', minWidth: 0, padding: '3px 4px', borderRadius: '6px', background: active ? T.primarySoft : 'transparent', cursor: 'pointer' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[i % COLORS.length] }}/>
              <span style={{ color: active ? T.ink : T.text, fontSize: '12.5px', fontWeight: active ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.StoreName}</span>
              <span style={{ color: T.ink, fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right' }}>{share.toFixed(1)}%</span>
            </div>);
        })}
      </div>
    </div>);
}

export function MenuRankList({ rows, tone = 'primary', emptyText }) {
    if (!rows.length)
        return <EmptyState text={emptyText || 'ยังไม่มีข้อมูลเมนู'} minHeight="120px"/>;
    const maxValue = Math.max(...rows.map((r) => r.qty), 1);
    return (<div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
      {rows.map((r) => (<div key={r.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <span style={{ color: T.text, fontSize: '13px' }}>{r.name}</span>
            <strong style={{ color: T.ink, fontSize: '13px', whiteSpace: 'nowrap' }}>
              {money(r.qty)} รายการ
            </strong>
          </div>
          <div style={{ height: '8px', background: T.trackSoft, borderRadius: '999px', marginTop: '5px' }}>
            <div style={{
                height: '100%',
                width: `${Math.max((r.qty / maxValue) * 100, 3)}%`,
                borderRadius: '999px',
                background: tone === 'primary' ? T.primary : T.accent
            }}/>
          </div>
        </div>))}
    </div>);
}
