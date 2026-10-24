import { useState, useEffect, useRef, useMemo } from 'react';
import { startPolling } from '../../lib/polling';
import { useHistoryNav } from '../../lib/historyNav';
import { RefundActionModals } from '../../shared/refunds/RefundModals';
import { fmtMoney, timeAgo } from './lib/format';
import { parseOrderDate, resolvePeriod } from './lib/dates';
import { toISODate, todayISO } from '../../lib/dates';
import { orderIs, hoursFromSchedule, buildStoreReport } from './lib/sales';
import { Icon } from './components/ui';
import { ConfirmDeleteDialog, SuccessOverlay } from './components/dialogs';
import { MenuFormModal } from './pages/menu/MenuFormModal';
import { StaffFormModal } from './pages/staff/StaffFormModal';
import { StaffPasswordModal } from './pages/staff/StaffPasswordModal';
import { StoreScheduleModal } from './pages/dashboard/StoreScheduleModal';
import { STORE_STATE_META } from './pages/dashboard/StoreControlCard';
import { StaffEraseModal } from './pages/staff/StaffEraseModal';
import { NotifDetailModal } from './components/NotifDetailModal';
import { SalesOrderDetailModal } from './pages/history/SalesOrderDetailModal';
import { ISSUE_STATUS_UI } from './pages/issues/issueMeta';
// CSS ของหน้าเจ้าของร้าน : แทรกเป็น <style> ตอนเปิดหน้า (ปิดหน้าแล้วหายไป ไม่ทับหน้าของบทบาทอื่น)
import BERRY_STYLES from './owner.css?inline';
import DashboardPage from './pages/dashboard/DashboardPage';
import MenuPage from './pages/menu/MenuPage';
import StaffPage from './pages/staff/StaffPage';
import SalesHistoryPage from './pages/history/SalesHistoryPage';
import ReviewsPage from './pages/reviews/ReviewsPage';
import RefundsPage from './pages/refunds/RefundsPage';
import IssuesPage from './pages/issues/IssuesPage';
import StoreProfilePage from './pages/profile/StoreProfilePage';


/* ============================================================
   OF Shop Owner — แดชบอร์ดเจ้าของร้านค้า (Executive Theme Colors)
   ============================================================ */

