import React, { useState, useEffect, useRef } from 'react';
import RefundLog from './RefundLog';

// โทนสีเดิมของ Counter & Theme กลาง
const PALETTE = {
  coral: '#FF724C',        // --berry-purple (primary)
  coralLight: '#FFEAE3',   // --berry-purple-light
  coralDark: '#E8552D',    // --berry-purple-dark
  yellow: '#FDBF50',       // cloud-icon gradient start
  yellowLight: '#FFF4DE',  // --berry-amber-light
  amber: '#E2A430',        // --berry-amber
  white: '#FFFFFF',        // --berry-paper
  dark: '#2A2C41',         // --berry-blue / --berry-text-dark
  darkLight: '#1D1F2F',    // --berry-blue-dark
  bg: '#F6F7FB',           // --berry-bg
  bgSoft: '#EDEEF4',       // --berry-blue-light
  border: '#E6E8F0',       // --berry-border
  textSub: '#8A8FA6',      // --berry-text-muted
  green: '#17A673',        // --berry-green
  greenLight: '#E3F6EE',
  red: '#E2452F',          // --berry-red
  redLight: '#FDEAE6',
};

// ออเดอร์ walk-in (ไม่มีบัญชีลูกค้า) : backend ส่ง IsWalkIn เป็น 0/1
const isWalkInOrder = (o) => Boolean(Number(o?.IsWalkIn)) || !o?.UserId;

const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
// ข้อความ error จาก backend : detail เป็นข้อความ หรือรายการ (422 ของ pydantic) -> ไม่ให้ขึ้น [object Object]
const apiErrorText = (data, fallback) => {
  if (typeof data?.detail === 'string') return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map(d => d?.msg).filter(Boolean).join(', ') || fallback;
  return fallback;
};
// ชนิดของ toast จากข้อความ (เดิมขึ้น ✓ สีเขียวทุกข้อความ แม้เป็น error)
const toastKind = (msg) => {
  const t = String(msg || '');
  if (/ไม่สำเร็จ|ไม่ได้|ไม่สามารถ|ผิดพลาด|ไม่พอ|ไม่พบ|กรุณา|error|HTTP|⚠️|❌|🔒/i.test(t)) return 'error';
  return 'success';
};

function Icon({ name, size = 20 }) {
  const paths = {
    orders: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="m9 14 2 2 4-4" /></>,
    stale: <><circle cx="12" cy="12" r="9" /><polyline points="12 6 12 12 16 14" /></>,
    walkin: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    menu: <><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></>,
    bell: <><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></>,
    user: <><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></>,
    print: <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
    check: <><polyline points="20 6 9 17 4 12" /></>,
    close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
    warn: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    store: <><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /><path d="M2 7h20" /></>,
    coin: <><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 2.9 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.6-3.1-1.6" /><path d="M12 6v2M12 16v2" /></>,
    tv: <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>,
    logout: <><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  );
}

function Badge({ tone, children }) {
  return <span className={`cv-badge tone-${tone}`}>{children}</span>;
}

