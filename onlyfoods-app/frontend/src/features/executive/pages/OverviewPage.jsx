import { useEffect, useMemo, useState } from 'react';
import { T, FONT_STACK, h3Style, bodyStyle, captionStyle, chartGridStyle, toolbarStyle, courtControlStyle, tableStyle, thStyle, thRightStyle, trStyle, tdStyle, tdRightStyle } from '../theme';
import { money, thaiDate, thaiDateTime, nowStamp, monthLabelOf } from '../lib/format';
import { pad2, toISODate, todayISO, rangeDayCount } from '../../../lib/dates';
import { parseOrderDate, periodBounds, previousBounds, customPeriodBounds, previousBoundsForRange, inRange } from '../lib/dates';
import { changePct, summarize, buildBuckets, buildBucketsForRange, CANCEL_ALERT_RATE, isCancelAlert, isContractSoon, contractLeftLabel } from '../lib/sales';
import { exportCsv, exportXlsx } from '../lib/api';
import { issuesQuery } from '../lib/queries';
import { useCachedApi } from '../../../lib/apiCache';
import { SkeletonRows } from '../../../shared/ui/Skeleton';
import { Icon, Card, AlertBanner, KpiCard, Badge, Button, Modal, EmptyState } from '../components/ui';
import { SalesLineChart, StoreDonutChart } from '../components/charts';
import { StorePeriodPicker } from '../components/pickers';

