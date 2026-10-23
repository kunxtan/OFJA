import { todayISO, toISODate } from '../../../../lib/dates';
import { parseOrderDate } from '../../lib/dates';
import { isRevenueOrder, orderNet, isNoShowOrder } from '../../lib/sales';
import { fmtMoney, thaiDate, timeHM } from '../../lib/format';
import { PageHeader, Icon, Skeleton, Badge } from '../../components/ui';
import { orderStatusMeta } from './salesMeta';

// หน้าประวัติการขาย : ออเดอร์ตามช่วงวัน/สถานะ กดดูรายละเอียดออเดอร์
// ข้อมูลและ state อยู่ที่ OwnerView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function SalesHistoryPage({
  salesRange, salesFrom, salesTo, history, salesSearch, salesStatus, refundedByOrder, salesLimit, setSalesRange,
  setSalesLimit, setSalesFrom, setSalesTo, loaded, setSalesStatus, setSalesSearch, setSalesDetailId
}) {
  // ---- ช่วงวันที่ ----
  const today = todayISO();
  const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); };
  const range = salesRange === 'custom'
    ? { from: salesFrom || today, to: salesTo || today }
    : salesRange === 'all' ? null
    : { from: salesRange === 'today' ? today : shiftDays(Number(salesRange) - 1), to: today };
  const inRange = history.filter(o => {
    if (!range) return true;
    const d = parseOrderDate(o.CreatedAt);
    const iso = d ? toISODate(d) : '';
    return iso >= range.from && iso <= range.to;
  });

  // ---- สถานะ + ค้นหา ----
  const group = (o) => (o.StatusCode === 'COMPLETED' ? 'done'
    : o.StatusCode === 'CANCELLED' ? 'cancelled'
    : o.StatusCode === 'NO_SHOW' ? 'noshow' : 'active');
  const counts = inRange.reduce((acc, o) => { acc[group(o)] += 1; return acc; }, { done: 0, active: 0, cancelled: 0, noshow: 0 });
  const q = salesSearch.trim().toLowerCase();
  const shown = inRange
    .filter(o => salesStatus === 'all' || group(o) === salesStatus)
    .filter(o => !q
      || String(o.QueueNo || '').toLowerCase().includes(q)
      || String(o.OrderID).includes(q)
      || String(o.CustomerName || '').toLowerCase().includes(q)
      || (o.items || []).some(i => String(i.ProductName || '').toLowerCase().includes(q)))
    // เรียงตามเวลาสั่งล่าสุดก่อน (API เรียงตามเลขออเดอร์) : ต้องเรียงก่อนจัดกลุ่มวัน ไม่งั้นวันเดียวกันแตกเป็นหลายกลุ่ม
    .sort((x, y) => (parseOrderDate(y.CreatedAt)?.getTime() || 0) - (parseOrderDate(x.CreatedAt)?.getTime() || 0)
      || y.OrderID - x.OrderID);

  // ---- สรุปยอดของช่วงที่เลือก ----
  const revenueOrders = inRange.filter(isRevenueOrder);
  const revenue = revenueOrders.reduce((s, o) => s + orderNet(o, refundedByOrder), 0);
  const noShowSales = revenueOrders.filter(isNoShowOrder).reduce((s, o) => s + orderNet(o, refundedByOrder), 0);
  const refundedSum = revenueOrders.reduce((s, o) => s + Number(refundedByOrder[o.OrderID] || 0), 0);
  // อัตรายกเลิก = ยกเลิก ÷ ออเดอร์ที่จบแล้ว (สำเร็จ + ไม่มารับ + ยกเลิก) เหมือนแดชบอร์ด
  const finishedCount = revenueOrders.length + counts.cancelled;
  const cancelRate = finishedCount ? Math.round((counts.cancelled / finishedCount) * 100) : 0;
  const kpis = [
    { tone: 'orange', icon: 'receipt', value: fmtMoney(inRange.length), label: 'ออเดอร์ทั้งหมด', sub: counts.active ? `กำลังดำเนินการ ${counts.active}` : null },
    { tone: 'green', icon: 'coin', value: `฿${fmtMoney(revenue)}`, label: 'ยอดขายสุทธิ (สำเร็จ + ไม่มารับ)',
      sub: [counts.noshow ? `รวมไม่มารับ ฿${fmtMoney(noShowSales)}` : null, refundedSum ? `หักคืนเงิน ฿${fmtMoney(refundedSum)}` : null].filter(Boolean).join(' · ') || null },
    { tone: 'blue', icon: 'trend', value: `฿${fmtMoney(revenueOrders.length ? revenue / revenueOrders.length : 0)}`, label: 'เฉลี่ยต่อออเดอร์' },
    { tone: 'amber', icon: 'soldout', value: fmtMoney(counts.cancelled), label: 'ยกเลิก', sub: finishedCount ? `${cancelRate}% ของออเดอร์ที่จบแล้ว` : null },
  ];
  const statusTabs = [
    { id: 'all', label: 'ทั้งหมด', count: inRange.length },
    { id: 'done', label: 'สำเร็จ', count: counts.done, tone: 'green' },
    { id: 'active', label: 'กำลังดำเนินการ', count: counts.active },
    { id: 'cancelled', label: 'ยกเลิก', count: counts.cancelled, tone: 'red' },
    { id: 'noshow', label: 'ไม่มารับ', count: counts.noshow },
  ];
  const rangeChips = [
    { id: 'today', label: 'วันนี้' }, { id: '7', label: '7 วัน' }, { id: '30', label: '30 วัน' },
    { id: 'all', label: 'ทั้งหมด' }, { id: 'custom', label: 'กำหนดเอง' },
  ];

  // ---- จัดกลุ่มตามวัน (แสดงทีละ salesLimit รายการ) ----
  const visible = shown.slice(0, salesLimit);
  const days = [];
  visible.forEach(o => {
    const d = parseOrderDate(o.CreatedAt);
    const key = d ? toISODate(d) : 'unknown';
    let day = days[days.length - 1];
    if (!day || day.key !== key) { day = { key, date: d, orders: [] }; days.push(day); }
    day.orders.push(o);
  });
  const daySummary = (key) => {
    const list = shown.filter(o => { const d = parseOrderDate(o.CreatedAt); return (d ? toISODate(d) : 'unknown') === key; });
    return { count: list.length, sales: list.filter(isRevenueOrder).reduce((s, o) => s + orderNet(o, refundedByOrder), 0) };
  };

  return (
    <>
      <PageHeader title="ประวัติการขาย" subtitle="ออเดอร์ทั้งหมดของร้าน กดที่ออเดอร์เพื่อดูรายละเอียด ใครรับ ใครทำ และไทม์ไลน์" icon="history">
        <span className="op-count-chip">{fmtMoney(shown.length)} ออเดอร์</span>
      </PageHeader>

      <div className="sh-filter-bar">
        <div className="sh-range" role="group" aria-label="ช่วงวันที่">
          <Icon name="calendar" size={16} />
          {rangeChips.map(c => (
            <button key={c.id} type="button" className={salesRange === c.id ? 'active' : ''}
              onClick={() => { setSalesRange(c.id); setSalesLimit(60); }}>
              {c.label}
            </button>
          ))}
        </div>
        {salesRange === 'custom' && (
          <div className="berry-date-range sh-dates">
            <label>
              ตั้งแต่
              <input type="date" value={salesFrom} max={salesTo || today}
                onChange={e => { const v = e.target.value || today; setSalesFrom(v); if (v > salesTo) setSalesTo(v); setSalesLimit(60); }} />
            </label>
            <label>
              ถึง
              <input type="date" value={salesTo} min={salesFrom} max={today}
                onChange={e => { setSalesTo(e.target.value || today); setSalesLimit(60); }} />
            </label>
          </div>
        )}
        <span className="sh-range-label">
          {range ? (range.from === range.to ? thaiDate(range.from) : `${thaiDate(range.from)} – ${thaiDate(range.to)}`) : 'ทุกช่วงเวลา'}
        </span>
      </div>

      <div className="sf-stats">
        {kpis.map(k => (
          <div key={k.label} className={`sf-stat tone-${k.tone}`}>
            <span className="icon"><Icon name={k.icon} size={20} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="value">{loaded.history ? k.value : <Skeleton height={22} width={60} />}</div>
              <div className="label">{k.label}</div>
              {k.sub && <div className="sub">{k.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="mm-toolbar mm-wrap-tabs">
        <div className="mm-tabs" role="tablist" aria-label="กรองตามสถานะ">
          {statusTabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={salesStatus === t.id}
              onClick={() => { setSalesStatus(t.id); setSalesLimit(60); }}
              className={`mm-tab ${salesStatus === t.id ? 'active' : ''} ${t.tone ? `tone-${t.tone}` : ''}`}>
              {t.tone && <span className="dot" />}
              {t.label}
              <span className="count">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="mm-search">
          <Icon name="search" size={16} />
          <input value={salesSearch} onChange={e => { setSalesSearch(e.target.value); setSalesLimit(60); }}
            placeholder="ค้นหาเลขคิว เลขออเดอร์ ชื่อลูกค้า หรือเมนู..." aria-label="ค้นหาออเดอร์" />
          {salesSearch && (
            <button type="button" onClick={() => setSalesSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>
          )}
        </div>
      </div>

      {!loaded.history ? (
        <div className="sh-list">{[0, 1, 2, 3].map(i => <Skeleton key={i} height={72} radius={14} />)}</div>
      ) : shown.length === 0 ? (
        <div className="sf-empty">
          <span className="icon"><Icon name={q ? 'search' : 'history'} size={28} /></span>
          <h3>{q ? 'ไม่พบออเดอร์ที่ตรงกับการค้นหา' : 'ไม่มีออเดอร์ในช่วงนี้'}</h3>
          <p>{q ? 'ลองค้นด้วยเลขคิว ชื่อลูกค้า หรือชื่อเมนูอื่น' : 'ลองเลือกช่วงวันที่ที่กว้างขึ้น หรือเปลี่ยนตัวกรองสถานะ'}</p>
        </div>
      ) : (
        <div className="sh-list">
          {days.map(day => {
            const sum = daySummary(day.key);
            return (
              <section key={day.key} className="sh-day">
                <div className="sh-day-head">
                  <strong>{day.date ? day.date.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'ไม่ทราบวันที่'}</strong>
                  <span>{sum.count} ออเดอร์ · ยอดขาย ฿{fmtMoney(sum.sales)}</span>
                </div>
                <div className="sh-day-card">
                  {day.orders.map(o => {
                    const sm = orderStatusMeta(o.StatusCode);
                    const its = o.items || [];
                    const itemText = its.slice(0, 2).map(i => `${i.ProductName} ×${i.Qty}`).join(', ');
                    return (
                      <button key={o.OrderID} type="button" className={`sh-row status-${group(o)}`} onClick={() => setSalesDetailId(o.OrderID)}>
                        <span className="sh-time">{timeHM(o.CreatedAt)}</span>
                        <span className="sh-queue">{o.QueueNo}</span>
                        <span className="sh-main">
                          <span className="sh-who">
                            {o.IsWalkIn ? <span className="sh-type walkin">Walk-in</span> : (o.CustomerName || 'ลูกค้า')}
                            <span className="sh-order-id">#{o.OrderID}</span>
                          </span>
                          <span className="sh-items-text">
                            {itemText || 'ไม่มีรายการอาหาร'}{its.length > 2 ? ` และอีก ${its.length - 2} รายการ` : ''}
                          </span>
                        </span>
                        <span className="sh-pay-method" title={o.PaymentMethod || ''}>
                          <Icon name={o.PaymentMethodCode === 'CASH' ? 'coin' : 'receipt'} size={14} />
                          {o.PaymentMethodCode === 'CASH' ? 'เงินสด' : 'โอน'}
                        </span>
                        <span className="sh-amount">฿{fmtMoney(o.TotalAmount)}</span>
                        <span className="sh-status">
                          <Badge tone={sm.tone}>{sm.label}</Badge>
                          {o.DeliveredAt && <span className="sh-delivered" title="เวลาที่ส่งมอบอาหาร">ส่งมอบ {timeHM(o.DeliveredAt)}</span>}
                        </span>
                        <span className="sh-chevron"><Icon name="arrowRight" size={16} /></span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {shown.length > salesLimit && (
            <button type="button" className="sh-more" onClick={() => setSalesLimit(n => n + 60)}>
              แสดงเพิ่ม ({fmtMoney(shown.length - salesLimit)} ออเดอร์ที่เหลือ)
            </button>
          )}
        </div>
      )}
    </>
  );
}