export default function CounterView({ user, apiBase, onLogout }) {
  const activeStoreId = user?.StoreId || user?.storeId || 1;
  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orderNote, setOrderNote] = useState('');

  const [activeTab, setActiveTab] = useState('orders');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const [viewingSlip, setViewingSlip] = useState(null);
  const [rejectSlipModal, setRejectSlipModal] = useState(null);
  const [rejectSlipReason, setRejectSlipReason] = useState('สลิปไม่ถูกต้อง');
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [reportCancellations, setReportCancellations] = useState([]);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [toast, setToast] = useState({ show: false, msg: '' });

  // ===== Print / Recall / No-Show controls =====
  const [printerStatus, setPrinterStatus] = useState('READY'); // READY | OFFLINE (Mock)
  const [pendingPrintJobs, setPendingPrintJobs] = useState([]);
  const [printConfirmOrder, setPrintConfirmOrder] = useState(null); // { order, type, job, error }
  const [printBusy, setPrintBusy] = useState(false);
  const [stockModal, setStockModal] = useState(null); // { product, notifiable: [], silent: [] }
  const [stockBusy, setStockBusy] = useState(false);
  // ตารางคิว: แท็บตามสถานะ + ค้นหาเลขคิว (ลูกค้าบอกคิว -> พนักงานพิมพ์ -> ส่งมอบจากการ์ด)
  const [queueTab, setQueueTab] = useState('ready');
  const [queueQuery, setQueueQuery] = useState('');
  const [handoverBusy, setHandoverBusy] = useState(null);
  const queueSearchRef = useRef(null);
  // Walk-in POS: ขั้นตอนชำระเงิน (เงินสด = กรอกเงินที่รับ + เงินทอน ; QR/TrueMoney = ลูกค้าโอนต่อหน้า พนักงานกดยืนยัน)
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState('Cash');
  const [cashInput, setCashInput] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [lastSale, setLastSale] = useState(null); // { queue, method, change, received, total } หลังออกคิว walk-in
  // จอเรียกคิว (จำลอง): คิวที่เพิ่งพร้อมจะกระพริบ + เสียงติ๊ง ; เห็นครั้งแรกตอนเปิดหน้าไม่นับว่า "ใหม่"
  const [displaySound, setDisplaySound] = useState(true);
  const [displayFull, setDisplayFull] = useState(false);
  const displayRef = useRef(null);
  const readySeenRef = useRef(null); // Map OrderID -> เวลาที่เห็นว่าพร้อมครั้งแรก (null = ยังไม่โหลดรอบแรก)
  const dateKey = (d) => {
    const x = new Date(d);
    if (isNaN(x)) return '';
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const [historyDate, setHistoryDate] = useState(() => dateKey(Date.now()));
  const [pastHistory, setPastHistory] = useState({ date: null, list: [], loading: false });
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyQuery, setHistoryQuery] = useState('');
  const autoPromptedJobsRef = useRef(new Set()); // job ที่เด้ง popup อัตโนมัติไปแล้ว (ปิดแล้วไม่เด้งซ้ำ ยังกดจากแถบเหลืองได้)
  const [noShowModal, setNoShowModal] = useState(null);
  // อาหารพร้อมรับแล้วลูกค้ายังไม่มา (ค่าจาก backend /api/food-court/status ; ค่าเริ่มต้น 30 / 60 นาที):
  // PICKUP_WARNING_MINUTES = ระบบเตือนลูกค้าเอง + ป้ายให้พนักงานโทรตาม ;
  // NO_SHOW_UNLOCK_MINUTES = ปลดล็อกปุ่ม "ลูกค้าไม่มารับ" (พนักงานกดเองเสมอ กันกรณีลูกค้าแจ้งว่าจะมาช้า)
  const [pickupTimes, setPickupTimes] = useState({ warn: 30, noShow: 60 });
  const PICKUP_WARNING_MINUTES = pickupTimes.warn;
  const NO_SHOW_UNLOCK_MINUTES = pickupTimes.noShow;
  const [pendingRefunds, setPendingRefunds] = useState(0);

  // 🔴 Modal ยกเลิกคำสั่งซื้อแบบใหม่
  const [cancelModal, setCancelModal] = useState(null); // { order, actionType: 'immediate' | 'window' }
  const [cancelReasonTag, setCancelReasonTag] = useState('วัตถุดิบหมด');
  const [customReason, setCustomReason] = useState('');
  // แจ้งของหมดรายคิว (แยกจากยกเลิก): เลือกจานที่หมด + ปิดเมนูในร้านด้วย
  const [outModal, setOutModal] = useState(null); // { order, selected: [OrderItemId], closeMenu }
  const [outBusy, setOutBusy] = useState(false);

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ครัวกด "ปรุงเสร็จ" -> backend สร้าง PrintJob PENDING -> เด้ง popup ยืนยันพิมพ์ที่หน้าร้านอัตโนมัติ
  useEffect(() => {
    // จอเรียกคิวหันไปทางลูกค้า: ไม่เด้ง popup ทับ (เด้งเมื่อกลับมาหน้าอื่น)
    if (activeTab === 'display' || printConfirmOrder || !pendingPrintJobs.length) return;
    const job = pendingPrintJobs.find(j => !autoPromptedJobsRef.current.has(j.PrintJobID));
    if (!job) return;
    const order = orders.find(o => o.OrderID === job.OrderID);
    if (!order) return; // รอ orders โหลดก่อน
    autoPromptedJobsRef.current.add(job.PrintJobID);
    openPrintConfirm(order, 'FIRST_PRINT', job);
  }, [pendingPrintJobs, orders, printConfirmOrder, activeTab]);

  useEffect(() => {
    const ready = orders.filter(o => o.Status === 'Ready');
    if (readySeenRef.current === null) {
      if (!orders.length) return;
      readySeenRef.current = new Map(ready.map(o => [o.OrderID, 0])); // ของที่พร้อมอยู่แล้วตอนเปิดหน้า: ไม่กระพริบ
      return;
    }
    const seen = readySeenRef.current;
    const fresh = ready.filter(o => !seen.has(o.OrderID));
    fresh.forEach(o => seen.set(o.OrderID, Date.now()));
    if (fresh.length && activeTab === 'display' && displaySound) playChime();
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onFs = () => setDisplayFull(document.fullscreenElement === displayRef.current && !!displayRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const playChime = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = playChime.ctx || (playChime.ctx = new Ctx());
      [880, 1320].forEach((f, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        const t = ctx.currentTime + i * 0.18;
        osc.frequency.value = f; osc.type = 'sine';
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        osc.connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + 0.5);
      });
    } catch { /* ไม่มีเสียงก็ยังแสดงผลได้ */ }
  };
  const toggleDisplayFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else displayRef.current?.requestFullscreen?.().catch(() => showToast('เบราว์เซอร์นี้เปิดเต็มจอไม่ได้'));
  };

  useEffect(() => {
    if (activeTab !== 'history' || historyDate === dateKey(Date.now())) return;
    let cancelled = false;
    setPastHistory({ date: historyDate, list: [], loading: true });
    fetch(`${apiBase}/api/orders?store_id=${activeStoreId}&date=${historyDate}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setPastHistory({ date: historyDate, list: Array.isArray(d) ? d : [], loading: false }); })
      .catch(() => { if (!cancelled) setPastHistory({ date: historyDate, list: [], loading: false }); });
    return () => { cancelled = true; };
  }, [activeTab, historyDate, activeStoreId, apiBase]);

  const showToast = (msg, kind) => {
    const k = kind || toastKind(msg);
    setToast({ show: true, msg, kind: k });
    clearTimeout(window.__cvToastTimer);
    // error ค้างไว้นานกว่า ให้อ่านทัน
    window.__cvToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), k === 'error' ? 6000 : 2600);
  };

  const fetchData = () => {
    // live = ออเดอร์ที่ยังไม่จบ + ของวันนี้ (ไม่ดึงประวัติทั้งร้านทุก 3.5 วิ ; วันก่อน ๆ ดึงตอนเปิดแท็บประวัติ)
    fetch(`${apiBase}/api/orders?store_id=${activeStoreId}&scope=live`)
      .then(r => r.json())
      .then(d => setOrders(Array.isArray(d) ? d : []))
      .catch(err => console.error("Error orders:", err));

    fetch(`${apiBase}/api/products?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : []))
      .catch(err => console.error("Error products:", err));

    fetch(`${apiBase}/api/print-jobs/pending?store_id=${activeStoreId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(d => setPendingPrintJobs(Array.isArray(d) ? d : []))
      .catch(err => console.error("Error print jobs:", err));

    fetchPendingRefunds();
  };

  // จำนวนรายการที่รอลูกค้ามารับเงินคืน (ป้ายตัวเลขบนเมนู "คืนเงินลูกค้า")
  const fetchPendingRefunds = () => {
    fetch(`${apiBase}/api/refunds?status=PENDING&limit=500`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setPendingRefunds(d.length); })
      .catch(err => console.error("Error refunds:", err));
  };

  const fetchReports = () => {
    Promise.all([
      fetch(`${apiBase}/api/reports/dashboard?store_id=${activeStoreId}`).then(r => r.json()),
      fetch(`${apiBase}/api/reports/cancellations?store_id=${activeStoreId}`).then(r => r.json())
    ])
      .then(([dashboard, cancellations]) => {
        setReportData(Array.isArray(dashboard) ? dashboard[0] || null : null);
        setReportCancellations(Array.isArray(cancellations) ? cancellations : []);
      })
      .catch(err => console.error("Error reports:", err));
  };

  // โหลดข้อมูลร้านค้า และซิงก์สถานะร้านเป็นระยะ
  const fetchStores = async () => {
    try {
      const res = await fetch(`${apiBase}/api/stores`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setStores(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error stores:", err);
    }
  };

  // เช็กสถานะโรงอาหารแยกจาก fetchData เพื่อไม่ให้ request อื่นมาขัดการ sync
  const checkFoodCourtStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/food-court/status`, {
        cache: 'no-store',
      });

      if (!res.ok) return;

      const data = await res.json();
      setFoodCourtOpen(Boolean(data?.is_open));
      if (data?.pickup_reminder_minutes && data?.no_show_after_minutes) {
        setPickupTimes(prev => (prev.warn === data.pickup_reminder_minutes && prev.noShow === data.no_show_after_minutes)
          ? prev : { warn: data.pickup_reminder_minutes, noShow: data.no_show_after_minutes });
      }
    } catch (err) {
      console.error("Error food court status:", err);
    }
  };

  useEffect(() => {
    fetchStores();
    checkFoodCourtStatus();

    const storeInterval = setInterval(fetchStores, 2000);
    const foodCourtInterval = setInterval(checkFoodCourtStatus, 2000);

    return () => {
      clearInterval(storeInterval);
      clearInterval(foodCourtInterval);
    };
  }, [apiBase]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3500);
    return () => clearInterval(interval);
  }, [activeStoreId, apiBase]);

  useEffect(() => {
    if (activeTab === 'reports') fetchReports();
  }, [activeTab, activeStoreId, apiBase]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentStore = stores.find(s => s.StoreId === activeStoreId);

  // --- Handlers ---
  const verifyingRef = useRef(new Set()); // กดซ้ำระหว่างรอคำตอบ = ไม่ยิงซ้ำ (ครั้งที่ 2 เคยขึ้น error ทับข้อความสำเร็จ)
  const verifySlip = (id, approved, reason = '') => {
    if (verifyingRef.current.has(id)) return;
    verifyingRef.current.add(id);
    fetch(`${apiBase}/api/orders/${id}/verify-slip`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved, reason })
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(apiErrorText(data, 'ไม่สามารถตรวจสอบสลิปได้'), 'error');
        return;
      }
      showToast(approved ? 'อนุมัติสลิปแล้ว ส่งคิวเข้าครัว' : 'ปฏิเสธสลิปแล้ว');
      setViewingSlip(null);
      setRejectSlipModal(null);
      fetchData();
    }).catch(() => showToast('เชื่อมต่อระบบตรวจสลิปไม่สำเร็จ'))
      .finally(() => verifyingRef.current.delete(id));
  };

  const openRejectSlip = (order) => {
    setViewingSlip(null);
    setRejectSlipReason('สลิปไม่ถูกต้อง');
    setRejectSlipModal(order);
  };

  const submitRejectSlip = () => {
    if (!rejectSlipModal || !rejectSlipReason.trim()) return;
    verifySlip(rejectSlipModal.OrderID, false, rejectSlipReason.trim());
  };

  const updateStatus = (id, status, cancelReason = null) => {
    fetch(`${apiBase}/api/orders/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, user_role: 'Front Staff', cancel_reason: cancelReason })
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.detail || 'ไม่สามารถเปลี่ยนสถานะออเดอร์ได้');
        return;
      }
      showToast(`อัปเดตสถานะเป็น "${status}" สำเร็จ`);
      fetchData();
    }).catch(() => showToast('เชื่อมต่อระบบออเดอร์ไม่สำเร็จ'));
  };

  const printableItems = (order) => (order?.items || []).filter(i => !i.ItemStatus || i.ItemStatus === 'NORMAL');

  // ส่งมอบอาหาร: ใช้ได้ทั้งปุ่มในตารางและการ์ดจากการค้นหาเลขคิว
  const handOver = async (order) => {
    if (handoverBusy) return;
    setHandoverBusy(order.OrderID);
    try {
      const res = await fetch(`${apiBase}/api/orders/${order.OrderID}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed', user_role: 'Front Staff' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.detail || 'ส่งมอบไม่สำเร็จ'); return; }
      showToast(`✅ ส่งมอบคิว ${order.QueueNo} แล้ว`);
      setQueueQuery('');
      queueSearchRef.current?.focus();
      fetchData();
    } catch {
      showToast('เชื่อมต่อระบบออเดอร์ไม่สำเร็จ');
    } finally {
      setHandoverBusy(null);
    }
  };

  const buildPrintData = (order) => ({
    orderId: order.OrderID,
    queueNo: order.QueueNo,
    customerName: order.CustomerName || order.UserName || 'ลูกค้า Walk-in',
    items: printableItems(order).map(item => ({
      productName: item.ProductName,
      qty: Number(item.Qty),
      unitPrice: Number(item.UnitPrice)
    })),
    totalAmount: Number(order.TotalAmount || 0)
  });

  const validatePrintData = (order) => {
    if (!order) return 'ไม่พบออเดอร์นี้ในรายการของร้าน (อาจจบไปแล้ว) — กด "ไม่ต้องพิมพ์ใบนี้" เพื่อปิดการแจ้งเตือน';
    if (order.Status === 'Cancelled') return 'ออเดอร์นี้ถูกยกเลิกแล้ว';
    if (order.Status === 'NoShow') return 'ออเดอร์นี้ถูกตัดเป็นลูกค้าไม่มารับแล้ว';
    if (order.Status === 'Pending_Cancellation') return 'มีเมนูหมด กำลังรอลูกค้าเลือกเปลี่ยนเมนูหรือยกเลิก';
    const data = buildPrintData(order);
    if (!data.orderId) return 'ไม่มี Order ID';
    if (!data.queueNo) return 'ไม่มีเลขคิว';
    if (!data.items.length) return 'ไม่มีรายการอาหารที่พิมพ์ได้';
    if (data.items.some(i => !i.productName || i.qty <= 0 || i.unitPrice < 0)) return 'ข้อมูลเมนู จำนวน หรือราคาไม่ถูกต้อง';
    if (data.totalAmount < 0) return 'ราคารวมไม่ถูกต้อง';
    const sum = data.items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
    if (Math.abs(sum - data.totalAmount) > 0.01) return `ราคารวม ฿${data.totalAmount} ไม่ตรงกับยอดรายการ ฿${sum}`;
    return null;
  };

  const openPrintConfirm = (order, type = 'FIRST_PRINT', job = null) => {
    const pj = job || (type === 'FIRST_PRINT' ? pendingPrintJobs.find(j => j.OrderID === order?.OrderID) : null);
    setPrintConfirmOrder({ order, type, job: pj || null, error: validatePrintData(order) });
  };
  const setPrintError = (error) => setPrintConfirmOrder(prev => (prev ? { ...prev, error } : prev));

  // หน้าร้านเลือกไม่พิมพ์ใบนี้ (เช่น ส่งมอบไปแล้ว/ข้อมูลผิด) : ปิดงานพิมพ์ แถบแจ้งเตือนหายไป ยังพิมพ์ซ้ำทีหลังได้
  const skipPrintJob = async () => {
    const job = printConfirmOrder?.job;
    if (!job || printBusy) return;
    setPrintBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/print-jobs/${job.PrintJobID}/skip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: printConfirmOrder.error ? `ไม่พิมพ์: ${printConfirmOrder.error}`.slice(0, 200) : null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 400) {
        setPrintError(apiErr(res, data, 'ปิดงานพิมพ์ไม่สำเร็จ'));
        return;
      }
      setPendingPrintJobs(prev => prev.filter(j => j.PrintJobID !== job.PrintJobID));
      showToast(`ไม่พิมพ์ใบคิว ${job.QueueNo ?? ''} แล้ว`);
      setPrintConfirmOrder(null);
      fetchData();
    } catch {
      setPrintError('เชื่อมต่อระบบพิมพ์ไม่สำเร็จ');
    } finally {
      setPrintBusy(false);
    }
  };

  const apiErr = (res, data, fallback) =>
    (res.status === 404 && data?.detail === 'Not Found')
      ? 'เซิร์ฟเวอร์ยังไม่มี API นี้ (404 Not Found) — ต้อง deploy backend เวอร์ชันใหม่'
      : (data?.detail || fallback);

  const confirmPrint = async () => {
    if (!printConfirmOrder || printBusy) return;
    const { order, type } = printConfirmOrder;
    if (printerStatus !== 'READY') {
      setPrintError('เครื่องพิมพ์ OFFLINE — เปลี่ยนเป็น READY ที่แถบด้านบนก่อนพิมพ์');
      return;
    }
    const error = validatePrintData(order);
    if (error) {
      setPrintError(error);
      return;
    }

    const local = buildPrintData(order);
    setPrintBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/${order.OrderID}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print_type: type, printer: 'MOCK_PRINTER_01', user_role: 'Front Staff' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrintError(apiErr(res, data, 'ไม่สามารถพิมพ์ใบสั่งซื้อได้'));
        fetchData();
        return;
      }
      const server = data.print_data;
      console.log('[PRINT_LOG] ส่งไปเครื่องพิมพ์:', server);
      const diffs = [];
      if (!server) diffs.push('ไม่มีข้อมูลตอบกลับ');
      else {
        if (String(server.queueNo) !== String(local.queueNo)) diffs.push('เลขคิว');
        if (server.customerName !== local.customerName) diffs.push('ชื่อลูกค้า');
        if (Math.abs(Number(server.totalAmount) - local.totalAmount) > 0.001) diffs.push('ราคารวม');
        const norm = (arr) => JSON.stringify(arr.sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
        const l = norm(local.items.map(i => [i.productName, i.qty, i.unitPrice]));
        const s = norm((server.items || []).map(i => [i.product, Number(i.qty), Number(i.unit_price)]));
        if (l !== s) diffs.push('เมนู/จำนวน/ราคา');
      }
      if (diffs.length) {
        console.warn('[PRINT_LOG] ข้อมูลไม่ตรงกัน:', diffs, { local, server });
        showToast(`⚠️ พิมพ์แล้ว แต่ข้อมูลไม่ตรงกับออเดอร์: ${diffs.join(', ')}`);
      } else {
        showToast(type === 'REPRINT' ? `พิมพ์ซ้ำคิว ${order.QueueNo} สำเร็จ (ข้อมูลตรงกับออเดอร์)` : `พิมพ์ใบคิว ${order.QueueNo} สำเร็จ (ข้อมูลตรงกับออเดอร์)`);
      }
      setPrintConfirmOrder(null);
      fetchData();
    } catch {
      setPrintError('ไม่สามารถเชื่อมต่อระบบพิมพ์ได้ (เครือข่ายขัดข้อง) ลองใหม่อีกครั้ง');
    } finally {
      setPrintBusy(false);
    }
  };

  const openNoShowModal = (order) => {
    if (!canMarkNoShow(order)) {
      showToast(beforeEta(order)
        ? `คิว ${order.QueueNo} ลูกค้าแจ้งว่าจะมาถึง ${fmtClock(order.LatePickupArrivalTime)} น.`
        : `คิว ${order.QueueNo} ยังไม่ถึง ${NO_SHOW_UNLOCK_MINUTES} นาที`);
      return;
    }
    setNoShowModal(order);
  };

  const confirmNoShow = async () => {
    if (!noShowModal) return;
    const order = noShowModal;
    try {
      const res = await fetch(`${apiBase}/api/orders/${order.OrderID}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'NoShow', user_role: 'Front Staff', cancel_reason: 'ลูกค้าไม่มารับอาหาร (พนักงานยืนยัน)' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.detail || 'ไม่สามารถตัดออเดอร์เป็น No-Show ได้');
        return;
      }
      showToast(`ตัดคิว ${order.QueueNo} เป็นลูกค้าไม่มารับอาหารแล้ว`);
      setNoShowModal(null);
      fetchData();
    } catch {
      showToast('เชื่อมต่อระบบตัดออเดอร์ไม่สำเร็จ');
    }
  };

  // ❌ ยกเลิกออเดอร์ (อย่างเดียว ; ของหมดใช้ openOutModal)
  const openCancelModal = (order) => {
    setCancelModal({ order });
    setCancelReasonTag('ลูกค้าขอยกเลิกเอง');
    setCustomReason('');
  };

  const handleConfirmCancel = () => {
    if (!cancelModal) return;
    const finalReason = customReason.trim() ? `${cancelReasonTag}: ${customReason.trim()}` : cancelReasonTag;
    updateStatus(cancelModal.order.OrderID, 'Cancelled', finalReason);
    setCancelModal(null);
  };

  // ⚠️ แจ้งของหมด: ลูกค้าออนไลน์เลือกเปลี่ยนเมนูหรือยกเลิกรับเงินคืนภายใน 30 นาที
  const outItems = (order) => (order?.items || []).filter(i => !i.ItemStatus || i.ItemStatus === 'NORMAL');
  const openOutModal = (order) => {
    const items = outItems(order);
    setOutModal({ order, selected: items.length === 1 ? [items[0].OrderItemId] : [], closeMenu: true });
  };
  const toggleOutItem = (id) => setOutModal(m => m && ({
    ...m, selected: m.selected.includes(id) ? m.selected.filter(x => x !== id) : [...m.selected, id],
  }));
  const confirmOrderOut = async () => {
    if (!outModal || outBusy || !outModal.selected.length) return;
    const { order, selected, closeMenu } = outModal;
    setOutBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/${order.OrderID}/cancel-request`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'วัตถุดิบหมด', response_window_minutes: 30, item_ids: selected, close_menu: closeMenu })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.detail || 'ไม่สามารถแจ้งของหมดได้'); return; }
      const closed = (data.closed_menus || []).length ? ` · ปิดเมนู ${data.closed_menus.join(', ')} แล้ว` : '';
      showToast(`แจ้งลูกค้าคิว ${order.QueueNo} ให้เปลี่ยนเมนูแล้ว (30 นาที)${closed}`);
      setOutModal(null);
      fetchData();
    } catch {
      showToast('เชื่อมต่อระบบไม่สำเร็จ');
    } finally {
      setOutBusy(false);
    }
  };

  const markNoShow = openNoShowModal;

  const viewCustomerProfile = (order) => {
    if (!order.UserId) return showToast('ออเดอร์นี้เป็นลูกค้า Walk-in ไม่มีข้อมูลโปรไฟล์');
    setViewingCustomer({ loading: true });
    fetch(`${apiBase}/api/customers/${order.UserId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => setViewingCustomer(data))
      .catch(() => setViewingCustomer({ error: true }));
  };

  const setStockFlag = async (product) => {
    const res = await fetch(`${apiBase}/api/products/${product.ProductId}/toggle-stock`, { method: 'PUT' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  };

  const toggleStock = (product) => {
    // การปิดเมนูเป็นการจัดการ stock ระดับเมนู ไม่ผูกกับออเดอร์ที่ทำเสร็จแล้ว
    if (!product.IsOutOfStock) {
      const affected = orders.filter(o =>
        !['Completed', 'Cancelled', 'NoShow'].includes(o.Status) &&
        o.items?.some(i => i.ProductId === product.ProductId && (!i.ItemStatus || i.ItemStatus === 'NORMAL'))
      );
      // backend แจ้งเฉพาะออเดอร์ลูกค้าออนไลน์ที่ยังรอ/กำลังปรุง ; ที่เหลือแสดงให้พนักงานรู้เฉยๆ
      const notifiable = affected.filter(o => ['Pending', 'Cooking'].includes(o.Status) && !isWalkInOrder(o));
      const silent = affected.filter(o => !notifiable.includes(o));
      setStockModal({ product, notifiable, silent });
      return;
    }
    setStockFlag(product)
      .then(() => { showToast(`"${product.ProductName}" กลับมาขายแล้ว`); fetchData(); })
      .catch(e => showToast(`เปลี่ยนสถานะไม่สำเร็จ: ${e.message}`));
  };

  const confirmOutOfStock = async (notify) => {
    if (!stockModal || stockBusy) return;
    const { product, notifiable } = stockModal;
    setStockBusy(true);
    try {
      await setStockFlag(product);
      let msg = `ปิดเมนู "${product.ProductName}" (ของหมด) แล้ว`;
      if (notify && notifiable.length) {
        const res = await fetch(`${apiBase}/api/products/${product.ProductId}/notify-out-of-stock`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response_window_minutes: 30 })
        });
        const data = await res.json().catch(() => ({}));
        msg = res.ok
          ? `${msg} · แจ้งลูกค้า ${data.notified_count ?? 0} ออเดอร์ให้เปลี่ยนเมนูหรือยกเลิก`
          : `${msg} แต่แจ้งลูกค้าไม่สำเร็จ: ${data.detail || `HTTP ${res.status}`}`;
      }
      showToast(msg);
      setStockModal(null);
      fetchData();
    } catch (e) {
      showToast(`ปิดเมนูไม่สำเร็จ: ${e.message}`);
    } finally {
      setStockBusy(false);
    }
  };

  const addToCart = (p) => setCart([...cart, { ...p, note: '' }]);
  const removeFromCart = (idx) => setCart(cart.filter((_, i) => i !== idx));
  const updateCartNote = (idx, note) => {
    const updated = [...cart];
    updated[idx].note = note;
    setCart(updated);
  };
  const totalAmount = cart.reduce((sum, item) => sum + Number(item.UnitPrice), 0);

  const walkInBlocked = () => {
    if (!foodCourtOpen) return 'โรงอาหารปิดอยู่ ไม่สามารถเปิดคิว Walk-in ได้';
    if (currentStore?.IsSuspended) return 'ร้านถูกระงับการขายชั่วคราว';
    if (currentStore && !currentStore.IsOpen) return 'ร้านปิดอยู่ ไม่สามารถเปิดคิว Walk-in ได้';
    if (cart.length === 0) return 'กรุณาเลือกอาหารก่อนกดชำระเงิน';
    return null;
  };
  const openPayment = () => {
    const why = walkInBlocked();
    if (why) return showToast(why);
    setPayMethod('Cash'); setCashInput(''); setPayOpen(true);
  };
  const cashReceived = Math.round(Number(cashInput || 0) * 100) / 100; // backend รับทศนิยมไม่เกิน 2 ตำแหน่ง
  const cashChange = cashReceived - totalAmount;
  const cashEnough = cashInput !== '' && cashChange >= -0.001;
  const addCash = (n) => setCashInput(v => String(Number(v || 0) + n));

  const submitWalkInOrder = async () => {
    const why = walkInBlocked();
    if (why) return showToast(why);
    if (payBusy) return;
    if (payMethod === 'Cash' && !cashEnough) return showToast('จำนวนเงินที่รับยังไม่พอ');
    setPayBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          user_id: null,
          items: cart.map(i => ({ product_id: i.ProductId, qty: 1, unit_price: i.UnitPrice, note: i.note || '' })),
          is_walk_in: true,
          note: orderNote || 'Walk-in',
          payment_method: payMethod,
          cash_received: payMethod === 'Cash' ? cashReceived : null,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(`สั่งซื้อไม่สำเร็จ: ${apiErrorText(data, `HTTP ${res.status}`)}`, 'error'); return; }
      // ยอดเงินทอนค้างไว้จนพนักงานกดปิด (เดิมขึ้นแค่ toast 2.6 วิ ทอนไม่ทันอ่าน)
      setLastSale({ queue: data.queue_no, method: payMethod, change: Math.max(0, cashChange), received: cashReceived, total: totalAmount });
      setPayOpen(false); setCart([]); setOrderNote(''); setCashInput('');
      fetchData(); setActiveTab('orders');
    } catch {
      showToast('เชื่อมต่อระบบสั่งซื้อไม่สำเร็จ');
    } finally {
      setPayBusy(false);
    }
  };

  const getStatusBadgeTone = (status) => {
    switch (status) {
      case 'Ready': return 'success';
      case 'Pending_Cancellation': return 'warning';
      case 'Awaiting_Top_Up': return 'warning';
      case 'NoShow': return 'danger';
      case 'Cancelled': return 'danger';
      case 'Completed': return 'success';
      case 'Cooking': return 'coral';
      default: return 'neutral';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'Ready': return 'พร้อมเสิร์ฟ';
      case 'Pending_Cancellation': return 'รอเปลี่ยนเมนู (30น.)';
      case 'Awaiting_Top_Up': return 'รอลูกค้าโอนส่วนต่าง';
      case 'NoShow': return 'ไม่มารับ (No-Show)';
      case 'Cooking': return 'กำลังปรุง';
      case 'Pending': return 'รอคิวเข้าครัว';
      case 'Completed': return 'ส่งมอบแล้ว';
      case 'Cancelled': return 'ยกเลิก';
      case 'Verifying_Slip': return 'รอตรวจสลิป';
      default: return status;
    }
  };

  const getRemainingLabel = (deadline) => {
    if (!deadline) return '-';
    const diff = new Date(deadline).getTime() - nowTick;
    if (diff <= 0) return 'หมดเวลา · ระบบกำลังยกเลิกให้';
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')} น.`;
  };

  const getElapsedLabel = (timestamp) => {
    if (!timestamp) return '-';
    return `${Math.max(0, Math.floor((nowTick - new Date(timestamp).getTime()) / 60000))} นาที`;
  };

  const minutesWaiting = (timestamp) => timestamp ? Math.max(0, (nowTick - new Date(timestamp).getTime()) / 60000) : 0;
  const isPickupWarning = (timestamp) => minutesWaiting(timestamp) >= PICKUP_WARNING_MINUTES;
  // backend ส่งเวลาบางช่องเป็น 'YYYY-MM-DD HH:MM:SS' (ไม่มี T) : แปลงให้ทุกเบราว์เซอร์อ่านเป็นเวลาท้องถิ่นได้
  const parseTs = (ts) => new Date(String(ts).replace(' ', 'T'));
  // ลูกค้าแจ้งร้านว่าจะมาช้า (LatePickupArrivalTime): ยังไม่ถึงเวลาที่แจ้ง = ไม่ต้องเตือน/โทร และยังตัดคิวไม่ได้
  const etaMs = (o) => (o.LatePickupArrivalTime ? parseTs(o.LatePickupArrivalTime).getTime() : null);
  const beforeEta = (o) => etaMs(o) !== null && nowTick < etaMs(o);
  // เวลาที่ปุ่ม "ลูกค้าไม่มารับ" กดได้ = หลังอาหารพร้อม NO_SHOW_UNLOCK_MINUTES นาที และเลยเวลาที่ลูกค้าแจ้ง (ถ้ามี)
  const noShowUnlockAt = (o) => {
    const byReady = o.ReadyAt ? new Date(o.ReadyAt).getTime() + NO_SHOW_UNLOCK_MINUTES * 60000 : Infinity;
    return Math.max(byReady, etaMs(o) ?? 0);
  };
  const canMarkNoShow = (o) => nowTick >= noShowUnlockAt(o);
  const noShowCountdown = (o) => {
    const r = Math.max(0, Math.ceil((noShowUnlockAt(o) - nowTick) / 1000));
    const h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60), sec = r % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  };
  const fmtPhone = (p) => {
    const d = String(p || '').replace(/\D/g, '');
    return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : (p || '');
  };
  // ข้อความบอกสถานะการเตือนลูกค้าบนป้าย ต้องไม่อ้างว่าเตือนแล้วถ้าไม่ได้เตือนจริง:
  //  - เตือนจริงเกิดหลัง ReadyAt อย่างน้อย PICKUP_WARNING_MINUTES เสมอ ; ค่าที่ migration ใส่ไว้ให้ออเดอร์เก่า = ReadyAt (ห่าง 0)
  //  - ยังไม่มีเวลาเตือนและเพิ่งครบเวลาไม่นาน = backend กำลังจะส่ง ; ค้างนานกว่านั้น = ระบบจะไม่ส่งแล้ว
  const reminderNote = (o) => {
    const at = o.PickupReminderAt ? new Date(o.PickupReminderAt).getTime() : null;
    const ready = o.ReadyAt ? new Date(o.ReadyAt).getTime() : null;
    if (at && ready && at - ready >= (PICKUP_WARNING_MINUTES * 60 - 5) * 1000) return `ระบบเตือนลูกค้าแล้วเมื่อ ${fmtClock(o.PickupReminderAt)} น.`;
    if (!at && minutesWaiting(o.ReadyAt) < PICKUP_WARNING_MINUTES + 2) return 'กำลังส่งแจ้งเตือนลูกค้า...';
    return 'ระบบไม่ได้ส่งแจ้งเตือนออเดอร์นี้ — โทรตามได้เลย';
  };
  const fmtClock = (ts) => ts ? parseTs(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

  // สลิปที่รอตรวจ: ค่าอาหาร (Verifying_Slip) + ส่วนต่างที่ลูกค้าแนบมาแล้ว (Awaiting_Top_Up ที่มี TopUpSlipUrl)
  const isTopUpSlip = (o) => o.Status === 'Awaiting_Top_Up' && Boolean(o.TopUpSlipUrl);
  const slipToCheck = (o) => (isTopUpSlip(o) ? o.TopUpSlipUrl : o.SlipUrl);
  const verifyingOrders = orders.filter(o => o.Status === 'Verifying_Slip' || isTopUpSlip(o));
  const activeOrders = orders.filter(o => o.Status !== 'Verifying_Slip' && !isTopUpSlip(o) && o.Status !== 'Completed' && o.Status !== 'Cancelled' && o.Status !== 'NoShow');
  // คิวที่ "ต้องจัดการ": รอลูกค้าเปลี่ยนเมนู / รอโอนส่วนต่าง / พร้อมรับแต่เลยเวลาแล้ว (ป้ายให้โทร)
  const needsAttention = (o) => ['Pending_Cancellation', 'Awaiting_Top_Up'].includes(o.Status)
    || (o.Status === 'Ready' && isPickupWarning(o.ReadyAt) && !beforeEta(o));
  const queueTabs = [
    { id: 'ready', label: 'พร้อมรับ', match: (o) => o.Status === 'Ready' },
    { id: 'attention', label: 'ต้องจัดการ', match: needsAttention },
    // ครัวกดแค่ "ปรุงเสร็จ" (ไม่มีปุ่มเริ่มทำ) : ร้านรับออเดอร์แล้ว = กำลังทำ จนกว่าจะพร้อมรับ
    { id: 'cooking', label: 'กำลังทำ', match: (o) => ['Pending', 'Cooking'].includes(o.Status) },
    { id: 'all', label: 'ทั้งหมด', match: () => true },
  ];
  // "12" / "012" / "a12" / "A012" -> หาคิว A012 (เทียบตัวเลข ; ถ้าพิมพ์ตัวอักษรมาด้วยต้องตรงร้าน)
  const queueMatches = (o, raw) => {
    const q = raw.trim().toUpperCase().replace(/\s+/g, '');
    if (!q) return true;
    const label = String(o.QueueNo || '').toUpperCase();
    const m = q.match(/^([A-Z]*)(\d+)$/);
    if (!m) return label.includes(q);
    const digits = label.replace(/\D/g, '');
    const letters = label.replace(/[^A-Z]/g, '');
    return digits !== '' && Number(digits) === Number(m[2]) && (!m[1] || m[1] === letters);
  };
  const byOldest = (tab) => (a, b) => tab === 'ready'
    ? (new Date(a.ReadyAt || 0) - new Date(b.ReadyAt || 0)) || (a.OrderID - b.OrderID)
    : a.OrderID - b.OrderID;
  const searching = queueQuery.trim() !== '';
  const currentQueueTab = queueTabs.find(t => t.id === queueTab) || queueTabs[0];
  const shownOrders = (searching
    ? activeOrders.filter(o => queueMatches(o, queueQuery))
    : activeOrders.filter(currentQueueTab.match)
  ).slice().sort(byOldest(searching ? 'all' : queueTab));
  // ค้นแล้วเจอคิวเดียว -> การ์ดส่งมอบ ; ถ้าไม่อยู่ในคิวที่ดำเนินการ ดูว่าจบไปแล้วหรือยัง (บอกพนักงานได้ทันที)
  const handoverOrder = searching && shownOrders.length === 1 ? shownOrders[0] : null;
  const endedMatch = searching && shownOrders.length === 0
    ? orders.find(o => ['Completed', 'Cancelled', 'NoShow', 'Verifying_Slip'].includes(o.Status) && queueMatches(o, queueQuery))
    : null;

  // วันนี้: ใช้ข้อมูล live ที่ดึงอยู่แล้ว ; วันก่อน ๆ : ดึงเฉพาะวันนั้นตอนเลือก (ดู useEffect ของ pastHistory)
  const historyDay = (historyDate === dateKey(nowTick) ? orders : (pastHistory.date === historyDate ? pastHistory.list : []))
    .filter(o => dateKey(o.CreatedAt) === historyDate)
    .sort((a, b) => (b.OrderID || 0) - (a.OrderID || 0));
  // ตัวกรองสถานะ + ค้นหา (เลขคิว หรือชื่อลูกค้า)
  const historyFilters = [
    { id: 'all', label: 'ทั้งหมด', match: () => true },
    { id: 'completed', label: 'สำเร็จ', match: (o) => o.Status === 'Completed' },
    { id: 'cancelled', label: 'ยกเลิก', match: (o) => o.Status === 'Cancelled' },
    { id: 'noshow', label: 'ไม่มารับ', match: (o) => o.Status === 'NoShow' },
    { id: 'active', label: 'ยังไม่จบ', match: (o) => !['Completed', 'Cancelled', 'NoShow'].includes(o.Status) },
  ];
  const historyFilterNow = historyFilters.find(f => f.id === historyFilter) || historyFilters[0];
  const historyMatchesQuery = (o) => {
    const q = historyQuery.trim();
    if (!q) return true;
    const name = String(o.CustomerName || o.UserName || (isWalkInOrder(o) ? 'walk-in' : '')).toLowerCase();
    return queueMatches(o, q) || name.includes(q.toLowerCase());
  };
  const historyOrders = historyDay.filter(o => historyFilterNow.match(o) && historyMatchesQuery(o));
  // จอเรียกคิว: แสดงแค่เลขคิว (จอสาธารณะ ไม่โชว์ชื่อ/เบอร์) ; คิวเก่าก่อน
  const DISPLAY_FLASH_MS = 10000;
  const displayCooking = orders.filter(o => ['Pending', 'Cooking'].includes(o.Status)).sort((a, b) => a.OrderID - b.OrderID);
  const displayReady = orders.filter(o => o.Status === 'Ready')
    .sort((a, b) => (new Date(a.ReadyAt || 0) - new Date(b.ReadyAt || 0)) || (a.OrderID - b.OrderID));
  const isFreshReady = (o) => {
    const at = readySeenRef.current?.get(o.OrderID);
    return Boolean(at) && nowTick - at < DISPLAY_FLASH_MS;
  };
  const canReprint = (o) => !['Verifying_Slip', 'Cancelled', 'NoShow'].includes(o.Status);

  const navItems = [
    { id: 'orders', label: 'Queue & Slips', caption: 'จัดการคิว & ตรวจสลิป', icon: 'orders', badge: verifyingOrders.length || null },
    { id: 'history', label: 'ประวัติออเดอร์', caption: 'ประวัติรายวัน / ดูลูกค้า / พิมพ์ใบเสร็จ', icon: 'stale' },
    { id: 'walkin', label: 'Walk-in POS', caption: 'แคชเชียร์สั่งอาหารหน้าร้าน', icon: 'walkin' },
    { id: 'refunds', label: 'คืนเงินลูกค้า', caption: 'ลูกค้ามารับเงินคืนที่หน้าร้าน', icon: 'coin', badge: pendingRefunds || null },
    { id: 'menu', label: 'Menu & Stock', caption: 'เปิด-ปิดสต็อกวัตถุดิบ', icon: 'menu' },
    { id: 'reports', label: 'Reports', caption: 'รายงานการขายและปัญหา', icon: 'orders' },
    { id: 'display', label: 'จอเรียกคิว (จำลอง)', caption: 'ของจริงเปิดค้างบนทีวีหน้าร้าน', icon: 'tv' },
  ];

  // ของหมดใช้ปุ่ม "ของหมด" แยกต่างหาก จึงไม่มีในเหตุผลยกเลิก
  const quickReasons = [
    'ลูกค้าขอยกเลิกเอง',
    'ครัวปรุงไม่ทัน / คิวแน่น',
    'สั่งออเดอร์ซ้ำซ้อน',
    'ลูกค้าเปลี่ยนใจเปลี่ยนร้าน',
    'เหตุขัดข้องอื่นๆ'
  ];

  return (
    <div className="cv-root">
      <style>{CV_STYLES}</style>

      {/* ===== TOPBAR ===== */}
      <header className="cv-topbar">
        <div className="cv-topbar-left">
          <div className="cv-brand">
            <div className="brand-title">
              <span className="brand-icon">🍽️</span>
              <span>Only Foods</span>
            </div>
            <div className="brand-subtitle">
              โรงอาหาร: <span className={`status-dot ${foodCourtOpen ? 'open' : 'closed'}`}></span>
              <span className={`status-text ${foodCourtOpen ? 'open' : 'closed'}`}>{foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}</span>
            </div>
          </div>

          <button className="cv-icon-btn coral-light" onClick={() => setSidebarOpen(!sidebarOpen)} title="ย่อ/ขยายเมนู">
            <Icon name="menu" size={20} />
          </button>
        </div>

        <div className="cv-topbar-right">
          <div className="cv-store-chip">
            <Icon name="store" size={16} />
            <span>{currentStore?.StoreName || `ร้านค้า #${activeStoreId}`}</span>
            <span className={`store-status-pill ${foodCourtOpen && currentStore?.IsOpen && !currentStore?.IsSuspended ? 'open' : 'closed'}`}>
              {currentStore?.IsSuspended ? 'ระงับ' : (foodCourtOpen && currentStore?.IsOpen ? 'เปิด' : 'ปิด')}
            </span>
          </div>

          <div className="cv-profile-container" ref={profileRef}>
            <div className="cv-user-chip" onClick={() => setProfileOpen(!profileOpen)}>
              <span className="user-name">{user?.FullName || user?.name || 'พนักงานหน้าร้าน'}</span>
              <span className="role-tag">Front Staff</span>
            </div>

            {profileOpen && (
              <div className="cv-profile-dropdown">
                <div className="dropdown-header">
                  <h4>{user?.FullName || user?.name || 'Front Staff'}</h4>
                  <p>พนักงานบริการหน้าร้าน (เคาน์เตอร์)</p>
                </div>
                <hr className="cv-divider" />
                <div className="dropdown-item" onClick={() => { setActiveTab('orders'); setProfileOpen(false); }}>
                  <Icon name="orders" size={18} /> จัดการคิวอาหาร
                </div>
                <div className="dropdown-item" onClick={() => { setActiveTab('walkin'); setProfileOpen(false); }}>
                  <Icon name="walkin" size={18} /> สั่งอาหาร Walk-in
                </div>
                {onLogout && (
                  <div className="dropdown-item" onClick={onLogout} style={{ color: PALETTE.red }}>
                    <Icon name="logout" size={18} /> ออกจากระบบ
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== BODY ===== */}
      <div className="cv-body">
        <aside className={`cv-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <nav className="cv-nav">
            <div className="cv-nav-label hide-on-collapse">Counter Controls</div>
            {navItems.map(n => (
              <div
                key={n.id}
                className={`cv-nav-item ${activeTab === n.id ? 'active' : ''}`}
                onClick={() => { setActiveTab(n.id); if (window.innerWidth <= 768) setSidebarOpen(false); }}
                title={!sidebarOpen ? n.label : ""}
              >
                <div className="cv-nav-icon"><Icon name={n.icon} size={20} /></div>
                <div className="cv-nav-text hide-on-collapse">
                  <div className="title">{n.label}</div>
                  <div className="caption">{n.caption}</div>
                </div>
                {n.badge ? <span className="cv-nav-badge hide-on-collapse">{n.badge}</span> : null}
              </div>
            ))}
          </nav>
        </aside>

        {/* ===== CONTENT AREA ===== */}
        <main className="cv-content">
          {pendingPrintJobs.length > 0 && (
            <div className="cv-print-alert">
              <div>
                <b>🖨️ มีใบสั่งซื้อรอยืนยันการพิมพ์ {pendingPrintJobs.length} รายการ</b>
                <small>อาหารปรุงเสร็จแล้วจากครัว กรุณาตรวจสอบข้อมูลบนตั๋วก่อนยืนยันการพิมพ์</small>
              </div>
              <button className="cv-btn btn-dark" onClick={() => {
                const job = pendingPrintJobs.find(j => orders.some(o => o.OrderID === j.OrderID)) || pendingPrintJobs[0];
                openPrintConfirm(orders.find(o => o.OrderID === job.OrderID) || null, 'FIRST_PRINT', job);
              }}>ตรวจสอบและยืนยัน</button>
            </div>
          )}
          {!foodCourtOpen && (
            <div className="foodcourt-closed-banner">
              <span>🔒</span>
              <div><b>โรงอาหารปิดให้บริการ</b><small>ระบบยังจัดการออเดอร์เดิมได้ แต่ไม่สามารถเปิดออเดอร์ Walk-in ใหม่ได้</small></div>
            </div>
          )}
          {foodCourtOpen && currentStore && (!currentStore.IsOpen || Boolean(currentStore.IsSuspended)) && (
            <div className="store-closed-banner">
              <span>⚠️</span>
              <div><b>{currentStore.IsSuspended ? 'ร้านถูกระงับการขาย' : 'ร้านปิดให้บริการ'}</b><small>ไม่สามารถเปิดออเดอร์ Walk-in ใหม่ได้</small></div>
            </div>
          )}
          
          {/* TAB 1: QUEUE & SLIPS */}
          {activeTab === 'orders' && (
            <div className="cv-stack">
              <div className="cv-printer-control">
                <span>🖨️ Mock Printer: <b>{printerStatus}</b></span>
                <button className="cv-btn btn-ghost" onClick={() => setPrinterStatus(v => v === 'READY' ? 'OFFLINE' : 'READY')}>
                  เปลี่ยนเป็น {printerStatus === 'READY' ? 'OFFLINE' : 'READY'}
                </button>
              </div>
              <div className="cv-stat-grid">
                <div className="cv-card cv-bg-coral">
                  <div className="cv-decor-circle-1" />
                  <div className="cv-stat-body">
                    <h2>{verifyingOrders.length}</h2>
                    <p>สลิปที่ต้องตรวจสอบ</p>
                  </div>
                </div>
                <div className="cv-card cv-bg-yellow">
                  <div className="cv-stat-body">
                    <h2>{orders.filter(o => ['Pending', 'Cooking'].includes(o.Status)).length}</h2>
                    <p>คิวที่ครัวกำลังปรุง</p>
                  </div>
                </div>
                <div className="cv-card cv-bg-dark">
                  <div className="cv-stat-body">
                    <h2>{orders.filter(o => o.Status === 'Ready').length}</h2>
                    <p>อาหารพร้อมส่งมอบ</p>
                  </div>
                </div>
              </div>

              {/* สลิปรอตรวจ */}
              <div className="cv-card">
                <div className="cv-card-head">
                  <div>
                    <h3>1. ตรวจสอบสลิปโอนเงิน (รอยืนยันเพื่อส่งเข้าครัว)</h3>
                    <div className="caption">ลูกค้าชำระเงินออนไลน์แล้ว รอการยืนยันยอดเงิน</div>
                  </div>
                </div>
                <div className="cv-table-wrapper">
                  <table className="cv-table">
                    <thead>
                      <tr>
                        <th>คิว</th>
                        <th>ยอดชำระ</th>
                        <th>หลักฐานสลิป</th>
                        <th style={{ textAlign: 'right' }}>การดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verifyingOrders.length === 0 ? (
                        <tr><td colSpan="4" className="empty-state">ไม่มีรายการรอตรวจสอบสลิปในขณะนี้</td></tr>
                      ) : (
                        verifyingOrders.map(o => (
                          <tr key={o.OrderID}>
                            <td><span className="queue-pill">{o.QueueNo}</span></td>
                            <td className="bold" style={{ color: PALETTE.coral, fontSize: '16px' }}>
                              ฿{fmtMoney(isTopUpSlip(o) ? o.TopUpAmount : o.TotalAmount)}
                              {isTopUpSlip(o) && <div className="caption" style={{ fontWeight: 600 }}>ส่วนต่างเปลี่ยนเมนู</div>}
                            </td>
                            <td>
                              {slipToCheck(o) ? (
                                <div onClick={() => setViewingSlip(o)} className="slip-thumb">
                                  <img src={slipToCheck(o)} alt="Slip" />
                                  <span>ตรวจสลิป + รายการอาหาร</span>
                                </div>
                              ) : <span style={{ color: PALETTE.red, fontWeight: 'bold' }}>ไม่มีสลิป</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button onClick={() => setViewingSlip(o)} className="cv-btn btn-dark" style={{ marginRight: '8px' }}>
                                🔎 ตรวจรายการ
                              </button>
                              <button onClick={() => verifySlip(o.OrderID, true)} className="cv-btn btn-success-light" style={{ marginRight: '8px' }}>
                                ✅ ยืนยัน
                              </button>
                              <button onClick={() => openRejectSlip(o)} className="cv-btn btn-danger-light">
                                ❌ ปฏิเสธ
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* คิวที่กำลังดำเนินการ */}
              <div className="cv-card">
                <div className="cv-card-head">
                  <div>
                    <h3>2. คิวคำสั่งซื้อที่กำลังดำเนินการ</h3>
                    <div className="caption">ลูกค้ามารับ: ถามเลขคิว แล้วพิมพ์ในช่องค้นหา · คิวเก่าอยู่บนสุด</div>
                  </div>
                </div>
                <div className="queue-search">
                  <span className="queue-search-icon">🔍</span>
                  <input
                    ref={queueSearchRef}
                    value={queueQuery}
                    onChange={e => setQueueQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setQueueQuery(''); }}
                    placeholder="พิมพ์เลขคิวที่ลูกค้าบอก เช่น 12"
                    inputMode="numeric"
                    aria-label="ค้นหาเลขคิว"
                  />
                  {searching && <button className="cv-btn btn-ghost" onClick={() => { setQueueQuery(''); queueSearchRef.current?.focus(); }}>ล้าง</button>}
                </div>
                {!searching && (
                  <div className="queue-tabs" role="tablist">
                    {queueTabs.map(t => {
                      const n = activeOrders.filter(t.match).length;
                      return (
                        <button key={t.id} role="tab" aria-selected={queueTab === t.id}
                          className={`queue-tab ${queueTab === t.id ? 'active' : ''} ${t.id === 'attention' && n ? 'alert' : ''}`}
                          onClick={() => setQueueTab(t.id)}>
                          {t.label} <span className="queue-tab-count">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {handoverOrder && (
                  <div className={`handover-card ${handoverOrder.Status === 'Ready' ? 'ready' : ''}`}>
                    <div className="handover-main">
                      <div className="handover-queue">{handoverOrder.QueueNo}</div>
                      <div>
                        <div className="handover-name">
                          {isWalkInOrder(handoverOrder) ? 'ลูกค้า Walk-in' : (handoverOrder.CustomerName || handoverOrder.UserName || '-')}
                        </div>
                        <div className="handover-items">
                          {(handoverOrder.items || []).map(it => `${it.ProductName} ×${it.Qty}`).join(', ')}
                        </div>
                        <div className="handover-status">
                          <Badge tone={getStatusBadgeTone(handoverOrder.Status)}>{getStatusLabel(handoverOrder.Status)}</Badge>
                          {handoverOrder.Status === 'Ready' && <span> พร้อมมาแล้ว {getElapsedLabel(handoverOrder.ReadyAt)}</span>}
                        </div>
                      </div>
                    </div>
                    {handoverOrder.Status === 'Ready' ? (
                      <button className="cv-btn btn-success cv-btn-lg" disabled={handoverBusy === handoverOrder.OrderID}
                        onClick={() => handOver(handoverOrder)}>
                        {handoverBusy === handoverOrder.OrderID ? 'กำลังบันทึก...' : `✅ ส่งมอบ ${handoverOrder.QueueNo}`}
                      </button>
                    ) : (
                      <div className="handover-wait">ยังส่งมอบไม่ได้ — แจ้งลูกค้าว่าอาหาร{getStatusLabel(handoverOrder.Status)}</div>
                    )}
                  </div>
                )}
                {searching && shownOrders.length > 1 && (
                  <div className="queue-search-hint">พบ {shownOrders.length} คิว — พิมพ์ตัวอักษรร้านนำหน้าเพื่อระบุให้ชัด</div>
                )}
                <div className="cv-table-wrapper">
                  <table className="cv-table">
                    <thead>
                      <tr>
                        <th>คิว</th>
                        <th>รายการอาหาร</th>
                        <th>สถานะ</th>
                        <th>จัดการออเดอร์</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownOrders.length === 0 ? (
                        <tr><td colSpan="4" className="empty-state">
                          {searching
                            ? (endedMatch
                              ? `คิว ${endedMatch.QueueNo} ${endedMatch.Status === 'Completed' ? 'ส่งมอบไปแล้ว' : endedMatch.Status === 'Verifying_Slip' ? 'ยังรอตรวจสลิป (ดูตารางด้านบน)' : getStatusLabel(endedMatch.Status)}`
                              : `ไม่พบคิว "${queueQuery.trim()}" ในร้านนี้`)
                            : activeOrders.length === 0 ? 'ไม่มีคิวที่กำลังดำเนินการ' : `ไม่มีคิวในแท็บ "${currentQueueTab.label}"`}
                        </td></tr>
                      ) : (
                        shownOrders.map(o => {
                          const isPendingCancel = o.Status === 'Pending_Cancellation';
                          return (
                            <tr key={o.OrderID}>
                              <td>
                                <div className="queue-pill bold">{o.QueueNo}</div>
                                {isWalkInOrder(o) && <span className="walkin-tag">Walk-in</span>}
                              </td>
                              <td>
                                {o.items?.map((it, idx) => (
                                  <div key={idx} className="item-row">
                                    • {it.ProductName} <b style={{ color: PALETTE.coral }}>x{it.Qty}</b>
                                    {it.ItemNote && <span className="item-note">({it.ItemNote})</span>}
                                  </div>
                                ))}
                                {o.Note && <div className="order-note">โน้ต: {o.Note}</div>}
                              </td>
                              <td>
                                <Badge tone={getStatusBadgeTone(o.Status)}>{getStatusLabel(o.Status)}</Badge>
                                {o.Status === 'Ready' && (
                                  <div style={{ marginTop: '6px' }}>
                                    <Badge tone={canMarkNoShow(o) ? 'danger' : isPickupWarning(o.ReadyAt) && !beforeEta(o) ? 'warning' : 'neutral'}>
                                      รอมาแล้ว {getElapsedLabel(o.ReadyAt)}
                                    </Badge>
                                    {beforeEta(o) && (
                                      <div className="pickup-eta" role="status">
                                        🕒 ลูกค้าแจ้งจะมาถึง <b>{fmtClock(o.LatePickupArrivalTime)} น.</b>
                                        <span className="pickup-sub">ยังไม่ต้องโทร · ตัดคิวได้หลังเวลานี้</span>
                                      </div>
                                    )}
                                    {isPickupWarning(o.ReadyAt) && !beforeEta(o) && (
                                      <div className="pickup-warning" role="alert">
                                        {isWalkInOrder(o) ? (
                                          <>⚠️ ครบ {PICKUP_WARNING_MINUTES} นาทียังไม่มารับ<br />ลูกค้า Walk-in: เรียกด้วยเสียงหน้าร้าน</>
                                        ) : (
                                          <>
                                            {o.LatePickupArrivalTime
                                              ? <>⚠️ เลยเวลาที่ลูกค้าแจ้ง ({fmtClock(o.LatePickupArrivalTime)} น.) — โทรหาลูกค้า<br /></>
                                              : <>⚠️ ครบ {PICKUP_WARNING_MINUTES} นาทียังไม่มารับ — โทรหาลูกค้า<br /></>}
                                            <b className="pickup-phone">{o.CustomerPhone ? fmtPhone(o.CustomerPhone) : 'ไม่มีเบอร์โทรในระบบ'}</b>
                                            <span className="pickup-sub">
                                              {o.LatePickupArrivalTime ? 'ลูกค้าแจ้งเวลามารับเองแล้ว ระบบจึงไม่ส่งเตือนซ้ำ' : reminderNote(o)}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {o.Status !== 'Ready' && o.LatePickupArrivalTime && (
                                  <div className="pickup-eta compact">🕒 ลูกค้าแจ้งจะมาถึง <b>{fmtClock(o.LatePickupArrivalTime)} น.</b></div>
                                )}
                                {isPendingCancel && (
                                  <div style={{ fontSize: '11px', color: PALETTE.coral, fontWeight: '700', marginTop: '4px' }}>
                                    เหลือเวลา: {getRemainingLabel(o.CancelDeadline)}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div className="cv-action-buttons">
                                  {o.Status === 'Ready' && (
                                    <>
                                      <button onClick={() => handOver(o)} className="cv-btn btn-success" disabled={handoverBusy === o.OrderID}>
                                        ✅ ส่งมอบอาหาร
                                      </button>
                                      <button
                                        onClick={() => openNoShowModal(o)}
                                        disabled={!canMarkNoShow(o)}
                                        className="cv-btn btn-danger"
                                        title={beforeEta(o)
                                          ? `ลูกค้าขอมารับภายใน ${fmtClock(o.LatePickupArrivalTime)} น. กดได้หลังเวลานี้`
                                          : `กดได้เมื่อเกิน ${NO_SHOW_UNLOCK_MINUTES} นาทีหลังอาหารเสร็จ (พนักงานตัดสินใจเอง ระบบไม่ตัดให้)`}
                                      >
                                        🚫 {canMarkNoShow(o)
                                          ? 'ลูกค้าไม่มารับอาหาร'
                                          : beforeEta(o) && etaMs(o) >= noShowUnlockAt(o)
                                            ? `ลูกค้าขอมาถึง ${fmtClock(o.LatePickupArrivalTime)} น. (อีก ${noShowCountdown(o)})`
                                            : `ลูกค้าไม่มารับ (อีก ${noShowCountdown(o)})`}
                                      </button>
                                    </>
                                  )}
                                  <button onClick={() => openPrintConfirm(o, 'REPRINT')} className="cv-btn-icon" title="พิมพ์ใบสั่งซื้อ (ต้องยืนยัน)"><Icon name="print" size={16} /></button>
                                  <button onClick={() => viewCustomerProfile(o)} className="cv-btn-icon" title="ข้อมูลลูกค้า"><Icon name="user" size={16} /></button>
                                  
                                  {/* ของหมด/ยกเลิกใช้ได้เฉพาะคิวที่ยังไม่เสร็จ */}
                                  {/* walk-in ไม่มีลูกค้าในระบบให้ตอบกลับ จึงยกเลิกได้อย่างเดียว */}
                                  {!isPendingCancel && !isWalkInOrder(o) && ['Pending', 'Cooking'].includes(o.Status) && (
                                    <button onClick={() => openOutModal(o)} className="cv-btn btn-warning-light">
                                      ⚠️ ของหมด
                                    </button>
                                  )}
                                  {['Pending', 'Cooking', 'Pending_Cancellation', 'Awaiting_Top_Up'].includes(o.Status) && (
                                    <button onClick={() => openCancelModal(o)} className="cv-btn btn-danger-light">
                                      ❌ ยกเลิก
                                    </button>
                                  )}
                                  {o.Status === 'Ready' && (
                                    <span className="action-lock-note">อาหารเสร็จแล้ว</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* จอเรียกคิว (จำลอง) */}
          {activeTab === 'display' && (
            <div className="cv-stack">
              <div className="display-note">
                <b>📺 หน้าจำลองจอเรียกคิว</b>
                <span>ร้านจริงเปิดหน้านี้ค้างไว้บนทีวีหรือจอที่หันไปทางลูกค้า แสดงแค่เลขคิว ไม่แสดงชื่อหรือเบอร์โทร
                  · คิวที่เพิ่งพร้อมจะกระพริบ 10 วินาทีพร้อมเสียงเตือน แทนการตะโกนเรียก · ส่งมอบแล้วคิวหายจากจอเอง</span>
                <div className="display-note-actions">
                  <button className="cv-btn btn-ghost" onClick={() => { setDisplaySound(v => !v); if (!displaySound) playChime(); }}>
                    {displaySound ? '🔔 เสียงเปิดอยู่' : '🔕 เสียงปิดอยู่'}
                  </button>
                  <button className="cv-btn btn-dark" onClick={toggleDisplayFull}>⛶ เปิดเต็มจอ</button>
                </div>
              </div>
              <div ref={displayRef} className={`queue-display ${displayFull ? 'full' : ''}`}>
                <div className="qd-head">
                  <span>{currentStore?.StoreName || 'ร้านค้า'}</span>
                  <span className="qd-clock">{new Date(nowTick).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })} น.</span>
                </div>
                <div className="qd-cols">
                  <section className="qd-col cooking">
                    <h4>🍳 กำลังทำ <span>{displayCooking.length}</span></h4>
                    <div className="qd-grid">
                      {displayCooking.length === 0 ? <div className="qd-empty">—</div> : displayCooking.map(o => (
                        <div key={o.OrderID} className="qd-num">{o.QueueNo}</div>
                      ))}
                    </div>
                  </section>
                  <section className="qd-col ready">
                    <h4>✅ พร้อมรับ <span>{displayReady.length}</span></h4>
                    <div className="qd-grid">
                      {displayReady.length === 0 ? <div className="qd-empty">ยังไม่มีคิวพร้อมรับ</div> : displayReady.map(o => (
                        <div key={o.OrderID} className={`qd-num ${isFreshReady(o) ? 'fresh' : ''}`}>{o.QueueNo}</div>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="qd-foot">กรุณาแสดงเลขคิวที่หน้าเคาน์เตอร์เพื่อรับอาหาร</div>
                {displayFull && <button className="qd-exit" onClick={toggleDisplayFull}>ออกจากเต็มจอ (Esc)</button>}
              </div>
            </div>
          )}

          {/* TAB 2: ประวัติออเดอร์ (รายวัน) */}
          {activeTab === 'history' && (
            <div className="cv-card">
              <div className="cv-card-head">
                <div>
                  <h3>ประวัติออเดอร์ทั้งหมดของวัน</h3>
                  <div className="caption">ดูประวัติลูกค้า และสั่งพิมพ์ใบเสร็จซ้ำ (ต้องกดยืนยันก่อนพิมพ์ทุกครั้ง)</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="date"
                    value={historyDate}
                    max={dateKey(nowTick)}
                    onChange={e => e.target.value && setHistoryDate(e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: '10px', border: `1px solid ${PALETTE.border}`, fontFamily: 'inherit' }}
                  />
                  <button className="cv-btn btn-ghost" onClick={() => setHistoryDate(dateKey(nowTick))}>วันนี้</button>
                </div>
              </div>
              <div className="queue-search">
                <span className="queue-search-icon">🔍</span>
                <input
                  value={historyQuery}
                  onChange={e => setHistoryQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setHistoryQuery(''); }}
                  placeholder="ค้นหาเลขคิว เช่น 12 หรือชื่อลูกค้า"
                  aria-label="ค้นหาประวัติออเดอร์"
                />
                {historyQuery.trim() && <button className="cv-btn btn-ghost" onClick={() => setHistoryQuery('')}>ล้าง</button>}
              </div>
              <div className="queue-tabs" role="tablist" aria-label="กรองตามสถานะ">
                {historyFilters.map(f => (
                  <button key={f.id} role="tab" aria-selected={historyFilter === f.id}
                    className={`queue-tab ${historyFilter === f.id ? 'active' : ''}`}
                    onClick={() => setHistoryFilter(f.id)}>
                    {f.label} <span className="queue-tab-count">{historyDay.filter(f.match).length}</span>
                  </button>
                ))}
              </div>
              <div className="cv-table-wrapper">
                <table className="cv-table">
                  <thead>
                    <tr>
                      <th>คิว</th>
                      <th>เวลาสั่ง</th>
                      <th>ลูกค้า</th>
                      <th>รายการอาหาร</th>
                      <th>ยอดรวม</th>
                      <th>สถานะ</th>
                      <th style={{ textAlign: 'right' }}>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyOrders.length === 0 ? (
                      <tr><td colSpan="7" className="empty-state">{pastHistory.loading && pastHistory.date === historyDate ? 'กำลังโหลด...'
                        : historyDay.length === 0 ? 'ไม่มีออเดอร์ในวันที่เลือก'
                        : historyQuery.trim() ? `ไม่พบ "${historyQuery.trim()}" ในสถานะ "${historyFilterNow.label}"`
                        : `ไม่มีออเดอร์สถานะ "${historyFilterNow.label}" ในวันที่เลือก`}</td></tr>
                    ) : (
                      historyOrders.map(o => (
                        <tr key={o.OrderID}>
                          <td>
                            <span className="queue-pill bold">{o.QueueNo}</span>
                            {isWalkInOrder(o) && <span className="walkin-tag">Walk-in</span>}
                          </td>
                          <td>{o.CreatedAt ? new Date(o.CreatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                          <td>{o.CustomerName || o.UserName || 'ลูกค้า Walk-in'}</td>
                          <td>{o.items?.map(i => `${i.ProductName} (x${i.Qty})`).join(', ')}</td>
                          <td className="bold">฿{fmtMoney(o.TotalAmount)}</td>
                          <td><Badge tone={getStatusBadgeTone(o.Status)}>{getStatusLabel(o.Status)}</Badge></td>
                          <td>
                            <div className="cv-stale-actions" style={{ justifyContent: 'flex-end' }}>
                              <button onClick={() => viewCustomerProfile(o)} className="cv-btn btn-dark">👤 ประวัติลูกค้า</button>
                              <button
                                onClick={() => openPrintConfirm(o, 'REPRINT')}
                                disabled={!canReprint(o)}
                                className="cv-btn btn-ghost"
                                title={canReprint(o) ? 'พิมพ์ใบสั่งซื้อ (ต้องยืนยัน)' : 'ออเดอร์นี้ไม่สามารถพิมพ์ได้'}
                              >
                                🖨️ พิมพ์ใบเสร็จ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: WALKIN POS */}
          {activeTab === 'walkin' && (
            <div className="cv-pos-grid">
              <div className="cv-card">
                <div className="cv-card-head">
                  <div>
                    <h3>เมนูอาหารพร้อมจำหน่าย</h3>
                    <div className="caption">เลือกเมนูเพื่อเพิ่มลงตะกร้า Walk-in {(!foodCourtOpen || currentStore?.IsSuspended || currentStore?.IsOpen === false) && '• ขณะนี้ปิดรับออเดอร์'}</div>
                  </div>
                </div>
                <div className="cv-product-grid">
                  {products.map(p => (
                    <div key={p.ProductId} className="cv-product-card">
                      <div className="cv-product-info">
                        <h4>{p.ProductName}</h4>
                        <div className="price">฿{fmtMoney(p.UnitPrice)}</div>
                      </div>
                      {p.IsOutOfStock ? (
                        <div className="out-of-stock-badge">สินค้าหมด</div>
                      ) : (
                        <button onClick={() => addToCart(p)} className="cv-btn btn-coral" style={{ width: '100%', marginTop: '8px' }}>
                          + สั่งจานนี้
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="cv-card cv-cart-card">
                <div className="cv-card-head">
                  <div>
                    <h3>🛒 ตะกร้าหน้าร้าน</h3>
                    <div className="caption">กดชำระเงิน: เงินสด / QR / TrueMoney แล้วออกคิวทันที</div>
                  </div>
                </div>

                {cart.length === 0 ? (
                  <div className="empty-state" style={{ padding: '60px 16px' }}>ยังไม่มีรายการอาหารในตะกร้า</div>
                ) : (
                  <div className="cv-cart-body">
                    <div className="cart-item-list">
                      {cart.map((item, idx) => (
                        <div key={idx} className="cart-item">
                          <div className="item-head">
                            <span className="bold">{item.ProductName}</span>
                            <div className="price-del">
                              <span className="bold" style={{ color: PALETTE.coral }}>฿{fmtMoney(item.UnitPrice)}</span>
                              <button onClick={() => removeFromCart(idx)} className="btn-del">✖</button>
                            </div>
                          </div>
                          <input
                            type="text"
                            placeholder="โน้ตพิเศษ เช่น ไม่ใส่ผัก, เผ็ดน้อย"
                            value={item.note || ''}
                            onChange={(e) => updateCartNote(idx, e.target.value)}
                            className="cv-input-note"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="cart-total-box">
                      <span>ยอดรวมสุทธิ</span>
                      <span className="total-amount">฿{fmtMoney(totalAmount)}</span>
                    </div>

                    <input
                      type="text"
                      placeholder="หมายเหตุออเดอร์ (ถ้ามี)"
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      className="cv-input-main"
                      style={{ marginBottom: '14px' }}
                    />

                    <button disabled={!foodCourtOpen || currentStore?.IsSuspended || currentStore?.IsOpen === false} onClick={openPayment} className="cv-btn btn-dark cv-btn-lg" style={{ width: '100%' }}>
                      {!foodCourtOpen ? '🔒 โรงอาหารปิด — เปิดคิวไม่ได้' : currentStore?.IsSuspended ? '🔒 ร้านถูกระงับ' : currentStore?.IsOpen === false ? '🔒 ร้านปิด — เปิดคิวไม่ได้' : `💳 ชำระเงิน ฿${fmtMoney(totalAmount)}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: REPORTS */}
          {activeTab === 'reports' && (
            <div className="cv-stack">
              <div className="cv-card">
                <div className="cv-card-head">
                  <div>
                    <h3>📊 รายงานหน้าร้าน</h3>
                    <div className="caption">สรุปข้อมูลจากระบบของร้านนี้</div>
                  </div>
                  <button onClick={fetchReports} className="cv-btn btn-ghost">↻ รีเฟรช</button>
                </div>
                <div className="report-grid">
                  <div className="report-card"><span>ยอดขายสุทธิ</span><b>฿{fmtMoney(reportData?.net_sales)}</b><small>Completed + No-Show ตาม API รายงาน</small></div>
                  <div className="report-card"><span>จำนวนออเดอร์</span><b>{reportData?.total_orders ?? 0}</b><small>ออเดอร์ที่ถูกนับในรายงาน</small></div>
                  <div className="report-card"><span>ยกเลิก</span><b>{reportCancellations.length}</b><small>รายการสถานะ Cancelled</small></div>
                  <div className="report-card"><span>เมนูหมดตอนนี้</span><b>{products.filter(p => p.IsOutOfStock).length}</b><small>สถานะจาก Menu & Stock</small></div>
                </div>
              </div>

              <div className="cv-card">
                <div className="cv-card-head"><div><h3>ประวัติการยกเลิก</h3><div className="caption">ใช้ตรวจสอบปัญหาออเดอร์และเหตุผลที่ยกเลิก</div></div></div>
                <div className="cv-table-wrapper">
                  <table className="cv-table">
                    <thead><tr><th>คิว</th><th>ยอดเงิน</th><th>เหตุผล</th><th>Order ID</th></tr></thead>
                    <tbody>
                      {reportCancellations.length === 0 ? <tr><td colSpan="4" className="empty-state">ยังไม่มีประวัติการยกเลิก</td></tr> : reportCancellations.slice(0, 20).map(o => (
                        <tr key={o.OrderID}><td><span className="queue-pill">{o.QueueNo}</span></td><td>฿{fmtMoney(o.TotalAmount)}</td><td>{o.CancelReason || '-'}</td><td>#{o.OrderID}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'refunds' && (
            <RefundLog apiBase={apiBase} canConfirm pollMs={10000} onChanged={fetchPendingRefunds} />
          )}

          {/* TAB 5: MENU & STOCK */}
          {activeTab === 'menu' && (
            <div className="cv-card">
              <div className="cv-card-head">
                <div>
                  <h3>ตั้งค่าสถานะวัตถุดิบหน้าร้าน</h3>
                  <div className="caption">หากวัตถุดิบหมด ให้กดเพื่อระงับการขายชั่วคราว</div>
                </div>
              </div>
              <div className="cv-stock-grid">
                {products.map(p => (
                  <div key={p.ProductId} className="cv-stock-item">
                    <div>
                      <h4 style={{ margin: '0 0 4px', fontSize: '15px' }}>{p.ProductName}</h4>
                      <Badge tone={p.IsOutOfStock ? 'danger' : 'success'}>
                        {p.IsOutOfStock ? '● สินค้าหมด' : '● พร้อมขาย'}
                      </Badge>
                    </div>
                    <button
                      onClick={() => toggleStock(p)}
                      className={`cv-btn ${p.IsOutOfStock ? 'btn-success-light' : 'btn-danger-light'}`}
                    >
                      {p.IsOutOfStock ? 'เปิดขาย' : 'ของหมด'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* 🔴 NEW MODAL: CANCEL ORDER (RECEIPT & BILL BREAKDOWN STYLE) */}
      {printConfirmOrder && (
        <div className="cv-modal-overlay" onClick={() => setPrintConfirmOrder(null)}>
          <div className="cv-modal cv-print-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>🖨️ ยืนยันการพิมพ์</h3><div className="caption">ตรวจข้อมูลสำคัญก่อนส่งไปยัง Mock Printer</div></div>
              <button onClick={() => setPrintConfirmOrder(null)} className="cv-modal-close">✖</button>
            </div>
            {printConfirmOrder.order ? (
              <div className="print-ticket-preview">
                <div><b>เลขคิว:</b> {printConfirmOrder.order.QueueNo}</div>
                <div><b>ชื่อลูกค้า:</b> {printConfirmOrder.order.CustomerName || printConfirmOrder.order.UserName || 'ลูกค้า Walk-in'}</div>
                <div className="receipt-divider" />
                {printableItems(printConfirmOrder.order).map((i, idx) => (
                  <div className="receipt-item-row" key={idx}><span>{i.ProductName} × {i.Qty}</span><span>฿{fmtMoney(Number(i.UnitPrice) * Number(i.Qty))}</span></div>
                ))}
                <div className="receipt-divider" />
                <div className="receipt-total-row"><span>รวม</span><span className="receipt-total-val">฿{fmtMoney(printConfirmOrder.order.TotalAmount)}</span></div>
              </div>
            ) : (
              <div className="print-ticket-preview">
                <div><b>เลขคิว:</b> {printConfirmOrder.job?.QueueNo}</div>
                <div><b>ยอดรวม:</b> ฿{fmtMoney(printConfirmOrder.job?.TotalAmount)}</div>
              </div>
            )}
            {printConfirmOrder.error && (
              <div className="cv-print-error" role="alert">
                <b>พิมพ์ไม่ได้</b>
                <span>{printConfirmOrder.error}</span>
              </div>
            )}
            <div className={printerStatus === 'READY' ? 'cv-printer-ready' : 'cv-printer-offline'}>
              🖨️ สถานะเครื่องพิมพ์: <b>{printerStatus}</b>
              {printerStatus !== 'READY' && <span> — เปลี่ยนเป็น READY ที่แถบ Mock Printer ด้านบนก่อนพิมพ์</span>}
            </div>
            <div className="modal-footer-btns">
              {printConfirmOrder.job && (
                <button onClick={skipPrintJob} className="cv-btn btn-ghost" disabled={printBusy}
                  title="ปิดการแจ้งเตือนใบนี้ (พิมพ์ซ้ำทีหลังได้จากปุ่มเครื่องพิมพ์ในรายการออเดอร์)">
                  ไม่ต้องพิมพ์ใบนี้
                </button>
              )}
              <button onClick={() => setPrintConfirmOrder(null)} className="cv-btn btn-ghost">ปิด</button>
              <button onClick={confirmPrint} className="cv-btn btn-dark"
                disabled={!printConfirmOrder.order || printerStatus !== 'READY' || printBusy || Boolean(validatePrintData(printConfirmOrder.order))}>
                {printBusy ? 'กำลังดำเนินการ...' : 'ยืนยันการพิมพ์'}
              </button>
            </div>
          </div>
        </div>
      )}

      {payOpen && (
        <div className="cv-modal-overlay" onClick={() => !payBusy && setPayOpen(false)}>
          <div className="cv-modal cv-pay-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>💳 ชำระเงิน Walk-in</h3><div className="caption">{cart.length} รายการ · ชำระแล้วออกคิวเข้าครัวทันที</div></div>
              <button onClick={() => setPayOpen(false)} className="cv-modal-close" disabled={payBusy}>✖</button>
            </div>
            <div className="pay-total"><span>ยอดรวม</span><b>฿{fmtMoney(totalAmount)}</b></div>
            <div className="pay-methods" role="radiogroup" aria-label="วิธีชำระเงิน">
              {[['Cash', '💵 เงินสด'], ['PromptPay', '📱 QR PromptPay'], ['TrueMoney', '👛 TrueMoney']].map(([v, label]) => (
                <button key={v} role="radio" aria-checked={payMethod === v} className={`pay-method ${payMethod === v ? 'active' : ''}`}
                  onClick={() => setPayMethod(v)} disabled={payBusy}>{label}</button>
              ))}
            </div>
            {payMethod === 'Cash' ? (
              <>
                <label className="pay-label" htmlFor="cash-input">รับเงินจากลูกค้า (บาท)</label>
                <input id="cash-input" className="pay-cash-input" inputMode="decimal" autoFocus value={cashInput}
                  onChange={e => setCashInput(e.target.value.replace(/[^\d.]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter' && cashEnough) submitWalkInOrder(); }}
                  placeholder="0" />
                <div className="pay-quick">
                  <button className="cv-btn btn-ghost" onClick={() => setCashInput(String(totalAmount))}>พอดี</button>
                  {[20, 50, 100, 500, 1000].map(n => (
                    <button key={n} className="cv-btn btn-ghost" onClick={() => addCash(n)}>+฿{n}</button>
                  ))}
                  <button className="cv-btn btn-ghost" onClick={() => setCashInput('')}>ล้าง</button>
                </div>
                <div className={`pay-change ${cashInput === '' ? '' : cashEnough ? 'ok' : 'short'}`}>
                  {cashInput === '' ? 'กรอกจำนวนเงินที่รับ หรือกดปุ่มด้านบน'
                    : cashEnough ? <>เงินทอน <b>฿{fmtMoney(cashChange)}</b></>
                    : <>ขาดอีก <b>฿{fmtMoney(-cashChange)}</b></>}
                </div>
              </>
            ) : (
              <div className="pay-qr">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${payMethod}_${totalAmount}`} alt={`QR ${payMethod}`} />
                <div>
                  <b>ให้ลูกค้าสแกนจ่าย ฿{fmtMoney(totalAmount)}</b>
                  <small>ดูหน้าจอ "โอนสำเร็จ" บนมือถือลูกค้า ยอดและเวลาต้องตรง แล้วกดยืนยัน (ระบบบันทึกชื่อคุณเป็นผู้รับเงิน) · QR จำลอง</small>
                </div>
              </div>
            )}
            <div className="modal-footer-btns">
              <button onClick={() => setPayOpen(false)} className="cv-btn btn-ghost" disabled={payBusy}>ยกเลิก</button>
              <button onClick={submitWalkInOrder} className="cv-btn btn-success"
                disabled={payBusy || (payMethod === 'Cash' && !cashEnough)}>
                {payBusy ? 'กำลังออกคิว...' : payMethod === 'Cash' ? '💰 รับเงิน & ออกคิว' : '✅ ได้รับเงินแล้ว & ออกคิว'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stockModal && (
        <div className="cv-modal-overlay" onClick={() => !stockBusy && setStockModal(null)}>
          <div className="cv-modal cv-stock-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>⚠️ ปิดเมนู "{stockModal.product.ProductName}" (ของหมด)</h3><div className="caption">ลูกค้าจะสั่งเมนูนี้ไม่ได้จนกว่าจะเปิดขายอีกครั้ง</div></div>
              <button onClick={() => setStockModal(null)} className="cv-modal-close" disabled={stockBusy}>✖</button>
            </div>
            {stockModal.notifiable.length > 0 ? (
              <div className="stock-affected">
                <b>มี {stockModal.notifiable.length} ออเดอร์ที่ยังไม่ได้ปรุง/กำลังปรุงเมนูนี้</b>
                <div className="stock-queue-list">
                  {stockModal.notifiable.map(o => <span key={o.OrderID} className="stock-queue">{o.QueueNo}</span>)}
                </div>
                <small>ถ้าแจ้งลูกค้า: ออเดอร์จะเปลี่ยนเป็น "รอลูกค้าเปลี่ยนเมนู" ลูกค้าเลือกเปลี่ยนเมนูหรือยกเลิกรับเงินคืนภายใน 30 นาที เลยเวลาแล้วระบบยกเลิกให้อัตโนมัติ (ลูกค้ามารับเงินคืนที่ร้าน)</small>
              </div>
            ) : (
              <p className="stock-none">ไม่มีออเดอร์ลูกค้าออนไลน์ที่ต้องแจ้ง</p>
            )}
            {stockModal.silent.length > 0 && (
              <p className="stock-silent">
                ไม่แจ้งอัตโนมัติ {stockModal.silent.length} ออเดอร์ (Walk-in / ปรุงเสร็จแล้ว / รอตรวจสลิป):{' '}
                <b>{stockModal.silent.map(o => o.QueueNo).join(', ')}</b> — คุยกับลูกค้าหน้าร้านเองหากจำเป็น
              </p>
            )}
            <div className="modal-footer-btns">
              <button onClick={() => setStockModal(null)} className="cv-btn btn-ghost" disabled={stockBusy}>ยกเลิก</button>
              {stockModal.notifiable.length > 0 && (
                <button onClick={() => confirmOutOfStock(false)} className="cv-btn btn-ghost" disabled={stockBusy}>ปิดเมนูอย่างเดียว</button>
              )}
              <button onClick={() => confirmOutOfStock(true)} className="cv-btn btn-danger" disabled={stockBusy}>
                {stockBusy ? 'กำลังบันทึก...' : stockModal.notifiable.length > 0 ? `ปิดเมนู + แจ้งลูกค้า ${stockModal.notifiable.length} ออเดอร์` : 'ยืนยันปิดเมนู'}
              </button>
            </div>
          </div>
        </div>
      )}

      {noShowModal && (
        <div className="cv-modal-overlay" onClick={() => setNoShowModal(null)}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>🚫 ยืนยันลูกค้าไม่มารับอาหาร</h3><div className="caption">การตัดคิวเป็นการตัดสินใจของพนักงาน ไม่ตัดอัตโนมัติ</div></div>
              <button onClick={() => setNoShowModal(null)} className="cv-modal-close">✖</button>
            </div>
            <div className="cv-customer-info">
              <div className="info-row"><span>คิว</span><b>{noShowModal.QueueNo}</b></div>
              <div className="info-row"><span>ลูกค้า</span><b>{noShowModal.CustomerName || 'ลูกค้า Walk-in'}</b></div>
              <div className="info-row"><span>โทรศัพท์</span><b>{noShowModal.CustomerPhone || '-'}</b></div>
              <div className="info-row"><span>อีเมล</span><b>{noShowModal.CustomerEmail || '-'}</b></div>
              <div className="info-row"><span>รอมาแล้ว</span><b>{getElapsedLabel(noShowModal.ReadyAt)}</b></div>
              {noShowModal.LatePickupArrivalTime && (
                <div className="info-row"><span>ลูกค้าแจ้งจะมาถึง</span><b>{fmtClock(noShowModal.LatePickupArrivalTime)} น.</b></div>
              )}
            </div>
            <p style={{ marginTop: 14, color: PALETTE.textSub, fontSize: 13 }}>ระบบเตือนลูกค้าให้แล้ว แนะนำให้โทรยืนยันก่อนตัดคิว หากลูกค้าแจ้งว่าจะมารับช้า ไม่ต้องตัดคิว (ตัดคิวแล้วไม่คืนเงิน)</p>
            <div className="modal-footer-btns">
              <button onClick={() => setNoShowModal(null)} className="cv-btn btn-ghost">ยกเลิก</button>
              <button onClick={confirmNoShow} className="cv-btn btn-danger">ยืนยัน ลูกค้าไม่มารับ</button>
            </div>
          </div>
        </div>
      )}

      {outModal && (
        <div className="cv-modal-overlay" onClick={() => !outBusy && setOutModal(null)}>
          <div className="cv-modal cv-out-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>⚠️ แจ้งของหมด · คิว {outModal.order.QueueNo}</h3>
                <div className="caption">ลูกค้าเลือกเปลี่ยนเมนู หรือยกเลิกรับเงินคืนได้ภายใน 30 นาที เลยเวลาแล้วระบบยกเลิกให้อัตโนมัติ</div></div>
              <button onClick={() => setOutModal(null)} className="cv-modal-close" disabled={outBusy}>✖</button>
            </div>
            <div className="out-label">เมนูไหนหมด? (เลือกได้หลายจาน)</div>
            <div className="out-items">
              {outItems(outModal.order).map(it => (
                <label key={it.OrderItemId} className={`out-item ${outModal.selected.includes(it.OrderItemId) ? 'active' : ''}`}>
                  <input type="checkbox" checked={outModal.selected.includes(it.OrderItemId)} onChange={() => toggleOutItem(it.OrderItemId)} />
                  <span className="out-name">{it.ProductName} ×{it.Qty}</span>
                  <span className="out-price">฿{fmtMoney(Number(it.UnitPrice) * Number(it.Qty))}</span>
                </label>
              ))}
            </div>
            <label className="out-close">
              <input type="checkbox" checked={outModal.closeMenu} onChange={e => setOutModal(m => ({ ...m, closeMenu: e.target.checked }))} />
              <span>ปิดเมนูที่เลือกในร้านด้วย (ลูกค้าคนอื่นสั่งไม่ได้จนกว่าจะเปิดขายใหม่ในหน้า Menu &amp; Stock)</span>
            </label>
            <div className="modal-footer-btns">
              <button onClick={() => setOutModal(null)} className="cv-btn btn-ghost" disabled={outBusy}>ยกเลิก</button>
              <button onClick={confirmOrderOut} className="cv-btn btn-warning-solid" disabled={outBusy || !outModal.selected.length}>
                {outBusy ? 'กำลังแจ้ง...' : outModal.selected.length ? `⚠️ แจ้งลูกค้าเปลี่ยนเมนู (${outModal.selected.length} จาน)` : 'เลือกจานที่หมดก่อน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelModal && (
        <div className="cv-modal-overlay" onClick={() => setCancelModal(null)}>
          <div className="cv-modal cv-cancel-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="cancel-icon-badge">❌</div>
                <div>
                  <h3 style={{ margin: 0 }}>ยกเลิกออเดอร์</h3>
                  <div className="caption">คิวหมายเลข: <b style={{ color: PALETTE.coral }}>{cancelModal.order.QueueNo}</b></div>
                </div>
              </div>
              <button onClick={() => setCancelModal(null)} className="cv-modal-close">✖</button>
            </div>

            {/* Receipt Summary Card */}
            <div className="receipt-summary-card">
              <div className="receipt-title">สรุปรายการคำสั่งซื้อ</div>
              <div className="receipt-items">
                {cancelModal.order.items?.map((it, idx) => (
                  <div key={idx} className="receipt-item-row">
                    <span>{it.ProductName} x{it.Qty}</span>
                    <span className="bold">฿{fmtMoney(it.UnitPrice * it.Qty)}</span>
                  </div>
                ))}
              </div>
              <div className="receipt-divider" />
              <div className="receipt-total-row">
                <span>ยอดเงินที่ชำระแล้ว</span>
                <span className="receipt-total-val">฿{fmtMoney(cancelModal.order.TotalAmount)}</span>
              </div>
            </div>

            {/* Quick Reason Chips */}
            <div className="reason-section">
              <label className="reason-label">เลือกเหตุผลอย่างรวดเร็ว:</label>
              <div className="reason-chips">
                {quickReasons.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`reason-chip ${cancelReasonTag === r ? 'active' : ''}`}
                    onClick={() => setCancelReasonTag(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <textarea
                placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                className="cv-textarea"
                rows={2}
              />
            </div>

            <div className="cancel-refund-note">
              {isWalkInOrder(cancelModal.order)
                ? '💵 ลูกค้า Walk-in: คืนเงินสดให้ลูกค้าที่หน้าร้าน'
                : '💸 ลูกค้าออนไลน์: ระบบบันทึกคืนเงินให้ฝ่ายบัญชีดำเนินการ และแจ้งลูกค้าให้อัตโนมัติ'}
            </div>

            {/* Footer Buttons */}
            <div className="modal-footer-btns">
              <button onClick={() => setCancelModal(null)} className="cv-btn btn-ghost">
                ไม่ยกเลิก
              </button>
              <button onClick={handleConfirmCancel} className="cv-btn btn-danger-solid">
                ❌ ยืนยันยกเลิกออเดอร์
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: SLIP + ORDER ITEMS ===== */}
      {viewingSlip && (
        <div className="cv-modal-overlay" onClick={() => setViewingSlip(null)}>
          <div className="cv-modal cv-slip-review-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>🧾 ตรวจสอบสลิปและรายการอาหาร</h3><div className="caption">คิว <b style={{ color: PALETTE.coral }}>{viewingSlip.QueueNo}</b></div></div>
              <button onClick={() => setViewingSlip(null)} className="cv-modal-close">✖</button>
            </div>

            <div className="slip-order-summary">
              <div className="receipt-title">รายการที่ลูกค้าสั่ง</div>
              {viewingSlip.items?.map((it, idx) => (
                <div key={idx} className="receipt-item-row">
                  <span>{it.ProductName} × {it.Qty}</span>
                  <b>฿{fmtMoney(Number(it.UnitPrice) * Number(it.Qty))}</b>
                </div>
              ))}
              <div className="receipt-divider" />
              <div className="receipt-total-row"><span>ยอดรวม</span><span className="receipt-total-val">฿{fmtMoney(viewingSlip.TotalAmount)}</span></div>
              {isTopUpSlip(viewingSlip) && (
                <div className="receipt-total-row"><span>สลิปนี้: ส่วนต่างที่ต้องโอนเพิ่ม</span><span className="receipt-total-val">฿{fmtMoney(viewingSlip.TopUpAmount)}</span></div>
              )}
            </div>

            {slipToCheck(viewingSlip) ? <img src={slipToCheck(viewingSlip)} alt="Slip" className="slip-full-img" /> : <div className="empty-state">ไม่มีรูปสลิป</div>}

            {/* สลิปทุกใบของออเดอร์นี้ (ค่าอาหาร + ส่วนต่าง รวมใบที่ถูกปฏิเสธ) */}
            {(viewingSlip.Payments || []).filter(p => p.SlipUrl).length > 1 && (
              <div className="slip-history">
                <div className="receipt-title">สลิปทั้งหมดของออเดอร์นี้</div>
                {(viewingSlip.Payments || []).filter(p => p.SlipUrl).map(p => (
                  <a key={p.PaymentId} href={p.SlipUrl} target="_blank" rel="noreferrer" className="slip-history-item">
                    <img src={p.SlipUrl} alt="Slip" />
                    <span>
                      {p.PaymentType === 'TOP_UP' ? 'ส่วนต่าง' : 'ค่าอาหาร'} ฿{fmtMoney(p.Amount)}<br />
                      {p.PaymentStatus === 'VERIFIED' ? '✅ ยืนยันแล้ว' : p.PaymentStatus === 'REJECTED' ? `❌ ${p.RejectReason || 'ปฏิเสธ'}` : '⏳ รอตรวจ'}
                    </span>
                  </a>
                ))}
              </div>
            )}

            <div className="modal-footer-btns">
              <button onClick={() => openRejectSlip(viewingSlip)} className="cv-btn btn-danger-light">❌ ปฏิเสธสลิป</button>
              <button onClick={() => verifySlip(viewingSlip.OrderID, true)} className="cv-btn btn-success">✅ ยืนยันสลิปและส่งเข้าครัว</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: REJECT SLIP ===== */}
      {rejectSlipModal && (
        <div className="cv-modal-overlay" onClick={() => setRejectSlipModal(null)}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>❌ ปฏิเสธสลิป</h3><div className="caption">คิว {rejectSlipModal.QueueNo} • ฿{fmtMoney(rejectSlipModal.TotalAmount)}</div></div>
              <button onClick={() => setRejectSlipModal(null)} className="cv-modal-close">✖</button>
            </div>
            <div className="reason-section">
              <label className="reason-label">เหตุผลที่ปฏิเสธ</label>
              <div className="reason-chips">
                {['สลิปไม่ถูกต้อง', 'ยอดเงินไม่ตรง', 'ไม่พบรายการโอนเงิน', 'สลิปซ้ำ', 'รูปสลิปไม่ชัดเจน', 'เหตุผลอื่นๆ'].map(r => (
                  <button key={r} type="button" className={`reason-chip ${rejectSlipReason === r ? 'active' : ''}`} onClick={() => setRejectSlipReason(r)}>{r}</button>
                ))}
              </div>
              <textarea value={rejectSlipReason} onChange={e => setRejectSlipReason(e.target.value)} className="cv-textarea" rows={3} placeholder="ระบุเหตุผลเพิ่มเติม" />
            </div>
            <div className="modal-footer-btns">
              <button onClick={() => setRejectSlipModal(null)} className="cv-btn btn-ghost">กลับ</button>
              <button onClick={submitRejectSlip} className="cv-btn btn-danger-solid">ยืนยันการปฏิเสธ</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: CUSTOMER PROFILE ===== */}
      {viewingCustomer && (
        <div className="cv-modal-overlay" onClick={() => setViewingCustomer(null)}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <h3>👤 โปรไฟล์ลูกค้า</h3>
              <button onClick={() => setViewingCustomer(null)} className="cv-modal-close">✖</button>
            </div>
            {viewingCustomer.loading ? (
              <p className="empty-state">กำลังดึงข้อมูลโปรไฟล์...</p>
            ) : viewingCustomer.error ? (
              <p className="empty-state" style={{ color: PALETTE.red }}>ไม่สามารถโหลดข้อมูลลูกค้าได้</p>
            ) : (
              <div className="cv-customer-info">
                <div className="info-row"><span>ชื่อ-นามสกุล:</span> <b>{viewingCustomer.CustomerName || viewingCustomer.Name || '-'}</b></div>
                <div className="info-row"><span>เบอร์โทร:</span> <b style={{ color: PALETTE.coral }}>{viewingCustomer.Phone || '-'}</b></div>
                <div className="info-row"><span>อีเมล:</span> <b>{viewingCustomer.Email || '-'}</b></div>
                <div className="info-row"><span>เคยสั่งซื้อสำเร็จ:</span> <b>{viewingCustomer.TotalOrders ?? 0} ออเดอร์</b></div>
              </div>
            )}
            <button onClick={() => setViewingCustomer(null)} className="cv-btn btn-dark" style={{ width: '100%', marginTop: '14px' }}>ปิดหน้าต่าง</button>
          </div>
        </div>
      )}

      {lastSale && (
        <div className="cv-modal-overlay" onClick={() => setLastSale(null)}>
          <div className="cv-modal" role="dialog" aria-modal="true" aria-label="ออกคิวแล้ว" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <h3 style={{ margin: '4px 0 8px' }}>✅ ออกคิว {lastSale.queue} แล้ว</h3>
            {lastSale.method === 'Cash' ? (
              <>
                <div style={{ color: PALETTE.textSub }}>รับเงิน ฿{fmtMoney(lastSale.received)} · ยอด ฿{fmtMoney(lastSale.total)}</div>
                <div style={{ fontSize: 40, fontWeight: 900, color: PALETTE.green, margin: '12px 0' }}>ทอน ฿{fmtMoney(lastSale.change)}</div>
              </>
            ) : (
              <div style={{ fontSize: 22, fontWeight: 800, margin: '12px 0' }}>รับโอน ฿{fmtMoney(lastSale.total)}</div>
            )}
            <button type="button" className="cv-btn btn-success cv-btn-lg" style={{ width: '100%' }} autoFocus onClick={() => setLastSale(null)}>ทอนเงินแล้ว / ปิด</button>
          </div>
        </div>
      )}

      {/* ===== TOAST ===== */}
      <div className={`cv-toast ${toast.show ? 'show' : ''} ${toast.kind === 'error' ? 'error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
        <span className="toast-icon">{toast.kind === 'error' ? '!' : <Icon name="check" size={16} />}</span>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}

/* ============================================================
   STYLES: Berry Style Structure + Receipt Modal Additions
   ============================================================ */
const CV_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Sarabun:wght@400;500;600;700&display=swap');
::-webkit-scrollbar { width: 0px; background: transparent; display: none; }
* { scrollbar-width: none; -ms-overflow-style: none; }

.cv-root {
  --radius-lg: 14px;
  --radius-md: 9px;
  --shadow-sm: 0 2px 10px rgba(42,44,65,0.05);
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column;
  background: ${PALETTE.bg};
  font-family: 'Roboto', 'Sarabun', sans-serif;
  color: ${PALETTE.dark};
  overflow: hidden; z-index: 1000;
}
.cv-root * { box-sizing: border-box; }

/* ---------- Topbar ---------- */
.cv-topbar {
  height: 80px; background: ${PALETTE.white}; display: flex; align-items: center;
  justify-content: space-between; padding: 0 24px; border-bottom: 1px solid ${PALETTE.border};
  flex-shrink: 0; z-index: 110;
}
.cv-topbar-left { display: flex; align-items: center; gap: 16px; }
.cv-brand { width: 236px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: center; white-space: nowrap; }
.brand-title { font-size: 20px; color: ${PALETTE.dark}; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.brand-subtitle { font-size: 12px; margin-top: 4px; color: ${PALETTE.textSub}; display: flex; align-items: center; gap: 6px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: ${PALETTE.green}; display: inline-block; }
.status-dot.closed { background: ${PALETTE.red}; }
.status-text { color: ${PALETTE.green}; font-weight: 600; }
.status-text.closed { color: ${PALETTE.red}; }

.cv-icon-btn {
  width: 34px; height: 34px; border-radius: var(--radius-md); border: none;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  position: relative; transition: all 0.2s ease;
}
.cv-icon-btn.coral-light { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-icon-btn.coral-light:hover { background: ${PALETTE.coral}; color: #fff; }
.cv-icon-btn.yellow-light { background: ${PALETTE.yellowLight}; color: #F59E0B; }
.cv-icon-btn.yellow-light:hover { background: #F59E0B; color: #fff; }
.cv-badge-dot-count {
  position: absolute; top: -6px; right: -6px; background: ${PALETTE.red}; color: #fff;
  font-size: 10px; font-weight: 700; min-width: 18px; height: 18px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center; padding: 0 4px;
}
.cv-topbar-right { display: flex; align-items: center; gap: 16px; }

.cv-store-chip {
  display: flex; align-items: center; gap: 8px; background: ${PALETTE.bgSoft};
  padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: 500; color: ${PALETTE.dark};
}
.store-status-pill { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 12px; }
.store-status-pill.open { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; }
.store-status-pill.closed { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }

.cv-profile-container { position: relative; }
.cv-user-chip {
  background: ${PALETTE.bgSoft}; padding: 6px 12px; border-radius: 20px;
  display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s ease;
}
.cv-user-chip:hover { background: #E1E3EE; }
.cv-user-chip .user-name { font-size: 14px; font-weight: 500; color: ${PALETTE.dark}; }
.cv-user-chip .role-tag { font-size: 11px; background: ${PALETTE.dark}; color: #fff; padding: 2px 8px; border-radius: 10px; font-weight: 600; }

.cv-profile-dropdown {
  position: absolute; top: calc(100% + 10px); right: 0; background: ${PALETTE.white};
  width: 280px; border-radius: var(--radius-lg); box-shadow: 0px 8px 24px rgba(0,0,0,0.1);
  border: 1px solid ${PALETTE.border}; padding: 20px; z-index: 1000;
  animation: cvSlideDown 0.2s ease-out forwards;
}
@keyframes cvSlideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.cv-profile-dropdown .dropdown-header h4 { margin: 0; font-size: 15px; font-weight: 600; color: ${PALETTE.dark}; }
.cv-profile-dropdown .dropdown-header p { margin: 4px 0 16px; font-size: 13px; color: ${PALETTE.textSub}; }
.cv-profile-dropdown .dropdown-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 6px;
  cursor: pointer; font-size: 14px; color: ${PALETTE.dark}; transition: background 0.2s; margin-bottom: 2px;
}
.cv-profile-dropdown .dropdown-item:hover { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }

/* ---------- Body / Sidebar ---------- */
.cv-body { display: flex; flex: 1; overflow: hidden; }
.cv-sidebar {
  width: 260px; background: ${PALETTE.white}; border-right: 1px solid ${PALETTE.border};
  display: flex; flex-direction: column; flex-shrink: 0; z-index: 100; overflow-x: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.cv-nav { padding: 16px; flex: 1; overflow-y: auto; overflow-x: hidden; }
.cv-nav-label { font-size: 14px; font-weight: 500; color: ${PALETTE.dark}; padding: 12px 16px; margin-bottom: 4px; white-space: nowrap; }
.cv-nav-item {
  display: flex; align-items: center; gap: 16px; padding: 10px 16px; margin-bottom: 8px;
  border-radius: var(--radius-md); cursor: pointer; color: ${PALETTE.dark}; transition: all 0.2s ease; white-space: nowrap;
}
.cv-nav-item:hover, .cv-nav-item.active { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-nav-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cv-nav-text .title { font-size: 14px; font-weight: 500; }
.cv-nav-text .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }
.cv-nav-item:hover .caption, .cv-nav-item.active .caption { color: ${PALETTE.coral}; opacity: 0.8; }
.cv-nav-badge { margin-left: auto; background: ${PALETTE.dark}; color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 12px; font-weight: bold; }

@media (min-width: 769px) {
  .cv-sidebar.collapsed { width: 88px; }
  .cv-sidebar.collapsed .hide-on-collapse { display: none !important; }
  .cv-sidebar.collapsed .cv-nav-item { justify-content: center; padding: 12px; }
}
@media (max-width: 768px) {
  .cv-sidebar { position: absolute; top: 0; bottom: 0; left: 0; transform: translateX(-100%); }
  .cv-sidebar.open { transform: translateX(0); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
  .cv-brand { width: auto; }
  .cv-stat-grid { grid-template-columns: 1fr; }
  .cv-pos-grid { grid-template-columns: 1fr; }
}

/* ---------- Content / Cards ---------- */
.cv-content { flex: 1; padding: 24px; overflow-y: auto; }
.cv-stack { display: flex; flex-direction: column; gap: 24px; }
.cv-card {
  background: ${PALETTE.white}; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
  padding: 24px; position: relative; overflow: hidden;
}
.cv-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.cv-card-head h3 { margin: 0; font-size: 18px; font-weight: 600; color: ${PALETTE.dark}; }
.cv-card-head .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 4px; }

/* Stat cards (Owner: solid colour + decorative circles) */
.cv-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.cv-bg-coral { background: ${PALETTE.coral}; color: #fff; }
.cv-bg-yellow { background: ${PALETTE.yellowLight}; color: ${PALETTE.dark}; }
.cv-bg-dark { background: ${PALETTE.dark}; color: #fff; }
.cv-decor-circle-1 { position: absolute; width: 210px; height: 210px; background: ${PALETTE.coralDark}; border-radius: 50%; top: -85px; right: -95px; opacity: 0.5; }
.cv-bg-coral::after { content: ''; position: absolute; width: 210px; height: 210px; background: ${PALETTE.coralDark}; border-radius: 50%; top: -125px; right: -15px; opacity: 0.5; }
.cv-stat-body { position: relative; z-index: 2; }
.cv-stat-body h2 { margin: 0 0 4px; font-size: 30px; font-weight: 500; }
.cv-stat-body p { margin: 0; font-size: 14px; opacity: 0.9; }

.foodcourt-closed-banner, .store-closed-banner { display: flex; gap: 12px; align-items: center; padding: 14px 16px; border-radius: var(--radius-md); margin-bottom: 24px; }
.foodcourt-closed-banner { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }
.store-closed-banner { background: ${PALETTE.yellowLight}; color: #9A6A12; }
.foodcourt-closed-banner b, .store-closed-banner b { display: block; font-size: 14px; font-weight: 600; }
.foodcourt-closed-banner small, .store-closed-banner small { display: block; margin-top: 2px; font-size: 12px; opacity: .85; }

/* ---------- Tables ---------- */
.cv-table-wrapper { overflow-x: auto; }
.cv-table { width: 100%; border-collapse: collapse; }
.cv-table th { text-align: left; padding: 16px; font-size: 14px; font-weight: 600; color: ${PALETTE.dark}; border-bottom: 1px solid ${PALETTE.border}; }
.cv-table td { padding: 16px; border-bottom: 1px solid ${PALETTE.border}; font-size: 14px; vertical-align: middle; }
.cv-table tr:last-child td { border-bottom: none; }
.empty-state { text-align: center; color: ${PALETTE.textSub}; padding: 32px !important; font-size: 14px; }
.queue-pill { font-family: 'Roboto', monospace; background: ${PALETTE.bgSoft}; padding: 4px 10px; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block; }
.walkin-tag { display: block; width: fit-content; margin-top: 4px; background: ${PALETTE.dark}; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.item-row { margin-bottom: 3px; font-size: 14px; }
.item-note { color: ${PALETTE.amber}; font-size: 12px; margin-left: 4px; }
.order-note { font-size: 12px; color: ${PALETTE.textSub}; background: ${PALETTE.bg}; padding: 4px 8px; border-radius: 6px; margin-top: 4px; }
.slip-thumb { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.slip-thumb img { width: 42px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid ${PALETTE.border}; }
.slip-thumb span { font-size: 12px; color: ${PALETTE.coral}; font-weight: 500; }
.cv-action-buttons { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.action-lock-note { font-size: 12px; color: ${PALETTE.textSub}; padding: 6px 8px; }

/* ---------- Buttons ---------- */
.cv-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 40px; padding: 8px 16px; border-radius: 8px; border: none; font-size: 14px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: all 0.2s ease;
}
.cv-btn:disabled { opacity: .45; cursor: not-allowed; }
.cv-btn-lg { min-height: 52px; padding: 12px 24px; font-size: 17px; border-radius: 10px; }
.queue-search { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border: 2px solid ${PALETTE.border}; border-radius: 12px; background: #fff; margin-bottom: 12px; }
.queue-search:focus-within { border-color: ${PALETTE.coral}; }
.queue-search-icon { font-size: 20px; }
.queue-search input { flex: 1; border: none; outline: none; font-size: 22px; font-weight: 700; font-family: inherit; padding: 6px 0; min-width: 0; background: transparent; }
.queue-search-hint { font-size: 13px; color: ${PALETTE.textSub}; margin: -4px 0 10px; }
.queue-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.queue-tab { min-height: 44px; padding: 8px 16px; border-radius: 999px; border: 1px solid ${PALETTE.border}; background: #fff; font-family: inherit; font-size: 15px; font-weight: 600; color: ${PALETTE.dark}; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.queue-tab.active { background: ${PALETTE.dark}; border-color: ${PALETTE.dark}; color: #fff; }
.queue-tab-count { min-width: 26px; padding: 1px 8px; border-radius: 999px; background: ${PALETTE.bgSoft}; color: ${PALETTE.dark}; font-size: 13px; text-align: center; }
.queue-tab.active .queue-tab-count { background: rgba(255,255,255,.2); color: #fff; }
.queue-tab.alert:not(.active) { border-color: ${PALETTE.coral}; color: ${PALETTE.coral}; }
.queue-tab.alert .queue-tab-count { background: ${PALETTE.coral}; color: #fff; }
.handover-card { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding: 16px 18px; margin-bottom: 14px; border-radius: 14px; border: 2px solid ${PALETTE.border}; background: ${PALETTE.bgSoft}; }
.handover-card.ready { border-color: ${PALETTE.green}; background: ${PALETTE.greenLight}; }
.handover-main { display: flex; gap: 16px; align-items: center; min-width: 0; }
.handover-queue { font-size: 34px; font-weight: 800; font-family: 'Roboto', monospace; color: ${PALETTE.dark}; }
.handover-name { font-size: 17px; font-weight: 700; color: ${PALETTE.dark}; }
.handover-items { font-size: 14px; color: ${PALETTE.textSub}; margin: 2px 0 6px; }
.handover-status { font-size: 13px; color: ${PALETTE.textSub}; }
.handover-wait { font-size: 14px; font-weight: 600; color: ${PALETTE.amber}; }
.cv-btn-icon {
  width: 40px; height: 40px; border-radius: 6px; border: none; background: ${PALETTE.bgSoft};
  display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${PALETTE.dark}; transition: all 0.2s ease;
}
.cv-btn-icon:hover { background: ${PALETTE.coral}; color: #fff; }
.btn-coral { background: ${PALETTE.coral}; color: #fff; }
.btn-coral:hover { background: ${PALETTE.coralDark}; }
.btn-dark { background: ${PALETTE.dark}; color: #fff; }
.btn-dark:hover { background: ${PALETTE.darkLight}; }
.btn-success { background: ${PALETTE.green}; color: #fff; }
.btn-success:hover { opacity: .9; }
.btn-danger { background: ${PALETTE.red}; color: #fff; }
.btn-danger:hover { opacity: .9; }
.btn-success-light { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; }
.btn-success-light:hover { background: ${PALETTE.green}; color: #fff; }
.btn-danger-light { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }
.btn-danger-light:hover { background: ${PALETTE.red}; color: #fff; }
.btn-warning-light { background: ${PALETTE.yellowLight}; color: ${PALETTE.amber}; }
.btn-warning-light:hover { background: ${PALETTE.amber}; color: #fff; }
.btn-ghost { background: ${PALETTE.bgSoft}; color: ${PALETTE.dark}; }
.btn-ghost:hover { background: #E1E3EE; }
.btn-danger-solid { background: ${PALETTE.red}; color: #fff; }
.btn-danger-solid:hover { opacity: .9; }
.btn-del { background: none; border: none; color: ${PALETTE.red}; cursor: pointer; font-size: 14px; }

/* ---------- Badges ---------- */
.cv-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 600; }
.cv-badge.tone-success { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; }
.cv-badge.tone-warning { background: ${PALETTE.yellowLight}; color: ${PALETTE.amber}; }
.cv-badge.tone-danger { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }
.cv-badge.tone-coral { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-badge.tone-neutral { background: ${PALETTE.bgSoft}; color: ${PALETTE.dark}; }

/* ---------- Walk-in POS ---------- */
.cv-pos-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 24px; }
.cv-product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
.cv-product-card {
  background: ${PALETTE.white}; border: 1px solid ${PALETTE.border}; border-radius: var(--radius-lg);
  padding: 16px; display: flex; flex-direction: column; justify-content: space-between;
  transition: transform 0.2s, box-shadow 0.2s;
}
.cv-product-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
.cv-product-info h4 { margin: 0 0 8px; font-size: 15px; font-weight: 600; color: ${PALETTE.dark}; line-height: 1.4; }
.cv-product-info .price { font-size: 18px; font-weight: 700; color: ${PALETTE.coral}; }
.out-of-stock-badge { background: ${PALETTE.redLight}; color: ${PALETTE.red}; padding: 8px; border-radius: 6px; text-align: center; font-size: 12px; font-weight: 600; margin-top: 8px; }
.cv-cart-card { display: flex; flex-direction: column; }
.cv-cart-body { display: flex; flex-direction: column; }
.cart-item-list { max-height: 280px; overflow-y: auto; margin-bottom: 14px; }
.cart-item { background: ${PALETTE.bg}; border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 8px; }
.cart-item .item-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
.cart-item .price-del { display: flex; align-items: center; gap: 10px; }
.cv-input-note, .cv-input-main, .cv-textarea {
  width: 100%; border: 1px solid ${PALETTE.border}; border-radius: var(--radius-md);
  font-family: inherit; outline: none; background: #fff; color: ${PALETTE.dark};
}
.cv-input-note { padding: 8px 12px; font-size: 13px; margin-top: 8px; }
.cv-input-main { padding: 10px 14px; font-size: 14px; }
.cv-textarea { padding: 10px 14px; font-size: 14px; resize: none; }
.cv-input-note:focus, .cv-input-main:focus, .cv-textarea:focus { border-color: ${PALETTE.coral}; }
.cart-total-box { display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed ${PALETTE.border}; padding: 16px 0; margin-bottom: 12px; font-weight: 600; font-size: 14px; }
.cart-total-box .total-amount { font-size: 24px; color: ${PALETTE.coral}; font-weight: 700; }

/* ---------- Stock / Reports ---------- */
.cv-stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
.cv-stock-item { border: 1px solid ${PALETTE.border}; border-radius: var(--radius-lg); padding: 16px; display: flex; justify-content: space-between; align-items: center; }
.report-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.report-card { background: ${PALETTE.bg}; border-radius: var(--radius-lg); padding: 20px; }
.report-card span { display: block; font-size: 14px; color: ${PALETTE.textSub}; }
.report-card b { display: block; font-size: 24px; font-weight: 700; margin: 6px 0; color: ${PALETTE.dark}; }
.report-card small { display: block; font-size: 12px; color: ${PALETTE.textSub}; }
@media (max-width: 900px) { .report-grid { grid-template-columns: repeat(2, 1fr); } }

.cv-print-alert { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:16px 18px; margin-bottom:16px; border:1px solid ${PALETTE.yellow}; background:${PALETTE.yellowLight}; border-radius:var(--radius-lg); }
.cv-print-alert small { display:block; color:${PALETTE.textSub}; margin-top:4px; }
.cv-printer-control { display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-bottom:12px; font-size:13px; color:${PALETTE.textSub}; }
.cv-printer-control b { color:${PALETTE.dark}; }
.cv-stale-actions { display:flex; flex-wrap:wrap; gap:8px; }
.cv-print-modal { width:500px; }
.cv-print-error { margin-top:10px; padding:10px 12px; border-radius:var(--radius-md); background:${PALETTE.redLight}; color:${PALETTE.red}; font-size:13px; line-height:1.5; }
.cv-print-error b { display:block; }
.display-note { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; padding:14px 18px; border-radius:var(--radius-lg); border:1px dashed ${PALETTE.border}; background:#fff; }
.display-note b { font-size:15px; }
.display-note span { flex:1 1 320px; font-size:13px; color:${PALETTE.textSub}; line-height:1.5; }
.display-note-actions { display:flex; gap:8px; }
.queue-display { position:relative; background:#14161F; color:#fff; border-radius:18px; padding:22px 26px 18px; min-height:460px; display:flex; flex-direction:column; }
.queue-display.full { border-radius:0; min-height:100vh; padding:36px 48px 28px; }
.qd-head { display:flex; justify-content:space-between; align-items:baseline; font-size:22px; font-weight:700; margin-bottom:18px; }
.queue-display.full .qd-head { font-size:34px; }
.qd-clock { font-family:'Roboto', monospace; opacity:.75; }
.qd-cols { flex:1; display:grid; grid-template-columns:1fr 1.4fr; gap:20px; }
.qd-col { border-radius:14px; padding:16px 18px; background:rgba(255,255,255,.05); }
.qd-col.ready { background:rgba(34,197,94,.12); border:1px solid rgba(34,197,94,.45); }
.qd-col h4 { margin:0 0 14px; font-size:20px; display:flex; align-items:center; gap:10px; }
.queue-display.full .qd-col h4 { font-size:30px; }
.qd-col h4 span { font-size:14px; padding:2px 10px; border-radius:999px; background:rgba(255,255,255,.12); }
.qd-grid { display:flex; flex-wrap:wrap; gap:12px; align-content:flex-start; }
.qd-num { font-family:'Roboto', monospace; font-weight:800; font-size:34px; padding:8px 16px; border-radius:12px; background:rgba(255,255,255,.08); letter-spacing:1px; }
.qd-col.ready .qd-num { font-size:48px; background:rgba(34,197,94,.22); color:#D9FBE5; }
.queue-display.full .qd-num { font-size:52px; }
.queue-display.full .qd-col.ready .qd-num { font-size:80px; padding:10px 24px; }
.qd-num.fresh { animation: qdFlash 1s ease-in-out infinite; }
@keyframes qdFlash { 0%,100% { background:rgba(34,197,94,.22); transform:scale(1); } 50% { background:#22C55E; color:#fff; transform:scale(1.06); } }
.qd-empty { font-size:18px; opacity:.5; }
.qd-foot { margin-top:16px; text-align:center; font-size:15px; opacity:.7; }
.queue-display.full .qd-foot { font-size:22px; }
.qd-exit { position:absolute; top:12px; right:16px; background:rgba(255,255,255,.1); color:#fff; border:none; border-radius:8px; padding:6px 12px; font-family:inherit; cursor:pointer; opacity:.4; }
.qd-exit:hover { opacity:1; }
@media (max-width: 768px) { .qd-cols { grid-template-columns:1fr; } }
.cv-pay-modal { width:520px; max-width:calc(100vw - 32px); }
.pay-total { display:flex; justify-content:space-between; align-items:baseline; padding:12px 16px; border-radius:12px; background:${PALETTE.bgSoft}; margin-bottom:14px; }
.pay-total span { font-size:15px; color:${PALETTE.textSub}; }
.pay-total b { font-size:30px; color:${PALETTE.coral}; }
.pay-methods { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:16px; }
.pay-method { min-height:52px; border-radius:12px; border:2px solid ${PALETTE.border}; background:#fff; font-family:inherit; font-size:15px; font-weight:700; color:${PALETTE.dark}; cursor:pointer; }
.pay-method.active { border-color:${PALETTE.coral}; background:${PALETTE.coralLight}; color:${PALETTE.coralDark}; }
.pay-label { display:block; font-size:13px; font-weight:700; color:${PALETTE.textSub}; margin-bottom:6px; }
.pay-cash-input { width:100%; box-sizing:border-box; font-size:32px; font-weight:800; text-align:right; padding:10px 14px; border-radius:12px; border:2px solid ${PALETTE.border}; font-family:inherit; outline:none; }
.pay-cash-input:focus { border-color:${PALETTE.coral}; }
.pay-quick { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 12px; }
.pay-quick .cv-btn { flex:1 1 64px; min-height:48px; padding:8px 6px; font-size:15px; white-space:nowrap; }
.pay-change { padding:14px 16px; border-radius:12px; background:${PALETTE.bgSoft}; color:${PALETTE.textSub}; font-size:15px; text-align:center; }
.pay-change b { font-size:28px; margin-left:6px; }
.pay-change.ok { background:${PALETTE.greenLight}; color:${PALETTE.green}; }
.pay-change.short { background:${PALETTE.redLight}; color:${PALETTE.red}; }
.pay-qr { display:flex; gap:16px; align-items:center; padding:12px; border-radius:12px; background:${PALETTE.bgSoft}; }
.pay-qr img { width:150px; height:150px; background:#fff; border-radius:10px; padding:6px; flex-shrink:0; }
.pay-qr b { display:block; font-size:16px; margin-bottom:6px; }
.pay-qr small { display:block; font-size:12px; color:${PALETTE.textSub}; line-height:1.5; }
.cv-stock-modal { width:560px; max-width:calc(100vw - 32px); }
.cv-stock-modal .modal-footer-btns { flex-wrap:wrap; }
.cv-stock-modal .modal-footer-btns .cv-btn { white-space:nowrap; }
.stock-affected { padding:12px 14px; border-radius:var(--radius-md); background:${PALETTE.yellowLight}; border:1px solid ${PALETTE.yellow}; font-size:13px; line-height:1.5; }
.stock-affected small { display:block; color:${PALETTE.textSub}; margin-top:6px; }
.stock-queue-list { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.stock-queue { padding:2px 10px; border-radius:999px; background:#fff; border:1px solid ${PALETTE.yellow}; font-weight:700; }
.stock-none { color:${PALETTE.textSub}; font-size:13px; }
.stock-silent { margin-top:10px; color:${PALETTE.textSub}; font-size:12px; }
.print-ticket-preview { background:#fff; border:1px dashed ${PALETTE.border}; border-radius:var(--radius-md); padding:16px; margin-bottom:12px; }
.cv-printer-ready, .cv-printer-offline { padding:10px 12px; border-radius:var(--radius-md); margin-top:10px; font-size:13px; }
.cv-printer-ready { background:${PALETTE.greenLight}; color:${PALETTE.green}; }
.cv-printer-offline { background:${PALETTE.redLight}; color:${PALETTE.red}; }
/* ---------- Modals ---------- */
.cv-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; }
.cv-modal { background: ${PALETTE.white}; padding: 24px; border-radius: var(--radius-lg); width: 440px; max-width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
.cv-cancel-modal { width: 480px; max-height: 92vh; overflow-y: auto; }
.cv-slip-review-modal { width: 560px; max-height: 90vh; overflow-y: auto; }
.cv-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.cv-modal-head h3 { margin: 0; font-size: 18px; font-weight: 600; color: ${PALETTE.dark}; }
.cv-modal-head .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }
.cv-modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: ${PALETTE.textSub}; }
.pickup-eta { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: #EAF3FF; border: 1px solid #93C0F5; color: #1E4E8C; font-size: 12px; font-weight: 600; line-height: 1.5; max-width: 260px; }
.pickup-eta b { font-size: 16px; }
.pickup-eta .pickup-sub { display: block; font-size: 11px; font-weight: 500; color: #4A6E9C; }
.pickup-eta.compact { padding: 4px 8px; font-size: 11px; }
.pickup-eta.compact b { font-size: 12px; }
.pickup-warning { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: #FFF4E5; border: 1px solid #F5B461; color: #8A4B00; font-size: 12px; font-weight: 600; line-height: 1.5; max-width: 260px; }
.pickup-warning .pickup-phone { display: block; font-size: 18px; letter-spacing: .5px; color: #B45309; user-select: all; }
.pickup-warning .pickup-sub { display: block; font-size: 11px; font-weight: 500; color: #9A6B2F; }
.slip-history { margin-bottom: 16px; }
.slip-history-item { display: inline-flex; align-items: center; gap: 8px; margin: 6px 12px 0 0; font-size: 12px; color: inherit; text-decoration: none; }
.slip-history-item img { width: 42px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid ${PALETTE.border}; }
.slip-full-img { width: 100%; max-height: 55vh; object-fit: contain; border-radius: var(--radius-md); border: 1px solid ${PALETTE.border}; margin-bottom: 16px; }
.cv-customer-info .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid ${PALETTE.border}; font-size: 14px; }
.cv-customer-info .info-row span { color: ${PALETTE.textSub}; }
.cancel-icon-badge { width: 38px; height: 38px; border-radius: var(--radius-md); background: ${PALETTE.redLight}; color: ${PALETTE.red}; display: flex; align-items: center; justify-content: center; font-size: 18px; }

.receipt-summary-card, .slip-order-summary { background: ${PALETTE.bg}; border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 16px; }
.receipt-title { font-size: 12px; font-weight: 600; color: ${PALETTE.textSub}; margin-bottom: 8px; }
.receipt-items { max-height: 90px; overflow-y: auto; font-size: 14px; }
.receipt-item-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 14px; color: ${PALETTE.dark}; }
.receipt-divider { border-top: 1px solid ${PALETTE.border}; margin: 8px 0; }
.receipt-total-row { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 600; }
.receipt-total-val { font-size: 18px; color: ${PALETTE.coral}; font-weight: 700; }

.cancel-refund-note { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-md); background: ${PALETTE.bgSoft}; font-size: 13px; color: ${PALETTE.dark}; }
.cv-out-modal { width: 520px; max-width: calc(100vw - 32px); }
.out-label { font-size: 14px; font-weight: 700; margin-bottom: 8px; }
.out-items { display: flex; flex-direction: column; gap: 8px; }
.out-item { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 10px 14px; border-radius: 12px; border: 2px solid ${PALETTE.border}; background: #fff; cursor: pointer; font-size: 15px; }
.out-item.active { border-color: ${PALETTE.amber}; background: ${PALETTE.yellowLight}; }
.out-item input, .out-close input { width: 20px; height: 20px; accent-color: ${PALETTE.amber}; flex-shrink: 0; }
.out-name { flex: 1; font-weight: 600; }
.out-price { color: ${PALETTE.textSub}; }
.out-close { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; font-size: 13px; color: ${PALETTE.dark}; cursor: pointer; }
.btn-warning-solid { background: ${PALETTE.amber}; color: #fff; }
.btn-warning-solid:hover { opacity: .9; }
.action-opt { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid ${PALETTE.border}; cursor: pointer; transition: all 0.2s ease; background: #fff; }
.action-opt input { margin-top: 3px; accent-color: ${PALETTE.coral}; }
.action-opt.active { border-color: ${PALETTE.coral}; background: ${PALETTE.coralLight}; }
.opt-title { font-size: 14px; font-weight: 500; color: ${PALETTE.dark}; }
.opt-desc { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }

.reason-section { margin-bottom: 20px; }
.reason-label { display: block; font-size: 13px; font-weight: 600; color: ${PALETTE.dark}; margin-bottom: 8px; }
.reason-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.reason-chip { background: #fff; border: 1px solid ${PALETTE.border}; border-radius: 16px; padding: 5px 12px; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer; transition: all 0.2s ease; color: ${PALETTE.dark}; }
.reason-chip:hover { border-color: ${PALETTE.coral}; color: ${PALETTE.coral}; }
.reason-chip.active { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; border-color: ${PALETTE.coral}; }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.modal-footer-btns .cv-btn { min-height: 48px; padding: 12px 22px; font-size: 15px; border-radius: var(--radius-md); }

/* ---------- Toast ---------- */
.cv-toast {
  position: fixed; bottom: 24px; right: 24px; background: ${PALETTE.white}; color: ${PALETTE.dark};
  padding: 12px 20px; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 12px; z-index: 10001;
  opacity: 0; transform: translateY(20px); pointer-events: none; border: 1px solid ${PALETTE.border};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.cv-toast.show { opacity: 1; transform: translateY(0); }
.cv-toast.error { border-color: ${PALETTE.red}; }
.cv-toast.error .toast-icon { background: ${PALETTE.redLight}; color: ${PALETTE.red}; font-weight: 900; }
.toast-icon { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

.bold { font-weight: 600; }
.cv-divider { border: none; border-top: 1px solid ${PALETTE.border}; margin: 4px 0 8px; }
`;
