import { useState, useEffect, useRef } from 'react';
import { BrandLogo, BurgerButton, StatusPill, TopbarStyles, UserChip } from '../../shared/ui/Topbar';
import { startPolling } from '../../lib/polling';
import { useHistoryNav } from '../../lib/historyNav';
import { printReceipt } from '../../lib/receiptPrint';
import { newRequestKey, applyServerPrices } from '../../lib/requestKey';
import AuthImage, { openFile } from '../../shared/ui/AuthImage';
import { PALETTE } from './theme';
import { isWalkInOrder, fmtMoney, apiErrorText, toastKind } from './lib';
import { Icon } from './components/ui';
import { CV_STYLES } from './styles';
import OrdersTab from './tabs/OrdersTab';
import DisplayTab from './tabs/DisplayTab';
import HistoryTab from './tabs/HistoryTab';
import WalkInTab from './tabs/WalkInTab';
import ReportsTab from './tabs/ReportsTab';
import RefundsTab from './tabs/RefundsTab';
import MenuTab from './tabs/MenuTab';

export default function CounterView({ user, apiBase, onLogout }) {
  const activeStoreId = user?.StoreId || user?.storeId || 1;
  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [orderNote, setOrderNote] = useState('');

  const [activeTab, setActiveTab] = useState('orders');
  useHistoryNav(activeTab, (hash) => {
    const tab = hash ?? 'orders';
    if (!['orders', 'walkin', 'history', 'menu', 'refunds', 'reports', 'display'].includes(tab)) return false;
    setActiveTab(tab);
    return true;
  });
  // มือถือ (≤768px): เมนูซ้ายปิดไว้ก่อน (เปิดแล้วลอยทับเนื้อหา) ; จอใหญ่: เปิดไว้
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 768);
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
  const [liveError, setLiveError] = useState(''); // ดึงคิวไม่สำเร็จ : คงข้อมูลเดิมไว้ แล้วขึ้นแถบเตือน

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
  const [recallBusy, setRecallBusy] = useState(null);
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

  // เวลาปัจจุบัน : ฟังก์ชันด้านล่างอ่าน Date.now() ตอนถูกเรียก ; แท็บที่นับถอยหลังเรียก useNow() เองเพื่อเดินทุกวินาที
  // (เดิมเก็บ state เวลาที่นี่ ทำให้ทั้งหน้า render ใหม่ทุกวินาที)

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
    // server error ชั่วคราว : ห้ามล้างรายการเป็นว่าง (คิวหายทั้งจอ แล้วพอกลับมาทุกคิวกระพริบ/มีเสียงพร้อมกัน)
    const getList = (url, opts) => fetch(url, opts).then(async r => {
      const d = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(d)) throw new Error(`HTTP ${r.status}`);
      return d;
    });
    getList(`${apiBase}/api/orders?store_id=${activeStoreId}&scope=live`)
      .then(d => { setOrders(d); setLiveError(''); })
      .catch(err => { console.error("Error orders:", err); setLiveError('ดึงรายการคิวล่าสุดไม่สำเร็จ กำลังลองใหม่… (ข้อมูลบนจออาจไม่อัปเดต)'); });

    getList(`${apiBase}/api/products?store_id=${activeStoreId}`)
      .then(setProducts)
      .catch(err => console.error("Error products:", err));

    getList(`${apiBase}/api/print-jobs/pending?store_id=${activeStoreId}`, { cache: 'no-store' })
      .then(setPendingPrintJobs)
      .catch(err => console.error("Error print jobs:", err));

    fetchPendingRefunds();
  };

  // จำนวนเงินคืนที่หน้าร้านต้องจ่าย (เงินสด walk-in) ; ลูกค้าออนไลน์เจ้าของร้านโอนคืน จึงไม่นับ
  const fetchPendingRefunds = () => {
    fetch(`${apiBase}/api/refunds?status=PENDING&limit=500`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setPendingRefunds(d.filter(r => r.IsWalkIn && !r.SlipUnverified).length); })
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

    // สถานะร้าน/ศูนย์อาหารเปลี่ยนไม่บ่อย (เดิมทุก 2 วิ)
    const stopStores = startPolling(fetchStores, 15000);
    const stopFoodCourt = startPolling(checkFoodCourtStatus, 15000);

    return () => {
      stopStores();
      stopFoodCourt();
    };
  }, [apiBase]);

  useEffect(() => {
    fetchData();
    return startPolling(fetchData, 3500);
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
  // ป้ายสถานะร้านบนแถบด้านบน (ศูนย์อาหารปิด = ร้านรับออเดอร์ไม่ได้ด้วย)
  const storeState = currentStore?.IsSuspended ? { tone: 'red', label: 'ถูกระงับสิทธิ์', short: 'ระงับ' }
    : foodCourtOpen && currentStore?.IsOpen ? { tone: 'green', label: 'เปิดรับออเดอร์', short: 'ร้านเปิด' }
      : currentStore?.OpenState === 'PAUSED' ? { tone: 'amber', label: 'หยุดรับออเดอร์ชั่วคราว', short: 'หยุดรับ' }
        : { tone: 'red', label: 'ปิดอยู่', short: 'ร้านปิด' };

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

  // เรียกคิวซ้ำ (เฉพาะคิวที่พร้อมรับ) : ส่งแจ้งเตือนเข้าแอปลูกค้าอีกครั้ง + จอเรียกคิวกระพริบ/มีเสียงใหม่
  const recallQueue = async (order) => {
    if (recallBusy) return;
    setRecallBusy(order.OrderID);
    try {
      const res = await fetch(`${apiBase}/api/orders/${order.OrderID}/recall`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(apiErr(res, data, 'เรียกคิวซ้ำไม่สำเร็จ')); return; }
      readySeenRef.current?.set(order.OrderID, Date.now());
      if (displaySound) playChime();
      showToast(data.notified
        ? `📢 เรียกคิว ${order.QueueNo} อีกครั้งแล้ว (ส่งแจ้งเตือนเข้าแอปลูกค้า)`
        : `📢 เรียกคิว ${order.QueueNo} อีกครั้งแล้ว (ลูกค้า walk-in ไม่มีแอป — จอเรียกคิวกระพริบให้)`);
    } catch {
      showToast('เชื่อมต่อระบบออเดอร์ไม่สำเร็จ');
    } finally {
      setRecallBusy(null);
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
        body: JSON.stringify({ print_type: type, printer: 'BROWSER_80MM', user_role: 'Front Staff' })
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
      // พิมพ์จากข้อมูลที่ backend บันทึกไว้ (ใบเสร็จ 80mm ผ่านหน้าต่างพิมพ์ของเบราว์เซอร์)
      const opened = server && printReceipt({ storeName: currentStore?.StoreName, data: server, reprint: type === 'REPRINT' });
      if (diffs.length) {
        console.warn('[PRINT_LOG] ข้อมูลไม่ตรงกัน:', diffs, { local, server });
        showToast(`⚠️ พิมพ์แล้ว แต่ข้อมูลไม่ตรงกับออเดอร์: ${diffs.join(', ')}`);
      } else if (!opened) {
        showToast(`บันทึกการพิมพ์คิว ${order.QueueNo} แล้ว แต่เปิดหน้าต่างพิมพ์ไม่ได้ — กดพิมพ์ซ้ำอีกครั้ง`);
      } else {
        showToast(type === 'REPRINT' ? `พิมพ์ซ้ำคิว ${order.QueueNo} (ข้อมูลตรงกับออเดอร์)` : `พิมพ์ใบคิว ${order.QueueNo} (ข้อมูลตรงกับออเดอร์)`);
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

  // ⚠️ แจ้งของหมด: ลูกค้าออนไลน์เลือกเปลี่ยนเมนูหรือยกเลิกรับเงินคืนภายใน 15 นาที
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
        body: JSON.stringify({ reason: 'วัตถุดิบหมด', item_ids: selected, close_menu: closeMenu })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.detail || 'ไม่สามารถแจ้งของหมดได้'); return; }
      const closed = (data.closed_menus || []).length ? ` · ปิดเมนู ${data.closed_menus.join(', ')} แล้ว` : '';
      showToast(`แจ้งลูกค้าคิว ${order.QueueNo} ให้เปลี่ยนเมนูแล้ว (15 นาที)${closed}`);
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
    const res = await fetch(`${apiBase}/api/products/${product.ProductId}/toggle-stock?out_of_stock=${!product.IsOutOfStock}`, { method: 'PUT' });
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
          body: JSON.stringify({})
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

  const walkInKeyRef = useRef(null);
  useEffect(() => { walkInKeyRef.current = null; }, [cart]);
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
    walkInKeyRef.current = newRequestKey();   // M6: กดยืนยันซ้ำ / เน็ตหลุด = ได้คิวเดิม ไม่เปิดคิวซ้ำ
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
          expected_total: Math.round(totalAmount * 100) / 100,
          client_request_id: walkInKeyRef.current || (walkInKeyRef.current = newRequestKey()),
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.price_changed) {
        // ราคาเมนูเปลี่ยน : อัปเดตตะกร้า (useEffect ล้างรหัสคำขอ) แล้วให้พนักงานแจ้งยอดใหม่กับลูกค้าก่อนกดอีกครั้ง
        setCart(prev => applyServerPrices(prev, data.items));
        showToast(`ราคาเมนูเปลี่ยน ยอดใหม่ ฿${fmtMoney(data.total)} กรุณาแจ้งลูกค้าแล้วกดยืนยันอีกครั้ง`, 'error');
        return;
      }
      if (!res.ok) { showToast(`สั่งซื้อไม่สำเร็จ: ${apiErrorText(data, `HTTP ${res.status}`)}`, 'error'); return; }
      walkInKeyRef.current = null;
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
      case 'Pending_Cancellation': return 'รอเปลี่ยนเมนู (15น.)';
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
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return 'หมดเวลา · ระบบกำลังยกเลิกให้';
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')} น.`;
  };

  const getElapsedLabel = (timestamp) => {
    if (!timestamp) return '-';
    return `${Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000))} นาที`;
  };

  const minutesWaiting = (timestamp) => timestamp ? Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 60000) : 0;
  const isPickupWarning = (timestamp) => minutesWaiting(timestamp) >= PICKUP_WARNING_MINUTES;
  // backend ส่งเวลาบางช่องเป็น 'YYYY-MM-DD HH:MM:SS' (ไม่มี T) : แปลงให้ทุกเบราว์เซอร์อ่านเป็นเวลาท้องถิ่นได้
  const parseTs = (ts) => new Date(String(ts).replace(' ', 'T'));
  // ลูกค้าแจ้งร้านว่าจะมาช้า (LatePickupArrivalTime): ยังไม่ถึงเวลาที่แจ้ง = ไม่ต้องเตือน/โทร และยังตัดคิวไม่ได้
  const etaMs = (o) => (o.LatePickupArrivalTime ? parseTs(o.LatePickupArrivalTime).getTime() : null);
  const beforeEta = (o) => etaMs(o) !== null && Date.now() < etaMs(o);
  // เวลาที่ปุ่ม "ลูกค้าไม่มารับ" กดได้ = หลังอาหารพร้อม NO_SHOW_UNLOCK_MINUTES นาที และเลยเวลาที่ลูกค้าแจ้ง (ถ้ามี)
  const noShowUnlockAt = (o) => {
    const byReady = o.ReadyAt ? new Date(o.ReadyAt).getTime() + NO_SHOW_UNLOCK_MINUTES * 60000 : Infinity;
    return Math.max(byReady, etaMs(o) ?? 0);
  };
  const canMarkNoShow = (o) => Date.now() >= noShowUnlockAt(o);
  const noShowCountdown = (o) => {
    const r = Math.max(0, Math.ceil((noShowUnlockAt(o) - Date.now()) / 1000));
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
  const historyDay = (historyDate === dateKey(Date.now()) ? orders : (pastHistory.date === historyDate ? pastHistory.list : []))
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
    return Boolean(at) && Date.now() - at < DISPLAY_FLASH_MS;
  };
  const canReprint = (o) => !['Verifying_Slip', 'Cancelled', 'NoShow'].includes(o.Status);

  const navItems = [
    { id: 'orders', label: 'Queue & Slips', caption: 'จัดการคิว & ตรวจสลิป', icon: 'orders', badge: verifyingOrders.length || null },
    { id: 'history', label: 'ประวัติออเดอร์', caption: 'ประวัติรายวัน / ดูลูกค้า / พิมพ์ใบเสร็จ', icon: 'stale' },
    { id: 'walkin', label: 'Walk-in POS', caption: 'แคชเชียร์สั่งอาหารหน้าร้าน', icon: 'walkin' },
    { id: 'refunds', label: 'คืนเงินลูกค้า', caption: 'คืนเงินสดลูกค้า walk-in', icon: 'coin', badge: pendingRefunds || null },
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
      <header className="cv-topbar oft-bar">
        <TopbarStyles />
        <div className="oft-left">
          <BurgerButton open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

          <div className="oft-brand">
            <BrandLogo onClick={() => setActiveTab('orders')} title="กลับหน้าคิวอาหาร" />
            <StatusPill tone={foodCourtOpen ? 'green' : 'red'} pulse={foodCourtOpen} hideOnPhone
              label={foodCourtOpen ? 'ศูนย์อาหารเปิดให้บริการ' : 'ศูนย์อาหารปิดให้บริการ'} />
            <StatusPill tone={storeState.tone} label={`${currentStore?.StoreName || `ร้านค้า #${activeStoreId}`} · ${storeState.label}`} short={storeState.short} />
          </div>
        </div>

        <div className="oft-right">
          <div className="cv-profile-container" ref={profileRef}>
            <UserChip name={user?.FullName || user?.name || 'พนักงานหน้าร้าน'} role="Front Staff" expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)} />

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
        {sidebarOpen && <div className="cv-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
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
          {liveError && <div role="alert" className="cv-live-error">⚠️ {liveError}</div>}
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
          {activeTab === 'orders' && <OrdersTab {...{
            printerStatus, setPrinterStatus, verifyingOrders, orders, isTopUpSlip, slipToCheck, setViewingSlip, apiBase,
            verifySlip, openRejectSlip, queueSearchRef, queueQuery, setQueueQuery, searching, queueTabs, activeOrders,
            queueTab, setQueueTab, handoverOrder, getStatusBadgeTone, getStatusLabel, getElapsedLabel, recallBusy,
            recallQueue, handoverBusy, handOver, shownOrders, endedMatch, currentQueueTab, canMarkNoShow,
            isPickupWarning, beforeEta, fmtClock, PICKUP_WARNING_MINUTES, fmtPhone, reminderNote, getRemainingLabel,
            openNoShowModal, NO_SHOW_UNLOCK_MINUTES, etaMs, noShowUnlockAt, noShowCountdown, openPrintConfirm,
            viewCustomerProfile, openOutModal, openCancelModal
          }} />}

          {/* จอเรียกคิว (จำลอง) */}
          {activeTab === 'display' && <DisplayTab {...{
            setDisplaySound, displaySound, playChime, toggleDisplayFull, displayRef, displayFull, currentStore,
            displayCooking, displayReady, isFreshReady
          }} />}

          {/* TAB 2: ประวัติออเดอร์ (รายวัน) */}
          {activeTab === 'history' && <HistoryTab {...{
            historyDate, dateKey, setHistoryDate, historyQuery, setHistoryQuery, historyFilters, historyFilter,
            setHistoryFilter, historyDay, historyOrders, pastHistory, historyFilterNow, getStatusBadgeTone,
            getStatusLabel, viewCustomerProfile, openPrintConfirm, canReprint
          }} />}

          {/* TAB 3: WALKIN POS */}
          {activeTab === 'walkin' && <WalkInTab {...{
            foodCourtOpen, currentStore, products, addToCart, cart, removeFromCart, updateCartNote, totalAmount,
            orderNote, setOrderNote, openPayment
          }} />}

          {/* TAB 4: REPORTS */}
          {activeTab === 'reports' && <ReportsTab {...{
            fetchReports, reportData, reportCancellations, products
          }} />}

          {activeTab === 'refunds' && <RefundsTab {...{
            apiBase, fetchPendingRefunds
          }} />}

          {/* TAB 5: MENU & STOCK */}
          {activeTab === 'menu' && <MenuTab {...{
            products, toggleStock
          }} />}

        </main>
      </div>

      {/* 🔴 NEW MODAL: CANCEL ORDER (RECEIPT & BILL BREAKDOWN STYLE) */}
      {printConfirmOrder && (
        <div className="cv-modal-overlay" onClick={() => setPrintConfirmOrder(null)}>
          <div className="cv-modal cv-print-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal-head">
              <div><h3>🖨️ ยืนยันการพิมพ์</h3><div className="caption">ยืนยันแล้วจะเปิดหน้าต่างพิมพ์ใบคิว (กระดาษ 80mm)</div></div>
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
                <small>ถ้าแจ้งลูกค้า: ออเดอร์จะเปลี่ยนเป็น "รอลูกค้าเปลี่ยนเมนู" ลูกค้าเลือกเปลี่ยนเมนูหรือยกเลิกรับเงินคืนภายใน 15 นาที เลยเวลาแล้วระบบยกเลิกให้อัตโนมัติ (เจ้าของร้านโอนเงินคืนให้ลูกค้า)</small>
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
                <div className="caption">ลูกค้าเลือกเปลี่ยนเมนู หรือยกเลิกรับเงินคืนได้ภายใน 15 นาที เลยเวลาแล้วระบบยกเลิกให้อัตโนมัติ</div></div>
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

            {slipToCheck(viewingSlip) ? <AuthImage apiBase={apiBase} src={slipToCheck(viewingSlip)} alt="Slip" className="slip-full-img" /> : <div className="empty-state">ไม่มีรูปสลิป</div>}

            {/* สลิปทุกใบของออเดอร์นี้ (ค่าอาหาร + ส่วนต่าง รวมใบที่ถูกปฏิเสธ) */}
            {(viewingSlip.Payments || []).filter(p => p.SlipUrl).length > 1 && (
              <div className="slip-history">
                <div className="receipt-title">สลิปทั้งหมดของออเดอร์นี้</div>
                {(viewingSlip.Payments || []).filter(p => p.SlipUrl).map(p => (
                  <button type="button" key={p.PaymentId} onClick={() => openFile(apiBase, p.SlipUrl)} className="slip-history-item">
                    <AuthImage apiBase={apiBase} src={p.SlipUrl} alt="Slip" />
                    <span>
                      {p.PaymentType === 'TOP_UP' ? 'ส่วนต่าง' : 'ค่าอาหาร'} ฿{fmtMoney(p.Amount)}<br />
                      {p.PaymentStatus === 'VERIFIED' ? '✅ ยืนยันแล้ว' : p.PaymentStatus === 'REJECTED' ? `❌ ${p.RejectReason || 'ปฏิเสธ'}` : '⏳ รอตรวจ'}
                    </span>
                  </button>
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

