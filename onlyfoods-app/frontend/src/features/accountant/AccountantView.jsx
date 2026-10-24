import { useState, useEffect, useMemo, useRef } from 'react';
import { startPolling } from '../../lib/polling';
import { useHistoryNav } from '../../lib/historyNav';
import { RATE_ALERT, ALERT_WINDOW_DAYS, MAX_CUSTOM_DAYS } from './lib/constants';
import { THAI_MONTHS, parseOrderDate, fmtDateTime, dateOnly, daysInclusive } from './lib/format';
import { normStatus, dedupeOrders, classifyCancelledOrder, customerNameOf, buildStoreSummary, filterOrdersByRange, getPeriodBounds, buildSalesTrend, buildTopMenu, buildMenuBreakdown, buildRangeTrend } from './lib/orders';
import { AUDIT_PAGE, mergeLogs, buildAuditRows, AUDIT_ACTION_META } from './lib/audit';
import { buildXlsxBlob, downloadBlob, REPORT_TYPES, REPORT_COLUMNS } from './lib/report';
import { Icon, useResponsiveEnhancements } from './components/ui';
import { BellButton, BrandLogo, BurgerButton, StatusPill, TopbarStyles, UserChip } from '../../shared/ui/Topbar';
import { prefetchWhenIdle } from '../../lib/apiCache';
import { refundsQuery } from '../../shared/refunds/queries';

