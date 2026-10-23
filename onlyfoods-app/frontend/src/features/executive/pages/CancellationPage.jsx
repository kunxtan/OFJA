import { T, FONT_STACK, h3Style, captionStyle, chartGridStyle, toolbarStyle, inputStyle } from '../theme';
import { money, thaiDate, monthLabelOf } from '../lib/format';
import { CANCEL_ALERT_RATE, CANCEL_WARN_RATE, cancelRateTone, changePct, summarize } from '../lib/sales';
import { EmptyState, Card, KpiCard, Badge } from '../components/ui';
import { useEffect, useMemo, useState } from 'react';
import { todayISO, rangeDayCount } from '../../../lib/dates';
import { periodBounds, previousBounds, customPeriodBounds, previousBoundsForRange, inRange } from '../lib/dates';
import { CancelledOrdersCard } from '../components/CancelledOrders';
import { StorePeriodPicker } from '../components/pickers';

// กราฟแท่งอัตรายกเลิกรายร้าน: พื้นหลังแบ่งโซน เขียว < 5% · เหลือง 5–10% · แดง > 10% และเส้นเกณฑ์ที่ 10%
export function CancelRateBars({ rows, selectedId, onSelect }) {
    if (!rows.length)
        return <EmptyState text="ยังไม่มีร้านค้าในระบบ" minHeight="160px"/>;
    const max = Math.max(20, CANCEL_ALERT_RATE + 5, ...rows.map((r) => r.cancelRate || 0));
    const pct = (v) => `${Math.min(100, ((v || 0) / max) * 100)}%`;
    const barColor = { ok: T.up, warn: T.amber, bad: T.down };
    return (<div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
      {rows.map((r) => {
            const tone = cancelRateTone(r.cancelRate);
            const active = String(selectedId) === String(r.StoreId);
            return (<button key={r.StoreId} type="button" onClick={() => onSelect(active ? '' : String(r.StoreId))} title={r.cancelRate === null ? `${r.StoreName}: ไม่มีออเดอร์ในช่วงนี้ · กดเพื่อดูเฉพาะร้านนี้` : `${r.StoreName}: ยกเลิก ${money(r.cancelledCount)} จาก ${money(r.orderCount)} ออเดอร์ · กดเพื่อดูเฉพาะร้านนี้`} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 170px) minmax(0, 1fr) 52px', gap: '12px', alignItems: 'center', width: '100%', padding: '7px 8px', border: 'none', borderRadius: '8px', background: active ? T.primarySoft : 'transparent', cursor: 'pointer', fontFamily: FONT_STACK, textAlign: 'left' }}>
              <span style={{ fontSize: '13px', color: active ? T.ink : (r.cancelRate === null ? T.muted : T.text), fontWeight: active ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.StoreName}</span>
              <span style={{ position: 'relative', height: '16px', borderRadius: '999px', overflow: 'hidden', background: T.greenSoft }}>
                <span style={{ position: 'absolute', top: 0, bottom: 0, left: pct(CANCEL_WARN_RATE), width: `calc(${pct(CANCEL_ALERT_RATE)} - ${pct(CANCEL_WARN_RATE)})`, background: T.amberSoft }}/>
                <span style={{ position: 'absolute', top: 0, bottom: 0, left: pct(CANCEL_ALERT_RATE), right: 0, background: T.redSoft }}/>
                <span style={{ position: 'absolute', top: '4px', bottom: '4px', left: 0, width: pct(r.cancelRate), minWidth: r.cancelRate > 0 ? '6px' : 0, borderRadius: '999px', background: barColor[tone] }}/>
                <span style={{ position: 'absolute', top: 0, bottom: 0, left: pct(CANCEL_ALERT_RATE), width: '2px', background: T.down, opacity: 0.6 }}/>
              </span>
              <strong style={{ fontSize: '13px', color: tone === 'bad' ? T.down : r.cancelRate === null ? T.muted : T.ink, textAlign: 'right' }}>{r.cancelRate === null ? 'N/A' : `${r.cancelRate.toFixed(1)}%`}</strong>
            </button>);
        })}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '8px', fontSize: '12px', color: T.muted }}>
        {[[T.greenSoft, `ปกติ < ${CANCEL_WARN_RATE}%`], [T.amberSoft, `เฝ้าระวัง ${CANCEL_WARN_RATE}–${CANCEL_ALERT_RATE}%`], [T.redSoft, `แจ้งเตือน > ${CANCEL_ALERT_RATE}%`]].map(([bg, text]) => (<span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: bg, border: `1px solid ${T.line}` }}/>{text}
          </span>))}
      </div>
    </div>);
}