// ===== ภาพรวมศูนย์อาหาร: สรุปยอดขาย ออเดอร์ ร้านค้า และกราฟ =====
export function OverviewPage({ ctx, foodCourtOpen,foodCourtOpenTime,foodCourtCloseTime,foodCourtMode, switchingCourt,returningFoodCourtAuto, onToggleCourt ,onOpenSettings,onReturnAuto }) {
    const { API, orders, stores, loading, pushToast, navigateTo } = ctx;
    const [anchor, setAnchor] = useState(todayISO());
    const [days, setDays] = useState(1);
    const [customRange, setCustomRange] = useState(false);
    const [customStart, setCustomStart] = useState(todayISO());
    const [customEnd, setCustomEnd] = useState(todayISO());
    const [exportPreview, setExportPreview] = useState(null);
    // รายงานปัญหาทั้งศูนย์ : ใช้ cache ชุดเดียวกับกระดิ่งของหน้าหลัก (หน้าหลักรีเฟรชให้ทุก 30 วิ)
    // จึงขึ้นทันทีตอนกลับเข้าหน้านี้ และไม่ยิงซ้ำถ้าข้อมูลยังใหม่ ; ยังไม่มีร้าน = ไม่ต้องโหลด
    const hasStores = Array.isArray(stores) && stores.length > 0;
    const [issuesKey, issuesFetcher] = issuesQuery(API, '');
    const issuesState = useCachedApi(hasStores ? issuesKey : null, issuesFetcher, { staleMs: 30000 });
    const issueReports = Array.isArray(issuesState.data?.issues) ? issuesState.data.issues : [];
    const issueLoading = issuesState.loading;
    const [showAllIssueStores, setShowAllIssueStores] = useState(false);

    useEffect(() => { setShowAllIssueStores(false); }, [days, anchor , customRange, customStart, customEnd]);
    const report = useMemo(() => {
        const bounds = customRange
            ? customPeriodBounds(customStart, customEnd)
            : periodBounds(anchor, days);

        const prevBounds = customRange
            ? previousBoundsForRange(customStart, customEnd)
            : previousBounds(anchor, days);
        const current = orders.filter((o) => inRange(o, bounds));
        const previous = orders.filter((o) => inRange(o, prevBounds));
        const now = summarize(current);
        const before = summarize(previous);
       const storeMap = new Map(
    stores.map((s) => [String(s.StoreId), s])
);

// ร้านที่มีออเดอร์ในช่วงปัจจุบันหรือช่วงเปรียบเทียบ
// ต้องยังอยู่ใน Dashboard แม้ร้านนั้นจะถูกลบภายหลัง
current.forEach((o) => {
    const id = String(o.StoreId);

    if (!storeMap.has(id)) {
        storeMap.set(id, {
            StoreId: o.StoreId,
            StoreName: `${o.StoreName || `ร้าน #${o.StoreId}`} (Deleted)`,
            IsDeleted: 1,
            IsOpen: 0,
            IsSuspended: 0
        });
    }
});

const storeRows = Array.from(storeMap.values())
    .map((s) => {
        const storeCurrent = current.filter(
            (o) => String(o.StoreId) === String(s.StoreId)
        );
        const storePrevious = previous.filter(
            (o) => String(o.StoreId) === String(s.StoreId)
        );

        const storeNow = summarize(storeCurrent);
        const storeBefore = summarize(storePrevious);

        return {
            ...s,
            sales: storeNow.sales,
            grossSales: storeNow.grossSales,
            prevSales: storeBefore.sales,
            delta: changePct(storeNow.sales, storeBefore.sales),
            completedCount: storeNow.completedCount,
            cancelledCount: storeNow.cancelledCount,
            orderCount: storeNow.completedCount + storeNow.cancelledCount,
            cancelRate: storeNow.cancelRate,
            avg: storeNow.avgOrder
        };
    })

     // ร้านหมดสัญญาไม่แสดงในสรุปรายร้าน ยกเว้นช่วงที่เลือกมีออเดอร์ หรือช่วงนั้นเริ่มก่อน/ตรงวันสิ้นสุดสัญญา
    // (หลักการเดียวกับร้านที่ถูกลบใน AccountantView.buildStoreSummary)
    .filter((s) => {
        if (s.ContractState !== 'EXPIRED') return true;
        if (s.orderCount > 0) return true;
       if (!s.ContractEndDate) return false;
       const cEnd = new Date(`${String(s.ContractEndDate).slice(0, 10)}T00:00:00`);
        cEnd.setDate(cEnd.getDate() + 1);  // สัญญามีผลถึง 23:59:59 ของวันสิ้นสุด
       return cEnd > bounds.start;
    })
    .sort((a, b) => b.sales - a.sales);
        
const ordersByHour = Array.from({ length: 24 }, () => 0);

now.settled.forEach(o => {
    const at = parseOrderDate(o.CreatedAt);
    if (at) ordersByHour[at.getHours()] += 1;
});

const peakOrderCount = Math.max(...ordersByHour);
const peakHour = peakOrderCount > 0
    ? ordersByHour.indexOf(peakOrderCount)
    : null;

return {
    now,
    before,
    current,
    hasPreviousData: previous.length > 0,
    storeRows,
    buckets: customRange
        ? buildBucketsForRange(now.settled, customStart, customEnd)
        : buildBuckets(now.settled, anchor, days),
    peakHour,
    peakOrderCount,
    activeStores: stores.filter((s) => s.IsOpen && !s.IsSuspended).length
};

    }, [orders, stores, anchor, days ,  customRange, customStart, customEnd]);
    const effectiveDays = customRange ? rangeDayCount(customStart, customEnd) : days;
const periodLabel = customRange ? monthLabelOf(customStart, customEnd) || (effectiveDays === 1 ? `วันที่ ${thaiDate(customStart)}` : `${thaiDate(customStart)} – ${thaiDate(customEnd)}`) : days === 1? `วันที่ ${thaiDate(anchor)}` : `${days} วันย้อนหลังถึง ${thaiDate(anchor)}`;
const compareLabel = customRange ? `เทียบ ${effectiveDays} วันก่อนหน้า` : days === 1 ? 'เทียบวันก่อนหน้า' : `เทียบ ${days} วันก่อนหน้า`;
    const visibleStoreRows = report.storeRows;
        // ไปหน้าวิเคราะห์การยกเลิก โดยส่งช่วงเวลาที่ดูอยู่ไปด้วย (storeId ว่าง = ทุกร้าน)
    const goCancellation = (storeId = '') => navigateTo('cancellation', storeId, { anchor, days, customRange, customStart, customEnd });
    const issueBounds = customRange
    ? customPeriodBounds(customStart, customEnd)
    : periodBounds(anchor, days);
    const periodIssueReports = issueReports.filter((item) => {
        const at = parseOrderDate(item.CreatedAt);
        return at && at >= issueBounds.start && at < issueBounds.end;
    }).sort((a, b) => (parseOrderDate(b.CreatedAt)?.getTime() || 0) - (parseOrderDate(a.CreatedAt)?.getTime() || 0));
    const issueCountsByStore = Object.values(periodIssueReports.reduce((acc, item) => {
        const id = String(item.StoreId || 'unknown');
        if (!acc[id]) acc[id] = { StoreId: item.StoreId, StoreName: item.StoreName || `ร้าน #${id}`, count: 0 };
        acc[id].count += 1;
        return acc;
    }, {})).sort((a, b) => b.count - a.count || String(a.StoreName).localeCompare(String(b.StoreName), 'th'));
    const maxStoreSales = Math.max(...report.storeRows.map((s) => Number(s.sales) || 0), 1);
    const bestStore = report.storeRows.find((s) => s.sales > 0) || null;
    // การ์ดสถานะร้านค้า: ไม่นับร้านที่หมดสัญญา (ร้านหมดสัญญาแสดงในแถบเหลืองด้านบนแทน)
    const storeStatus = useMemo(() => {
        const live = stores.filter((s) => s.ContractState !== 'EXPIRED');
       return {
            open: live.filter((s) => s.IsOpen && !s.IsSuspended).length,
           closed: live.filter((s) => !s.IsOpen && !s.IsSuspended).length,
           suspended: live.filter((s) => s.IsSuspended).length,
           total: live.length
        };
    }, [stores]);
    // สัญญาที่ต้องดู (แถบเหลืองบนสุดของ Dashboard)
    const contractSoonStores = stores.filter(isContractSoon).sort((a, b) => a.ContractDaysLeft - b.ContractDaysLeft);
    const contractExpiredStores = stores.filter((s) => s.ContractState === 'EXPIRED');
    const cancelAlertStores = report.storeRows
        .filter((s) => isCancelAlert(s.cancelRate))
        .sort((a, b) => b.cancelRate - a.cancelRate);
    const csvRows = () => {
    const summaryRow = [
        'สรุปภาพรวม',
        report.now.completedCount,
        report.now.cancelledCount,
        Math.round(report.now.grossSales),
        Math.round(report.now.sales),
        report.now.cancelRate === null
            ? 'N/A'
            : `${report.now.cancelRate.toFixed(1)}%`
    ];

    // 1 วัน: แสดงข้อมูลแยกร้าน
    if (effectiveDays === 1) {
        return [
            [
                'ร้านค้า',
                'ออเดอร์สำเร็จ',
                'ออเดอร์ที่ยกเลิก',
                'ยอดขายก่อนหักยกเลิก (บาท)',
                'ยอดขายสุทธิ (บาท)',
                'อัตราการยกเลิก'
            ],

            ...report.storeRows.map((s) => [
                s.StoreName,
                s.completedCount,
                s.cancelledCount,
                Math.round(s.grossSales),
                Math.round(s.sales),
                s.cancelRate === null
                    ? 'N/A'
                    : `${s.cancelRate.toFixed(1)}%`
            ]),

            summaryRow
        ];
    }

    // 7 / 14 / 30 วัน: แสดงข้อมูลแยกรายวัน
    const dailyRows = report.buckets.map((bucket) => {
        const bucketOrders = report.current.filter((o) => {
            const at = parseOrderDate(o.CreatedAt);
            return at && toISODate(at) === bucket.key;
        });

        const summary = summarize(bucketOrders);

        return [
            bucket.key,  // CSV ใช้วันที่เต็ม 2026-10-01 : Excel ทุกภาษาอ่านถูก (01/10 จะถูกแปลงเป็น 10-Jan ใน Excel แบบเดือน/วัน)
            summary.completedCount,
            summary.cancelledCount,
            Math.round(summary.grossSales),
            Math.round(summary.sales),
            summary.cancelRate === null
                ? 'N/A'
                : `${summary.cancelRate.toFixed(1)}%`
        ];
    });

    return [
        [
            'วันที่',
            'ออเดอร์สำเร็จ',
            'ออเดอร์ที่ยกเลิก',
            'ยอดขายก่อนหักยกเลิก (บาท)',
            'ยอดขายสุทธิ (บาท)',
            'อัตราการยกเลิก'
        ],

        ...dailyRows,

        summaryRow
    ];
};
    const saveCsv = () => {
        exportCsv(
    `onlyfoods-executive-report-${customRange ? `${customStart}-to-${customEnd}` : `${anchor}-${days}d`}.csv`,csvRows());
        setExportPreview(null);
        pushToast('บันทึกไฟล์ CSV เรียบร้อยแล้ว');
    };
  const saveXlsx = () => {
    try {
        const peakTime = report.peakHour === null ? '-' : `${pad2(report.peakHour)}:00 น.`;

        const overviewRows = [
            ['ตัวชี้วัด', 'ค่า'], ['ช่วงข้อมูล', periodLabel], ['ออกรายงานเมื่อ', nowStamp()],
            ['ออเดอร์สำเร็จ', report.now.completedCount], ['ออเดอร์ยกเลิก', report.now.cancelledCount],
            ['ยอดขายก่อนหักยกเลิก (บาท)', Math.round(report.now.grossSales)], ['ยอดขายสุทธิ (บาท)', Math.round(report.now.sales)],
            ['อัตราการยกเลิก (%)', report.now.cancelRate === null ? 'N/A' : Number(report.now.cancelRate.toFixed(1))],
           ['ยอดเฉลี่ยต่อออเดอร์ (บาท)', Number(report.now.avgOrder.toFixed(2))],
            ['ช่วงเวลาขายดี', peakTime],
            ['จำนวนออเดอร์ช่วงเวลาขายดี', report.peakHour === null ? '-' : report.peakOrderCount]
        ];

        const storeRows = [
            ['ร้านค้า', 'ออเดอร์สำเร็จ', 'ออเดอร์ยกเลิก', 'ยอดขายก่อนหักยกเลิก (บาท)', 'ยอดขายสุทธิ (บาท)', 'อัตราการยกเลิก (%)'],
            ...report.storeRows.map(s => [s.StoreName, s.completedCount, s.cancelledCount, Math.round(s.grossSales), Math.round(s.sales), s.cancelRate === null ? 'N/A' : Number(s.cancelRate.toFixed(1))])
        ];

        const timelineRows = [[effectiveDays === 1 ? 'ช่วงเวลา' : 'วันที่', 'ออเดอร์สำเร็จ', 'ออเดอร์ยกเลิก', 'ยอดขายก่อนหักยกเลิก (บาท)', 'ยอดขายสุทธิ (บาท)', 'อัตราการยกเลิก (%)']];

        if (effectiveDays === 1) {
            for (let h = 0; h < 24; h += 1) {
                const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && at.getHours() === h; });
                const summary = summarize(bucketOrders);
                timelineRows.push([`${pad2(h)}:00`, summary.completedCount, summary.cancelledCount, Math.round(summary.grossSales), Math.round(summary.sales), summary.cancelRate === null ? 'N/A' : Number(summary.cancelRate.toFixed(1))]);
            }
        } else {
            report.buckets.forEach(b => {
                const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && b.key === toISODate(at); });
                const summary = summarize(bucketOrders);
                timelineRows.push([b.label, summary.completedCount, summary.cancelledCount, Math.round(summary.grossSales), Math.round(summary.sales), summary.cancelRate === null ? 'N/A' : Number(summary.cancelRate.toFixed(1))]);
            });
        }

        exportXlsx( `onlyfoods-overview-${customRange ? `${customStart}-to-${customEnd}` : `${anchor}-${days}d`}.xlsx`,[
            { name: 'สรุปภาพรวม', rows: overviewRows, widths: [38, 24] },
            { name: 'รายงานรายร้าน', rows: storeRows, widths: [32, 18, 18, 30, 22, 22] },
            { name: 'ยอดขายตามเวลา', rows: timelineRows, widths: [18, 18, 18, 30, 22, 22] }
        ]);

        setExportPreview(null);
        pushToast('บันทึกไฟล์ XLSX เรียบร้อยแล้ว');
    } catch (err) {
        pushToast('สร้างไฟล์ XLSX ไม่สำเร็จ', 'error');
    }
};
    return (<>
      {(contractSoonStores.length > 0 || contractExpiredStores.length > 0) && (<AlertBanner tone="warn" style={{ marginBottom: '16px' }}>
        {contractSoonStores.length > 0 && <>สัญญาใกล้หมด {money(contractSoonStores.length)} ร้าน ({contractSoonStores.map((s) => `${s.StoreName} ${contractLeftLabel(s.ContractDaysLeft)}`).join(', ')})</>}
        {contractSoonStores.length > 0 && contractExpiredStores.length > 0 && ' · '}
        {contractExpiredStores.length > 0 && <>หมดสัญญาแล้ว {money(contractExpiredStores.length)} ร้าน ({contractExpiredStores.map((s) => s.StoreName).join(', ')})</>}
        {' — '}
        <button type="button" onClick={() => navigateTo('contract-tracking')} style={{ border: 'none', background: 'transparent', padding: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_STACK, fontSize: '13px' }}>
          ดูหน้าติดตามสัญญา →
        </button>
      </AlertBanner>)}

      <div
        className="of-control-status-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '18px',
          marginBottom: '18px'
        }}
      >
        {/* การควบคุมศูนย์อาหาร */}