// CSS ของหน้าฝ่ายบัญชี : แทรกเป็น <style> ตอนเปิดหน้า (ปิดหน้าแล้วหายไป)
import STYLES from './accountant.css?inline';
import DashboardPage from './pages/DashboardPage';
import SalesPage from './pages/SalesPage';
import CancelPage from './pages/CancelPage';
import RefundsPage from './pages/RefundsPage';
import AuditPage from './pages/AuditPage';
import ReportPage from './pages/ReportPage';
                                 /* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function AccountantView({ apiBase, user, onLogout }) {
  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  // Audit log ดึงทีละหน้า (backend จำกัด 500 แถวต่อครั้ง) : รอบ polling รีเฟรชหน้าล่าสุด ; ปุ่มด้านล่างโหลดหน้าที่เก่ากว่า
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoadingOlder, setAuditLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState('dashboard');
  useHistoryNav(page, (hash) => {
    const p = hash ?? 'dashboard';
    if (!['dashboard', 'sales', 'cancel', 'refunds', 'audit', 'report'].includes(p)) return false;
    setPage(p);
    return true;
  });
  // เดสก์ท็อป (>1024px) เปิดเมนูข้างไว้, แท็บเล็ตเป็นแถบไอคอน, มือถือเป็นลิ้นชัก
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 1024);
  const [foodCourtOpen, setFoodCourtOpen] = useState(null); // ป้ายสถานะศูนย์อาหารบนแถบด้านบน (null = ยังไม่รู้)
  const rootRef = useRef(null);
  useResponsiveEnhancements(rootRef);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(max-width: 1024px)');
    const onChange = (e) => setSidebarOpen(!e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', onChange); else mq.removeListener(onChange); };
  }, []);
  const [toast, setToast] = useState({ show: false, msg: '' });
  
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const [notificationsRead, setNotificationsRead] = useState(false);
  const [dropdown, setDropdown] = useState('');

  const [trendDays, setTrendDays] = useState(7);   // 'today' | 7 | 14 | 30 | 'month' | 'custom'
  const [dashMonth, setDashMonth] = useState(() => dateOnly(new Date()).slice(0, 7));   // ใช้เมื่อ trendDays = 'month'
  // ช่วงวันที่กำหนดเองของ Dashboard (ใช้เมื่อ trendDays = 'custom') : เริ่มต้น = 7 วันล่าสุด
  const [dashCustomStart, setDashCustomStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return dateOnly(d); });
  const [dashCustomEnd, setDashCustomEnd] = useState(() => dateOnly(new Date()));
  const [dashRangeError, setDashRangeError] = useState('');
  const [salesStoreFilter, setSalesStoreFilter] = useState('all');
  const [detailStoreId, setDetailStoreId] = useState(null);
  const [auditSearch, setAuditSearch] = useState('');
  const [cancelStoreFilter, setCancelStoreFilter] = useState('all');
  const [cancelReasonFilter, setCancelReasonFilter] = useState('');
  const [cancelDetailId, setCancelDetailId] = useState(null);
  const [cancelShowAll, setCancelShowAll] = useState(false);
  // ส่วนที่ข้อมูลเยอะ: เริ่มต้นย่อไว้ ผู้ใช้กดขยายได้
  const [watchOpen, setWatchOpen] = useState(false);
  const [salesRowsOpen, setSalesRowsOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [reportRowsOpen, setReportRowsOpen] = useState(false);
  const [menusOpen, setMenusOpen] = useState(false);
  const [auditCat, setAuditCat] = useState('all');
  const [auditLimit, setAuditLimit] = useState(100);
  const [cancelRange, setCancelRange] = useState('all');   // 'all' | 'today' | 7 | 14 | 30 | 'custom' — ค่าเริ่มต้น: ทั้งหมด
  
  const todayStr = dateOnly(new Date());
  const curYear = Number(todayStr.slice(0, 4));
  const curMonth = Number(todayStr.slice(5, 7));
  const [reportType, setReportType] = useState('store');
  const [reportFormat, setReportFormat] = useState('csv');
  const [reportEnd] = useState(() => dateOnly(new Date()));
  const [reportStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return dateOnly(d); });
  const [reportMode, setReportMode] = useState('month');   // 'month' รายเดือน | 'year' รายปี | 'custom' กำหนดเอง
  const [reportMonth, setReportMonth] = useState(curMonth);
  const [reportYearSel, setReportYear] = useState(curYear);   // ปีที่ผู้ใช้เลือก (ปีจริงที่ใช้คือ reportYear ด้านล่าง)
  const [customStart, setCustomStart] = useState(reportStart);
  const [customEnd, setCustomEnd] = useState(reportEnd);
  const [reportStoreFilter, setReportStoreFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [salesRange, setSalesRange] = useState(7);   // 'today' | 7 | 14 | 30 | 'month' | 'custom' — ค่าเริ่มต้น: 7 วัน
  const [salesCustomStart, setSalesCustomStart] = useState(reportStart);
  const [salesMonth, setSalesMonth] = useState(() => new Date().toISOString().slice(0, 7));   // 'YYYY-MM' (เลือกเดือน)
  const [salesCustomEnd, setSalesCustomEnd] = useState(reportEnd);
  const [cancelCustomStart, setCancelCustomStart] = useState(reportStart);
  const [cancelCustomEnd, setCancelCustomEnd] = useState(reportEnd);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [loadError, setLoadError] = useState('');
  const [connInfo, setConnInfo] = useState('');
  const baseRef = useRef(null);

  // หา URL ของ backend: ใช้ apiBase ที่ส่งเข้ามาก่อน ถ้าไม่มี/ต่อไม่ได้ ลองพอร์ต 8000 ของเครื่องเดียวกัน
  const resolveBase = async () => {
    if (baseRef.current) return baseRef.current;
    const host = window.location.hostname || 'localhost';
    const candidates = [...new Set(
      [apiBase, `${window.location.protocol}//${host}:8000`, `http://127.0.0.1:8000`, `http://localhost:8000`, window.location.origin]
        .filter(Boolean).map(b => String(b).trim().replace(/\/+$/, ''))
    )];
    const tried = [];
    for (const b of candidates) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        const r = await fetch(`${b}/api/stores`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (r.ok) { baseRef.current = b; return b; }
        tried.push(`${b} → HTTP ${r.status}`);
      } catch (e) {
        clearTimeout(timer);
        tried.push(`${b} → ${e.name === 'AbortError' ? 'ไม่ตอบสนอง' : 'เชื่อมต่อไม่ได้'}`);
      }
    }
    throw new Error(tried.join('  |  '));
  };

  const fetchData = async () => {
    let base;
    try {
      base = await resolveBase();
    } catch (e) {
      setLoadError(`เชื่อมต่อ backend ไม่ได้ — ${e.message}${apiBase ? '' : '  (ไม่ได้รับ apiBase จากหน้าหลัก)'}`);
      setLoading(false);
      return;
    }

    const getList = (path) => fetch(`${base}${path}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(`${path} → HTTP ${r.status}${body && body.detail ? `: ${typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)}` : ''}`);
        }
        return r.json();
      })
      .then(d => (Array.isArray(d) ? d : Promise.reject(new Error(`${path} → ข้อมูลไม่ใช่รายการ`))));

    const storesReq = getList('/api/stores/history').catch(() => getList('/api/stores'));  // ถ้า history ใช้ไม่ได้ ถอยไปใช้รายชื่อร้านปกติ
    // สถานะศูนย์อาหาร (ป้ายบนแถบด้านบน) : โหลดไม่ได้ไม่นับเป็น error ของข้อมูลบัญชี
    fetch(`${base}/api/food-court/status`).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.is_open !== 'undefined') setFoodCourtOpen(Boolean(d.is_open)); }).catch(() => {});
    const [st, od, lg] = await Promise.allSettled([storesReq, getList('/api/orders'), getList(`/api/audit-logs?limit=${AUDIT_PAGE}`)]);
    if (st.status === 'fulfilled') setStores(st.value);
    if (od.status === 'fulfilled') setOrders(dedupeOrders(od.value));   // กันออเดอร์ซ้ำตั้งแต่โหลด : จำนวน/ยอดเงินทุกหน้าจึงไม่นับซ้ำ
    if (lg.status === 'fulfilled') {
      setLogs(prev => mergeLogs(lg.value, prev));
      setAuditHasMore(prev => prev || lg.value.length >= AUDIT_PAGE);
    }
    const failed = [st, od, lg].filter(r => r.status === 'rejected').map(r => r.reason && r.reason.message);
    setLoadError(failed.length ? `โหลดข้อมูลจากฐานข้อมูลไม่สำเร็จ — ${failed.join('  |  ')}` : '');
    setConnInfo(failed.length === 0 && od.value.length === 0
      ? `เชื่อมต่อ backend (${base}) สำเร็จ แต่ยังไม่มีออเดอร์ในฐานข้อมูล` : '');
    if (failed.length < 3) setLastUpdated(new Date());
    setLoading(false);
  };

  const loadOlderLogs = async () => {
    setAuditLoadingOlder(true);
    try {
      const base = baseRef.current || apiBase || '';
      const res = await fetch(`${base}/api/audit-logs?limit=${AUDIT_PAGE}&offset=${logs.length}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const older = Array.isArray(d) ? d : [];
      setLogs(prev => mergeLogs(prev, older));
      setAuditHasMore(older.length >= AUDIT_PAGE);
    } catch (e) {
      setLoadError(`โหลดประวัติเก่าไม่สำเร็จ — ${e.message}`);
    } finally {
      setAuditLoadingOlder(false);
    }
  };

  useEffect(() => {
    baseRef.current = null;
    fetchData();
    return startPolling(fetchData, 15000); // fetchData คืน Promise : ไม่ยิงซ้อนรอบที่ยังไม่เสร็จ
  }, [apiBase]);

  // ข้อมูลชุดแรกมาแล้ว : โหลดรายการคืนเงินล่วงหน้าตอนเครื่องว่าง (เปิดหน้า Refund Log แล้วขึ้นทันที)
  // base ต้องตรงกับที่ pages/RefundsPage ส่งให้ RefundLog
  useEffect(() => {
    if (loading) return undefined;
    return prefetchWhenIdle([refundsQuery(baseRef.current || apiBase || '')]);
  }, [loading, apiBase]);

  useEffect(() => { setMenusOpen(false); }, [detailStoreId]);

  // ปุ่ม Esc ปิดป๊อปอัป เมนูแจ้งเตือน/โปรไฟล์ และลิ้นชักเมนูบนจอเล็ก
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setDetailStoreId(null); setCancelDetailId(null); setDropdown(''); setProfileOpen(false);
      if (window.innerWidth <= 1024) setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__avxToastTimer);
    window.__avxToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };
  
  const toggleDropdown = (name) => setDropdown(prev => (prev === name ? '' : name));

  const storeSummary = useMemo(() => buildStoreSummary(stores, orders), [stores, orders]);
  const overview = useMemo(() => {
    const totalGross = storeSummary.reduce((a, s) => a + s.grossSales, 0);
    const totalOrders = storeSummary.reduce((a, s) => a + s.totalOrders, 0);
    const totalCancelled = storeSummary.reduce((a, s) => a + s.cancelledOrders, 0);
    const rate = totalOrders > 0 ? +((totalCancelled / totalOrders) * 100).toFixed(1) : null;
    return { totalGross, totalOrders, totalCancelled, rate, abnormalStores: storeSummary.filter(s => s.status === 'bad' && !s.isDeleted) };
  }, [storeSummary]);

  // แจ้งเตือน Cancellation Rate: คำนวณจากข้อมูลย้อนหลัง ALERT_WINDOW_DAYS วัน (ไม่ขึ้นกับตัวกรองของหน้าใด ๆ)
  const alertSummary = useMemo(() => {
    const { currStart, currEnd } = getPeriodBounds(ALERT_WINDOW_DAYS);
    return buildStoreSummary(stores, filterOrdersByRange(orders, currStart, currEnd, 'all'), currStart);
  }, [stores, orders]);
  const alertStores = useMemo(
    () => alertSummary.filter(s => s.status === 'bad' && !s.isDeleted).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)),
    [alertSummary]
  );
  // มีร้านใหม่เกินเกณฑ์ -> ให้ตัวเลขบนกระดิ่งขึ้นอีกครั้ง
  const alertKey = alertStores.map(x => x.storeId).join(',');
  useEffect(() => { setNotificationsRead(false); }, [alertKey]);
  // จำนวนที่ยังไม่ได้อ่าน: ใช้ร่วมกันทั้งกระดิ่งและ badge ที่เมนู Cancellation (เปิดดูแล้วตัวเลขหายทั้งสองที่)
  const unreadAlertCount = notificationsRead ? 0 : alertStores.length;

  // ช่วงเวลาของหน้า Cancellation (ทั้งหมด = ไม่จำกัดวันที่)
  const cancelBounds = useMemo(() => {
    if (cancelRange === 'all') return { start: '', end: '' };
    if (cancelRange === 'custom') return { start: cancelCustomStart, end: cancelCustomEnd };
    const { currStart, currEnd } = getPeriodBounds(cancelRange);
    return { start: currStart, end: currEnd };
  }, [cancelRange, cancelCustomStart, cancelCustomEnd]);
  const cancelOrders = useMemo(() => filterOrdersByRange(orders, cancelBounds.start, cancelBounds.end, 'all'), [orders, cancelBounds]);
  const cancelStoreSummary = useMemo(
    () => buildStoreSummary(stores, cancelOrders, cancelBounds.start || undefined),
    [stores, cancelOrders, cancelBounds]
  );
  const cancelOverview = useMemo(() => {
    const totalOrders = cancelStoreSummary.reduce((a, s) => a + s.totalOrders, 0);
    const totalCancelled = cancelStoreSummary.reduce((a, s) => a + s.cancelledOrders, 0);
    const rate = totalOrders > 0 ? +((totalCancelled / totalOrders) * 100).toFixed(1) : null;
    return { totalOrders, totalCancelled, rate, abnormalStores: cancelStoreSummary.filter(s => s.status === 'bad' && !s.isDeleted) };
  }, [cancelStoreSummary]);

  // เรียงจากอัตราการยกเลิกมากที่สุด -> น้อยที่สุด
  const cancelSummary = useMemo(
    () => [...cancelStoreSummary].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.cancelledOrders - a.cancelledOrders || b.totalOrders - a.totalOrders),
    [cancelStoreSummary]
  );
  // เลือกร้านใดร้านหนึ่ง -> กราฟ/ตัวเลข/รายงานแสดงเฉพาะร้านนั้น, เลือกทุกร้านค้า -> แสดงทุกร้าน
  const cancelTableRows = cancelStoreFilter === 'all'
    ? cancelSummary
    : cancelSummary.filter(s => String(s.storeId) === String(cancelStoreFilter));
  const cancelScope = (() => {
    const totalOrders = cancelTableRows.reduce((a, s) => a + s.totalOrders, 0);
    const totalCancelled = cancelTableRows.reduce((a, s) => a + s.cancelledOrders, 0);
    return { totalOrders, totalCancelled, rate: totalOrders > 0 ? +((totalCancelled / totalOrders) * 100).toFixed(1) : null };
  })();
  // จำนวนออเดอร์ยกเลิก = ทุกออเดอร์ที่สถานะ Cancelled (รวมสลิปถูกปฏิเสธ) ตามช่วงวันที่/ร้านที่เลือก ; ไม่รวม Pending_Cancellation ฯลฯ ; นับออเดอร์ละครั้ง
  const cancelledOrdersList = useMemo(
    () => dedupeOrders(cancelOrders.filter(o => normStatus(o.Status) === 'Cancelled' && (cancelStoreFilter === 'all' || String(o.StoreId) === String(cancelStoreFilter)))),
    [cancelOrders, cancelStoreFilter]
  );

  // ช่วงวันที่ของ Sales Summary: ตามปุ่มที่เลือก หรือกำหนดเอง
  const { salesStart, salesEnd } = useMemo(() => {
    if (salesRange === 'custom') return { salesStart: salesCustomStart, salesEnd: salesCustomEnd };
    if (salesRange === 'month' && /^\d{4}-\d{2}$/.test(salesMonth)) {
      const [y, m] = salesMonth.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();   // วันสุดท้ายของเดือน
      return { salesStart: `${salesMonth}-01`, salesEnd: `${salesMonth}-${String(last).padStart(2, '0')}` };
    }
    const { currStart, currEnd } = getPeriodBounds(salesRange);
    return { salesStart: currStart, salesEnd: currEnd };
  }, [salesRange, salesCustomStart, salesCustomEnd, salesMonth]);
  const salesOrders = useMemo(() => filterOrdersByRange(orders, salesStart, salesEnd, 'all'), [orders, salesStart, salesEnd]);
  const salesStoreSummary = useMemo(() => buildStoreSummary(stores, salesOrders, salesStart), [stores, salesOrders, salesStart]);

  // เรียงตามยอดสุทธิจากมากไปน้อย (ถ้าเท่ากันเรียงตามยอดขายรวม แล้วตามชื่อร้าน)
  const salesFilteredRows = useMemo(() => {
    const rows = salesStoreFilter === 'all'
      ? salesStoreSummary
      : salesStoreSummary.filter(s => String(s.storeId) === String(salesStoreFilter));
    return [...rows].sort((a, b) =>
      b.netSales - a.netSales || b.grossSales - a.grossSales || String(a.storeName).localeCompare(String(b.storeName), 'th'));
  }, [salesStoreSummary, salesStoreFilter]);

  const salesTotals = useMemo(() => {
    const gross = salesFilteredRows.reduce((a, s) => a + s.grossSales, 0);
    const net = salesFilteredRows.reduce((a, s) => a + s.netSales, 0);
    const completed = salesFilteredRows.reduce((a, s) => a + s.completedOrders, 0);
    const cancelled = salesFilteredRows.reduce((a, s) => a + s.cancelledOrders, 0);
    return { gross, net, completed, cancelled };
  }, [salesFilteredRows]);

  // ยอดขายตามช่วงเวลาของร้านที่เลือกใน Sales Summary (แสดงเมื่อกรองแยกร้านเท่านั้น)
  const salesTrend = useMemo(() => {
    if (salesStoreFilter === 'all') return [];
    const ords = salesOrders.filter(o => String(o.StoreId) === String(salesStoreFilter));
    return buildRangeTrend(ords, salesStart, salesEnd);
  }, [salesOrders, salesStoreFilter, salesStart, salesEnd]);
  // รายเมนูของร้านที่เลือก (แทนตารางรายร้านเมื่อเลือกร้านใดร้านหนึ่ง)
  const salesMenuRows = useMemo(
    () => (salesStoreFilter === 'all' ? [] : buildMenuBreakdown(salesOrders, salesStoreFilter)),
    [salesOrders, salesStoreFilter]
  );
  const hourlyTrend = useMemo(() => {
    // กำหนดเอง: วันเดียว = รายชั่วโมง, หลายวัน = รายวัน (buildRangeTrend ตัดข้อมูลนอกช่วงออกให้แล้ว)
    if (trendDays === 'custom') return buildRangeTrend(orders, dashCustomStart, dashCustomEnd);
    if (trendDays !== 'month') return buildSalesTrend(orders, trendDays);
    const { currStart, currEnd } = getPeriodBounds('month', dashMonth);
    return buildRangeTrend(orders, currStart, currEnd);
  }, [orders, trendDays, dashMonth, dashCustomStart, dashCustomEnd]);

  // ดึงข้อมูลเมนูของร้านที่ถูกเลือกเพื่อแสดงใน Modal แบบละเอียด
  const detailStoreMenus = useMemo(() => {
    if (!detailStoreId) return [];
    return buildTopMenu(salesOrders, detailStoreId, 100, stores); // ดึงสูงสุด 100 เมนูที่ขายได้ของร้านที่เลือก
  }, [salesOrders, detailStoreId, stores]);

  const periodStats = useMemo(() => {
    const { currStart, currEnd, prevStart, prevEnd } = getPeriodBounds(trendDays, dashMonth, { start: dashCustomStart, end: dashCustomEnd });
    const summarize = (ords, startDay) => {
      const s = buildStoreSummary(stores, ords, startDay);
      const gross = s.reduce((a, x) => a + x.grossSales, 0);
      const net = s.reduce((a, x) => a + x.netSales, 0); 
      const totalOrders = s.reduce((a, x) => a + x.totalOrders, 0);
      const completed = s.reduce((a, x) => a + x.completedOrders, 0);   // ออเดอร์ที่สำเร็จ (Completed + NoShow)
      const cancelled = s.reduce((a, x) => a + x.cancelledOrders, 0);
      const rate = totalOrders > 0 ? +((cancelled / totalOrders) * 100).toFixed(1) : null;
      return { gross, net, totalOrders, completed, cancelled, rate, storesData: s }; 
    };
    
      const curr = summarize(filterOrdersByRange(orders, currStart, currEnd, 'all'), currStart);
      const prev = summarize(filterOrdersByRange(orders, prevStart, prevEnd, 'all'), prevStart);
      const pctChange = (c, p) => {
        if (p === 0) {
          return c === 0 ? 0 : null;
        }
        return +(((c - p) / p) * 100).toFixed(1);
      };
      // กำหนดเอง: เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน (ติดกับวันเริ่มต้น)
      const customDays = trendDays === 'custom' ? daysInclusive(currStart, currEnd) : 0;
      const compareLabel = trendDays === 'today' ? 'เทียบกับเมื่อวาน'
        : trendDays === 'month' ? 'เทียบกับเดือนก่อน'
        : trendDays === 'custom' ? (customDays === 1 ? 'เทียบกับวันก่อนหน้า' : `เทียบกับ ${customDays} วันก่อนหน้า`)
        : `เทียบกับ ${trendDays} วันก่อนหน้า`;
      return {
        curr, prev, compareLabel, bounds: { currStart, currEnd, prevStart, prevEnd, days: daysInclusive(currStart, currEnd) },
        deltaGross: pctChange(curr.gross, prev.gross),
        deltaNet: pctChange(curr.net, prev.net), 
        deltaOrders: pctChange(curr.completed, prev.completed),
        deltaCancelled: pctChange(curr.cancelled, prev.cancelled),
        deltaRate: curr.rate === null || prev.rate === null ? null : +(curr.rate - prev.rate).toFixed(1),
      };
    }, [orders, stores, trendDays, dashMonth, dashCustomStart, dashCustomEnd]);

  // ตรวจวันที่ของช่วงกำหนดเอง (Dashboard): วันสิ้นสุดห้ามก่อนวันเริ่ม, ห้ามเป็นอนาคต, ยาวไม่เกิน MAX_CUSTOM_DAYS วัน
  const changeDashStart = (v) => {
    if (!v) return;
    if (v > todayStr) { setDashRangeError('ไม่สามารถเลือกวันที่ในอนาคตได้'); return; }
    const end = v > dashCustomEnd ? v : dashCustomEnd;   // เลือกวันเริ่มหลังวันสิ้นสุด -> ปรับวันสิ้นสุดตาม
    if (daysInclusive(v, end) > MAX_CUSTOM_DAYS) { setDashRangeError(`เลือกช่วงวันที่ได้ไม่เกิน ${MAX_CUSTOM_DAYS} วัน`); return; }
    setDashRangeError('');
    setDashCustomStart(v);
    if (end !== dashCustomEnd) setDashCustomEnd(end);
  };
  const changeDashEnd = (v) => {
    if (!v) return;
    if (v < dashCustomStart) { setDashRangeError('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น'); return; }
    if (v > todayStr) { setDashRangeError('ไม่สามารถเลือกวันที่ในอนาคตได้'); return; }
    if (daysInclusive(dashCustomStart, v) > MAX_CUSTOM_DAYS) { setDashRangeError(`เลือกช่วงวันที่ได้ไม่เกิน ${MAX_CUSTOM_DAYS} วัน`); return; }
    setDashRangeError('');
    setDashCustomEnd(v);
  };

  // ร้านค้ายอดนิยม (Dashboard): ตามช่วงเวลาที่เลือก เรียงตามยอดสุทธิ ตัดร้านที่ไม่มียอดและร้านที่ถูกลบออก
  const topStores = useMemo(
    () => [...periodStats.curr.storesData]
      .filter(s => !s.isDeleted && s.totalOrders > 0)
      .sort((a, b) => b.netSales - a.netSales || b.grossSales - a.grossSales)
      .slice(0, 5),
    [periodStats]
  );

  const auditRows = useMemo(() => buildAuditRows(logs, orders), [logs, orders]);
  const auditTs = (r) => { const d = parseOrderDate(r.time); return d ? d.getTime() : 0; };

  // ข้อมูลการยกเลิกของแต่ละออเดอร์ (ใครกดยกเลิก / เวลา) จาก Audit Log — ใช้บันทึกจริงก่อนแถวที่สร้างจากข้อมูลออเดอร์
  const cancelInfoByOrder = useMemo(() => {
    const map = {};
    auditRows.forEach(r => {
      if (!r.orderId || r.tone !== 'bad') return;
      const cur = map[r.orderId];
      if (!cur || (cur.derived && !r.derived) || (cur.derived === r.derived && auditTs(r) > auditTs(cur))) map[r.orderId] = r;
    });
    return map;
  }, [auditRows]);
  const cancelInfoOf = (o) => {
    const hit = cancelInfoByOrder[String(o.OrderID)];
    if (hit) return { by: hit.by, time: hit.time, known: !hit.derived, label: hit.label };
    const act = classifyCancelledOrder(o);
    return {
      by: act === 'CUSTOMER_CANCEL_ORDER' ? customerNameOf(o) : `พนักงานร้าน ${o.StoreName || '-'}`,
      time: o.CreatedAt, known: false, label: AUDIT_ACTION_META[act].label,
    };
  };

  const auditSearched = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return auditRows;
    return auditRows.filter(r =>
      [r.action, r.label, r.by, r.details, r.summary, r.queue, r.storeName, fmtDateTime(r.time)]
        .some(v => String(v || '').toLowerCase().includes(q)));
  }, [auditRows, auditSearch]);
  const auditCatCounts = useMemo(() => {
    const c = { all: auditSearched.length };
    auditSearched.forEach(r => { c[r.cat] = (c[r.cat] || 0) + 1; });
    return c;
  }, [auditSearched]);
  const auditFiltered = useMemo(
    () => (auditCat === 'all' ? auditSearched : auditSearched.filter(r => r.cat === auditCat)),
    [auditSearched, auditCat]
  );
  const auditGroups = useMemo(() => {
    const groups = [];
    auditFiltered.slice(0, auditLimit).forEach(r => {
      const key = dateOnly(r.time);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else groups.push({ key, rows: [r] });
    });
    return groups;
  }, [auditFiltered, auditLimit]);

  // ช่วงเวลาของรายงานการเงิน: รายเดือน / รายปี / กำหนดเอง (เลือกได้ถึงวันที่ล่าสุด = วันนี้)
  // ปีที่เลือกได้ = ปีที่มีข้อมูลออเดอร์จริงในฐานข้อมูลเท่านั้น (ไม่สร้างปีเปล่า) เรียงจากล่าสุดไปเก่าสุด
  const reportYearOptions = useMemo(() => {
    const years = new Set();
    orders.forEach(o => { const y = Number(dateOnly(o.CreatedAt).slice(0, 4)); if (y >= 2000) years.add(y); });
    return [...years].sort((a, b) => b - a);
  }, [orders]);
  const hasReportYears = reportYearOptions.length > 0;
  // ถ้าปีที่เลือกไว้ไม่มีข้อมูล (เช่น ปีปัจจุบันยังไม่มีออเดอร์) ใช้ปีล่าสุดที่มีข้อมูลแทน
  const reportYear = reportYearOptions.includes(reportYearSel) ? reportYearSel : (reportYearOptions[0] ?? curYear);
  const reportMaxMonth = reportYear >= curYear ? curMonth : 12;
  const reportMonthEff = Math.min(reportMonth, reportMaxMonth);
  const { rangeStart, rangeEnd, reportPeriodLabel } = useMemo(() => {
    const cap = (d) => (d > todayStr ? todayStr : d);
    if (reportMode === 'year') {
      return { rangeStart: `${reportYear}-01-01`, rangeEnd: cap(`${reportYear}-12-31`), reportPeriodLabel: `รายปี ${reportYear} (พ.ศ. ${reportYear + 543})` };
    }
    if (reportMode === 'month') {
      const mm = String(reportMonthEff).padStart(2, '0');
      const last = String(new Date(reportYear, reportMonthEff, 0).getDate()).padStart(2, '0');
      return { rangeStart: `${reportYear}-${mm}-01`, rangeEnd: cap(`${reportYear}-${mm}-${last}`), reportPeriodLabel: `รายเดือน ${THAI_MONTHS[reportMonthEff - 1]} ${reportYear} (พ.ศ. ${reportYear + 543})` };
    }
    const st = customStart || todayStr, en = customEnd || todayStr;
    return { rangeStart: st <= en ? st : en, rangeEnd: cap(st <= en ? en : st), reportPeriodLabel: 'กำหนดเอง' };
  }, [reportMode, reportYear, reportMonthEff, customStart, customEnd, todayStr]);

  const reportOrders = useMemo(() => filterOrdersByRange(orders, rangeStart, rangeEnd, reportStoreFilter), [orders, rangeStart, rangeEnd, reportStoreFilter]);
  const reportSummary = useMemo(() => {
    const rows = buildStoreSummary(stores, reportOrders, rangeStart);
    // เลือกร้านใดร้านหนึ่ง -> แสดงเฉพาะร้านนั้น (เลือก "ทุกร้านค้า" จะแสดงทุกร้านรวมร้านที่ยอด 0)
    return reportStoreFilter === 'all' ? rows : rows.filter(r => String(r.storeId) === String(reportStoreFilter));
  }, [stores, reportOrders, reportStoreFilter, rangeStart]);
  // รายชื่อร้านใน dropdown ของรายงาน: ตามช่วงวันที่ที่เลือก (ร้านที่ลบแล้วจะอยู่ในรายการเฉพาะช่วงที่ยังมีประวัติ)
  const reportStoreOptions = useMemo(
    () => buildStoreSummary(stores, filterOrdersByRange(orders, rangeStart, rangeEnd, 'all'), rangeStart),
    [stores, orders, rangeStart, rangeEnd]
  );
  useEffect(() => {
    if (reportStoreFilter !== 'all' && !reportStoreOptions.some(x => String(x.storeId) === String(reportStoreFilter))) setReportStoreFilter('all');
  }, [reportStoreOptions, reportStoreFilter]);
  useEffect(() => {
    if (salesStoreFilter !== 'all' && !salesStoreSummary.some(x => String(x.storeId) === String(salesStoreFilter))) setSalesStoreFilter('all');
  }, [salesStoreSummary, salesStoreFilter]);
  useEffect(() => {
    if (cancelStoreFilter !== 'all' && !cancelStoreSummary.some(x => String(x.storeId) === String(cancelStoreFilter))) setCancelStoreFilter('all');
  }, [cancelStoreSummary, cancelStoreFilter]);
  const reportColumns = REPORT_COLUMNS[reportType] || REPORT_COLUMNS.store;

  const exportReport = () => {
    if (reportSummary.length === 0) { showToast('ไม่มีข้อมูลให้ส่งออกในช่วงเวลาที่เลือก'); return; }
    const header = reportColumns.map(c => c.label);
    const rows = reportSummary.map(s => reportColumns.map(c => s[c.key]));
    const storeLabel = reportStoreFilter === 'all' ? 'ทุกร้านค้า' : (reportSummary[0] ? reportSummary[0].storeName : '-');
    const typeInfo = REPORT_TYPES.find(t => t.id === reportType) || REPORT_TYPES[0];
    const fileBase = `FinancialReport-${reportType}-${rangeStart}_${rangeEnd}`;

    if (reportFormat === 'xlsx') {
      const columns = reportColumns.map(c => ({
        label: c.label,
        kind: c.money ? 'money' : c.percent ? 'percent' : c.key === 'storeName' ? 'text' : 'int',
        width: c.key === 'storeName' ? 34 : 16,
      }));
      // แถวรวม: ผลรวมของตัวเลข, อัตรายกเลิกรวมคำนวณจากยอดรวม (ไม่ใช่ค่าเฉลี่ยของ %)
      const sum = (key) => reportSummary.reduce((a, s) => a + Number(s[key] || 0), 0);
      const totalRow = reportColumns.map((c, i) => {
        if (i === 0) return 'รวม';
        if (c.percent) return sum('totalOrders') > 0 ? +((sum('cancelledOrders') / sum('totalOrders')) * 100).toFixed(1) : 'N/A';
        return sum(c.key);
      });
      const blob = buildXlsxBlob({
        sheetName: typeInfo.title,
        title: `${typeInfo.title} — ${typeInfo.sub}`,
        infoLines: [
          `ช่วงข้อมูล: ${reportPeriodLabel} (${rangeStart} ถึง ${rangeEnd})`,
          `ร้านค้า: ${storeLabel}`,
          `ออกรายงานเมื่อ: ${fmtDateTime(new Date())}`,
        ],
        columns,
        rows: rows.map(r => r.map((v, i) => (columns[i].kind === 'percent' && (v === null || v === undefined) ? 'N/A' : v))),
        totalRow,
      });
      downloadBlob(blob, `${fileBase}.xlsx`);
      showToast('ส่งออกรายงานเป็นไฟล์ Excel (.xlsx) สำเร็จ');
      return;
    }

    // ข้อความที่ขึ้นต้นด้วย = + - @ จะถูก Excel ตีเป็นสูตร (เช่นชื่อร้าน/เหตุผลที่ผู้ใช้พิมพ์) : ใส่ ' นำหน้ากันไว้
    const cell = (v) => { const t = String(v ?? ''); return typeof v === 'string' && /^[=+\-@\t\r]/.test(t) ? `'${t}` : t; };
    const csv = [header, ...rows].map(r => r.map(v => `"${cell(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), `${fileBase}.csv`);
    showToast('ส่งออกรายงานเป็นไฟล์ CSV สำเร็จ');
  };

  // กดจากการแจ้งเตือน -> ไปหน้า Cancellation ของร้านนั้นในช่วง 30 วัน
  const openStoreCancel = (storeId) => {
    setCancelStoreFilter(String(storeId));
    setCancelRange(ALERT_WINDOW_DAYS);
    setCancelReasonFilter('');
    setCancelShowAll(false);
    setPage('cancel');
    setDropdown('');
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', caption: 'ภาพรวมบัญชี', icon: 'dashboard' },
    { id: 'sales', label: 'Sales Summary', caption: 'สรุปยอดขาย', icon: 'sales' },
    { id: 'cancel', label: 'Cancellation', caption: 'วิเคราะห์การยกเลิก', icon: 'cancel', badge: unreadAlertCount || null },
    { id: 'refunds', label: 'Refund Log', caption: 'ประวัติการคืนเงิน', icon: 'refund' },
    { id: 'audit', label: 'Audit Log', caption: 'ประวัติการเปลี่ยนแปลง', icon: 'audit' },
    { id: 'report', label: 'Financial Report', caption: 'ออกรายงานการเงิน', icon: 'report' },
  ];

  if (loading) {
    return (
      <div className="berry-root">
        <style>{STYLES}</style>
        <div className="berry-loading" role="status" aria-live="polite"><span className="berry-spinner" aria-hidden="true" />กำลังโหลดข้อมูล...</div>
      </div>
    );
  }

  const WATCH_LIMIT = 5, SALES_LIMIT = 8, ALERT_LIMIT = 2, RATE_LIMIT = 6, REPORT_LIMIT = 8, MENU_LIMIT = 8;
  const yearSelect = hasReportYears ? (
    <select className="berry-input" value={reportYear} onChange={e => setReportYear(Number(e.target.value))}>
      {reportYearOptions.map(y => <option key={y} value={y}>{y} (พ.ศ. {y + 543})</option>)}
    </select>
  ) : (
    <select className="berry-input" disabled aria-label="ไม่มีข้อมูลปี"><option>ไม่มีข้อมูล</option></select>
  );
  const watchRows = [...periodStats.curr.storesData].filter(s => !s.isDeleted || !s.deletedDay || s.deletedDay >= dateOnly(new Date())).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));

  return (
    <div className="berry-root" ref={rootRef}>
      <style>{STYLES}</style>
      
      {/* ===== TOPBAR (HEADER) ===== */}
      <header className="berry-topbar oft-bar">
        <TopbarStyles />
        <div className="oft-left">
          <BurgerButton open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} aria-controls="berry-sidebar" />

          <div className="oft-brand">
            <BrandLogo onClick={() => setPage('dashboard')} title="กลับหน้า Dashboard" />
            {foodCourtOpen !== null && (
              <StatusPill tone={foodCourtOpen ? 'green' : 'red'} pulse={foodCourtOpen}
                label={foodCourtOpen ? 'ศูนย์อาหารเปิดให้บริการ' : 'ศูนย์อาหารปิดให้บริการ'} short={foodCourtOpen ? 'เปิด' : 'ปิด'} />
            )}
          </div>
        </div>

        <div className="oft-right">
          <div style={{ position: 'relative' }}>
            <BellButton count={unreadAlertCount} active={dropdown === 'notif'} aria-haspopup="true"
              onClick={() => { setNotificationsRead(true); toggleDropdown('notif'); }} />
            {dropdown === 'notif' && (
              <div className="berry-profile-dropdown" style={{ right: 0, width: '300px' }}>
                <div className="dropdown-header">
                  <h4>Notifications <span>({alertStores.length})</span></h4>
                  <p>อัตรายกเลิกเกิน {RATE_ALERT}% ในช่วง {ALERT_WINDOW_DAYS} วันล่าสุด</p>
                </div>
                <hr className="berry-divider" />
                {alertStores.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--berry-text-muted)' }}>ไม่มีการแจ้งเตือน</div>
                ) : alertStores.map(s => (
                  <div key={s.storeId} className="dropdown-item" onClick={() => openStoreCancel(s.storeId)}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600 }}>{s.storeName}</span>
                      <span style={{ fontSize: '12px', color: 'var(--berry-text-muted)' }}>อัตรายกเลิก {s.rate}% ({s.cancelledOrders}/{s.totalOrders} ออเดอร์)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="berry-profile-container" ref={profileRef}>
            <UserChip name={user?.name || user?.FullName || 'Accountant'} role="Accountant" expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)} />

            {profileOpen && (
              <div className="berry-profile-dropdown">
                <div className="dropdown-header">
                  <h4>Welcome, {user?.name || user?.FullName || 'Accountant'}</h4>
                  <p>เจ้าหน้าที่บัญชี</p>
                </div>
                <hr className="berry-divider" />
                <div className="dropdown-item" onClick={() => { if(onLogout) onLogout(); }}>
                  <Icon name="logout" size={18} /> Logout
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== BODY ===== */}
      <div className="berry-body">
        
        {/* ฉากหลังมืดเมื่อเปิดเมนูบนมือถือ/แท็บเล็ต แตะเพื่อปิด */}
        <div className={`berry-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />

        {/* SIDEBAR */}
        <aside id="berry-sidebar" className={`berry-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <nav className="berry-nav">
            <div className="berry-nav-group">
              <div className="berry-nav-label hide-on-collapse">Menu</div>
              {navItems.map(n => (
                <div 
                  key={n.id} 
                  className={`berry-nav-item ${page === n.id ? 'active' : ''}`} 
                  onClick={() => { setPage(n.id); if (window.innerWidth <= 1024) setSidebarOpen(false); }}
                  title={!sidebarOpen ? n.label : ""}
                >
                  <div className="berry-nav-icon"><Icon name={n.icon} size={20} /></div>
                  <div className="berry-nav-text hide-on-collapse">
                    <div className="title">{n.label}</div>
                    <div className="caption">{n.caption}</div>
                  </div>
                  {n.badge ? <span className="berry-nav-badge hide-on-collapse">{n.badge}</span> : null}
                </div>
              ))}
            </div>
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="berry-content" id="berry-main">
          {!loadError && connInfo && (
            <div style={{ background: '#FFFBF0', border: '1px solid #FDBF50', color: '#8a5a00', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              ℹ️ {connInfo}
            </div>
          )}
          {loadError && (
            <div style={{ background: '#FFF7F7', border: '1px solid #fecaca', color: '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              ⚠️ {loadError} — ตัวเลขที่เห็นอาจไม่ครบ (ระบบจะลองใหม่อัตโนมัติ)
            </div>
          )}
          
          {page === 'dashboard' && <DashboardPage {...{
            trendDays, dashMonth, periodStats, lastUpdated, dashCustomStart, dashCustomEnd, setDashRangeError,
            setTrendDays, setDashMonth, todayStr, changeDashStart, changeDashEnd, dashRangeError, hourlyTrend, setPage,
            watchRows, watchOpen, WATCH_LIMIT, setWatchOpen, topStores
          }} />}

          {page === 'sales' && <SalesPage {...{
            salesStoreFilter, setSalesStoreFilter, setDetailStoreId, setSalesRowsOpen, salesStoreSummary, salesRange,
            setSalesCustomStart, salesStart, setSalesCustomEnd, salesEnd, setSalesMonth, setSalesRange, salesMonth,
            salesCustomStart, salesCustomEnd, showToast, salesTotals, salesTrend, salesMenuRows, salesRowsOpen,
            SALES_LIMIT, salesFilteredRows, detailStoreId, detailStoreMenus, menusOpen, MENU_LIMIT, setMenusOpen
          }} />}

          {page === 'cancel' && <CancelPage {...{
            cancelRange, cancelCustomStart, cancelCustomEnd, cancelStoreFilter, cancelSummary, cancelledOrdersList,
            cancelInfoOf, cancelReasonFilter, cancelShowAll, cancelDetailId, orders, setCancelStoreFilter,
            setCancelReasonFilter, setCancelShowAll, setCancelRange, setCancelCustomStart, setCancelCustomEnd,
            cancelScope, alertStores, cancelTableRows, rateOpen, RATE_LIMIT, setRateOpen, alertOpen, ALERT_LIMIT,
            openStoreCancel, setAlertOpen, setCancelDetailId
          }} />}

          {page === 'refunds' && <RefundsPage {...{
            baseRef, apiBase
          }} />}

          {page === 'audit' && <AuditPage {...{
            logs, auditSearch, setAuditSearch, setAuditLimit, auditCat, setAuditCat, auditCatCounts, auditLimit,
            auditFiltered, auditGroups, loadError, auditHasMore, loadOlderLogs, auditLoadingOlder, auditRows
          }} />}

          {page === 'report' && <ReportPage {...{
            reportType, setReportType, reportMode, setReportMode, reportMonthEff, hasReportYears, setReportMonth,
            reportMaxMonth, yearSelect, customStart, customEnd, todayStr, setCustomStart, setCustomEnd,
            reportStoreFilter, setReportStoreFilter, reportStoreOptions, reportPeriodLabel, rangeStart, rangeEnd,
            reportOrders, reportColumns, reportSummary, reportRowsOpen, REPORT_LIMIT, setReportRowsOpen, reportFormat,
            setReportFormat, exportReport
          }} />}

        </main>
      </div>

      {/* Toast Notification */}
      <div className={`berry-toast ${toast.show ? 'show' : ''}`}><Icon name="check_icon" size={15} color="#00C853" /> {toast.msg}</div>
    </div>
  );
}