import { useEffect, useMemo, useState } from 'react';
import { T, FONT_STACK, h3Style, captionStyle, chartGridStyle, toolbarStyle, tableStyle, thStyle, thRightStyle, trStyle, tdStyle, tdRightStyle } from '../theme';
import { money, thaiDate, thaiDateTime, nowStamp, monthLabelOf } from '../lib/format';
import { pad2, toISODate, todayISO, rangeDayCount } from '../../../lib/dates';
import { parseOrderDate, periodBounds, previousBounds, customPeriodBounds, previousBoundsForRange, inRange } from '../lib/dates';
import { changePct, summarize, buildBuckets, buildBucketsForRange, summarizeMenus, CANCEL_ALERT_RATE, isCancelAlert, CONTRACT_SOON_DAYS } from '../lib/sales';
import { callApi, exportCsv, exportXlsx } from '../lib/api';
import { Card, AlertBanner, KpiCard, Badge, Button, Modal, EmptyState } from '../components/ui';
import { SalesLineChart, MenuRankList } from '../components/charts';
import { SearchableStorePicker, StorePeriodPicker } from '../components/pickers';
import { StoreReviewSection } from '../components/StoreReviewSection';
import { StoreIssueReportSection } from '../components/StoreIssueReportSection';
import { CancelledOrdersCard } from '../components/CancelledOrders';