<Card style={{ marginBottom: '0' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, flex: '1 1 260px' }}>
            <div style={{ width: '44px', height: '44px', minWidth: '44px', borderRadius: T.radiusMd, display: 'grid', placeItems: 'center', background: foodCourtOpen ? T.greenSoft : T.redSoft }}>
                <Icon name="power" size={21} color={foodCourtOpen ? T.up : T.down} />
            </div>
            <div style={{ minWidth: 0 }}>
                <h3 style={{ ...h3Style, margin: 0 }}>การควบคุมศูนย์อาหาร</h3>
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: foodCourtOpen ? T.up : T.down }} />
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: foodCourtOpen ? T.up : T.down }}>{foodCourtOpen ? 'ศูนย์อาหารเปิดให้บริการ' : 'ศูนย์อาหารปิดให้บริการ'}</span>
                </div>
                <div style={{ marginTop: '7px', color: T.muted, fontSize: '13px' }}>เวลาทำการ {foodCourtOpenTime} - {foodCourtCloseTime}</div>
                <div style={{ marginTop: '4px', color: foodCourtMode === 'AUTO' ? T.muted : '#B7791F', fontSize: '12.5px' }}>{foodCourtMode === 'AUTO' ? 'ระบบเปิด-ปิดอัตโนมัติ' : 'กำลังใช้สถานะที่ผู้บริหารกำหนดเอง'}</div>
            </div>
        </div>

        <button type="button" onClick={onOpenSettings} title="ตั้งค่าเวลาทำการ" aria-label="ตั้งค่าเวลาทำการ" style={{ width: '40px', height: '40px', minWidth: '40px', borderRadius: T.radiusMd, border: `1px solid ${T.line}`, background: T.surface, color: T.muted, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Icon name="settings" size={18} />
        </button>
    </div>

    <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: `1px solid ${T.line}`, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Button variant={foodCourtOpen ? 'danger' : 'primary'} icon="power" onClick={onToggleCourt} disabled={switchingCourt}>
            {switchingCourt ? 'กำลังบันทึก...' : foodCourtOpen ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร'}
        </Button>
        {foodCourtMode !== 'AUTO' && <Button variant="ghost" icon="refresh" onClick={onReturnAuto} disabled={returningFoodCourtAuto}>{returningFoodCourtAuto ? 'กำลังกลับสู่ระบบอัตโนมัติ...' : 'กลับสู่ระบบอัตโนมัติ'}</Button>}
    </div>

    {foodCourtMode !== 'AUTO' && <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: T.radiusMd, background: T.accentSoft, color: '#8A5A00', fontSize: '12.5px', lineHeight: 1.6 }}>
        สถานะที่กำหนดด้วยตนเองจะมีผลจนถึงเวลาเปลี่ยนสถานะอัตโนมัติครั้งถัดไป
    </div>}
</Card>

        {/* สถานะร้านค้า */}
        <Card style={{ marginBottom: '0' }}>
          <div style={{
            ...courtControlStyle,
            minHeight: '132px',
            padding: '18px 20px'
          }}>
            <div className="of-store-status-grid" style={{
              display: 'grid',
              gridTemplateColumns: '52px minmax(0, 0.9fr) minmax(0, 1.6fr)',
              columnGap: 'clamp(8px, 1.5vw, 16px)',
              width: '100%',
              alignItems: 'stretch',
              minHeight: '96px'
            }}>
              {/* Icon */}
              <div style={{
                width: '52px',
                height: '52px',
                minWidth: '52px',
                borderRadius: T.radiusMd,
                display: 'grid',
                placeItems: 'center',
                background: T.primarySoft,
                color: T.primaryDark
              }}>
                <Icon name="store" size={28} color={T.primaryDark}/>
              </div>

              {/* Title */}
              <div style={{
                minWidth: 0,
                paddingTop: '1px'
              }}>
                <h3 style={h3Style}>สถานะร้านค้า</h3>
                <p style={{ ...bodyStyle, margin: '6px 0 0' }}>
                  ร้านค้าทั้งหมด{' '}
                  <strong style={{ color: T.ink }}>
                    {money(storeStatus.total)} ร้าน
                  </strong>
                </p>
                  </div>

              {/* Status numbers — กลางการ์ดยาวไปทางขวา */}
             <div className="of-store-status-nums" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 'clamp(8px, 2vw, 24px)',
                alignItems: 'center',
                minWidth: 0,
                paddingRight: '8px'
              }}>
                {[
                  { key: 'open', label: 'เปิดให้บริการ', value: storeStatus.open, color: T.up },
                  { key: 'closed', label: 'ปิดทำการ', value: storeStatus.closed, color: T.muted },
                  { key: 'suspended', label: 'ระงับสิทธิ์', value: storeStatus.suspended, color: T.down }
                ].map((item) => (
                  <div key={item.key} style={{
                    minWidth: 0
                  }}>
                    <div style={{
                      color: T.ink,
                      fontSize: '32px',
                      lineHeight: 1,
                      fontWeight: 800,
                      letterSpacing: '-0.8px'
                    }}>
                      {money(item.value)}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '6px',
                      minWidth: 0,
                      flexWrap: 'wrap'
                    }}>
                      <span style={{
                        width: '7px',
                        height: '7px',
                        minWidth: '7px',
                        borderRadius: '50%',
                        background: item.color
                      }}/>

                      <span style={{
                        color: T.muted,
                        fontSize: '12px',
                        lineHeight: 1.2,
                        fontWeight: 500
                      }}>
                        {item.label}
                      </span>
                    </div>

                    <div style={{
                      color: T.muted,
                      fontSize: '10px',
                      marginTop: '2px'
                    }}>
                      
                    </div>
                  </div>
                ))}
              </div>

            </div>

            <div className="of-store-status-btn" style={{ marginTop: '-18px' }}>
              <Button
                variant="danger"
                icon="store"
                onClick={() => ctx.navigateTo('store-manage')}
              >
                จัดการร้านค้า
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .of-control-status-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <Card style={{ marginBottom: '18px' }}>
        <div style={toolbarStyle}>
          <div>
            <h3 style={h3Style}>ช่วงข้อมูลที่กำลังดู</h3>
            <p style={captionStyle}>
              {periodLabel} · อัปเดตล่าสุด {nowStamp()} น.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

            <Button variant="ghost" icon="download" onClick={() => setExportPreview('csv')}>
              CSV
            </Button>
            <Button variant="dark" icon="download" onClick={() => setExportPreview('xlsx')}>
              XLSX
            </Button>
          </div>
        </div>
      </Card>

      <div className="of-kpi-hero">
        <KpiCard label="ยอดขายสุทธิ" value={`${money(report.now.sales)}`} unit="บาท" delta={changePct(report.now.sales, report.before.sales)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} highlight icon="trend"/>
        <KpiCard label="ออเดอร์สำเร็จ" value={money(report.now.completedCount)} unit="ออเดอร์" delta={changePct(report.now.completedCount, report.before.completedCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} variant="blue" icon="check"/>
      </div>

      <div className="of-kpi-small">
        <KpiCard size="sm" label="มูลค่าออเดอร์รวมก่อนหักยกเลิก" value={money(report.now.grossSales)} unit="บาท" hint="รวมมูลค่าออเดอร์สำเร็จและออเดอร์ที่ถูกยกเลิก" delta={changePct(report.now.grossSales, report.before.grossSales)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="wallet" tone="blue"/>
        <KpiCard size="sm" label="ออเดอร์ยกเลิก" value={money(report.now.cancelledCount)} unit="ออเดอร์" delta={changePct(report.now.cancelledCount, report.before.cancelledCount)} deltaLabel={compareLabel} hasPreviousData={report.hasPreviousData} icon="ban" tone="amber" invertDelta/>
        <KpiCard size="sm" label="อัตราการยกเลิก" value={report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`} delta={ report.now.cancelRate !== null && report.before.cancelRate !== null  ? report.now.cancelRate - report.before.cancelRate : null } deltaSuffix=" จุดเปอร์เซ็นต์" deltaLabel="" hasPreviousData={report.hasPreviousData} hint={report.now.cancelRate === null ? 'ไม่มีออเดอร์ในช่วงนี้' : undefined} icon="info" tone="amber" invertDelta />
        <KpiCard size="sm" label="ช่วงเวลาขายดี" value={report.peakHour === null ? '—' : `${pad2(report.peakHour)}:00`} unit={report.peakHour === null ? '' : 'น.'} hint={report.peakHour === null ? 'ยังไม่มีออเดอร์สำเร็จ' : `มี ${money(report.peakOrderCount)} ออเดอร์`} delta={null} icon="calendar" tone="purple" />
      </div>

      <div style={chartGridStyle}>

        <Card>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ color: T.muted, fontSize: '14px', fontWeight: 500 }}>
                {effectiveDays === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}
              </div>
              <StorePeriodPicker anchor={anchor} setAnchor={setAnchor} days={days} setDays={setDays} custom={customRange} setCustom={setCustomRange} startDate={customStart} setStartDate={setCustomStart} endDate={customEnd} setEndDate={setCustomEnd} />
            </div>
            <h3 style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: 700, color: T.ink }}>
              {money(report.now.sales)} บาท
            </h3>
            <p style={captionStyle}>
              ชี้ที่จุดบนกราฟเพื่อดูยอดรวม และร้านที่ขายได้มากสุด/น้อยสุดของช่วงนั้น
            </p>
          </div>
          {loading ? <EmptyState text="กำลังโหลดข้อมูล..."/> : <SalesLineChart buckets={report.buckets}/>}
        </Card>

        <Card title="ยอดขายแยกร้าน" subtitle="เรียงจากร้านที่ทำยอดสูงสุดในช่วงเดียวกัน">
          {loading ? <EmptyState text="กำลังโหลดข้อมูล..."/> : <StoreDonutChart rows={report.storeRows}/>}
        </Card>
      </div>

        <Card title="สรุปผลรายร้าน" subtitle={`ทั้งหมด ${money(visibleStoreRows.length)} ร้าน · เปิดให้บริการ ${money(report.activeStores)} ร้าน`} style={{ marginTop: '16px' }}>
        {cancelAlertStores.length > 0 && (<AlertBanner style={{ marginBottom: '12px' }}>
          {money(cancelAlertStores.length)} ร้านอัตรายกเลิกเกิน {CANCEL_ALERT_RATE}% ในช่วงนี้:{' '}
          {cancelAlertStores.map((s, i) => (<span key={s.StoreId}>
            {i > 0 && ', '}
            <button type="button" onClick={() => goCancellation(s.StoreId)} style={{ border: 'none', background: 'transparent', padding: 0, color: T.down, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_STACK, fontSize: '13px' }}>
              {s.StoreName}
            </button> ({s.cancelRate.toFixed(1)}%)
          </span>))}
                    {' — '}
          <button type="button" onClick={() => goCancellation()} style={{ border: 'none', background: 'transparent', padding: 0, color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_STACK, fontSize: '13px' }}>
            ดูวิเคราะห์การยกเลิก →
          </button>
        </AlertBanner>)}
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ร้านค้า</th>
                <th style={thRightStyle}>ออเดอร์สำเร็จ</th>
                <th style={thRightStyle}>ยอดขาย</th>
                <th style={thRightStyle} title="เปรียบเทียบยอดขายกับช่วงก่อนหน้า">{compareLabel}</th>
                <th style={thRightStyle}>ยกเลิก</th>
                <th style={thRightStyle}>อัตรายกเลิก</th>
                <th style={thStyle}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {visibleStoreRows.map((s) => (<tr key={s.StoreId} style={trStyle}>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => ctx.navigateTo('store-sales', s.StoreId)}
                      title={`ดูรายละเอียดยอดขายร้าน ${s.StoreName}`}
                      style={{ border: 'none', background: 'transparent', padding: 0, color: T.ink, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_STACK, textAlign: 'left' }}
                    >
                      {s.StoreName} <span aria-hidden="true">→</span>
                    </button>
                  </td>
                  <td style={tdRightStyle}>{money(s.completedCount)}</td>
                  <td style={{ ...tdRightStyle, minWidth: '170px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', color: T.ink, fontWeight: 700 }}>
                      {money(s.sales)} บาท
                    </div>

                  </td>
                  <td style={tdRightStyle}>
                    {s.delta === null ? (<span style={{ color: T.muted }}>—</span>) : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 9px', borderRadius: '999px', background: s.delta >= 0 ? T.greenSoft : T.redSoft, color: s.delta >= 0 ? T.up : T.down, fontWeight: 700 }}>
                        {s.delta >= 0 ? '▲' : '▼'} {Math.abs(s.delta).toFixed(1)}%
                      </span>)}
                  </td>
                  <td style={tdRightStyle}>{money(s.cancelledCount)}</td>
                  <td style={tdRightStyle}>{s.cancelRate === null ? 'N/A' : (<button type="button" onClick={() => goCancellation(s.StoreId)} title={`ดูการยกเลิกของร้าน ${s.StoreName}`} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: FONT_STACK, fontSize: '14px', color: T.text, textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                      {isCancelAlert(s.cancelRate) ? <Badge tone="danger">{s.cancelRate.toFixed(1)}%</Badge> : `${s.cancelRate.toFixed(1)}%`}
                    </button>)}</td>
                  <td style={tdStyle}>
                   <Badge tone={s.IsDeleted ? 'neutral' : s.ContractState === 'EXPIRED' || s.IsSuspended ? 'danger' : s.IsOpen ? 'ok' : 'neutral'}>
                      {s.IsDeleted ? 'ลบแล้ว' : s.ContractState === 'EXPIRED' ? 'หมดสัญญา' : s.IsSuspended ? 'ระงับสิทธิ์' : s.IsOpen ? 'เปิดบริการ' : 'ปิดร้าน'}
                    </Badge>
                  </td>
                </tr>))}
              {visibleStoreRows.length === 0 && (<tr>
                  <td colSpan="7" style={{ ...tdStyle, textAlign: 'center', color: T.muted }}>
                    ไม่พบร้านค้าที่ตรงกับคำค้นหา
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

           <Card title="ออเดอร์ที่ถูกยกเลิก" subtitle={`${periodLabel} · ดูอัตรายกเลิกรายร้าน สาเหตุ และรายการออเดอร์ได้ในหน้าวิเคราะห์การยกเลิก`} style={{ marginTop: '16px' }} right={<Button variant="ghost" icon="ban" onClick={() => goCancellation()}>ดูวิเคราะห์การยกเลิก →</Button>}>
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', marginTop: '6px' }}>
          <div><div style={captionStyle}>ออเดอร์ที่ยกเลิก</div><strong style={{ fontSize: '20px', color: T.ink }}>{money(report.now.cancelledCount)} ออเดอร์</strong></div>
          <div><div style={captionStyle}>มูลค่าออเดอร์ที่ถูกยกเลิก</div><strong style={{ fontSize: '20px', color: T.ink }}>{money(report.now.cancelledValue)} บาท</strong>{report.now.rejectedCancelledCount > 0 && <div style={{ ...captionStyle, fontSize: '12px', marginTop: '2px' }}>ไม่รวมสลิปถูกปฏิเสธ {money(report.now.rejectedCancelledCount)} ออเดอร์ (ร้านไม่ได้รับเงิน)</div>}</div>
          <div><div style={captionStyle}>ร้านที่อัตรายกเลิกเกิน {CANCEL_ALERT_RATE}%</div><strong style={{ fontSize: '20px', color: cancelAlertStores.length ? T.down : T.ink }}>{money(cancelAlertStores.length)} ร้าน</strong></div>
        </div>
      </Card>

     <Card title="รายงานปัญหาจากลูกค้า" subtitle={effectiveDays === 1 ? `รายงานที่แจ้งใน${periodLabel}` : `จำนวนรายงานแยกตามร้าน · ${periodLabel}`} style={{ marginTop: '16px' }} right={<Badge tone="warning">{money(periodIssueReports.length)} รายการ</Badge>}>
        {issueLoading ? <SkeletonRows rows={3} columns={[3, 2, 1]} label="กำลังโหลดรายงานปัญหา"/> : periodIssueReports.length === 0 ? (
          <EmptyState text="ไม่มีรายงานปัญหาในช่วงเวลาที่เลือก"/>
        ) :effectiveDays === 1 ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {periodIssueReports.slice(0, 5).map((item) => (
              <button key={item.ReportID} type="button" onClick={() => navigateTo('issue-reports', item.StoreId)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', width: '100%', textAlign: 'left', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '13px 14px', background: '#FFF', cursor: 'pointer', fontFamily: FONT_STACK }}>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', color: T.ink, fontSize: '14px' }}>{item.StoreName}</strong>
                  <span style={{ display: 'block', color: T.text, fontSize: '13px', marginTop: '4px' }}>{item.IssueType || 'ไม่ระบุประเภท'}</span>
                  <span style={{ display: 'block', color: T.muted, fontSize: '12px', marginTop: '4px' }}>
                    {item.QueueNo ? `คิว ${item.QueueNo}` : ''}{item.OrderID ? `${item.QueueNo ? ' · ' : ''}Order #${item.OrderID}` : ''}
                  </span>
                </span>
                <span style={{ color: T.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>{thaiDateTime(item.CreatedAt)}</span>
              </button>
            ))}
            {periodIssueReports.length > 5 && <p style={{ ...captionStyle, margin: 0 }}>แสดง 5 จาก {money(periodIssueReports.length)} รายการล่าสุด</p>}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            <p style={{ ...captionStyle, margin: '0 0 4px' }}>เรียงตามจำนวนรายงานจากมากไปน้อย · คลิกชื่อร้านเพื่อดูรายละเอียดรายงาน</p>
            {(showAllIssueStores ? issueCountsByStore : issueCountsByStore.slice(0, 5)).map((item) => (
              <div key={item.StoreId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '11px 13px' }}>
                <button type="button" onClick={() => navigateTo('issue-reports', item.StoreId)} style={{ border: 0, background: 'transparent', padding: 0, color: T.ink, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_STACK, textAlign: 'left' }}>{item.StoreName}</button>
                <Badge tone="warning">{money(item.count)} ครั้ง</Badge>
              </div>
            ))}
            {issueCountsByStore.length > 5 && <Button variant="ghost" onClick={() => setShowAllIssueStores((v) => !v)}>{showAllIssueStores ? 'แสดงน้อยลง' : `แสดงทุกร้าน (${issueCountsByStore.length})`}</Button>}
          </div>
        )}
      </Card>


      <Modal open={Boolean(exportPreview)} title={`พรีวิวก่อนบันทึก ${String(exportPreview || '').toUpperCase()}`} subtitle={`รายงานภาพรวมศูนย์อาหาร · ${periodLabel}`} onClose={() => setExportPreview(null)} width={820} footer={<>
            <Button variant="ghost" onClick={() => setExportPreview(null)}>ยกเลิก</Button>
            <Button variant={exportPreview === 'xlsx' ? 'dark' : 'primary'} icon="download" onClick={exportPreview === 'xlsx' ? saveXlsx : saveCsv}>
              บันทึก {String(exportPreview || '').toUpperCase()}
            </Button>
          </>}>
        <div style={{ border: `1px solid ${T.line}`, borderRadius: '12px', overflow: 'hidden', background: '#FFFFFF' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.line}`, background: '#FAFAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ ...h3Style, margin: 0 }}>รายงานภาพรวมศูนย์อาหาร</h3>
                <p style={{ ...captionStyle, marginTop: '5px' }}>{periodLabel}</p>
              </div>
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {exportPreview === 'xlsx' && (
    <div style={{
        padding: '12px 14px',
        marginBottom: '16px',
        borderRadius: T.radiusMd,
        background: T.bg,
        color: T.text,
        fontSize: '13px',
        lineHeight: 1.7
    }}>
        ไฟล์ Excel จะแยกข้อมูลเป็น 3 Sheet:
        <strong> สรุปภาพรวม · รายงานรายร้าน · ยอดขายตามเวลา</strong>
    </div>
)}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
              {[
            ['ยอดขายสุทธิ', `${money(report.now.sales)} บาท`],
            ['ออเดอร์สำเร็จ', `${money(report.now.completedCount)} ออเดอร์`],
            ['มูลค่าออเดอร์รวมก่อนหักยกเลิก', `${money(report.now.grossSales)} บาท`],
            ['ออเดอร์ยกเลิก', `${money(report.now.cancelledCount)} ออเดอร์`],
            ['อัตราการยกเลิก', report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`]
].map(([label, value]) => (<div key={label} style={{ border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: '12px' }}>
                  <div style={{ ...captionStyle, margin: 0 }}>{label}</div>
                  <strong style={{ display: 'block', color: T.ink, marginTop: '6px', fontSize: '16px' }}>{value}</strong>
                </div>))}
            </div>
            <div style={{ ...captionStyle, color: T.text, fontWeight: 700, marginBottom: '8px' }}>{exportPreview === 'csv' && effectiveDays > 1 ? 'ตัวอย่างข้อมูลสรุปผลรายวัน' : 'ตัวอย่างข้อมูลสรุปผลรายร้าน'}</div>