export function CancellationPage({ ctx }) {
    const { orders, stores, loading, focusStoreId, focusPeriod, navigateTo } = ctx;
    // ถ้ากดมาจากหน้าภาพรวม จะได้ช่วงเวลาเดียวกับที่ดูอยู่ (focusPeriod) ไม่งั้นเริ่มที่ "วันนี้"
    const from = focusPeriod || {};
    const [anchor, setAnchor] = useState(from.anchor || todayISO());
    const [days, setDays] = useState(from.days || 1);
    const [customRange, setCustomRange] = useState(Boolean(from.customRange));
    const [customStart, setCustomStart] = useState(from.customStart || todayISO());
    const [customEnd, setCustomEnd] = useState(from.customEnd || todayISO());
    const [storeId, setStoreId] = useState(focusStoreId ? String(focusStoreId) : '');
    useEffect(() => { if (focusStoreId) setStoreId(String(focusStoreId)); }, [focusStoreId]);

    const effectiveDays = customRange ? rangeDayCount(customStart, customEnd) : days;
    const periodLabel = customRange ? monthLabelOf(customStart, customEnd) || (effectiveDays === 1 ? `วันที่ ${thaiDate(customStart)}` : `${thaiDate(customStart)} – ${thaiDate(customEnd)}`) : days === 1 ? `วันที่ ${thaiDate(anchor)}` : `${days} วันย้อนหลังถึง ${thaiDate(anchor)}`;
    const compareLabel = customRange ? `เทียบ ${effectiveDays} วันก่อนหน้า` : days === 1 ? 'เทียบวันก่อนหน้า' : `เทียบ ${days} วันก่อนหน้า`;

    const report = useMemo(() => {
        const bounds = customRange ? customPeriodBounds(customStart, customEnd) : periodBounds(anchor, days);
        const prevBounds = customRange ? previousBoundsForRange(customStart, customEnd) : previousBounds(anchor, days);
        const current = orders.filter((o) => inRange(o, bounds));
        const previous = orders.filter((o) => inRange(o, prevBounds));
                // เริ่มจากร้านทั้งหมดในระบบ (เหมือน AccountantView.buildStoreSummary) ร้านที่ไม่มีออเดอร์ในช่วงนี้จะขึ้นเป็น N/A
        // ร้านที่ถูกลบไปแล้วแต่ยังมีออเดอร์ในช่วงนี้ แสดงพร้อมป้าย Deleted เหมือนหน้าภาพรวม
        const storeMap = new Map(stores.map((s) => [String(s.StoreId), { id: String(s.StoreId), name: s.StoreName, contractState: s.ContractState, contractEnd: s.ContractEndDate }]));
        current.forEach((o) => {
            const id = String(o.StoreId);
            if (!storeMap.has(id))
                storeMap.set(id, { id, name: `${o.StoreName || `ร้าน #${id}`} (Deleted)` });
        });
        const storeRows = [...storeMap.values()]
            .map((st) => {
                const own = current.filter((o) => String(o.StoreId) === st.id);
                const sum = summarize(own);
                return {
                    StoreId: st.id,
                    StoreName: st.name,
                    cancelledCount: sum.cancelledCount,
                    orderCount: sum.completedCount + sum.cancelledCount,
                    cancelRate: sum.cancelRate,
                    contractState: st.contractState,
                    contractEnd: st.contractEnd
                };
            })
            // ร้านหมดสัญญาที่ไม่มีออเดอร์ในช่วงนี้ ไม่ต้องแสดง (หลักการเดียวกับหน้าภาพรวม)
            .filter((r) => {
                if (r.contractState !== 'EXPIRED' || r.orderCount > 0) return true;
                if (!r.contractEnd) return false;
                const cEnd = new Date(`${String(r.contractEnd).slice(0, 10)}T00:00:00`);
                cEnd.setDate(cEnd.getDate() + 1);
                return cEnd > bounds.start;
            })
            // มีข้อมูลเรียงตามอัตรายกเลิกมากสุดก่อน ร้านที่ไม่มีออเดอร์ (N/A) ไว้ท้ายสุดเรียงตามชื่อ
            .sort((a, b) => {
                if (a.cancelRate === null && b.cancelRate === null)
                    return String(a.StoreName).localeCompare(String(b.StoreName), 'th');
                if (a.cancelRate === null) return 1;
                if (b.cancelRate === null) return -1;
                return b.cancelRate - a.cancelRate || b.cancelledCount - a.cancelledCount;
            });
        const scopedNow = storeId ? current.filter((o) => String(o.StoreId) === storeId) : current;
        const scopedBefore = storeId ? previous.filter((o) => String(o.StoreId) === storeId) : previous;
        return { now: summarize(scopedNow), before: summarize(scopedBefore), hasPreviousData: scopedBefore.length > 0, storeRows };
    }, [orders, stores, anchor, days, customRange, customStart, customEnd, storeId]);

    const selectedRow = report.storeRows.find((r) => String(r.StoreId) === storeId);
    const selectedName = selectedRow?.StoreName || stores.find((s) => String(s.StoreId) === storeId)?.StoreName || '';
    const alertRows = report.storeRows.filter((r) => cancelRateTone(r.cancelRate) === 'bad');
    const watchRows = report.storeRows.filter((r) => ['bad', 'warn'].includes(cancelRateTone(r.cancelRate)));
        const storesWithOrders = report.storeRows.filter((r) => r.orderCount > 0).length;
    const pickerStores = [...report.storeRows, ...stores.filter((s) => !report.storeRows.some((r) => String(r.StoreId) === String(s.StoreId)))];

    return (<>
      <Card style={{ marginBottom: '18px' }}>
        <div style={toolbarStyle}>
          <div>
            <h3 style={h3Style}>ช่วงข้อมูลที่กำลังดู</h3>
            <p style={captionStyle}>{storeId ? `เฉพาะร้าน ${selectedName}` : 'ทุกร้านค้า'} · {periodLabel}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="เลือกร้านค้า" style={{ ...inputStyle, width: 'auto', minWidth: '200px', padding: '9px 12px' }}>
              <option value="">ทุกร้านค้า</option>
              {pickerStores.map((s) => <option key={s.StoreId} value={String(s.StoreId)}>{s.StoreName}</option>)}
            </select>
            <StorePeriodPicker anchor={anchor} setAnchor={setAnchor} days={days} setDays={setDays} custom={customRange} setCustom={setCustomRange} startDate={customStart} setStartDate={setCustomStart} endDate={customEnd} setEndDate={setCustomEnd}/>
          </div>
        </div>
      </Card>

      <div className="of-kpi-small">
        <KpiCard size="sm" label="ออเดอร์ทั้งหมด (สำเร็จ + ยกเลิก)" value={money(report.now.completedCount + report.now.cancelledCount)} unit="ออเดอร์" delta={changePct(report.now.completedCount + report.now.cancelledCount, report.before.completedCount + report.before.cancelledCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="check" tone="blue"/>
        <KpiCard size="sm" label="ออเดอร์ยกเลิก" value={money(report.now.cancelledCount)} unit="ออเดอร์" delta={changePct(report.now.cancelledCount, report.before.cancelledCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="ban" tone="amber" invertDelta/>
        <KpiCard size="sm" label="อัตราการยกเลิก" value={report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`} delta={report.now.cancelRate !== null && report.before.cancelRate !== null ? report.now.cancelRate - report.before.cancelRate : null} deltaSuffix=" จุดเปอร์เซ็นต์" deltaLabel="" hasPreviousData={report.hasPreviousData} hint={report.now.cancelRate === null ? 'ไม่มีออเดอร์ในช่วงนี้' : undefined} icon="info" tone="amber" invertDelta/>
        <KpiCard size="sm" label={`ร้านที่อัตรายกเลิกเกิน ${CANCEL_ALERT_RATE}%`} value={money(alertRows.length)} unit="ร้าน" hint={`จาก ${money(report.storeRows.length)} ร้านที่มีออเดอร์ในช่วงนี้`} delta={null} icon="alert" tone={alertRows.length ? 'amber' : 'green'}/>
      </div>

      <div style={chartGridStyle}>
        <Card title="อัตราการยกเลิกรายร้าน" subtitle={`เรียงจากร้านที่ยกเลิกมากสุด · ${periodLabel} · กดที่ร้านเพื่อดูเฉพาะร้านนั้น`}>
          {loading ? <EmptyState text="กำลังโหลดข้อมูล..."/> : <CancelRateBars rows={report.storeRows} selectedId={storeId} onSelect={setStoreId}/>}
        </Card>
        <Card title="ร้านที่ต้องจับตา" subtitle={`อัตรายกเลิกตั้งแต่ ${CANCEL_WARN_RATE}% ขึ้นไป ในช่วงที่เลือก`} right={<Badge tone={alertRows.length ? 'danger' : 'ok'}>{money(watchRows.length)} ร้าน</Badge>}>
          {watchRows.length === 0 ? (<EmptyState text="ไม่มีร้านที่น่ากังวลในช่วงนี้" minHeight="160px"/>) : (<div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              {watchRows.map((r) => {
                const bad = cancelRateTone(r.cancelRate) === 'bad';
                return (<div key={r.StoreId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: T.radiusMd, border: `1px solid ${bad ? '#F6C9C0' : '#F3DFAE'}`, background: bad ? T.redSoft : T.amberSoft }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: T.ink, fontWeight: 700, fontSize: '13.5px' }}>{r.StoreName}</div>
                      <div style={{ color: T.muted, fontSize: '12px', marginTop: '3px' }}>ยกเลิก {money(r.cancelledCount)} จาก {money(r.orderCount)} ออเดอร์</div>
                      <button type="button" onClick={() => navigateTo('store-sales', r.StoreId)} style={{ border: 'none', background: 'transparent', padding: 0, marginTop: '6px', color: T.primaryDark, fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', fontFamily: FONT_STACK }}>ดูยอดขายร้าน →</button>
                    </div>
                    <Badge tone={bad ? 'danger' : 'warn'}>{r.cancelRate.toFixed(1)}%</Badge>
                  </div>);
            })}
            </div>)}
        </Card>
      </div>

      <CancelledOrdersCard api={ctx.API} cancelled={report.now.cancelled} periodLabel={storeId ? `${selectedName} · ${periodLabel}` : periodLabel} loading={loading} showStore={!storeId} onStoreClick={(id) => setStoreId(String(id))}/>
    </>);
}
