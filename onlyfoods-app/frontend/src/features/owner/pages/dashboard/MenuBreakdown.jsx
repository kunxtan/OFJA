import { useState } from 'react';
import { fmtMoney } from '../../lib/format';
import { Icon } from '../../components/ui';

export const MENU_COLORS = ['#FF724C', '#FDBF50', '#2A2C41', '#17A673', '#FF9E84', '#585B78', '#E8552D', '#B9BCCD'];

// เมนูขายดี + สัดส่วนยอดขาย ในการ์ดเดียว: วงกลมเป็นหลัก รายการข้าง ๆ เป็นคำอธิบายสี
// 5 อันดับแรก (เรียงตามจำนวนจาน) + เมนูอื่น ๆ ; ชี้ที่วงกลมหรือรายการ ไฮไลต์อีกฝั่ง
export const MENU_TOP_COUNT = 5;

export const MENU_OTHER_COLOR = '#B9BCCD';

// สีอ่อน: ตัวเลข % บนวงกลมใช้สีเข้มแทนสีขาว
export const MENU_LIGHT_COLORS = new Set(['#FDBF50', '#FF9E84', MENU_OTHER_COLOR]);

// ชิ้นที่เล็กกว่านี้ (%) ไม่แสดงตัวเลขบนวงกลม (ไม่พอที่วาง)
export const MENU_LABEL_MIN_PCT = 6;

export function MenuBreakdown({ rows, products }) {
  const [hovered, setHovered] = useState(null);
  const all = rows || [];
  if (!all.length) {
    return (
      <div className="od-empty">
        <Icon name="pie" size={30} />
        <span>ช่วงเวลานี้ยังไม่มีเมนูที่ขายได้</span>
      </div>
    );
  }
  const top = all.slice(0, MENU_TOP_COUNT);
  const others = all.slice(MENU_TOP_COUNT);
  const other = others.length ? {
    id: 'other',
    name: `เมนูอื่น ๆ (${others.length} เมนู)`,
    qty: others.reduce((acc, r) => acc + r.qty, 0),
    amount: others.reduce((acc, r) => acc + r.amount, 0),
    share: others.reduce((acc, r) => acc + r.share, 0),
    orderCount: null,
  } : null;
  const list = (other ? [...top, other] : top).map((r, i) => ({ ...r, color: r.id === 'other' ? MENU_OTHER_COLOR : MENU_COLORS[i] }));
  const slices = list.filter(r => r.amount > 0);
  const total = slices.reduce((acc, r) => acc + r.amount, 0);
  const totalQty = all.reduce((acc, r) => acc + r.qty, 0);
  const productById = Object.fromEntries((products || []).map(p => [String(p.ProductId), p]));
  const active = hovered && list.find(r => r.id === hovered);

  let cumulative = 0;
  const arcs = slices.map(r => {
    const pct = (r.amount / (total || 1)) * 100;
    const arc = { ...r, pct, from: cumulative, to: cumulative + pct };
    cumulative += pct;
    return arc;
  });
  // ชี้อยู่ที่เมนูหนึ่ง: ส่วนอื่นจางลง
  const stops = arcs.map(a => `${active && active.id !== a.id ? `${a.color}40` : a.color} ${a.from}% ${a.to}%`).join(', ');

  const hoverDonut = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (!total || dist < rect.width * 0.31 || dist > rect.width / 2) { setHovered(null); return; }
    const pct = ((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360) / 3.6;
    setHovered((arcs.find(a => pct <= a.to) || arcs[arcs.length - 1]).id);
  };

  return (
    <div className="od-menu-wrap">
      <div className="od-donut-box">
        <div className="od-donut" style={{ background: total ? `conic-gradient(${stops})` : 'var(--berry-blue-light)' }}
          onMouseMove={hoverDonut} onMouseLeave={() => setHovered(null)}>
          <div className="od-donut-hole" />
        </div>
        {arcs.filter(a => a.pct >= MENU_LABEL_MIN_PCT).map(a => {
          // วางตัวเลขกลางความหนาของวง (รัศมี 40.5% ของกล่อง) ตรงกลางมุมของชิ้นนั้น
          const angle = ((a.from + a.to) / 2) * 3.6 * Math.PI / 180;
          return (
            <span key={a.id} className={`od-donut-label ${active && active.id !== a.id ? 'dim' : ''}`}
              style={{
                left: `${50 + Math.sin(angle) * 40.5}%`, top: `${50 - Math.cos(angle) * 40.5}%`,
                color: MENU_LIGHT_COLORS.has(a.color) ? 'var(--berry-text-dark)' : '#FFFFFF',
              }}>
              {a.pct.toFixed(0)}%
            </span>
          );
        })}
        <div className="od-donut-center">
          {active ? (
            <>
              <div className="name">{active.name}</div>
              <strong>{fmtMoney(active.amount)}</strong>
              <span>บาท · {fmtMoney(active.qty)} จาน · {(total ? (active.amount / total) * 100 : 0).toFixed(1)}%</span>
            </>
          ) : (
            <>
              <div className="name muted">ยอดขายรวม</div>
              <strong>{fmtMoney(total)}</strong>
              <span>บาท · {fmtMoney(totalQty)} จาน</span>
            </>
          )}
        </div>
      </div>

      <div className="od-menu-legend">
        {list.map((r, i) => {
          const product = productById[r.id];
          const avgPrice = r.qty ? r.amount / r.qty : 0;
          return (
            <div key={r.id} className={`od-menu-item ${hovered === r.id ? 'active' : ''} ${r.id === 'other' ? 'other' : ''}`}
              onMouseEnter={() => setHovered(r.id)} onMouseLeave={() => setHovered(null)}>
              <span className="swatch" style={{ background: r.color }} />
              <div className="info">
                <div className="head">
                  {r.id !== 'other' && <span className="rank">{i + 1}</span>}
                  <span className="name" title={r.name}>{r.name}</span>
                  {product?.IsOutOfStock ? <span className="out">หมด</span> : null}
                </div>
                <div className="meta">
                  {fmtMoney(r.qty)} จาน · {fmtMoney(r.amount)} บาท
                  {r.orderCount != null && <> · {fmtMoney(r.orderCount)} ออเดอร์ · เฉลี่ย {fmtMoney(avgPrice)} บาท/จาน</>}
                </div>
              </div>
              <b className="pct">{r.share.toFixed(1)}%</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}
