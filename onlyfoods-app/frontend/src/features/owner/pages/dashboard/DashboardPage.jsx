import { thaiDate, fmtMoney } from '../../lib/format';
import { PageHeader, Badge, Icon, Skeleton, DeltaChip, KpiSmall } from '../../components/ui';
import { StoreControlCard } from './StoreControlCard';
import { StorePeriodPicker } from '../../components/StorePeriodPicker';
import { changePct } from '../../lib/sales';
import { SalesLineChart } from './SalesLineChart';
import { MenuBreakdown } from './MenuBreakdown';

// หน้าภาพรวมร้าน : การควบคุมร้าน ตอนนี้ในร้าน สรุปยอดขาย กราฟแนวโน้ม เมนูขายดี
// ข้อมูลและ state อยู่ที่ OwnerView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function DashboardPage({
  storeReport, loaded, customRange, storePeriod, customStart, customEnd, storeDays, storeAnchor, foodCourtHours,
  liveStats, dash, storeDetail, contractTone, daysLeft, formatContractDate, contractProgress, openState,
  openBlockedReason, storeBusy, toggleStore, requestCloseStore, pauseStore, storeToAuto, setScheduleOpen,
  setMenuFilter, setPage, openSalesHistory, setStoreAnchor, setStoreDays, setCustomRange, setCustomStart,
  setCustomEnd, products
}) {
  const now = storeReport?.now || { sales: 0, grossSales: 0, completedCount: 0, cancelledCount: 0, cancelRate: null, avgOrder: 0 };
  const before = storeReport?.before || {};
  const hasPrev = Boolean(storeReport?.hasPreviousData);
  const ready = loaded.history && storeReport;
  const periodLabel = customRange
    ? (storePeriod.days === 1 ? `วันที่ ${thaiDate(customStart)}` : `${thaiDate(customStart)} – ${thaiDate(customEnd)}`)
    : (storeDays === 1 ? `วันที่ ${thaiDate(storeAnchor)}` : `${storeDays} วันย้อนหลังถึง ${thaiDate(storeAnchor)}`);
  const compareLabel = storePeriod.days === 1 ? 'เทียบวันก่อนหน้า' : `เทียบ ${storePeriod.days} วันก่อนหน้า`;
  const rateDelta = now.cancelRate !== null && before.cancelRate !== null && before.cancelRate !== undefined
    ? now.cancelRate - before.cancelRate : null;
  const hoursNote = storePeriod.days === 1 && foodCourtHours ? ` · แสดงช่วง ${foodCourtHours.open}–${foodCourtHours.close} น.` : '';
  const live = [
    { key: 'waiting', label: 'รอดำเนินการ', value: liveStats.waiting, icon: 'clock', tone: 'amber', go: 'history' },
    { key: 'cooking', label: 'กำลังปรุง', value: liveStats.cooking, icon: 'flame', tone: 'orange', go: 'history' },
    { key: 'ready', label: 'รอลูกค้ารับ', value: liveStats.ready, icon: 'bell', tone: 'green', go: 'history' },
    { key: 'out', label: 'เมนูที่หมดอยู่', value: liveStats.outOfStock, icon: 'soldout', tone: 'red', go: 'menu' },
  ];
  return (
  <div className="berry-dashboard-grid od-fit">
    <PageHeader title="ภาพรวมร้าน" subtitle={dash.StoreName ? `${dash.StoreName} · ยอดขาย แนวโน้ม และเมนูขายดี` : 'ยอดขาย แนวโน้ม และเมนูขายดีของร้าน'} icon="dashboard">
      <Badge tone={storeDetail?.IsSuspended ? 'danger' : 'success'}>
        {storeDetail?.IsSuspended ? 'ถูกระงับสิทธิ์' : 'สิทธิ์ปกติ'}
      </Badge>
      {/* สัญญาเช่า (ย่อ) : จำนวนวันที่เหลือ + แถบเวลาที่ผ่านไป ; ชี้ดูวันเริ่ม-สิ้นสุด */}
      <span className={`od-contract-chip tone-${contractTone}`}
        title={daysLeft === null ? 'ยังไม่มีข้อมูลสัญญาของร้าน'
          : `สัญญาเช่า ${formatContractDate(storeDetail?.ContractStartDate)} – ${formatContractDate(storeDetail?.ContractEndDate)}${daysLeft <= 30 ? ' · กรุณาติดต่อผู้บริหารเพื่อต่อสัญญา' : ''}`}>
        <Icon name="calendar" size={14} />
        {daysLeft === null ? 'ยังไม่มีข้อมูลสัญญา' : (
          <>
            <span>สัญญา{daysLeft < 0 ? 'หมดอายุแล้ว' : <> เหลือ <b>{fmtMoney(daysLeft)}</b> วัน</>}</span>
            {contractProgress !== null && (
              <span className="bar" role="progressbar" aria-valuenow={Math.round(contractProgress)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${contractProgress}%` }} />
              </span>
            )}
            <span className="end">ถึง {formatContractDate(storeDetail?.ContractEndDate)}</span>
          </>
        )}
      </span>
    </PageHeader>

    {/* ===== การควบคุมร้าน + ตอนนี้ในร้าน (ไม่ขึ้นกับช่วงวันที่) ===== */}
    <div className="od-now-row">
    <StoreControlCard
      state={openState}
      blockedReason={openState === 'CLOSED' ? openBlockedReason : null}
      mode={storeDetail?.OpenMode || 'AUTO'}
      openTime={storeDetail?.OpenTime}
      closeTime={storeDetail?.CloseTime}
      hasOwnHours={Boolean(storeDetail?.HasOwnHours)}
      overrideUntil={storeDetail?.OverrideUntil}
      pausedUntil={storeDetail?.PausedUntil}
      busy={storeBusy}
      onOpen={() => toggleStore(true)}
      onClose={requestCloseStore}
      onPause={() => pauseStore(true)}
      onResume={() => pauseStore(false)}
      onAuto={storeToAuto}
      onSettings={() => setScheduleOpen(true)}
    />
    <section className="od-live">
      <div className="od-live-head">
        <span className="pulse" />
        <strong>ตอนนี้ในร้าน</strong>
        <span className="muted">อัปเดตอัตโนมัติ · วันนี้ {fmtMoney(liveStats.todayOrders)} ออเดอร์</span>
      </div>
      <div className="od-live-grid">
        {live.map(item => (
          <button key={item.key} type="button" className={`od-live-item tone-${item.tone} ${item.value > 0 ? 'has' : ''}`} onClick={() => {
            if (item.go === 'menu') { setMenuFilter(item.key === 'out' ? 'out' : 'all'); setPage('menu'); }
            else openSalesHistory({ status: 'active', range: 'today' });
          }}>
            <span className="icon"><Icon name={item.icon} size={18} /></span>
            <span className="text">
              {loaded.history && loaded.products ? <strong>{fmtMoney(item.value)}</strong> : <Skeleton height={22} width={34} />}
              <span>{item.label}</span>
            </span>
            <Icon name="arrowRight" size={15} />
          </button>
        ))}
      </div>
    </section>
    </div>

    {/* ===== แถบช่วงเวลา (ติดด้านบนเวลาเลื่อน) ===== */}
    <div className="od-period-bar">
      <div className="od-period-text">
        <Icon name="calendar" size={16} />
        <span><strong>{periodLabel}</strong> · {compareLabel}</span>
      </div>
      <StorePeriodPicker
        setAnchor={setStoreAnchor}
        days={storeDays} setDays={setStoreDays}
        custom={customRange} setCustom={setCustomRange}
        startDate={customStart} setStartDate={setCustomStart}
        endDate={customEnd} setEndDate={setCustomEnd}
      />
    </div>

    {/* ===== สรุปยอดขาย + ตัวเลขเล็ก (แถวเดียวกันบนจอใหญ่) ===== */}
    <div className="od-stats">
      <div className="od-summary">
        <span className="od-hero-circle one" />
        <span className="od-hero-circle two" />
        {ready ? (
          <>
            <div className="od-summary-block">
              <div className="od-summary-label"><Icon name="trend" size={16} /> ยอดขายสุทธิ</div>
              <div className="od-summary-value">{fmtMoney(now.sales)}<small>บาท</small></div>
              {(now.noShowCount > 0 || now.refunded > 0) && (
                <div className="od-summary-note">
                  {now.noShowCount > 0 && <span>รวมไม่มารับ {fmtMoney(now.noShowCount)} ออเดอร์ ฿{fmtMoney(now.noShowSales)}</span>}
                  {now.refunded > 0 && <span>หักคืนเงินแล้ว ฿{fmtMoney(now.refunded)}</span>}
                </div>
              )}
              <DeltaChip solid delta={changePct(now.sales, before.sales)} label={compareLabel} hasPreviousData={hasPrev} />
            </div>
            <div className="od-summary-divider" />
            <div className="od-summary-block">
              <div className="od-summary-label"><Icon name="check" size={16} /> ออเดอร์ที่ขายได้</div>
              <div className="od-summary-value">{fmtMoney(now.revenueCount)}<small>ออเดอร์</small></div>
              {now.noShowCount > 0 && (
                <div className="od-summary-note"><span>สำเร็จ {fmtMoney(now.completedCount)} · ไม่มารับ {fmtMoney(now.noShowCount)}</span></div>
              )}
              <DeltaChip solid delta={changePct(now.revenueCount, before.revenueCount)} label={compareLabel} hasPreviousData={hasPrev} />
            </div>
          </>
        ) : (
          <div className="od-summary-skel">
            <Skeleton height={14} width={110} style={{ opacity: 0.5 }} />
            <Skeleton height={34} width={180} style={{ opacity: 0.5 }} />
            <Skeleton height={22} width={150} style={{ opacity: 0.5 }} />
          </div>
        )}
      </div>

      {ready ? (
        <>
          <KpiSmall tone="blue" icon="receipt" value={fmtMoney(now.grossSales)} unit="บาท" label="มูลค่าออเดอร์รวมก่อนหักยกเลิก">
            <DeltaChip delta={changePct(now.grossSales, before.grossSales)} label={compareLabel} hasPreviousData={hasPrev} />
          </KpiSmall>
          <KpiSmall tone="green" icon="coin" value={fmtMoney(now.avgOrder)} unit="บาท" label="มูลค่าเฉลี่ยต่อออเดอร์">
            <DeltaChip delta={changePct(now.avgOrder, before.avgOrder)} label={compareLabel} hasPreviousData={hasPrev} />
          </KpiSmall>
          <KpiSmall tone="red" icon="soldout" className="wide" value={fmtMoney(now.cancelledCount)} unit="ออเดอร์" label="ออเดอร์ที่ถูกยกเลิก"
            aside={{ value: now.cancelRate === null ? 'N/A' : `${now.cancelRate.toFixed(1)}%`, label: 'อัตราการยกเลิก' }}>
            <DeltaChip invert suffix=" จุด" delta={rateDelta} label={`อัตรายกเลิก${compareLabel}`} hasPreviousData={hasPrev}
              hint={now.cancelRate === null ? 'ยังไม่มีออเดอร์ที่จบในช่วงนี้' : undefined} />
          </KpiSmall>
        </>
      ) : [0, 1, 2].map(i => (
        <div key={i} className={`od-kpi ${i === 2 ? 'wide' : ''}`}>
          <div className="od-kpi-main">
            <Skeleton height={42} width={42} radius={10} />
            <div style={{ flex: 1, display: 'grid', gap: 8 }}><Skeleton height={20} width="60%" /><Skeleton height={12} width="85%" /></div>
          </div>
          <Skeleton height={20} width={140} radius={999} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>

    {/* ===== กราฟแนวโน้ม + เมนูขายดี (กินความสูงที่เหลือของหน้าจอ) ===== */}
    <div className="od-main-row">
      <div className="berry-card od-fill-card">
        <div className="od-card-head">
          <div>
            <h3>{storePeriod.days === 1 ? 'แนวโน้มยอดขายรายชั่วโมง' : 'แนวโน้มยอดขายรายวัน'}</h3>
            <p>ชี้ที่จุดบนกราฟเพื่อดูยอดขายของช่วงเวลานั้น{hoursNote}</p>
          </div>
          {ready && <div className="od-head-total">{fmtMoney(now.sales)} <small>บาท</small></div>}
        </div>
        {ready ? <SalesLineChart buckets={storeReport?.buckets || []} /> : <div className="od-line-chart"><Skeleton height="100%" radius={12} /></div>}
      </div>

      <div className="berry-card od-fill-card">
        <div className="od-card-head">
          <div>
            <h3>เมนูขายดีและสัดส่วนยอดขาย</h3>
            <p>เรียงตามจำนวนจาน · ชี้ที่วงกลมหรือรายการเพื่อดูยอดขาย</p>
          </div>
          {ready && (storeReport?.menus || []).length > 0 && (
            <span className="od-chip">{fmtMoney((storeReport?.menus || []).length)} เมนูที่ขายได้</span>
          )}
        </div>
        {ready ? <MenuBreakdown rows={storeReport?.menus || []} products={products} /> : (
          <div className="od-menu-wrap">
            <div className="od-donut-box"><Skeleton height="100%" width="100%" radius={999} /></div>
            <div className="od-menu-legend">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} height={40} radius={10} />)}</div>
          </div>
        )}
      </div>
    </div>
  </div>
  );
}