// ===== ยอดขายรายร้าน: เลือกร้าน ดูยอดขาย และอันดับเมนู =====
export function StoreSalesPage({ ctx }) {
    const { orders, stores, pushToast, focusStoreId, navigateTo } = ctx;
    const [storeId, setStoreId] = useState(focusStoreId || '');
    const [historyStores, setHistoryStores] = useState([]);
    useEffect(() => {
    callApi(`${ctx.API}/api/stores/history`)
        .then((data) => {
            setHistoryStores(
                Array.isArray(data) ? data : []
            );
        })
        .catch((err) => {
            console.error(
                'โหลดประวัติร้านไม่สำเร็จ:',
                err
            );
            setHistoryStores([]);
        });
}, [ctx.API]);
    useEffect(() => {
        if (focusStoreId) setStoreId(String(focusStoreId));
    }, [focusStoreId]);
    // เมื่อเข้าหน้ายอดขายรายร้านจากการ์ด/รายการทั่วไป ให้กลับไปด้านบนสุด
        useEffect(() => {
        if (!focusStoreId) return undefined;
        const timer = window.setTimeout(() => {
            const main = document.getElementById('executive-main-scroll');
            if (main) main.scrollTo({ top: 0, behavior: 'auto' });
        }, 0);
        return () => window.clearTimeout(timer);
    
    }, [focusStoreId]);
    const [anchor, setAnchor] = useState(todayISO());
    const [days, setDays] = useState(1);
    const [customRange, setCustomRange] = useState(false);
    const [customStart, setCustomStart] = useState(todayISO());
    const [customEnd, setCustomEnd] = useState(todayISO());
    const [salesExportPreview, setSalesExportPreview] = useState(null);
    const [exportExtras, setExportExtras] = useState({ reviews: [], reviewSummary: { total: 0, average: 0 }, issues: [] });
    const store = historyStores.find((s) => String(s.StoreId) === String(storeId)) || null;

    useEffect(() => {
        if (!storeId) {
            setExportExtras({ reviews: [], reviewSummary: { total: 0, average: 0 }, issues: [] });
            return undefined;
        }
        let cancelled = false;
        Promise.all([
            callApi(`${ctx.API}/api/stores/${storeId}/reviews`).catch(() => ({ reviews: [], summary: { total: 0, average: 0 } })),
            callApi(`${ctx.API}/api/reports/issue/store/${storeId}`).catch(() => [])
        ]).then(([reviewData, issueData]) => {
            if (cancelled) return;
            setExportExtras({
                reviews: Array.isArray(reviewData?.reviews) ? reviewData.reviews : [],
                reviewSummary: reviewData?.summary || { total: 0, average: 0 },
                issues: Array.isArray(issueData) ? issueData : []
            });
        });
        return () => { cancelled = true; };
    }, [ctx.API, storeId]);

        // ใช้สถานะจาก backend (ContractState / ContractDaysLeft) ให้ตรงกับหน้าติดตามสัญญาและที่ระบบล็อกจริง
    const salesContractInfo = (selectedStore) => {
        const state = selectedStore?.ContractState;
        const days = selectedStore?.ContractDaysLeft;
        const startText = selectedStore?.ContractStartDate ? String(selectedStore.ContractStartDate).slice(0, 10) : '';
        const endText = selectedStore?.ContractEndDate ? String(selectedStore.ContractEndDate).slice(0, 10) : '';
        if (state === 'NONE' || !endText)
            return { label: 'ยังไม่ระบุสัญญา', tone: 'neutral', detail: 'ยังไม่มีวันสัญญา ร้านเปิดขายไม่ได้' };
        if (state === 'UPCOMING')
            return { label: `ยังไม่เริ่มสัญญา (เริ่ม ${startText})`, tone: 'neutral', detail: 'ร้านยังเปิดขายไม่ได้จนถึงวันเริ่มสัญญา' };
        if (state === 'EXPIRED')
            return { label: `หมดสัญญาแล้ว ${Math.abs(days)} วัน`, tone: 'danger', detail: `หมดเมื่อ ${endText} 23:59 น. กดเพื่อเปิดสัญญารอบใหม่` };
        if (days === 0)
            return { label: 'หมดคืนนี้ 23:59 น.', tone: 'danger', detail: 'ถ้าร้านต่อสัญญาแล้ว ให้แก้วันสิ้นสุดก่อนเวลานี้' };
        if (days <= CONTRACT_SOON_DAYS)
            return { label: `เหลือ ${days} วัน`, tone: 'warn', detail: `ใกล้หมดสัญญา สิ้นสุด ${endText} 23:59 น.` };
        return { label: `เหลือ ${days} วัน`, tone: 'ok', detail: `สัญญามีผลถึง ${endText} 23:59 น.` };
    };

    const selectedContract = store ? salesContractInfo(store) : null;

    const report = useMemo(() => {
        if (!storeId)
            return null;
        const effectiveStart = customRange ? customStart : toISODate(new Date(new Date(`${anchor}T00:00:00`).setDate(new Date(`${anchor}T00:00:00`).getDate() - days + 1)));
        const effectiveEnd = customRange ? customEnd : anchor;
        const effectiveDays = customRange ? rangeDayCount(customStart, customEnd) : days;
        const bounds = customRange ? customPeriodBounds(customStart, customEnd) : periodBounds(anchor, days);
        const prevBounds = customRange ? previousBoundsForRange(customStart, customEnd) : previousBounds(anchor, days);
        const current = orders.filter((o) => inRange(o, bounds, storeId));
        const previous = orders.filter((o) => inRange(o, prevBounds, storeId));
        const now = summarize(current);
        const before = summarize(previous);
        const menus = summarizeMenus(now.settled);
        return {
            now,
            before, current,
            hasPreviousData: previous.length > 0,
            buckets: customRange
                ? buildBucketsForRange(now.settled, customStart, customEnd)
                : buildBuckets(now.settled, anchor, days),
                            bestMenus: menus.slice(0, 2),
            // เมนูขายได้น้อยต้องไม่ซ้ำกับรายการขายดี
            worstMenus: menus
                .filter((menu) => !menus.slice(0, 2).some((best) => best.name === menu.name))
                .reverse()
                .slice(0, 2),
            menuCount: menus.length
        };
    }, [orders, storeId, anchor, days, customRange, customStart, customEnd]);
    const effectiveStart = customRange ? customStart : toISODate(new Date(new Date(`${anchor}T00:00:00`).setDate(new Date(`${anchor}T00:00:00`).getDate() - days + 1)));
    const effectiveEnd = customRange ? customEnd : anchor;
    const effectiveDays = customRange ? rangeDayCount(customStart, customEnd) : days;
    const periodLabel = customRange ? monthLabelOf(customStart, customEnd) || `${thaiDate(customStart)} – ${thaiDate(customEnd)}` : days === 1 ? `วันที่ ${thaiDate(anchor)}` : `${days} วันย้อนหลังถึง ${thaiDate(anchor)}`;
    const compareLabel = customRange ? `เทียบ ${effectiveDays} วันก่อนหน้า` : days === 1 ? 'เทียบเมื่อวาน' : `เทียบ ${days} วันก่อนหน้า`;
    const exportDateBounds = customRange
    ? customPeriodBounds(customStart, customEnd)
    : periodBounds(anchor, days);

    const exportReviews = exportExtras.reviews.filter((r) => {
        const at = parseOrderDate(r.CreatedAt);
        return at && at >= exportDateBounds.start && at < exportDateBounds.end;
    });

    const exportIssues = exportExtras.issues.filter((r) => {
        const at = parseOrderDate(r.CreatedAt);
        return at && at >= exportDateBounds.start && at < exportDateBounds.end;
    });

    const exportReviewAverage = exportReviews.length
        ? exportReviews.reduce((sum, r) => sum + Number(r.Rating || 0), 0) / exportReviews.length
        : 0;
    const salesTimelineRows = !report ? [] : (customRange ? effectiveDays : days) === 1
    ? Array.from({ length: 24 }, (_, h) => {
        const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && at.getHours() === h; }), summary = summarize(bucketOrders);
        return { key: `h${h}`, label: `${pad2(h)}:00`, completedCount: summary.completedCount, cancelledCount: summary.cancelledCount, grossSales: summary.grossSales, netSales: summary.sales, cancelRate: summary.cancelRate === null ? 'N/A' : `${summary.cancelRate.toFixed(1)}%` };
    })
    : (report?.buckets || []).map(b => {
        const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && b.key === toISODate(at); }), summary = summarize(bucketOrders);
        return { key: b.key, label: b.label, completedCount: summary.completedCount, cancelledCount: summary.cancelledCount, grossSales: summary.grossSales, netSales: summary.sales, cancelRate: summary.cancelRate === null ? 'N/A' : `${summary.cancelRate.toFixed(1)}%` };
    });
    const salesExportRows = () => [ [(customRange ? effectiveDays : days) === 1
        ? 'ช่วงเวลา'
        : 'วันที่',
        'ออเดอร์สำเร็จ',
        'ออเดอร์ที่ยกเลิก',
        'ยอดขายก่อนหักยกเลิก (บาท)',
        'ยอดขายสุทธิ (บาท)',
        'อัตราการยกเลิก'],
    ...salesTimelineRows.map((row) => [
        (customRange ? effectiveDays : days) === 1 ? 
        row.label : row.key,  // รายวัน: วันที่เต็ม 2026-10-01 กัน Excel สลับวัน/เดือน
        row.completedCount,
        row.cancelledCount,
        Math.round(row.grossSales),
        Math.round(row.netSales),
        row.cancelRate ]),[],

    ['สรุปข้อมูลเพิ่มเติม', 'ค่า'],
    [
        'คะแนนรีวิวเฉลี่ย',
        exportReviews.length
            ? Number(exportReviewAverage.toFixed(1))
            : 'N/A'
    ],
    ['จำนวนรีวิว', exportReviews.length],
    ['จำนวนรายงานปัญหา', exportIssues.length]
];
    const handleCsv = () => {
        if (!report || !store) return;
        exportCsv(`onlyfoods-${store.StoreName}-${customRange ? `${customStart}-to-${customEnd}` : `${anchor}-${days}d`}.csv`, salesExportRows());
        setSalesExportPreview(null);
        pushToast('บันทึกไฟล์ CSV เรียบร้อยแล้ว');
    };
    const handleXlsx = () => {
    if (!report || !store) return

    const summaryRows = [
        ['ตัวชี้วัด', 'ค่า'],
        ['ร้านค้า', store.StoreName],
        ['ช่วงข้อมูล', periodLabel],
        ['ออกรายงานเมื่อ', nowStamp()],
        ['ยอดขายสุทธิ (บาท)', Math.round(report.now.sales)],
        ['มูลค่าออเดอร์รวมก่อนหักยกเลิก (บาท)', Math.round(report.now.grossSales)],
        ['ออเดอร์สำเร็จ', report.now.completedCount],
        ['ออเดอร์ยกเลิก', report.now.cancelledCount],
        ['อัตราการยกเลิก (%)', report.now.cancelRate === null  ? 'N/A' : Number(report.now.cancelRate.toFixed(1)) ],
        ['คะแนนรีวิวเฉลี่ย', exportReviews.length ? Number(exportReviewAverage.toFixed(1)) : 'N/A'],
        ['จำนวนรีวิว', exportReviews.length],
        ['จำนวนรายงานปัญหา', exportIssues.length]
    ];

    const menuRows = [
        ['เมนู', 'จำนวนที่ขายได้', 'ยอดขาย (บาท)', 'สัดส่วนของยอดร้าน (%)'],
        ...summarizeMenus(report.now.settled).map((m) => [
            m.name,
            m.qty,
            Math.round(m.amount),
            Number(m.share.toFixed(1))
        ])
    ];

    const timelineRows = [
    [
        (customRange ? effectiveDays : days) === 1
            ? 'ช่วงเวลา'
            : 'วันที่',
        'ออเดอร์สำเร็จ',
        'ออเดอร์ยกเลิก',
        'ยอดขายก่อนหักยกเลิก (บาท)',
        'ยอดขายสุทธิ (บาท)',
        'อัตราการยกเลิก'
    ],

    ...salesTimelineRows.map((row) => [
        row.label,
        row.completedCount,
        row.cancelledCount,
        Math.round(row.grossSales),
        Math.round(row.netSales),
        row.cancelRate
    ])
];

    const reviewRows = [
        ['วันที่', 'คะแนน', 'ผู้รีวิว', 'ความคิดเห็น'],
        ...[...exportReviews]
            .sort((a, b) =>
                (parseOrderDate(b.CreatedAt)?.getTime() || 0) -
                (parseOrderDate(a.CreatedAt)?.getTime() || 0)
            )
            .map((r) => [
                thaiDateTime(r.CreatedAt),
                Number(r.Rating || 0),
                r.ReviewerName || 'ลูกค้าไม่ระบุชื่อ',
                r.Comment || '-'
            ])
    ];

    const issueRows = [
        ['วันที่', 'ประเภทปัญหา', 'ลูกค้า', 'ออเดอร์/คิว', 'รายละเอียด'],
        ...[...exportIssues]
            .sort((a, b) =>
                (parseOrderDate(b.CreatedAt)?.getTime() || 0) -
                (parseOrderDate(a.CreatedAt)?.getTime() || 0)
            )
            .map((r) => [
                thaiDateTime(r.CreatedAt),
                r.IssueType || 'ไม่ระบุประเภท',
                r.CustomerName || 'ลูกค้าไม่ระบุชื่อ',
                r.QueueNo
                    ? `คิว ${r.QueueNo}`
                    : r.OrderID
                        ? `Order #${r.OrderID}`
                        : '-',
                r.Description || '-'
            ])
    ];

    exportXlsx(
        `onlyfoods-${store.StoreName}-${customRange ? `${customStart}-to-${customEnd}` : `${anchor}-${days}d`}.xlsx`,
        [
            {
                name: 'สรุปรายงาน',
                rows: summaryRows,
                widths: [42, 38]
            },
            {
                name: 'ยอดขายตามเมนู',
                rows: menuRows,
                widths: [36, 18, 20, 24]
            },
            {
                name: 'ยอดขายตามเวลา',
                rows: timelineRows,
                widths: [20, 20, 16]
            },
            {
                name: 'รีวิวลูกค้า',
                rows: reviewRows,
                widths: [24, 12, 28, 60]
            },
            {
                name: 'รายงานปัญหา',
                rows: issueRows,
                widths: [24, 26, 28, 20, 60]
            }
        ]
    );

    setSalesExportPreview(null);
    pushToast('บันทึกไฟล์ XLSX เรียบร้อยแล้ว');
};
    return (<>
      <Card style={{ marginBottom: '16px', zIndex: 40 }}>
        <div style={toolbarStyle}>
          <div style={{ minWidth: '240px', flex: 1 }}>
            <h3 style={h3Style}>เลือกร้านค้า</h3>
            <SearchableStorePicker stores={historyStores} value={storeId} onChange={setStoreId}/>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

            <Button variant="ghost" icon="download" onClick={() => setSalesExportPreview('csv')} disabled={!storeId}>
              CSV
            </Button>
            <Button variant="dark" icon="download" onClick={() => setSalesExportPreview('xlsx')} disabled={!storeId}>
              XLSX
            </Button>
          </div>
        </div>
      </Card>

      {!storeId && (<Card>
          <EmptyState text="เลือกร้านจากช่องด้านบนเพื่อดูยอดขายและเมนูของร้านนั้น"/>
        </Card>)}

      {storeId && report && store && (<>
          <Card style={{ marginBottom: '16px' }}>
            <div style={toolbarStyle}>
              <div>
                <h3 style={h3Style}>{store.StoreName}{Boolean(store?.IsDeleted) && (<span style={{
                  marginLeft: '8px',fontSize: '12px', fontWeight: 700,color: '#E2452F' }} > (ร้านถูกลบแล้ว) </span> )}
                  </h3>
                <p style={captionStyle}>{periodLabel}</p>
              </div> 
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
              {!Boolean(store?.IsDeleted) && (
                <Button
                  variant="ghost"
                  icon="edit"
                  onClick={() => navigateTo('store-manage', store.StoreId)}
                  title="ไปหน้าจัดการร้านค้านี้"
                  style={{ padding: '7px 12px' }}
                >
                  จัดการร้านค้า
                </Button> )}
                                {store.ContractState === 'EXPIRED' ? (
                  <Badge tone="danger">หมดสัญญา</Badge>
                ) : (
                  <Badge tone={store.IsOpen ? 'ok' : 'neutral'}>
                    {store.IsOpen ? 'เปิดร้าน' : 'ปิดร้าน'}
                  </Badge>
                )}
                
                {Boolean(store?.IsDeleted) ? (
  <Badge tone="danger">
    ร้านถูกลบแล้ว
  </Badge>
) : (
  <>
        {(store.IsSuspended || store.ContractState !== 'EXPIRED') && (
      <Badge tone={store.IsSuspended ? 'danger' : 'ok'}>
        {store.IsSuspended ? 'ถูกระงับสิทธิ์' : 'สิทธิ์ปกติ'}
      </Badge>
    )}

    {selectedContract && (
      <button
        type="button"
        onClick={() => navigateTo('contract-tracking', store.StoreId)}
                title={`${selectedContract.detail} · ไปจัดการสัญญาร้านนี้`}
        style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_STACK }}
      >
        <Badge tone={selectedContract.tone}>
          สัญญา: {selectedContract.label} · จัดการ →
        </Badge>
      </button>
    )}
  </>
)}
              </div>
            </div>
          </Card>

          {isCancelAlert(report.now.cancelRate) && (<AlertBanner style={{ marginBottom: '16px' }}>
            อัตรายกเลิกของร้านนี้ {report.now.cancelRate.toFixed(1)}% เกินเกณฑ์ {CANCEL_ALERT_RATE}% ในช่วงที่เลือก ({money(report.now.cancelledCount)} จาก {money(report.now.cancelledCount + report.now.completedCount)} ออเดอร์)
          </AlertBanner>)}

          <div className="of-kpi-hero">
            <KpiCard label="ยอดขายสุทธิ" value={money(report.now.sales)} unit="บาท" delta={changePct(report.now.sales, report.before.sales)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} highlight icon="trend"/>
            <KpiCard label="ออเดอร์สำเร็จ" value={money(report.now.completedCount)} unit="ออเดอร์" delta={changePct(report.now.completedCount, report.before.completedCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} variant="blue" icon="check"/>
          </div>

          <div className="of-store-kpi-small">
            <KpiCard size="sm" label="มูลค่าออเดอร์รวมก่อนหักยกเลิก" value={money(report.now.grossSales)} unit="บาท" delta={changePct(report.now.grossSales, report.before.grossSales)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="trend" tone="blue"/>
            <KpiCard size="sm" label="ออเดอร์ยกเลิก" value={money(report.now.cancelledCount)} unit="ออเดอร์" delta={changePct(report.now.cancelledCount, report.before.cancelledCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="ban" tone="amber" invertDelta/>
            <KpiCard size="sm" label="อัตราการยกเลิก" value={report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`} delta={ report.now.cancelRate !== null && report.before.cancelRate !== null  ? report.now.cancelRate - report.before.cancelRate : null } deltaSuffix=" จุดเปอร์เซ็นต์" deltaLabel="" hasPreviousData={report.hasPreviousData} hint={report.now.cancelRate === null ? 'ไม่มีออเดอร์ในช่วงนี้' : undefined} icon="info" tone="amber" invertDelta />
          </div>

          <Card style={{ marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ color: T.muted, fontSize: '14px', fontWeight: 500 }}>
                  {(customRange ? effectiveDays : days) === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}
                </div>
                <StorePeriodPicker anchor={anchor} setAnchor={setAnchor} days={days} setDays={setDays} custom={customRange} setCustom={setCustomRange} startDate={customStart} setStartDate={setCustomStart} endDate={customEnd} setEndDate={setCustomEnd}/>
              </div>
              <h3 style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: 700, color: T.ink }}>
                {money(report.now.sales)} บาท
              </h3>
              <p style={captionStyle}>ชี้ที่จุดบนกราฟเพื่อดูยอดขายของช่วงเวลานั้น</p>
            </div>
            <SalesLineChart buckets={report.buckets} showStoreDetail={false}/>
          </Card>

                   <div style={{ ...chartGridStyle, marginBottom: '16px' }}>
            <Card title="เมนูขายดี 2 อันดับแรก" >
              <MenuRankList rows={report.bestMenus} emptyText="ช่วงนี้ยังไม่มีเมนูที่ขายได้"/>
            </Card>
            <Card title="เมนูที่ขายได้น้อย 2 อันดับ" >
              <MenuRankList rows={report.worstMenus} tone="accent" emptyText="ช่วงนี้ยังไม่มีเมนูที่ขายได้"/>
            </Card>
          </div>
          <div style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
           <CancelledOrdersCard api={ctx.API} cancelled= {report.now.cancelled} periodLabel={`${store.StoreName} · ${periodLabel}`} showStore={false} style={{ marginTop: 0 }}/>
            <StoreReviewSection ctx={ctx} storeId={storeId}/>
            <div id="store-issue-reports" style={{ scrollMarginTop: '20px' }}>
              <StoreIssueReportSection ctx={ctx} storeId={storeId}/>
            </div>
          </div>
        </>)}

      <Modal open={Boolean(salesExportPreview && report && store)} title={`พรีวิวก่อนบันทึก ${String(salesExportPreview || '').toUpperCase()}`} subtitle={store ? `รายงานยอดขายร้าน ${store.StoreName} · ${periodLabel}` : ''} onClose={() => setSalesExportPreview(null)} width={900} footer={<>
        <Button variant="ghost" onClick={() => setSalesExportPreview(null)}>ยกเลิก</Button>
        <Button variant={salesExportPreview === 'xlsx' ? 'dark' : 'primary'} icon="download" onClick={salesExportPreview === 'xlsx' ? handleXlsx : handleCsv}>บันทึก {String(salesExportPreview || '').toUpperCase()}</Button>
      </>}>
        {report && store && (<div style={{ display: 'grid', gap: '16px' }}>
  {salesExportPreview === 'csv' ? (<>
    <div>
      <div style={{ ...captionStyle, color: T.text, fontWeight: 700, marginBottom: '8px' }}>{(customRange ? effectiveDays : days) === 1 ?
       'ตัวอย่างยอดขายตามช่วงเวลา' : 'ตัวอย่างยอดขายตามวันที่'}</div>
      <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.radiusMd }}>
        <table style={tableStyle}>
          <thead><tr>
            <th style={thStyle}>{(customRange ? effectiveDays : days) === 1 ? 'ช่วงเวลา' : 'วันที่'}</th>
            <th style={thRightStyle}>ออเดอร์สำเร็จ</th>
            <th style={thRightStyle}>ออเดอร์ที่ยกเลิก</th>
            <th style={thRightStyle}>ยอดขายก่อนหักยกเลิก</th>
            <th style={thRightStyle}>ยอดขายสุทธิ</th>
            <th style={thRightStyle}>อัตราการยกเลิก</th>
          </tr></thead>
          <tbody>{salesTimelineRows.slice(0, 8).map((row) => (
            <tr key={row.key} style={trStyle}>
              <td style={tdStyle}>{row.label}</td>
              <td style={tdRightStyle}>{money(row.completedCount)}</td>
              <td style={tdRightStyle}>{money(row.cancelledCount)}</td>
              <td style={tdRightStyle}>{money(row.grossSales)} บาท</td>
              <td style={tdRightStyle}>{money(row.netSales)} บาท</td>
              <td style={tdRightStyle}>{row.cancelRate}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>

    <div style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, overflow: 'hidden' }}>
      <table style={tableStyle}>
        <thead><tr><th style={thStyle}>สรุปข้อมูลเพิ่มเติม</th><th style={thRightStyle}>ค่า</th></tr></thead>
        <tbody>
          <tr style={trStyle}><td style={tdStyle}>คะแนนรีวิวเฉลี่ย</td><td style={tdRightStyle}>{exportReviews.length ? `${exportReviewAverage.toFixed(1)} / 5` : 'N/A'}</td></tr>
          <tr style={trStyle}><td style={tdStyle}>จำนวนรีวิว</td><td style={tdRightStyle}>{money(exportReviews.length)} รีวิว</td></tr>
          <tr style={trStyle}><td style={tdStyle}>จำนวนรายงานปัญหา</td><td style={tdRightStyle}>{money(exportIssues.length)} รายการ</td></tr>
        </tbody>
      </table>
    </div>
  </>) : (<>
    {salesExportPreview === 'xlsx' && (
      <div style={{ padding: '12px 14px', borderRadius: T.radiusMd, background: T.bg, color: T.text, fontSize: '13px', lineHeight: 1.7 }}>
        ไฟล์ Excel จะแยกข้อมูลเป็น 5 Sheet:
        <strong> สรุปรายงาน · ยอดขายตามเมนู · ยอดขายตามเวลา · รีวิวลูกค้า · รายงานปัญหา</strong>
      </div>
    )}

    <div style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, overflow: 'hidden' }}>
      <table style={tableStyle}>
        <thead><tr><th style={thStyle}>ตัวชี้วัด</th><th style={thRightStyle}>ค่า</th></tr></thead>
        <tbody>{[
          ['ยอดขายสุทธิ', `${money(report.now.sales)} บาท`],
          ['มูลค่าออเดอร์รวมก่อนหักยกเลิก', `${money(report.now.grossSales)} บาท`],
          ['ออเดอร์สำเร็จ', `${money(report.now.completedCount)} ออเดอร์`],
          ['ออเดอร์ยกเลิก', `${money(report.now.cancelledCount)} ออเดอร์`],
          ['อัตราการยกเลิก', report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`],
          ['คะแนนรีวิวเฉลี่ย', `${exportReviewAverage.toFixed(1)} / 5`],
          ['จำนวนรีวิว', `${money(exportReviews.length)} รีวิว`],
          ['จำนวนรายงานปัญหา', `${money(exportIssues.length)} รายการ`]
        ].map(([label, value]) => (
          <tr key={label} style={trStyle}><td style={tdStyle}>{label}</td><td style={tdRightStyle}>{value}</td></tr>
        ))}</tbody>
      </table>
    </div>

    <div>
      <div style={{ ...captionStyle, color: T.text, fontWeight: 700, marginBottom: '8px' }}>ตัวอย่างยอดขายตาม{(customRange ? effectiveDays : days) === 1 ? 'ช่วงเวลา' : 'วันที่'}</div>
      <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: T.radiusMd }}>
        <table style={tableStyle}>
          <thead><tr><th style={thStyle}>{(customRange ? effectiveDays : days) === 1 ? 'ช่วงเวลา' : 'วันที่'}</th><th style={thRightStyle}>ยอดขาย</th><th style={thRightStyle}>ออเดอร์</th></tr></thead>
          <tbody>{report.buckets.slice(0, 8).map((b) => (
            <tr key={b.key} style={trStyle}><td style={tdStyle}>{b.label}</td><td style={tdRightStyle}>{money(b.sales)} บาท</td><td style={tdRightStyle}>{money(b.count)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>

    <div style={{ ...captionStyle, color: T.text }}>ไฟล์จริงมีตารางเมนูขาย, ยอดขายตามเวลา, รีวิวจากลูกค้า และรายงานปัญหาจากลูกค้า โดยไม่มีคอลัมน์เทียบช่วงก่อนหน้า</div>
  </>)}</div>)} </Modal>
</>);
}