<div style={{ overflowX: 'auto' }}><table style={tableStyle}>
    <thead><tr>
        <th style={thStyle}>{exportPreview === 'csv' && effectiveDays > 1 ? 'วันที่' : 'ร้านค้า'}</th>
        <th style={thRightStyle}>ออเดอร์สำเร็จ</th><th style={thRightStyle}>ออเดอร์ที่ยกเลิก</th><th style={thRightStyle}>ยอดขายก่อนหักยกเลิก</th><th style={thRightStyle}>ยอดขายสุทธิ</th><th style={thRightStyle}>อัตราการยกเลิก</th>
    </tr></thead>
    <tbody>
        {exportPreview === 'csv' && effectiveDays > 1 ? <>
            {report.buckets.slice(0, 6).map(bucket => {
                const bucketOrders = report.current.filter(o => { const at = parseOrderDate(o.CreatedAt); return at && toISODate(at) === bucket.key; }), summary = summarize(bucketOrders);
                return <tr key={bucket.key} style={trStyle}>
                    <td style={tdStyle}>{bucket.label}</td><td style={tdRightStyle}>{money(summary.completedCount)}</td><td style={tdRightStyle}>{money(summary.cancelledCount)}</td><td style={tdRightStyle}>{money(summary.grossSales)} บาท</td><td style={tdRightStyle}>{money(summary.sales)} บาท</td><td style={tdRightStyle}>{summary.cancelRate === null ? 'N/A' : `${summary.cancelRate.toFixed(1)}%`}</td>
                </tr>;
            })}
            <tr style={{ ...trStyle, fontWeight: 700, background: T.bg }}>
                <td style={tdStyle}>สรุปภาพรวม</td><td style={tdRightStyle}>{money(report.now.completedCount)}</td><td style={tdRightStyle}>{money(report.now.cancelledCount)}</td><td style={tdRightStyle}>{money(report.now.grossSales)} บาท</td><td style={tdRightStyle}>{money(report.now.sales)} บาท</td><td style={tdRightStyle}>{report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`}</td>
            </tr>
        </> : <>
            {report.storeRows.slice(0, 6).map(s => <tr key={s.StoreId} style={trStyle}>
                <td style={tdStyle}>{s.StoreName}</td><td style={tdRightStyle}>{money(s.completedCount)}</td><td style={tdRightStyle}>{money(s.cancelledCount)}</td><td style={tdRightStyle}>{money(s.grossSales)} บาท</td><td style={tdRightStyle}>{money(s.sales)} บาท</td><td style={tdRightStyle}>{s.cancelRate === null ? 'N/A' : `${s.cancelRate.toFixed(1)}%`}</td>
            </tr>)}
            {exportPreview === 'csv' && <tr style={{ ...trStyle, fontWeight: 700, background: T.bg }}>
                <td style={tdStyle}>สรุปภาพรวม</td><td style={tdRightStyle}>{money(report.now.completedCount)}</td><td style={tdRightStyle}>{money(report.now.cancelledCount)}</td><td style={tdRightStyle}>{money(report.now.grossSales)} บาท</td><td style={tdRightStyle}>{money(report.now.sales)} บาท</td><td style={tdRightStyle}>{report.now.cancelRate === null ? 'N/A' : `${report.now.cancelRate.toFixed(1)}%`}</td>
            </tr>}
        </>}
    </tbody>
</table></div>

{exportPreview === 'csv' && effectiveDays > 1 && report.buckets.length > 6 && <p style={{ ...captionStyle, textAlign: 'center', marginTop: '10px' }}>และอีก {report.buckets.length - 6} วันในไฟล์จริง</p>}
{!(exportPreview === 'csv' && effectiveDays > 1) && report.storeRows.length > 6 && <p style={{ ...captionStyle, textAlign: 'center', marginTop: '10px' }}>และอีก {report.storeRows.length - 6} ร้านในไฟล์จริง</p>}
          </div>
        </div>
      </Modal>
    </>);
}