export default function OwnerView({ user, apiBase, onLogout }) {
  const storeId = user?.storeId || 1;
  const uid = user?.id || user?.UserId;
  const [dash, setDash] = useState({});
  const [storeDetail, setStoreDetail] = useState(null);
  const [cancels, setCancels] = useState([]);
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]); 
  const [staffList, setStaffList] = useState([]); 
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const [foodCourtHours, setFoodCourtHours] = useState(null); // { open: '08:00', close: '20:00' }
  // โหลดข้อมูลครั้งแรกเสร็จหรือยัง (ใช้แสดง skeleton แทนเลข 0)
  const [loaded, setLoaded] = useState({ history: false, products: false, dash: false, staff: false, reviews: false, issues: false, refunds: false, cancels: false });
  const markLoaded = (key) => setLoaded(prev => (prev[key] ? prev : { ...prev, [key]: true }));
  // หน้าเมนู: การเรียง + โหมดเลือกหลายเมนู
  const [menuSort, setMenuSort] = useState('default');
  // มุมมองหน้าเมนู: การ์ด / รายการ (จำค่าไว้ในเบราว์เซอร์)
  const [menuView, setMenuViewState] = useState(() => {
    try { return localStorage.getItem('owner.menuView') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const setMenuView = (v) => {
    setMenuViewState(v);
    try { localStorage.setItem('owner.menuView', v); } catch { /* ไม่เป็นไร */ }
  };
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reviewsData, setReviewsData] = useState({ reviews: [], summary: {} });
  const [refunds, setRefunds] = useState([]); // รายการคืนเงินของร้าน (ใช้หักยอดขายสุทธิ)
  // { OrderId: ยอดเงินคืน } ; หักทั้งที่คืนแล้ว (DONE) และที่รอลูกค้ามารับ (PENDING) เพราะเงินคืนไม่ใช่รายได้
  const refundedByOrder = useMemo(() => refunds.reduce((acc, r) => {
    if (r.RefundStatus === 'DONE' || r.RefundStatus === 'PENDING') acc[r.OrderId] = (acc[r.OrderId] || 0) + Number(r.Amount || 0);
    return acc;
  }, {}), [refunds]);
  const pendingRefundCount = useMemo(() => refunds.filter(r => r.RefundStatus === 'PENDING').length, [refunds]);
  const [issues, setIssues] = useState([]);
  
  const [storeDays, setStoreDays] = useState(1);
  const [storeAnchor, setStoreAnchor] = useState(todayISO());
  const [customRange, setCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [storeReport, setStoreReport] = useState(null);
  const [menuFilter, setMenuFilter] = useState('all');
  // --- ยืนยันการลบ + แอนิเมชันลบสำเร็จ ---
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [successState, setSuccessState] = useState(null);
  const successTimers = useRef([]);
  const [menuSearch, setMenuSearch] = useState('');
  const storePeriod = resolvePeriod({ anchor: storeAnchor, days: storeDays, custom: customRange, customStart, customEnd });
  
  const [page, setPage] = useState('dashboard');
  useHistoryNav(page, (hash) => {
    const p = hash ?? 'dashboard';
    if (!['dashboard', 'profile', 'menu', 'history', 'staff', 'refunds', 'reviews', 'issues'].includes(p)) return false;
    setPage(p);
    return true;
  });
  
  // มือถือ (≤768px): ปิดแถบเมนูไว้ก่อน ; จอใหญ่: เปิดไว้
  const isMobileWidth = () => typeof window !== 'undefined' && window.innerWidth <= 768;
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobileWidth());
  useEffect(() => {
    let wasMobile = isMobileWidth();
    const onResize = () => {
      const mobile = isMobileWidth();
      if (mobile !== wasMobile) setSidebarOpen(!mobile); // เปลี่ยนขนาดข้ามจุดตัด -> ปรับให้เหมาะกับจอใหม่
      wasMobile = mobile;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [toast, setToast] = useState({ show: false, msg: '' });

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState('all'); // all | unread
  const [burgerSpin, setBurgerSpin] = useState(0);  // องศาที่ไอคอน ☰ หมุนสะสม
  const notifRef = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const [unreadCancels, setUnreadCancels] = useState(0);
  const [knownCancelsCount, setKnownCancelsCount] = useState(0);
  const isFirstFetch = useRef(true);

  // --- Modal States ---
  // menuModal: null | { mode: 'add' } | { mode: 'edit', product }
  const [menuModal, setMenuModal] = useState(null);

  // staffModal: null | { mode: 'add' } | { mode: 'edit', staff }
  const [staffModal, setStaffModal] = useState(null);
  const [passwordStaff, setPasswordStaff] = useState(null);
  const [staffFilter, setStaffFilter] = useState('all'); // all | front | kitchen | inactive
  const [staffSearch, setStaffSearch] = useState('');
  const [staffBusyId, setStaffBusyId] = useState(null);
  const [eraseStaff, setEraseStaff] = useState(null);
  const [notifDetail, setNotifDetail] = useState(null); // รายการแจ้งเตือนที่เปิดดูรายละเอียด
  // หน้าประวัติการขาย
  const [salesRange, setSalesRange] = useState('7'); // today | 7 | 30 | all | custom
  const [salesFrom, setSalesFrom] = useState(todayISO());
  const [salesTo, setSalesTo] = useState(todayISO());
  const [salesStatus, setSalesStatus] = useState('all'); // all | done | active | cancelled | noshow
  const [salesSearch, setSalesSearch] = useState('');
  const [salesLimit, setSalesLimit] = useState(60);
  const [salesDetailId, setSalesDetailId] = useState(null); // ออเดอร์ที่เปิดดูรายละเอียด
  // หน้าคืนเงินลูกค้า : ใช้ refunds ที่ดึงพร้อม fetchData (ไม่โหลดใหม่ทุกครั้งที่เปิดหน้า)
  const [refundRange, setRefundRange] = useState('all'); // today | 7 | 30 | all | custom ; ค่าเริ่มต้นทั้งหมด จะได้ไม่ซ่อนรายการค้างเก่า
  const [refundFrom, setRefundFrom] = useState(todayISO());
  const [refundTo, setRefundTo] = useState(todayISO());
  const [refundStatus, setRefundStatus] = useState('pending'); // all | pending | slip | transfer | done | failed
  const [refundSearch, setRefundSearch] = useState('');
  const [refundLimit, setRefundLimit] = useState(60);
  const [refundConfirming, setRefundConfirming] = useState(null); // แถวที่เปิดหน้าต่างคืนเงิน
  const [refundChecking, setRefundChecking] = useState(null);     // แถวที่เปิดหน้าต่างตรวจสลิป
  // ไปหน้าประวัติการขายพร้อมตั้งตัวกรอง (ใช้จากการแจ้งเตือน / แดชบอร์ด) ; orderId = เปิดรายละเอียดออเดอร์นั้นเลย
  const openSalesHistory = ({ status = 'all', range = '7', orderId = null } = {}) => {
    setSalesStatus(status);
    setSalesRange(range);
    setSalesSearch('');
    setSalesLimit(60);
    setPage('history');
    if (orderId) setSalesDetailId(orderId);
  };

  // --- Filter States ---
  const [reviewFilter, setReviewFilter] = useState('all');
  const [reviewOnly, setReviewOnly] = useState(null); // null | comment | photo
  const [reviewSort, setReviewSort] = useState('new'); // new | low | high
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewPhoto, setReviewPhoto] = useState(null); // รูปที่เปิดดูขนาดเต็ม
  const [issueFilter, setIssueFilter] = useState('all'); // 'all' | TypeCode
  const [issueStatusFilter, setIssueStatusFilter] = useState('all'); // all | pending | IN_PROGRESS | RESOLVED | REJECTED
  const [issueRange, setIssueRange] = useState('all'); // 7 | 30 | all
  const [issueSort, setIssueSort] = useState('new'); // new | old
  const [issueSearch, setIssueSearch] = useState('');
  const [issueRespond, setIssueRespond] = useState(null); // { issue, target }
  const [issueBusyId, setIssueBusyId] = useState(null);
  const [issuesSummary, setIssuesSummary] = useState(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(event.target)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ดึงข้อมูลร้านทุก endpoint (ทุก 10 วิ + หลังกดปุ่มต่าง ๆ)
  //  - progressive (เปิดหน้าครั้งแรก) : endpoint ไหนตอบก่อน แสดงส่วนนั้นก่อน ไม่ต้องรอตัวที่ช้าที่สุด
  //  - ดึงซ้ำ : รอครบแล้วอัปเดตทีเดียว (React รวมเป็น render รอบเดียว ; เดิม set แยกตัว = render ได้ ~11 รอบต่อครั้ง)
  //  - ข้อมูลเหมือนเดิมทุกตัวอักษร = คืนค่าเดิม (React ไม่ render ซ้ำ)
  //  - คืน Promise : startPolling ไม่ยิงรอบใหม่ทับรอบที่ยังไม่เสร็จ
  //  - เงื่อนไขของแต่ละ endpoint เหมือนเดิม : ตัวที่เช็ค r.ok ตอบ error = คงข้อมูลเดิม ไม่ให้ KPI กลายเป็น 0
  const fetchData = async (progressive = false) => {
    const get = (path, okOnly) => fetch(`${apiBase}${path}`)
      .then(r => (okOnly && !r.ok ? null : r.json()))
      .catch(err => { console.error(err); return undefined; }); // undefined = เน็ต/JSON พัง : ไม่แตะ state
    const keep = (next) => (prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    // [path, เช็ค r.ok, นำผลไปใส่ state]
    const jobs = [
      [`/api/reports/dashboard?store_id=${storeId}`, false, (d) => {
        if (d !== undefined) { setDash(keep((d && d[0]) || {})); markLoaded('dash'); }
      }],
      ['/api/stores', false, (d) => {
        if (d === undefined) return;
        const allStores = Array.isArray(d) ? d : [];
        setStoreDetail(keep(allStores.find(st => String(st.StoreId) === String(storeId)) || null));
      }],
      ['/api/food-court/status', false, (d) => {
        if (!d) return;
        setFoodCourtOpen(d.is_open ?? true);
        if (d.open_time && d.close_time) {
          setFoodCourtHours(prev => (prev && prev.open === d.open_time && prev.close === d.close_time) ? prev : { open: d.open_time, close: d.close_time });
        }
      }],
      ['/api/refunds?limit=2000', true, (d) => {
        if (Array.isArray(d)) { setRefunds(keep(d)); markLoaded('refunds'); }
      }],
      [`/api/stores/${storeId}/reviews/detail`, false, (d) => {
        if (d && Array.isArray(d.reviews)) { setReviewsData(keep(d)); markLoaded('reviews'); }
      }],
      // รายงานปัญหาแบบละเอียด (ชื่อผู้แจ้งแบบย่อ ไม่มีข้อมูลติดต่อ)
      [`/api/stores/${storeId}/issues/detail`, false, (d) => {
        if (d && Array.isArray(d.issues)) { setIssues(keep(d.issues)); setIssuesSummary(keep(d.summary)); markLoaded('issues'); }
      }],
      [`/api/reports/cancellations?store_id=${storeId}`, true, (d) => {
        if (!Array.isArray(d)) return;
        setCancels(keep(d));
        markLoaded('cancels'); // อัปเดตใน render เดียวกับ cancels (ดู effect ป้ายยกเลิกใหม่)
        if (isFirstFetch.current) {
          setKnownCancelsCount(d.length);
          isFirstFetch.current = false;
        }
      }],
      [`/api/products?store_id=${storeId}`, true, (d) => {
        if (Array.isArray(d)) { setProducts(keep(d)); markLoaded('products'); }
      }],
      [`/api/orders?store_id=${storeId}`, true, (d) => {
        if (Array.isArray(d)) { setHistory(keep(d)); markLoaded('history'); }
      }],
      [`/api/stores/${storeId}/staff?include_inactive=true`, true, (d) => {
        if (Array.isArray(d)) { setStaffList(keep(d)); markLoaded('staff'); }
      }],
      ...(uid ? [[`/api/notifications/${uid}`, false, (d) => {
        if (d === undefined) return;
        const arr = Array.isArray(d) ? d : [];
        setNotifications(keep(arr));
        setUnreadNotifs(arr.filter(n => !n.IsRead).length);
      }]] : []),
    ];
    if (progressive) {
      await Promise.all(jobs.map(([path, okOnly, apply]) => get(path, okOnly).then(apply)));
      return;
    }
    const results = await Promise.all(jobs.map(([path, okOnly]) => get(path, okOnly)));
    results.forEach((d, k) => jobs[k][2](d));
  };

  useEffect(() => {
    fetchData(true); // เปิดหน้า : แสดงทีละส่วนตามที่ได้ข้อมูล
    // เดิม 4 วิ (ยิง 11 endpoint ต่อรอบ) ; หยุดเมื่อแท็บซ่อน
    return startPolling(fetchData, 10000);
  }, [storeId, apiBase, uid]);

  useEffect(() => {
    if (history) {
      const hourRange = foodCourtHours ? hoursFromSchedule(foodCourtHours.open, foodCourtHours.close) : null;
      setStoreReport(buildStoreReport(history, storeId, storePeriod, hourRange, refundedByOrder));
    }
  }, [history, storeId, storeDays, storeAnchor, customRange, customStart, customEnd, foodCourtHours, refundedByOrder]);

  useEffect(() => {
    if (page !== 'menu') { setSelectMode(false); setSelectedIds([]); }
  }, [page]);

  // จำนวนจานที่ขายได้วันนี้ของแต่ละเมนู (ออเดอร์สำเร็จ)
  const todaySold = useMemo(() => {
    const today = todayISO();
    const map = {};
    (history || []).forEach(order => {
      if (!orderIs(order, 'Completed')) return;
      const at = parseOrderDate(order.CreatedAt);
      if (!at || toISODate(at) !== today) return;
      (order.items || []).forEach(item => {
        const id = String(item.ProductId);
        map[id] = (map[id] || 0) + Number(item.Qty || 0);
      });
    });
    return map;
  }, [history]);

  // ตัวเลข "ตอนนี้ในร้าน" (ไม่ขึ้นกับช่วงวันที่เลือก)
  const liveStats = useMemo(() => {
    const count = (...statuses) => (history || []).filter(o => statuses.includes(o.Status)).length;
    const today = todayISO();
    const todayOrders = (history || []).filter(o => {
      const at = parseOrderDate(o.CreatedAt);
      return at && toISODate(at) === today;
    });
    return {
      // ครัวกดแค่ "ปรุงเสร็จ" : รอดำเนินการ = รอร้านตรวจสลิป ; ร้านรับแล้ว (Pending/Cooking) = กำลังปรุง
      waiting: count('Verifying_Slip'),
      cooking: count('Pending', 'Cooking'),
      ready: count('Ready'),
      outOfStock: (products || []).filter(p => p.IsOutOfStock).length,
      todayOrders: todayOrders.length,
    };
  }, [history, products]);

  // ยกเลิกใหม่ที่ยังไม่ได้ดู : เทียบด้วยเลขออเดอร์ (เดิมเทียบจำนวนรายการ ซึ่งตันที่ 500 ตาม limit แล้วไม่เตือนอีกเลย)
  //  ใช้ loaded.cancels (state) ไม่ใช่ isFirstFetch (ref) : ref เปลี่ยนก่อน cancels จะถึงหน้าจอ ถ้ามี render อื่นแทรก
  //  (เช่นเปิดเว็บที่ #staff แล้ว page เปลี่ยนหลัง render แรก) จะจำ "ดูแล้ว" เป็นรายการว่าง = ยกเลิกเดิมทั้งหมดเด้งเป็นของใหม่
  const seenCancelIdsRef = useRef(null);
  useEffect(() => {
    if (!loaded.cancels) return;
    const ids = cancels.map(c => c.OrderID);
    if (seenCancelIdsRef.current === null) {
      seenCancelIdsRef.current = new Set(ids); // ของที่มีอยู่ตอนเปิดหน้า = ดูแล้ว
      return;
    }
    if (page === 'history') {
      ids.forEach(id => seenCancelIdsRef.current.add(id));
      setUnreadCancels(0);
    } else {
      setUnreadCancels(ids.filter(id => !seenCancelIdsRef.current.has(id)).length);
    }
  }, [cancels, page, loaded.cancels]);

  // ป้ายตัวเลขเมนูคืนเงิน = รายการรอคืน "ใหม่ที่ยังไม่ได้เปิดดู" (เปิดหน้าแล้วหาย)
  // จำในเบราว์เซอร์ต่อร้าน : รีเฟรช/เข้าใหม่แล้วรายการที่เคยดูไม่เด้งกลับ ; จำนวนที่ยังค้างดูได้จาก caption ของเมนู
  const seenRefundsKey = `owner.seenRefunds.${storeId}`;
  const [seenRefundIds, setSeenRefundIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(seenRefundsKey) || '[]')); } catch { return new Set(); }
  });
  const unseenRefundCount = useMemo(
    () => refunds.filter(r => r.RefundStatus === 'PENDING' && !seenRefundIds.has(r.RefundId)).length,
    [refunds, seenRefundIds],
  );
  useEffect(() => {
    if (page !== 'refunds' || !loaded.refunds) return;
    // เก็บเฉพาะรายการที่ยังรอคืน : คืนแล้วไม่ต้องจำ ไฟล์ไม่โตเรื่อย ๆ
    const pendingIds = refunds.filter(r => r.RefundStatus === 'PENDING').map(r => r.RefundId);
    if (pendingIds.every(id => seenRefundIds.has(id)) && seenRefundIds.size === pendingIds.length) return;
    setSeenRefundIds(new Set(pendingIds));
    try { localStorage.setItem(seenRefundsKey, JSON.stringify(pendingIds)); } catch { /* ไม่เป็นไร */ }
  }, [page, refunds, loaded.refunds, seenRefundIds, seenRefundsKey]);

  const markAllRead = async () => {
    setUnreadCancels(0);
    setKnownCancelsCount(cancels.length);
    if (seenCancelIdsRef.current) cancels.forEach(c => seenCancelIdsRef.current.add(c.OrderID));
    if (uid && unreadNotifs > 0) {
      setNotifications(prev => prev.map(n => ({ ...n, IsRead: true })));
      setUnreadNotifs(0);
      try { await fetch(`${apiBase}/api/notifications/${uid}/read-all`, { method: 'PUT' }); } catch (err) { console.error(err); }
      fetchData();
    }
  };

  useEffect(() => {
    if (!notifOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNotifOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notifOpen]);

  const markNotifRead = (notifId) => {
    fetch(`${apiBase}/api/notifications/${notifId}/read`, { method: 'PUT' }).then(() => fetchData());
  };

  // กดรายการแจ้งเตือน -> ปิดกล่อง เปิดหน้ารายละเอียด และนับว่าอ่านแล้ว
  const openNotifDetail = (item) => {
    setNotifOpen(false);
    setNotifDetail(item);
    if (item.notif && !item.notif.IsRead) markNotifRead(item.notif.NotifId);
  };

  // หาข้อมูลประกอบจากที่โหลดไว้แล้ว (ออเดอร์ + รายการอาหาร, รายงานปัญหา, เมนู) ไม่ต้องเรียก API เพิ่ม
  const resolveNotifContext = (item) => {
    const orderId = item.orderId || item.notif?.OrderId || null;
    let issue = null;
    if (item.kind === 'issue') {
      // ตาราง Notification ไม่ได้เก็บ IssueReportId : จับคู่จากออเดอร์ หรือรายงานที่เวลาใกล้ที่สุด (ภายใน 2 นาที)
      const at = parseOrderDate(item.at)?.getTime() || 0;
      const nearest = (list) => list
        .map(r => ({ r, d: Math.abs((parseOrderDate(r.CreatedAt)?.getTime() || 0) - at) }))
        .sort((a, b) => a.d - b.d)[0];
      const byOrder = orderId ? issues.filter(r => String(r.OrderID) === String(orderId)) : [];
      const hit = nearest(byOrder.length ? byOrder : issues);
      issue = hit && (byOrder.length || hit.d <= 120000) ? hit.r : null;
    }
    const issueOrderId = issue?.OrderID || orderId;
    const order = issueOrderId
      ? history.find(o => String(o.OrderID) === String(issueOrderId)) || cancels.find(o => String(o.OrderID) === String(issueOrderId)) || null
      : null;
    let product = null;
    if (item.kind === 'stock') {
      const name = (String(item.message || '').match(/'([^']+)'/) || [])[1];
      product = name ? products.find(p => p.ProductName === name) || null : null;
    }
    return { order, issue, product };
  };

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__avxToastTimer);
    window.__avxToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };

  // การ์ดควบคุมร้าน : ทุกปุ่มส่งสถานะเป้าหมาย (กดซ้ำจากหน้าจอเก่าไม่กลับด้าน)
  const [storeBusy, setStoreBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const storeAction = async (path, fallbackMsg, okMsg) => {
    setStoreBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/stores/${storeId}/${path}`, { method: 'PUT' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.detail || data.message || fallbackMsg);
        return;
      }
      showToast(okMsg(data));
    } catch (err) {
      console.error(err);
      showToast(fallbackMsg);
    } finally {
      setStoreBusy(false);
      fetchData();
    }
  };
  const toggleStore = (open) => storeAction(`toggle?open=${open}`, 'ไม่สามารถเปลี่ยนสถานะร้านได้',
    (d) => (d.is_open ? 'เปิดร้านแล้ว' : 'ปิดร้านแล้ว'));
  const pauseStore = (paused) => storeAction(`pause?paused=${paused}`, 'ไม่สามารถเปลี่ยนสถานะร้านได้',
    (d) => d.message || (paused ? 'หยุดรับออเดอร์ชั่วคราวแล้ว' : 'เปิดรับออเดอร์ต่อแล้ว'));
  const storeToAuto = () => storeAction('auto', 'ไม่สามารถกลับไปเปิด-ปิดตามเวลาได้', (d) => d.message || 'กลับไปเปิด-ปิดตามเวลาแล้ว');
  const saveStoreSchedule = async (body) => {
    const res = await fetch(`${apiBase}/api/stores/${storeId}/schedule`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.message || 'บันทึกเวลาไม่สำเร็จ');
    setScheduleOpen(false);
    showToast(data.message || 'บันทึกเวลาเปิด-ปิดร้านเรียบร้อยแล้ว');
    fetchData();
  };
  // ป้ายสถานะบน topbar : พาไปที่การ์ดควบคุมร้านในหน้าภาพรวม
  const goToStoreControl = () => {
    setPage('dashboard');
    setTimeout(() => document.getElementById('owner-store-control')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  // ปิดร้าน : ถามยืนยันก่อน (กันกดโดนโดยไม่ตั้งใจ)
  const requestCloseStore = async () => {
    // กฎ PO 1: ยังมีออเดอร์ที่ยังไม่จบ = ปิดร้านไม่ได้ (backend ตรวจซ้ำอีกชั้น)
    try {
      const res = await fetch(`${apiBase}/api/stores/${storeId}/open-orders`);
      const pending = res.ok ? await res.json() : [];
      if (Array.isArray(pending) && pending.length) {
        const queues = pending.slice(0, 10).map(o => `${o.queue} (${o.status_label})`).join(', ');
        setConfirmDelete({
          type: 'closeBlocked',
          blocked: true,
          name: dash.StoreName || 'ร้านของคุณ',
          title: 'ยังปิดร้านไม่ได้',
          prefix: 'ร้าน',
          suffix: `ยังมีออเดอร์ที่ยังไม่จบ ${pending.length} ออเดอร์`,
          warn: `${queues}${pending.length > 10 ? ` และอีก ${pending.length - 10} คิว` : ''} — กรุณาทำและส่งมอบให้ครบก่อนปิดร้าน ถ้าไม่อยากรับออเดอร์เพิ่ม ให้กด "หยุดรับชั่วคราว" แทน`,
          icon: 'power',
          tone: 'danger',
        });
        return;
      }
    } catch (err) {
      console.error(err);
    }
    setConfirmDelete({
      type: 'closeStore',
      name: dash.StoreName || 'ร้านของคุณ',
      title: 'ปิดร้าน?',
      prefix: 'ลูกค้าจะสั่งอาหารจากร้าน',
      suffix: 'ไม่ได้จนถึงเวลาเปิดร้านรอบถัดไป หรือจนกว่าจะกดเปิดร้าน',
      warn: 'ถ้าแค่ต้องการพักรับออเดอร์สักครู่ ให้กด "หยุดรับชั่วคราว" แทน',
      icon: 'power',
      tone: 'danger',
      confirmText: 'ปิดร้าน',
      busyText: 'กำลังปิดร้าน...',
    });
  };

  // ปรับสต็อกหลายเมนูพร้อมกัน (เรียก toggle เฉพาะเมนูที่สถานะยังไม่ตรง)
  const bulkSetStock = async (makeOut) => {
    const targets = products.filter(p => selectedIds.includes(p.ProductId) && Boolean(p.IsOutOfStock) !== makeOut);
    if (!targets.length) {
      showToast(makeOut ? 'เมนูที่เลือกเป็นสินค้าหมดอยู่แล้ว' : 'เมนูที่เลือกพร้อมขายอยู่แล้ว');
      return;
    }
    setBulkBusy(true);
    const results = await Promise.allSettled(
      targets.map(p => fetch(`${apiBase}/api/products/${p.ProductId}/toggle-stock?out_of_stock=${makeOut}`, { method: 'PUT' })
        .then(res => { if (!res.ok) throw new Error(p.ProductName); return p; }))
    );
    setBulkBusy(false);
    const done = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - done;
    fetchData();
    setSelectedIds([]);
    setSelectMode(false);
    if (done) showSuccess('อัปเดตสต็อกสำเร็จ', `ปรับ ${done} เมนูเป็น${makeOut ? 'สินค้าหมด' : 'พร้อมขาย'}แล้ว`);
    if (failed) showToast(`ปรับไม่สำเร็จ ${failed} เมนู กรุณาลองใหม่`);
  };

  const toggleSelected = (id) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds([]); };

  const toggleStock = async (id, pName, isOutOfStock) => {
    try {
      const res = await fetch(`${apiBase}/api/products/${id}/toggle-stock?out_of_stock=${!isOutOfStock}`, { method: 'PUT' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : 'อัปเดตสถานะไม่สำเร็จ');
      }
      showToast(`อัปเดตสถานะ "${pName}" เป็น ${isOutOfStock ? 'มีสินค้า' : 'สินค้าหมด'} แล้ว`);
    } catch (err) {
      showToast(`⚠️ ${err.message || 'อัปเดตสถานะไม่สำเร็จ'} ("${pName}")`);
    } finally {
      fetchData();
    }
  };

  const openAddModal = () => setMenuModal({ mode: 'add' });
  const openEditModal = (product) => setMenuModal({ mode: 'edit', product });
  const closeMenuModal = () => setMenuModal(null);

  // โยน error กลับไปให้ฟอร์มแสดง ถ้าสำเร็จจะปิดฟอร์มแล้วขึ้นแอนิเมชันติ๊กถูก
  const saveMenu = async ({ name, price, img, description }) => {
    const isEdit = menuModal?.mode === 'edit';
    const res = await fetch(
      isEdit ? `${apiBase}/api/products/${menuModal.product.ProductId}` : `${apiBase}/api/products`,
      {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit
          ? { ProductName: name, Description: description, UnitPrice: price, img: img || '' }
          : { StoreId: storeId, ProductName: name, Description: description, UnitPrice: price, IsOutOfStock: false, img: img || '' }),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const detail = Array.isArray(data.detail) ? data.detail.map(d => d.msg).join(', ') : data.detail;
      throw new Error(detail || data.message || (isEdit ? 'แก้ไขเมนูไม่สำเร็จ' : 'เพิ่มเมนูไม่สำเร็จ'));
    }
    setMenuModal(null);
    showSuccess(
      isEdit ? 'บันทึกสำเร็จ' : 'เพิ่มเมนูสำเร็จ',
      isEdit ? `แก้ไขเมนู "${name}" เรียบร้อยแล้ว` : `เพิ่มเมนู "${name}" เรียบร้อยแล้ว`
    );
    fetchData();
  };

  // โปรไฟล์ร้าน : รูปร้าน รายละเอียด ข้อมูลติดต่อ (ชื่อร้าน/หมวดหมู่แก้ไม่ได้ ต้องเป็นที่ลงทะเบียนกับผู้บริหาร)
  // โยน error กลับไปให้ฟอร์มแสดง ; สำเร็จ = ติ๊กถูก + โหลดข้อมูลร้านใหม่
  const saveStoreProfile = async (payload) => {
    const res = await fetch(`${apiBase}/api/stores/${storeId}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = Array.isArray(data.detail) ? data.detail.map(d => d.msg).join(', ') : data.detail;
      throw new Error(detail || 'บันทึกโปรไฟล์ร้านไม่สำเร็จ');
    }
    showSuccess(data.changed?.length ? 'บันทึกโปรไฟล์ร้านแล้ว' : 'ไม่มีข้อมูลที่เปลี่ยนแปลง', storeDetail?.StoreName || '');
    fetchData();
  };

  // แสดงติ๊กถูกกลางจอ ~1.4 วินาที แล้วค่อย ๆ จางหาย
  const showSuccess = (title, detail) => {
    successTimers.current.forEach(clearTimeout);
    setSuccessState({ title, detail, leaving: false });
    successTimers.current = [
      setTimeout(() => setSuccessState(prev => (prev ? { ...prev, leaving: true } : prev)), 1400),
      setTimeout(() => setSuccessState(null), 1750),
    ];
  };
  useEffect(() => () => successTimers.current.forEach(clearTimeout), []);

  const handleDeleteMenu = (id, name) => {
    setConfirmDelete({
      type: 'menu', id, name,
      title: 'ลบเมนูนี้?',
      prefix: 'คุณต้องการลบเมนู',
      suffix: 'ออกจากร้านใช่หรือไม่',
      confirmText: 'ลบเมนู',
    });
  };

  const cancelDelete = () => {
    if (!deleting) setConfirmDelete(null);
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    const { type, id, name } = confirmDelete;
    if (type === 'closeStore') {
      setDeleting(true);
      await toggleStore(false);
      setDeleting(false);
      setConfirmDelete(null);
      return;
    }
    if (type === 'staff') {
      // ปิดใช้งาน (ไม่ลบจริง ข้อมูลและประวัติยังอยู่ เปิดกลับได้)
      setDeleting(true);
      await setStaffActive({ UserId: id, FullName: name }, false);
      setDeleting(false);
      setConfirmDelete(null);
      return;
    }
    const url = `${apiBase}/api/products/${id}`;
    setDeleting(true);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 400 && data.detail) {
          // กฎ PO 3: เมนูยังอยู่ในออเดอร์ที่ไม่จบ -> แสดงเหตุผลค้างไว้ให้อ่าน (toast หายเร็วเกิน)
          setConfirmDelete({ type: 'deleteBlocked', blocked: true, name, title: 'ยังลบเมนูนี้ไม่ได้',
            prefix: 'เมนู', suffix: '', warn: data.detail, icon: 'trash', tone: 'danger' });
          return;
        }
        throw new Error(data.detail || data.message || 'เกิดข้อผิดพลาดในการลบเมนู');
      }
      setConfirmDelete(null);
      showSuccess('ลบสำเร็จ', `ลบเมนู "${name}" เรียบร้อยแล้ว`);
      fetchData();
    } catch (err) {
      console.error(err);
      setConfirmDelete(null);
      showToast(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // --- จัดการพนักงาน ---
  const apiError = async (res, fallback) => {
    const data = await res.json().catch(() => ({}));
    return new Error(data.detail || data.message || fallback);
  };

  // ฟอร์มเรียกใช้: error ถูก throw กลับไปแสดงในฟอร์ม
  const saveStaff = async (payload) => {
    const isEdit = staffModal?.mode === 'edit';
    const res = await fetch(
      isEdit ? `${apiBase}/api/staff/${staffModal.staff.UserId}` : `${apiBase}/api/stores/${storeId}/staff`,
      { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );
    if (!res.ok) throw await apiError(res, isEdit ? 'บันทึกข้อมูลพนักงานไม่สำเร็จ' : 'เพิ่มพนักงานไม่สำเร็จ');
    setStaffModal(null);
    showSuccess(isEdit ? 'บันทึกเรียบร้อย' : 'เพิ่มพนักงานแล้ว', payload.fullName);
    fetchData();
  };

  const resetStaffPassword = async (newPassword) => {
    const target = passwordStaff;
    const res = await fetch(`${apiBase}/api/staff/${target.UserId}/reset-password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_password: newPassword }),
    });
    if (!res.ok) throw await apiError(res, 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ');
    setPasswordStaff(null);
    showSuccess('ตั้งรหัสผ่านใหม่แล้ว', `แจ้งรหัสผ่านใหม่ให้ ${target.FullName}`);
    fetchData();
  };

  const setStaffActive = async (target, isActive) => {
    setStaffBusyId(target.UserId);
    try {
      const res = await fetch(`${apiBase}/api/staff/${target.UserId}/active`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw await apiError(res, isActive ? 'เปิดใช้งานไม่สำเร็จ' : 'ปิดใช้งานไม่สำเร็จ');
      showSuccess(isActive ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', target.FullName);
      fetchData();
    } catch (err) {
      showToast(err.message);
    } finally {
      setStaffBusyId(null);
    }
  };

  const eraseStaffAccount = async (confirmUsername) => {
    const target = eraseStaff;
    const res = await fetch(`${apiBase}/api/staff/${target.UserId}/erase`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_username: confirmUsername }),
    });
    if (!res.ok) throw await apiError(res, 'ลบพนักงานไม่สำเร็จ');
    setEraseStaff(null);
    showSuccess('ลบถาวรแล้ว', target.FullName);
    fetchData();
  };

  // เปลี่ยนสถานะรายงานปัญหา (+ ข้อความตอบกลับ) ; fromModal = ให้ error กลับไปแสดงในหน้าต่าง
  const updateIssueStatus = async (issue, status, note, fromModal = false) => {
    setIssueBusyId(issue.IssueReportId);
    try {
      const res = await fetch(`${apiBase}/api/issues/${issue.IssueReportId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note }),
      });
      if (!res.ok) throw await apiError(res, 'อัปเดตรายงานปัญหาไม่สำเร็จ');
      showSuccess(`${ISSUE_STATUS_UI[status].label}`, 'แจ้งลูกค้าเรียบร้อยแล้ว');
      fetchData();
    } catch (err) {
      if (fromModal) throw err;
      showToast(err.message);
    } finally {
      setIssueBusyId(null);
    }
  };

  const askDeactivateStaff = (target) => {
    setConfirmDelete({
      type: 'staff', id: target.UserId, name: target.FullName,
      icon: 'power',
      title: 'ปิดใช้งานพนักงานคนนี้?',
      prefix: 'ต้องการปิดใช้งานบัญชีของ',
      suffix: 'ใช่หรือไม่',
      warn: 'พนักงานจะเข้าสู่ระบบไม่ได้ทันที ข้อมูลและประวัติการทำงานยังอยู่ครบ และเปิดใช้งานอีกครั้งได้ทุกเมื่อ',
      confirmText: 'ปิดใช้งาน',
      busyText: 'กำลังปิดใช้งาน...',
    });
  };

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  const navItemsAll = [
    { id: 'dashboard', label: 'Dashboard', caption: 'ภาพรวมร้านค้า', icon: 'dashboard' },
    { id: 'profile', label: 'Store Profile', caption: 'รูปและรายละเอียดร้าน', icon: 'photo' },
    { id: 'menu', label: 'Manage Menu', caption: 'จัดการเมนู/สต็อก', icon: 'menu' },
    { id: 'staff', label: 'Manage Staff', caption: 'จัดการพนักงาน', icon: 'users' },
    // ออเดอร์ที่ยกเลิกรวมอยู่ในประวัติการขายแล้ว (แท็บ "ยกเลิก") : badge ยกเลิกใหม่จึงย้ายมาอยู่ที่นี่
    { id: 'history', label: 'Sales History', caption: 'ประวัติการขาย', icon: 'history', badge: unreadCancels > 0 ? unreadCancels : null },
    { id: 'reviews', label: 'Customer Reviews', caption: 'รีวิวจากลูกค้า', icon: 'star' },
    { id: 'issues', label: 'Issue Reports', caption: 'ประวัติการแจ้งปัญหา', icon: 'alert' },
    { id: 'refunds', label: 'คืนเงินลูกค้า', caption: pendingRefundCount ? `รอคืน ${pendingRefundCount} รายการ` : 'รอคืน / คืนแล้ว', icon: 'coin', badge: unseenRefundCount || null },
  ];
  const navById = Object.fromEntries(navItemsAll.map(n => [n.id, n]));
  const navGroups = [
    { label: 'ภาพรวม', items: ['dashboard'] },
    { label: 'จัดการร้าน', items: ['profile', 'menu', 'staff'] },
    { label: 'ประวัติและความคิดเห็น', items: ['history', 'refunds', 'reviews', 'issues'] },
  ].map(g => ({ ...g, items: g.items.map(id => navById[id]) }));

  const isSuspended = Boolean(storeDetail?.IsSuspended);
  // ร้านจะถือว่า "เปิด" ได้ก็ต่อเมื่อศูนย์อาหารเปิดด้วย ถ้าศูนย์อาหารปิด ร้านถูกบังคับปิดเสมอ
  // สถานะร้านจาก backend : คำนวณจากเวลาร้าน + เวลาศูนย์อาหาร + ที่กดเอง + หยุดรับชั่วคราว (utils.store_open_state)
  const openState = !foodCourtOpen || isSuspended ? 'CLOSED' : (dash.OpenState || storeDetail?.OpenState || (dash.IsOpen ? 'OPEN' : 'CLOSED'));
  const contractActive = !storeDetail || storeDetail.ContractState === 'ACTIVE';
  // เหตุที่กดเปิดร้านไม่ได้ (แสดงบนการ์ดควบคุมร้าน)
  const openBlockedReason = !foodCourtOpen ? 'ศูนย์อาหารปิดให้บริการ ร้านเปิดไม่ได้จนกว่าศูนย์อาหารจะเปิด'
    : isSuspended ? 'ร้านถูกระงับสิทธิ์ ติดต่อผู้บริหาร'
    : !contractActive ? (storeDetail?.ContractState === 'UPCOMING' ? 'สัญญาร้านยังไม่เริ่มมีผล' : 'สัญญาร้านไม่มีผล ติดต่อผู้บริหาร')
    : null;
  const unreadSuspendedAlert = isSuspended ? 1 : 0;
  const totalBadgeUnread = unreadCancels + unreadNotifs + unreadSuspendedAlert;
  
  // -- Helper functions for filtering and contracts --
  const getDaysLeft = (endDate) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((end - today) / 86400000);
  };
  const daysLeft = getDaysLeft(storeDetail?.ContractEndDate);

  const formatContractDate = (value) => value
    ? new Date(value).toLocaleDateString('th-TH-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' })
    : '-';
  const contractTone = daysLeft === null ? 'neutral' : daysLeft > 30 ? 'success' : daysLeft > 0 ? 'warning' : 'danger';
  // สัดส่วนเวลาที่ผ่านไปแล้วของสัญญา (0-100) ใช้วาดแถบความคืบหน้า
  const contractProgress = (() => {
    if (!storeDetail?.ContractStartDate || !storeDetail?.ContractEndDate) return null;
    const start = new Date(storeDetail.ContractStartDate).getTime();
    const end = new Date(storeDetail.ContractEndDate).getTime();
    if (!(end > start)) return null;
    return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  })();

  

  return (
    <div className="berry-root">
      <style>{BERRY_STYLES}</style>
      
      {/* ===== TOPBAR (HEADER) ===== */}
      <header className="berry-topbar">
        <div className="berry-topbar-left">
          <button
            className={`berry-icon-btn purple-light op-burger ${sidebarOpen ? 'is-open' : ''}`}
            onClick={() => { setBurgerSpin(d => d + 180); setSidebarOpen(!sidebarOpen); }}
            aria-label={sidebarOpen ? 'ซ่อนแถบเมนู' : 'แสดงแถบเมนู'}
            aria-expanded={sidebarOpen}
          >
            <span className="lines" style={{ transform: `rotate(${burgerSpin}deg)` }} aria-hidden="true">
              <span /><span /><span />
            </span>
          </button>

          {/* โลโก้ + สถานะศูนย์อาหาร (แบบเดียวกับหน้าลูกค้า) */}
          <div className="berry-brand">
            <button type="button" className="brand-logo" onClick={() => setPage('dashboard')} title="กลับหน้า Dashboard">
              Only<span>Foods</span>
            </button>
            <div
              className={`brand-status ${foodCourtOpen ? 'open' : 'closed'}`}
              title={foodCourtOpen ? 'ศูนย์อาหารเปิดให้บริการ' : 'ศูนย์อาหารปิดให้บริการ'}
            >
              <span className="dot" />
              <span className="full">{foodCourtOpen ? 'ศูนย์อาหารเปิดให้บริการ' : 'ศูนย์อาหารปิดให้บริการ'}</span>
              <span className="short">{foodCourtOpen ? 'เปิด' : 'ปิด'}</span>
            </div>

            {/* สถานะร้าน : กดแล้วไปที่การ์ดควบคุมร้าน (เปิด/ปิด/หยุดรับชั่วคราว/ตั้งเวลา) */}
            <button type="button" className={`store-pill tone-${STORE_STATE_META[openState].tone}`} onClick={goToStoreControl}
              title={`${STORE_STATE_META[openState].label} · กดเพื่อจัดการร้าน`}>
              <span className="dot" />
              <span className="label">{STORE_STATE_META[openState].label}</span>
            </button>
          </div>
        </div>

        <div className="berry-topbar-right">
          
          <div className="berry-notif-container" ref={notifRef} style={{ position: 'relative' }}>
            <button
              className={`berry-icon-btn amber-light op-bell ${notifOpen ? 'active' : ''} ${totalBadgeUnread > 0 ? 'has-unread' : ''}`}
              onClick={() => setNotifOpen(!notifOpen)}
              style={{ position: 'relative' }}
              aria-label={totalBadgeUnread > 0 ? `การแจ้งเตือน ${totalBadgeUnread} รายการใหม่` : 'การแจ้งเตือน'}
              aria-expanded={notifOpen}
            >
              <span className="bell-icon" key={totalBadgeUnread}><Icon name="bell" size={20} /></span>
              {totalBadgeUnread > 0 && (
                <span className="notif-badge-top">{totalBadgeUnread > 99 ? '99+' : totalBadgeUnread}</span>
              )}
            </button>

            {notifOpen && (() => {
              const NOTIF_STYLE = {
                ORDER_STATUS: { icon: 'receipt', tone: 'orange' },
                QUEUE_CALLED: { icon: 'bell', tone: 'green' },
                PAYMENT: { icon: 'coin', tone: 'green' },
                CONTRACT: { icon: 'calendar', tone: 'amber' },
                ISSUE: { icon: 'alert', tone: 'red' },
                SYSTEM: { icon: 'bell', tone: 'blue' },
              };
              const items = [
                ...notifications.map(n => ({
                  key: `n-${n.NotifId}`,
                  ...(NOTIF_STYLE[n.NotificationType] || NOTIF_STYLE.SYSTEM),
                  kind: n.NotificationType === 'ISSUE' ? 'issue' : n.Title === 'สินค้าหมด' ? 'stock' : 'system',
                  notif: n,
                  title: n.Title || 'การแจ้งเตือน',
                  message: n.Message,
                  at: n.CreatedAt,
                  unread: !n.IsRead,
                })),
                ...cancels.slice(0, 5).map((c, i) => ({
                  key: `c-${c.OrderID}`,
                  icon: 'soldout',
                  tone: 'red',
                  title: `ออเดอร์ถูกยกเลิก · คิว ${c.QueueNo || '-'}`,
                  message: c.CancelReason ? `เหตุผล: ${c.CancelReason}` : 'ไม่ได้ระบุเหตุผล',
                  at: c.CreatedAt,
                  unread: i < unreadCancels,
                  amount: c.TotalAmount,
                  kind: 'cancel',
                  orderId: c.OrderID,
                })),
              ].sort((a, b) => (parseOrderDate(b.at)?.getTime() || 0) - (parseOrderDate(a.at)?.getTime() || 0));
              const shown = notifTab === 'unread' ? items.filter(it => it.unread) : items;
              return (
                <>
                  <div className="op-notif-backdrop" onClick={() => setNotifOpen(false)} aria-hidden="true" />
                  <div className="op-notif-panel" role="dialog" aria-label="การแจ้งเตือน">
                    <div className="op-notif-head">
                      <div className="title">
                        <h4>การแจ้งเตือน</h4>
                        {totalBadgeUnread > 0 && <span className="count">{totalBadgeUnread} ใหม่</span>}
                      </div>
                      <div className="head-actions">
                        {(unreadCancels > 0 || unreadNotifs > 0) && (
                          <button type="button" className="op-notif-link" onClick={markAllRead}>
                            <Icon name="check" size={14} /> อ่านทั้งหมด
                          </button>
                        )}
                        <button type="button" className="op-notif-close" onClick={() => setNotifOpen(false)} aria-label="ปิด">
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="op-notif-tabs" role="tablist">
                      <button type="button" role="tab" aria-selected={notifTab === 'all'} className={notifTab === 'all' ? 'active' : ''} onClick={() => setNotifTab('all')}>
                        ทั้งหมด <span>{items.length}</span>
                      </button>
                      <button type="button" role="tab" aria-selected={notifTab === 'unread'} className={notifTab === 'unread' ? 'active' : ''} onClick={() => setNotifTab('unread')}>
                        ยังไม่อ่าน <span>{items.filter(it => it.unread).length}</span>
                      </button>
                    </div>

                    <div className="op-notif-list">
                      {isSuspended && (
                        <div className="op-notif-alert">
                          <span className="icon"><Icon name="alert" size={18} /></span>
                          <div>
                            <div className="t">ร้านของคุณถูกระงับสิทธิ์</div>
                            <div className="m">เปิดรับออเดอร์ใหม่ไม่ได้ชั่วคราว กรุณาติดต่อผู้บริหารศูนย์อาหาร</div>
                          </div>
                        </div>
                      )}

                      {shown.length === 0 && !isSuspended ? (
                        <div className="op-notif-empty">
                          <div className="icon"><Icon name="bell" size={26} /></div>
                          <div className="t">{notifTab === 'unread' ? 'อ่านครบทุกรายการแล้ว' : 'ยังไม่มีการแจ้งเตือน'}</div>
                          <div className="m">{notifTab === 'unread' ? 'ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน' : 'เมื่อมีออเดอร์ถูกยกเลิกหรือข่าวจากระบบ จะแสดงที่นี่'}</div>
                        </div>
                      ) : shown.map(it => (
                        <button key={it.key} type="button" className={`op-notif-item ${it.unread ? 'unread' : ''}`} onClick={() => openNotifDetail(it)}>
                          <span className={`icon tone-${it.tone}`}><Icon name={it.icon} size={17} /></span>
                          <span className="body">
                            <span className="t">{it.title}</span>
                            {it.message && <span className="m">{it.message}</span>}
                            <span className="meta">
                              <Icon name="clock" size={12} /> {timeAgo(it.at)}
                              {it.amount !== undefined && <> · ฿{fmtMoney(it.amount)}</>}
                            </span>
                          </span>
                          {it.unread && <span className="unread-dot" aria-label="ยังไม่อ่าน" />}
                        </button>
                      ))}
                    </div>

                    <button type="button" className="op-notif-foot" onClick={() => { openSalesHistory({ status: 'cancelled', range: 'all' }); setNotifOpen(false); }}>
                      ดูออเดอร์ที่ยกเลิกทั้งหมดในประวัติการขาย <Icon name="arrowRight" size={15} />
                    </button>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="berry-profile-container" ref={profileRef}>
            <button type="button" className="berry-user-chip" onClick={() => setProfileOpen(!profileOpen)} aria-label="เมนูบัญชีผู้ใช้">
              <div className="berry-avatar">
                {String(user?.name || user?.FullName || 'O').trim().replace(/^[เแโใไ]+/, '').charAt(0).toUpperCase() || 'O'}
              </div>
              <div className="berry-user-text">
                <div className="berry-user-name">{user?.name || user?.FullName || 'Shop Owner'}</div>
                <div className="berry-user-role">Shop Owner</div>
              </div>
              <Icon name="settings" size={17} />
            </button>

            {profileOpen && (
              <div className="berry-profile-dropdown">
                <div className="dropdown-header">
                  <h4>Good Morning, {user?.name || user?.FullName || 'Owner'}</h4>
                  <p>Shop Owner (เจ้าของร้าน)</p>
                </div>
                
                <hr className="berry-divider" style={{ margin: '0 0 16px' }} />

                <div className="dropdown-item" onClick={handleLogout}>
                  <Icon name="logout" size={18} /> Logout
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* มือถือ: แถบสถานะศูนย์อาหาร + สถานะร้าน (บน topbar ไม่พอที่) */}
      <div className="op-mobile-status">
        <span className={`op-ms-court ${foodCourtOpen ? 'open' : 'closed'}`}>
          <span className="dot" />
          {foodCourtOpen ? 'ศูนย์อาหารเปิด' : 'ศูนย์อาหารปิด'}
        </span>
        <button type="button" className={`store-pill mobile tone-${STORE_STATE_META[openState].tone}`} onClick={goToStoreControl}>
          <span className="dot" />
          <span className="label">{STORE_STATE_META[openState].label}</span>
        </button>
      </div>

      {/* ===== BODY (Sidebar + Main Content) ===== */}
      <div className="berry-body">
        
        {/* ฉากหลังมืดตอนเปิดแถบเมนูบนมือถือ (แตะเพื่อปิด) */}
        {sidebarOpen && <div className="berry-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

        {/* ===== SIDEBAR ===== */}
        <aside className={`berry-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <nav className="berry-nav">
            {navGroups.map(group => (
            <div className="berry-nav-group" key={group.label}>
              <div className="berry-nav-label hide-on-collapse">{group.label}</div>
              <div className="berry-nav-divider show-on-collapse" />
              {group.items.map(n => (
                <div 
                  key={n.id} 
                  className={`berry-nav-item ${page === n.id ? 'active' : ''}`} 
                  onClick={() => { 
                    setPage(n.id); 
                    if (window.innerWidth <= 768) setSidebarOpen(false); 
                  }}
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
            ))}
          </nav>
        </aside>

        {/* ===== MAIN CONTENT ===== */}
        <main className="berry-content">
          {page === 'dashboard' && <DashboardPage {...{
            storeReport, loaded, customRange, storePeriod, customStart, customEnd, storeDays, storeAnchor,
            foodCourtHours, liveStats, dash, storeDetail, contractTone, daysLeft, formatContractDate, contractProgress,
            openState, openBlockedReason, storeBusy, toggleStore, requestCloseStore, pauseStore, storeToAuto,
            setScheduleOpen, setMenuFilter, setPage, openSalesHistory, setStoreAnchor, setStoreDays, setCustomRange,
            setCustomStart, setCustomEnd, products
          }} />}

          {page === 'profile' && <StoreProfilePage storeDetail={storeDetail} onSave={saveStoreProfile} />}

          {page === 'menu' && <MenuPage {...{
            products, menuSearch, menuFilter, todaySold, menuSort, selectedIds, selectMode, toggleSelected, toggleStock,
            openEditModal, handleDeleteMenu, loaded, openAddModal, setMenuFilter, setMenuSearch, setMenuSort, menuView,
            setMenuView, exitSelectMode, setSelectMode, setSelectedIds, bulkBusy, bulkSetStock
          }} />}

          {page === 'staff' && <StaffPage {...{
            staffList, staffSearch, staffFilter, setStaffModal, loaded, setStaffFilter, setStaffSearch, staffBusyId,
            setPasswordStaff, askDeactivateStaff, setStaffActive, setEraseStaff
          }} />}

          {page === 'history' && <SalesHistoryPage {...{
            salesRange, salesFrom, salesTo, history, salesSearch, salesStatus, refundedByOrder, salesLimit,
            setSalesRange, setSalesLimit, setSalesFrom, setSalesTo, loaded, setSalesStatus, setSalesSearch,
            setSalesDetailId
          }} />}

          {page === 'reviews' && <ReviewsPage {...{
            reviewsData, reviewSearch, reviewFilter, reviewOnly, reviewSort, setReviewFilter, setReviewSearch,
            setReviewOnly, setReviewSort, loaded, setReviewPhoto, reviewPhoto
          }} />}

          {page === 'refunds' && <RefundsPage {...{
            refundRange, refundFrom, refundTo, refunds, refundStatus, refundSearch, refundLimit, setSalesDetailId,
            pendingRefundCount, setRefundRange, setRefundLimit, setRefundFrom, setRefundTo, loaded, setRefundStatus,
            setRefundSearch, setRefundChecking, setRefundConfirming, apiBase
          }} />}

          {page === 'issues' && <IssuesPage {...{
            issuesSummary, issueRange, issueSearch, issues, issueStatusFilter, issueFilter, issueSort, loaded,
            setIssueFilter, setIssueStatusFilter, setIssueRange, setIssueSort, setIssueSearch, issueBusyId,
            updateIssueStatus, setIssueRespond, issueRespond
          }} />}


        </main>
      </div>

      {/* ===== เพิ่ม / แก้ไขพนักงาน + รีเซ็ตรหัสผ่าน ===== */}
      {staffModal && (
        <StaffFormModal
          key={staffModal.mode === 'edit' ? `edit-${staffModal.staff.UserId}` : 'add'}
          mode={staffModal.mode}
          staff={staffModal.staff}
          onClose={() => setStaffModal(null)}
          onSubmit={saveStaff}
        />
      )}
      {passwordStaff && (
        <StaffPasswordModal staff={passwordStaff} onClose={() => setPasswordStaff(null)} onSubmit={resetStaffPassword} />
      )}
      {eraseStaff && (
        <StaffEraseModal staff={eraseStaff} onClose={() => setEraseStaff(null)} onSubmit={eraseStaffAccount} />
      )}
      <RefundActionModals
        apiBase={apiBase}
        isOwner
        confirming={refundConfirming}
        checking={refundChecking}
        onClose={() => { setRefundConfirming(null); setRefundChecking(null); }}
        onDone={(message, info) => {
          setRefundConfirming(null);
          setRefundChecking(null);
          showSuccess(info?.kind === 'slip-check' ? (info.approved ? 'สลิปถูกต้อง' : 'บันทึกผลตรวจสลิปแล้ว') : 'คืนเงินเรียบร้อย', message);
          fetchData();
        }}
      />
      {salesDetailId && (
        <SalesOrderDetailModal
          key={salesDetailId}
          orderId={salesDetailId}
          statusCode={history.find(o => o.OrderID === salesDetailId)?.StatusCode}
          apiBase={apiBase}
          onClose={() => setSalesDetailId(null)}
        />
      )}
      {notifDetail && (
        <NotifDetailModal
          item={notifDetail}
          {...resolveNotifContext(notifDetail)}
          onClose={() => setNotifDetail(null)}
          onGo={(target) => {
            const it = notifDetail;
            setNotifDetail(null);
            if (target === 'history') openSalesHistory({ status: 'all', range: 'all', orderId: it.orderId });
            else setPage(target);
          }}
        />
      )}

      {/* ===== เพิ่ม / แก้ไขเมนู ===== */}
      {menuModal && (
        <MenuFormModal
          key={menuModal.mode === 'edit' ? `edit-${menuModal.product.ProductId}` : 'add'}
          mode={menuModal.mode}
          product={menuModal.product}
          onClose={closeMenuModal}
          onSubmit={saveMenu}
        />
      )}

      {/* ===== ยืนยันการลบ / ลบสำเร็จ ===== */}
      <ConfirmDeleteDialog state={confirmDelete} busy={deleting} onCancel={cancelDelete} onConfirm={confirmDeleteAction} />
      {scheduleOpen && (
        <StoreScheduleModal
          fcOpen={foodCourtHours?.open || '00:00'}
          fcClose={foodCourtHours?.close || '23:59'}
          hasOwnHours={Boolean(storeDetail?.HasOwnHours)}
          openTime={storeDetail?.OpenTime}
          closeTime={storeDetail?.CloseTime}
          onClose={() => setScheduleOpen(false)}
          onSubmit={saveStoreSchedule}
        />
      )}
      <SuccessOverlay state={successState} />

      {/* ===== Toast ===== */}
      <div className={`berry-toast ${toast.show ? 'show' : ''}`}>
        <div className="icon-wrapper"><Icon name="check" size={16} /></div>
        {toast.msg}
      </div>
    </div>
  );
}
