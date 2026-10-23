import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startPolling } from '../../lib/polling';
import { useHistoryNav } from '../../lib/historyNav';
import RefundLog from '../../shared/refunds/RefundLog';
import { REFRESH_MS, forceCloseMessage, callApi } from './lib/api';
import { T, FONT_STACK, h2Style, captionStyle, shellStyle, shellBodyStyle, mainScrollStyle, sidebarStyle, sidebarLabelStyle, sidebarItemStyle, backdropStyle, iconButtonStyle, searchWrapStyle, searchInputStyle, dropdownBackdropStyle, notifPanelStyle, notifHeadStyle, notifItemStyle, profilePanelStyle, dropdownItemStyle, contentStyle, courtBannerStyle } from './theme';
import { BellButton, BrandLogo, BurgerButton, StatusPill, TopbarStyles, UserChip } from '../../shared/ui/Topbar';
import { parseOrderDate } from './lib/dates';
import { thaiDateTime } from './lib/format';
import { useIsNarrow, greetingText, Icon, Button, Modal, ConfirmDialog, ForceCloseDialog, ToastStack, Field, TimeSelect } from './components/ui';
import { CancellationPage } from './pages/CancellationPage';
import { OverviewPage } from './pages/OverviewPage';
import { IssueReportsPage } from './pages/IssueReportsPage';
import { StoreSalesPage } from './pages/StoreSalesPage';
import { StoreManagePage } from './pages/store-manage/StoreManagePage';
import { ContractTrackingPage } from './pages/ContractTrackingPage';
import { AuditHistoryPage } from './pages/AuditHistoryPage';
import { CustomerInfoPage } from './pages/CustomerInfoPage';
import { StoreAccountsPage } from './pages/StoreAccountsPage';

// ===== หน้าหลัก Executive: โหลดข้อมูล เมนู แจ้งเตือน และควบคุมศูนย์อาหาร =====
export default function ExecutiveView({ apiBase, user, onLogout }) {
    const API = apiBase || 'http://localhost:8000';
    const isNarrow = useIsNarrow();
    const isPhone = useIsNarrow(640);
    const [activeMenu, setActiveMenu] = useState('overview');
    useHistoryNav(activeMenu, (hash) => {
        const m = hash ?? 'overview';
        if (!['overview', 'cancellation', 'store-manage', 'store-accounts', 'store-sales', 'contract-tracking', 'customer-info',
              'issue-reports', 'refund-log', 'audit-history'].includes(m)) return false;
        setActiveMenu(m);
        return true;
    });
    // [CROSS-NAV] เก็บร้านที่ผู้บริหารคลิกมาจากอีกหน้า เพื่อเปิดรายละเอียดร้านเดิมต่อเนื่อง
    const [focusStoreId, setFocusStoreId] = useState('');
    const [focusPeriod, setFocusPeriod] = useState(null); // ช่วงเวลาที่ส่งต่อจากหน้าภาพรวมไปหน้าวิเคราะห์การยกเลิก
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [search, setSearch] = useState('');
    const searchRef = useRef(null);
    const [stores, setStores] = useState([]);
    const storesRef = useRef(stores);
    useEffect(() => { storesRef.current = stores; }, [stores]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [foodCourtOpen, setFoodCourtOpen] = useState(true);
    const [switchingCourt, setSwitchingCourt] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [issueAlerts, setIssueAlerts] = useState([]);
    const [notifOpen, setNotifOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef(null);
    const [foodCourtOpenTime, setFoodCourtOpenTime] = useState('08:00');
    const [foodCourtCloseTime, setFoodCourtCloseTime] = useState('20:00');
    const [foodCourtMode, setFoodCourtMode] = useState('AUTO');
// เปิดปิดโรงอาหารอัตโนมัติ
    const [showFoodCourtSettings, setShowFoodCourtSettings] = useState(false);
    const [foodCourtOpenInput, setFoodCourtOpenInput] = useState('08:00');
    const [foodCourtCloseInput, setFoodCourtCloseInput] = useState('20:00');
    const [savingFoodCourtSchedule, setSavingFoodCourtSchedule] = useState(false);
    const [returningFoodCourtAuto, setReturningFoodCourtAuto] = useState(false);
    const [locallyRead, setLocallyRead] = useState(() => {
        try {
            return JSON.parse(window.localStorage.getItem('executiveSyntheticRead') || '[]');
        }
        catch {
            return [];
        }
    });
    const [toasts, setToasts] = useState([]);
    const [confirmState, setConfirmState] = useState(null);
    const confirmResolver = useRef(null);
    const pushToast = useCallback((message, type = 'success') => {
        const id = `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
    }, []);
    const dismissToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);
    useEffect(() => {
        function handleClickOutside(event) {
            if (profileRef.current && !profileRef.current.contains(event.target)) {
                setProfileOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const ask = useCallback((options) => {
        setConfirmState(options);
        return new Promise((resolve) => {
            confirmResolver.current = resolve;
        });
    }, []);
    const [forceCloseState, setForceCloseState] = useState(null);
    const forceCloseResolver = useRef(null);
    const askForceClose = useCallback((options) => {
        setForceCloseState(options);
        return new Promise((resolve) => {
            forceCloseResolver.current = resolve;
        });
    }, []);
    const closeForceClose = (choice) => {
        setForceCloseState(null);
        forceCloseResolver.current?.(choice);
        forceCloseResolver.current = null;
    };
    const closeConfirm = (result) => {
        setConfirmState(null);
        confirmResolver.current?.(result);
        confirmResolver.current = null;
    };
    const loadStores = useCallback(async (silent = false) => {
        try {
            const [dashboardData, storeData] = await Promise.all([
                callApi(`${API}/api/reports/dashboard`),
                callApi(`${API}/api/stores`)
            ]);

            const dashboardStores = Array.isArray(dashboardData) ? dashboardData : [];
            const fullStores = Array.isArray(storeData) ? storeData : [];

            const dashboardById = new Map(dashboardStores.map((s) => [String(s.StoreId), s]));

            const merged = fullStores.map((s) => ({
              ...(dashboardById.get(String(s.StoreId)) || {}),
              ...s
          }));

            setStores(merged);
        }
        catch (err) {
            if (!silent)
                pushToast(err.message, 'error');
        }
    }, [API, pushToast]);
    const loadOrders = useCallback(async (silent = false) => {
        try {
            const data = await callApi(`${API}/api/orders`);
            setOrders(Array.isArray(data) ? data : []);
        }
        catch (err) {
            if (!silent)
                pushToast(err.message, 'error');
        }
        finally {
            setLoading(false);
        }
    }, [API, pushToast]);
    const loadFoodCourt = useCallback(async (silent = false) => {
    try {
        const data = await callApi(`${API}/api/food-court/status`);
        setFoodCourtOpen(Boolean(data?.is_open));
        setFoodCourtOpenTime(data?.open_time || '08:00');
        setFoodCourtCloseTime(data?.close_time || '20:00');
        setFoodCourtMode(data?.mode || 'AUTO');
    } catch (err) {
        if (!silent) pushToast(err.message, 'error');
    }
}, [API, pushToast]);
    const loadIssueAlerts = useCallback(async () => {
        const currentStores = storesRef.current;
        if (!Array.isArray(currentStores) || currentStores.length === 0) {
            setIssueAlerts([]);
            return;
        }

        try {
                       // ดึงรายงานทั้งศูนย์ในคำขอเดียว (เดิมยิงทีละร้าน)
            const data = await callApi(`${API}/api/executive/issues`);
            const merged = (Array.isArray(data?.issues) ? data.issues : [])
                .slice(0, 20)
                .map((report) => ({
                    NotifId: `front-issue-${report.ReportID}`,
                    Synthetic: true,
                    EventType: 'ISSUE_REPORT',
                    StoreId: report.StoreId,
                    Message: `มีรายงานปัญหาจาก ${report.StoreName}: ${report.IssueType || 'ไม่ระบุประเภท'}`,
                    CreatedAt: report.CreatedAt
                }));

            setIssueAlerts(merged);
        }
        catch (err) {
            console.debug('โหลดรายงานปัญหาสำหรับกระดิ่งไม่สำเร็จ:', err.message);
        }
    }, [API]);

    const loadNotifications = useCallback(async (silent = true) => {
        const userId = user?.UserId || user?.userId;
        if (!userId)
            return;

        try {
            const data = await callApi(`${API}/api/notifications/${userId}`);
            setNotifications(Array.isArray(data) ? data : []);
        }
        catch (err) {
            if (!silent)
                pushToast(err.message, 'error');
        }
    }, [API, user, pushToast]);

    const loadContractNotifications = useCallback(async (silent = true) => {
    const userId = user?.UserId || user?.userId;

    if (!userId)
        return;

    try {
        const data = await callApi(
            `${API}/api/executive/contract-notifications/${userId}`
        );

        setContractAlerts(Array.isArray(data) ? data : []);
    }
    catch (err) {
        if (!silent)
            pushToast(err.message, 'error');
    }
}, [API, user, pushToast]);
    useEffect(() => {
        loadStores();
        loadOrders();
        loadFoodCourt(true);
        loadNotifications(true);
        loadContractNotifications(true);
        return startPolling(() => Promise.allSettled([
            loadStores(true),
            loadOrders(true),
            loadFoodCourt(true),
            loadNotifications(true),
            loadContractNotifications(true)
        ]), REFRESH_MS);
    }, [loadStores, loadOrders, loadFoodCourt, loadNotifications, loadContractNotifications]);
    useEffect(() => {
        if (!stores.length)
            return;

        loadIssueAlerts();
        return startPolling(loadIssueAlerts, 30000);
    }, [stores, loadIssueAlerts]);

    useEffect(() => {
        setSidebarOpen(!isNarrow);
    }, [isNarrow]);

    const openFoodCourtSettings = () => {
    setFoodCourtOpenInput(foodCourtOpenTime);
    setFoodCourtCloseInput(foodCourtCloseTime);
    setShowFoodCourtSettings(true);
};

    const toggleFoodCourt = async () => {
        const closing = foodCourtOpen;
        let onOpenOrders = '';
        if (closing) {
            let pending = [];
            try { pending = await callApi(`${API}/api/food-court/open-orders`); }
            catch (err) { pushToast(err.message, 'error'); return; }
            if (Array.isArray(pending) && pending.length) {
                const choice = await askForceClose({ kind: 'court', title: 'ปิดศูนย์อาหาร', orders: pending });
                if (!choice) return;
                onOpenOrders = `&on_open_orders=${choice}`;
            }
        }
        const ok = onOpenOrders || await ask({
            title: closing ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร',
            message: closing
                ? 'ยืนยันปิดศูนย์อาหารทั้งหมดใช่หรือไม่'
                : 'ยืนยันเปิดศูนย์อาหารให้กลับมาให้บริการใช่หรือไม่',
            warning: closing
                ? 'ระหว่างปิด ลูกค้าจะสั่งอาหารไม่ได้ทุกร้าน และพนักงานทุกโรลจะเห็นสถานะปิดบนหน้าจอ'
                : null,
            confirmText: closing ? 'ปิดศูนย์อาหาร' : 'เปิดศูนย์อาหาร',
            danger: closing
        });
        if (!ok)
            return;
        setSwitchingCourt(true);
        try {
            const data = await callApi(`${API}/api/food-court/toggle?performed_by=Executive&open=${!closing}${onOpenOrders}`, { method: 'PUT' });
            setFoodCourtOpen(Boolean(data?.is_open));
            setFoodCourtMode(data?.mode || 'AUTO');

            await loadFoodCourt(true);
            await loadStores();

            pushToast(forceCloseMessage(data?.message || 'อัปเดตสถานะศูนย์อาหารแล้ว', data?.forced));
        }
        catch (err) {
            pushToast(err.message, 'error');
        }
        finally {
            setSwitchingCourt(false);
        }
    };

    // บันทึกเวลาเปิดปิดโณงอาหาร
    const saveFoodCourtSchedule = async () => {
    if (!foodCourtOpenInput || !foodCourtCloseInput) return pushToast('กรุณาระบุเวลาเปิดและเวลาปิด', 'error');
    if (foodCourtOpenInput >= foodCourtCloseInput) return pushToast('เวลาปิดต้องอยู่หลังเวลาเปิด', 'error');

    setSavingFoodCourtSchedule(true);
    try {
        const data = await callApi(`${API}/api/food-court/schedule?performed_by=Executive`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ open_time: foodCourtOpenInput, close_time: foodCourtCloseInput })
        });
        setFoodCourtOpen(Boolean(data?.is_open));
        setFoodCourtOpenTime(data?.open_time || foodCourtOpenInput);
        setFoodCourtCloseTime(data?.close_time || foodCourtCloseInput);
        setFoodCourtMode(data?.mode || 'AUTO');
        setShowFoodCourtSettings(false);
        await loadFoodCourt(true);
        pushToast(data?.message || 'บันทึกเวลาทำการเรียบร้อยแล้ว');
    } catch (err) {
        pushToast(err.message, 'error');
    } finally {
        setSavingFoodCourtSchedule(false);
    }
};

// กลับสู่ระบบอัตโนมัติ
const returnFoodCourtToAuto = async () => {
    const ok = await ask({ title: 'กลับสู่ระบบอัตโนมัติ', message: 'ต้องการยกเลิกสถานะที่กำหนดด้วยตนเอง และกลับมาใช้เวลาทำการอัตโนมัติใช่หรือไม่', confirmText: 'กลับสู่ระบบอัตโนมัติ' });
    if (!ok) return;

    setReturningFoodCourtAuto(true);
    try {
        const data = await callApi(`${API}/api/food-court/auto?performed_by=Executive`, { method: 'PUT' });
        setFoodCourtOpen(Boolean(data?.is_open));
        setFoodCourtMode('AUTO');
        await loadFoodCourt(true);
        await loadStores();
        pushToast(data?.message || 'กลับสู่ระบบอัตโนมัติเรียบร้อยแล้ว');
    } catch (err) {
        pushToast(err.message, 'error');
    } finally {
        setReturningFoodCourtAuto(false);
    }
};

    const rememberSyntheticRead = useCallback((notifId) => {
        setLocallyRead((prev) => {
            if (prev.includes(notifId))
                return prev;
            const next = [...prev, notifId].slice(-300);
            try {
                window.localStorage.setItem('executiveSyntheticRead', JSON.stringify(next));
            }
            catch {}
            return next;
        });
    }, []);

    const isRead = (n) =>
        n?.Synthetic
            ? locallyRead.includes(n.NotifId)
            : Boolean(n?.IsRead);
    const [contractAlerts, setContractAlerts] = useState([]);

    const displayNotifications = useMemo(() => {
    const seen = new Set();
    // ใช้ notifications ก่อน เพื่อให้ข้อมูล IsRead เป็นค่าล่าสุด
    const all = [...notifications, ...contractAlerts, ...issueAlerts];
    const unique = all.filter((notif) => {
        const id = notif.NotificationId ?? notif.NotifId;
        // ถ้าไม่มี ID จะไม่สุ่มจับรวมกับรายการอื่น
        if (id == null) return true;
        const key = `${notif.Synthetic ? 'synthetic' : 'database'}:${id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return unique
        .sort((a, b) => {
            const ad = parseOrderDate(a.CreatedAt);
            const bd = parseOrderDate(b.CreatedAt);
            return (bd?.getTime() || 0) - (ad?.getTime() || 0);
        })
        .slice(0, 30);
}, [issueAlerts, contractAlerts, notifications]);

    const unreadCount = displayNotifications.filter((n) => !isRead(n)).length;

    const openNotification = async (notif) => {
    if (notif?.Synthetic) {
        rememberSyntheticRead(notif.NotifId);

        if (notif?.EventType === 'ISSUE_REPORT') {
            setFocusStoreId(String(notif.StoreId || ''));
            setActiveMenu('issue-reports');
            setSearch('');
        }}else {
        if (notif?.EventType === 'CONTRACT') {
            setFocusStoreId(String(notif.StoreId || ''));
            setActiveMenu('contract-tracking');
            setSearch(''); }
        // ลูกค้ายื่นอุทธรณ์การระงับบัญชี -> หน้าข้อมูลผู้ใช้ (มีรายการอุทธรณ์รอพิจารณาอยู่ด้านบน)
        if (notif?.NotificationType === 'SYSTEM' && String(notif.Title || '').includes('อุทธรณ์')) {
            setActiveMenu('customer-info');
            setSearch(''); }

        if (!isRead(notif)) {
            try {
                await callApi(
                    `${API}/api/notifications/${notif.NotifId}/read`,
                    { method: 'PUT' }); }
            catch (err) {
                console.debug('mark-read endpoint ยังไม่พร้อม:', err.message);} }}

    setNotifOpen(false);

    if (isNarrow)
        setSidebarOpen(false);

    if (!notif?.Synthetic)
        loadNotifications(true);
};

    const markAllRead = async () => {
        const userId = user?.UserId || user?.userId;
        const syntheticIds = displayNotifications.filter((n) => n?.Synthetic).map((n) => n.NotifId);

        setLocallyRead((prev) => {
            const next = [...new Set([...prev, ...syntheticIds])].slice(-300);
            try {
                window.localStorage.setItem('executiveSyntheticRead', JSON.stringify(next));
            }
            catch {}
            return next;
        });

        // ของจริงใน Notifications ใช้ endpoint กลางเดิม
        try {
            await callApi(`${API}/api/notifications/${userId}/read-all`, { method: 'PUT' });
            loadNotifications(true);
            pushToast('อ่านแจ้งเตือนทั้งหมดแล้ว');
        }
        catch (err) {
            pushToast('ทำเครื่องหมายรายการ Executive ว่าอ่านแล้วบนเครื่องนี้', 'warn');
        }
    };
    const accountName = user?.FullName || user?.Username || 'ผู้บริหาร';
    const accountRole = user?.Role || 'Executive';
    const handleLogout = () => {
        setProfileOpen(false);
        if (typeof onLogout === 'function') {
            onLogout();
            return;
        }
        try {
            window.localStorage.clear();
            window.sessionStorage.clear();
        }
        catch (err) {
        }
        window.location.reload();
    };
    const MENUS = [
        { id: 'overview', icon: 'overview', label: 'Dashboard', caption: 'ภาพรวมศูนย์อาหาร' },
        { id: 'store-sales', icon: 'trend', label: 'Sales Summary', caption: 'ยอดขายรายร้าน' },
                { id: 'cancellation', icon: 'ban', label: 'Cancellation', caption: 'วิเคราะห์การยกเลิก' },
        { id: 'store-manage', icon: 'store', label: 'Store Management', caption: 'จัดการร้านค้า' },
        { id: 'issue-reports', icon: 'alert', label: 'Issue Reports', caption: 'รายงานปัญหา' },
        { id: 'store-accounts', icon: 'account', label: 'Store Accounts', caption: 'บัญชีร้านค้า' },
        { id: 'customer-info', icon: 'search', label: 'User Information', caption: 'ข้อมูลผู้ใช้' },
        { id: 'contract-tracking', icon: 'calendar', label: 'Contract Tracking', caption: 'ติดตามสัญญา' },
        { id: 'refund-log', icon: 'refund', label: 'Refund Log', caption: 'ประวัติการคืนเงิน' },
        { id: 'audit-history', icon: 'history', label: 'Audit Log', caption: 'ประวัติการดำเนินการ' }
    ];
    // ลบได้ป้ะ
    const PAGE_META = {
        overview: {
            title: 'ภาพรวมศูนย์อาหาร',
            subtitle: 'ดูภาพรวมยอดขาย แนวโน้ม และสถานะร้านค้าทั้งศูนย์',
            searchPlaceholder: 'ค้นหาร้านค้าในตารางสรุป...'
        },
        'store-sales': {
            title: 'ยอดขายรายร้าน',
            subtitle: 'เจาะดูยอดขาย แนวโน้ม และเมนูของร้านแต่ละร้าน',
            searchPlaceholder: 'ค้นหาชื่อร้านเพื่อเลือกดู...'
        },
        'store-manage': {
            title: 'จัดการร้านค้า',
            subtitle: 'เพิ่ม แก้ไข ปิดร้าน ระงับสิทธิ์ และลบร้านค้าออกจากระบบ',
            searchPlaceholder: 'ค้นหาร้านค้าที่ต้องการจัดการ...'
        },
        'issue-reports': {
            title: 'รายงานปัญหาจากลูกค้า',
            subtitle: 'ติดตามสถานะรายงานปัญหาของทุกร้าน (ดูอย่างเดียว ร้านเป็นผู้อัปเดตสถานะ)'
        },
        'store-accounts': {
            title: 'บัญชีร้านค้า',
            subtitle: 'ออกบัญชีผู้ใช้ให้ร้านค้าเข้าระบบไปจัดการเมนูและออเดอร์ของตัวเอง',
            searchPlaceholder: 'ค้นหาชื่อผู้ใช้หรือชื่อร้าน...'
        },
        'customer-info': {
            title: 'ข้อมูลผู้ใช้',
            subtitle: 'ค้นหาและตรวจสอบข้อมูลของลูกค้าในระบบ',
            searchPlaceholder: 'ค้นหาด้วย User ID, Username หรือชื่อผู้ใช้...'
        },
        'contract-tracking': {
            title: 'ติดตามระยะเวลาสัญญา',
            subtitle: 'ตรวจสอบวันเริ่มสัญญา วันสิ้นสุดสัญญา และร้านค้าที่ใกล้หมดอายุ',
            searchPlaceholder: 'ค้นหาร้านค้า...'
        },
          'cancellation': {
            title: 'วิเคราะห์การยกเลิก',
            subtitle: 'อัตราการยกเลิกรายร้าน ร้านที่ต้องจับตา และสาเหตุของออเดอร์ที่ถูกยกเลิก',
            searchPlaceholder: ''
        },
        'refund-log': {
            title: 'ประวัติการคืนเงิน',
            subtitle: 'เงินคืนที่รอคืน (โอนคืนลูกค้าออนไลน์ / เงินสด walk-in) และที่ร้านคืนแล้ว (ไม่นับเป็นรายได้)',
            searchPlaceholder: ''
        },
        'audit-history': {
            title: 'ประวัติการดำเนินการ',
            subtitle: 'ตรวจสอบกิจกรรมสำคัญและการเปลี่ยนแปลงที่เกิดขึ้นภายในระบบ',
            searchPlaceholder: 'ค้นหาประวัติการดำเนินการ...'
        }
    }[activeMenu];
        // มือถือ: ใส่ชื่อหัวคอลัมน์ (data-label) ให้ทุกช่องตาราง เพื่อให้ CSS แสดงตารางเป็นการ์ดได้
    useEffect(() => {
        const root = document.getElementById('executive-main-scroll');
        if (!root) return;
        let frame = 0;
        const labelCells = () => {
            frame = 0;
            root.querySelectorAll('table').forEach((table) => {
                const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
                table.querySelectorAll('tbody tr').forEach((tr) => {
                    let col = 0;
                    [...tr.children].forEach((cell) => {
                        const label = cell.colSpan > 1 ? '' : (heads[col] || '');
                        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
                        col += cell.colSpan || 1;
                    });
                });
            });
        };
        labelCells();
        const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(labelCells); });
        observer.observe(root, { childList: true, subtree: true });
        return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
    }, []);
        const navigateTo = useCallback((menuId, storeId = '', period = null) => {
        setFocusStoreId(storeId ? String(storeId) : '');
        setFocusPeriod(period);
        setActiveMenu(menuId);
        setSearch('');
        if (isNarrow) setSidebarOpen(false);
    }, [isNarrow]);
    const ctx = {
        API,
        user,
        stores,
        orders,
        loading,
        search: search.trim().toLowerCase(),
        pushToast,
        ask,
        askForceClose,
        reloadStores: loadStores,
        reloadOrders: loadOrders,
        focusStoreId,
        focusPeriod,
        navigateTo,
        clearFocusStore: () => setFocusStoreId('')
    };
    return (<>
      <style>{`
        html, body, #root {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
        }
        html {
          overflow-x: hidden !important;
          background: ${T.bg};
        }
        body {
          min-height: 100%;
          min-width: 0 !important;
          overflow-x: hidden !important;
          background: ${T.bg};
          display: block !important;
          place-items: initial !important;
          align-items: initial !important;
          justify-content: initial !important;
        }
        #root {
          min-height: 100vh !important;
          text-align: left !important;
          display: block !important;
          overflow-x: hidden !important;
        }
        #root > * {
          max-width: 100% !important;
          min-width: 0 !important;
        }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, select, textarea { font-family: ${FONT_STACK}; }
        button { transition: transform .15s ease, box-shadow .15s ease, background .15s ease, color .15s ease; }
        table tbody tr { transition: background .15s ease; }
        table tbody tr:hover { background: #F7F7FB; }

        /* ---------- [UX/UI] ธีม Berry ---------- */
        /* ปุ่มทั่วไปมีเงาตอบสนองเวลาชี้เมาส์ */
        button:not(.of-nav-item):not(.of-icon-btn):hover { box-shadow: 0 2px 8px rgba(18,25,38,.10); }

        /* กริดการ์ด KPI: แถวบนการ์ดสีใหญ่ 2 ใบเท่ากัน แถวล่างการ์ดเล็กเรียงเท่ากันทุกใบ */
        .of-kpi-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-bottom: 22px; align-items: stretch; }
        .of-kpi-small { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(215px, 100%), 1fr)); gap: 22px; margin-bottom: 22px; align-items: stretch; }
        .of-store-kpi-small { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 22px; align-items: stretch; }
        @media (max-width: 900px) {
          .of-store-kpi-small { grid-template-columns: 1fr; }
        }
        @media (max-width: 760px) {
          .of-kpi-hero { grid-template-columns: 1fr; }
        }

        /* การ์ดยกตัวเล็กน้อยเมื่อชี้เมาส์ */
        .of-card { transition: box-shadow .2s ease, transform .2s ease; }
        .of-card:hover { box-shadow: ${T.shadowMd}; }

        /* เมนูฝั่งซ้าย */
        .of-nav-item:hover { background: ${T.primarySoft} !important; color: ${T.primary} !important; }
        .of-nav-item:hover .of-nav-caption { color: ${T.primary}; opacity: .8; }

        /* ปุ่มไอคอนบนแถบบน */
        .of-icon-btn.purple:hover { background: ${T.primary} !important; color: #fff !important; }
        .of-icon-btn.purple:hover svg { stroke: #fff !important; }
        .of-icon-btn.amber:hover { background: ${T.amber} !important; }
        .of-icon-btn.amber:hover svg { stroke: #fff !important; }
        .of-user-chip:hover { background: #E2E4EE !important; }
        .of-dropdown-item:hover { background: ${T.primarySoft}; color: ${T.primary}; }
        .of-dropdown-item:hover svg { stroke: ${T.primary}; }
        .of-click-row:hover { background: ${T.bg} !important; }
        /* ช่องกรอกเวลาโฟกัส */
        input:focus, select:focus, textarea:focus { outline: 2px solid ${T.primarySoft}; border-color: ${T.primary} !important; }

        /* แถบเลื่อนบาง ๆ ให้เข้ากับธีม */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #D6D8E4; border-radius: 999px; }
        ::-webkit-scrollbar-track { background: transparent; }
        
        /* ===== จอเล็ก (iPad / มือถือ) ===== */
        @media (max-width: 1200px) {
          #executive-main-scroll table { min-width: 0 !important; }
          #executive-main-scroll th, #executive-main-scroll td { padding: 12px 10px !important; }
        }
        @media (max-width: 640px) {

          #executive-main-scroll table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
          #executive-main-scroll table, #executive-main-scroll tbody { display: block; width: 100% !important; margin-top: 8px !important; }
          #executive-main-scroll tbody tr { display: block; border: 1px solid ${T.line}; border-radius: 12px; padding: 4px 14px; margin-bottom: 10px; background: ${T.surface} !important; }
          #executive-main-scroll tbody td { display: grid; grid-template-columns: minmax(0, 38%) minmax(0, 1fr); column-gap: 12px; align-items: center; justify-items: end; width: auto !important; min-width: 0 !important; padding: 9px 0 !important; border: 0 !important; border-bottom: 1px dashed ${T.line} !important; text-align: right !important; white-space: normal !important; overflow-wrap: anywhere; }
          #executive-main-scroll tbody td:last-child { border-bottom: 0 !important; }
          #executive-main-scroll tbody td::before { content: attr(data-label); grid-column: 1; grid-row: 1 / span 9; justify-self: start; text-align: left; font-size: 12px; font-weight: 600; color: ${T.muted}; }
          #executive-main-scroll tbody td > * { grid-column: 2; }
          #executive-main-scroll tbody td[data-label=""] { display: block; text-align: left !important; }
          #executive-main-scroll tbody td[data-label=""]::before { display: none; }

          .of-store-status-grid { grid-template-columns: 52px minmax(0, 1fr) !important; row-gap: 16px; }
          .of-store-status-nums { grid-column: 1 / -1; padding-right: 0 !important; }
          .of-store-status-btn { margin-top: 12px !important; width: 100%; }
          .of-store-status-btn > button { width: 100%; justify-content: center; }
        }
      `}</style>
      <div style={{ ...shellStyle, fontFamily: FONT_STACK }}>

        <header className="oft-bar" style={{ position: 'sticky', top: 0, zIndex: 70, flexWrap: 'wrap', ...(isPhone ? { padding: '10px 12px' } : {}) }}>
          <TopbarStyles/>
          <div className="oft-left">
            <BurgerButton open={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)}/>
            <div className="oft-brand">
              <BrandLogo onClick={() => navigateTo('overview')} title="กลับหน้า Dashboard"/>
              <StatusPill tone={foodCourtOpen ? 'green' : 'red'} pulse={foodCourtOpen}
                label={foodCourtOpen ? 'ศูนย์อาหารเปิดให้บริการ' : 'ศูนย์อาหารปิดให้บริการ'} short={foodCourtOpen ? 'เปิด' : 'ปิด'}/>
            </div>
          </div>

          {(activeMenu === 'store-manage' || activeMenu === 'store-accounts') && (<form onSubmit={(e) => {
                e.preventDefault();
                searchRef.current?.blur();
            }} style={{ ...searchWrapStyle, maxWidth: isPhone ? 'none' : searchWrapStyle.maxWidth, flexBasis: isPhone ? '100%' : 'auto', order: isPhone ? 5 : 'initial' }}>
              <button type="button" style={{ ...iconButtonStyle, border: 'none', background: 'transparent', width: '28px', height: '28px' }} aria-label="ค้นหา" onClick={() => searchRef.current?.focus()}>
                <Icon name="search" size={17} color={T.muted}/>
              </button>
              <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={PAGE_META.searchPlaceholder} style={searchInputStyle}/>
              {search && (<button type="button" onClick={() => setSearch('')} style={{ ...iconButtonStyle, border: 'none', background: 'transparent', width: '26px', height: '26px' }} aria-label="ล้างคำค้นหา">
                  <Icon name="close" size={15} color={T.muted}/>
                </button>)}
            </form>)}

          <div style={{ flex: 1, minWidth: '8px' }}/>
          <div className="oft-right">
          <div style={{ position: 'relative' }}>
            <BellButton count={unreadCount} active={notifOpen} onClick={() => setNotifOpen((v) => !v)}/>

            {notifOpen && (<>
                <div style={dropdownBackdropStyle} onClick={() => setNotifOpen(false)}/>
                <div style={notifPanelStyle}>
                  <div style={notifHeadStyle}>
                    <div>
                      <div style={{ color: T.ink, fontWeight: 700, fontSize: '14px' }}>การแจ้งเตือน</div>
                      <div style={captionStyle}>ยังไม่ได้อ่าน {unreadCount} รายการ</div>
                    </div>
                    {unreadCount > 0 && (<Button variant="ghost" onClick={markAllRead} style={{ padding: '6px 10px', fontSize: '12px' }}>
                        อ่านทั้งหมด
                      </Button>)}
                  </div>
                  <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                    {displayNotifications.length === 0 && (<div style={{ padding: '26px', textAlign: 'center', color: T.muted, fontSize: '13px' }}>
                        ยังไม่มีการแจ้งเตือน
                      </div>)}
                    {displayNotifications.map((n) => (<button key={n.NotifId} type="button" onClick={() => openNotification(n)} style={{...notifItemStyle,background:isRead(n)?T.surface:T.primarySoft}}>
                        <span style={{width: '8px',height: '8px',borderRadius: '50%',marginTop: '6px',background:isRead(n)?T.line:T.primary}}/>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', color: T.text, fontSize: '13px' }}>{n.Message}</span>
                          <span style={{ display: 'block', color: T.muted, fontSize: '11.5px', marginTop: '3px' }}>
                            {n.CreatedAt ? thaiDateTime(n.CreatedAt) : ''}
                          </span>
                        </span>
                      </button>))}
                  </div>
                </div>
              </>)}
          </div>

          <div style={{ position: 'relative' }} ref={profileRef}>
            <UserChip name={accountName} role={accountRole} expanded={profileOpen} onClick={() => setProfileOpen((v) => !v)}/>
                {profileOpen && <div style={{ ...profilePanelStyle, ...(isPhone ? { position: 'fixed', top: '92px', left: '16px', right: '16px', width: 'auto', maxWidth: 'none', boxSizing: 'border-box', zIndex: 9999 } : {}) }}>
    <div><h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: T.ink, lineHeight: 1.5 }}>{greetingText()}, {accountName}</h4><p style={{ margin: '4px 0 16px', fontSize: '13px', color: T.muted }}>{accountRole} (ผู้บริหารศูนย์อาหาร)</p></div>
    <hr style={{ border: 'none', borderTop: `1px solid ${T.line}`, margin: '0 0 12px' }}/>
    <button type="button" className="of-dropdown-item" style={dropdownItemStyle} onClick={handleLogout}><Icon name="logout" size={18}/> ออกจากระบบ</button>
</div>}
          </div>
          </div>
        </header>

        <div style={shellBodyStyle}>

          {(!isNarrow || sidebarOpen) && (<aside style={{...sidebarStyle,width:isNarrow? 'min(84vw, 290px)':sidebarOpen? '260px':'76px',minWidth:isNarrow? 'min(84vw, 290px)':sidebarOpen? '260px':'76px',padding:isNarrow || sidebarOpen? sidebarStyle.padding:'16px 8px 12px',position:isNarrow? 'absolute': 'relative',left:isNarrow?0: 'auto',top:isNarrow?0: 'auto',bottom:isNarrow?0: 'auto',alignSelf:isNarrow? 'auto': 'stretch',boxShadow:isNarrow? '4px 0 24px rgba(18,25,38,.10)':sidebarStyle.boxShadow,zIndex:isNarrow?60:20}}>
              <nav style={{ flex: 1 }}>
                {sidebarOpen && <div style={sidebarLabelStyle}>เมนูหลัก</div>}
                {MENUS.map((m) => (<button key={m.id} type="button" className="of-nav-item" title={!sidebarOpen ? m.label : undefined} aria-label={m.label} onClick={() => {
                    setActiveMenu(m.id);
                    setFocusStoreId('');
                    setFocusPeriod(null);
                    setSearch('');
                    if (isNarrow)
                        setSidebarOpen(false);
                }} style={{...sidebarItemStyle,justifyContent:sidebarOpen?'flex-start':'center',gap:sidebarOpen?'16px':'0',padding:sidebarOpen?'10px 16px':'12px 0',background:activeMenu===m.id?T.sideActive: 'transparent',color:activeMenu===m.id?T.primary:T.sideText}}>
                    <Icon name={m.icon} size={20} strokeWidth={1.5}/>
                    {sidebarOpen && <span style={{ minWidth: 0, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: '14px', fontWeight: activeMenu === m.id ? 600 : 500 }}>
                        {m.label}
                      </span>
                      <span className="of-nav-caption" style={{display: 'block',fontSize: '11.5px',marginTop: '2px',color:activeMenu===m.id?T.primary:T.muted,opacity:activeMenu===m.id?0.8:1}}>
                        {m.caption}
                      </span>
                    </span>}
                  </button>))}
              </nav>

            </aside>)}

          {isNarrow && sidebarOpen && (<div style={backdropStyle} onClick={() => setSidebarOpen(false)}/>)}

          <main id="executive-main-scroll" style={mainScrollStyle}>

            <div style={{ ...contentStyle, padding: isPhone ? '14px 10px 22px' : isNarrow ? '18px 14px 24px' : contentStyle.padding }}>
              <div style={{ marginBottom: '18px' }}>
                <h2 style={{ ...h2Style, fontSize: isPhone ? '20px' : h2Style.fontSize }}>{PAGE_META.title}</h2>
                <p style={{ ...captionStyle, fontSize: '13.5px' }}>{PAGE_META.subtitle}</p>
              </div>

              {!foodCourtOpen && (<div style={courtBannerStyle}>
                  <Icon name="info" size={18} color={T.down}/>
                  <span>
                    ศูนย์อาหารปิดให้บริการอยู่ — ลูกค้าสั่งอาหารไม่ได้ทุกร้าน และทุกโรลจะเห็นสถานะนี้
                  </span>
                </div>)}

              {activeMenu === 'overview' && (<OverviewPage ctx={ctx} foodCourtOpen={foodCourtOpen} foodCourtOpenTime={foodCourtOpenTime} foodCourtCloseTime={foodCourtCloseTime} foodCourtMode={foodCourtMode} switchingCourt={switchingCourt} returningFoodCourtAuto={returningFoodCourtAuto} onToggleCourt={toggleFoodCourt} onOpenSettings={openFoodCourtSettings} onReturnAuto={returnFoodCourtToAuto} />)}
              {activeMenu === 'store-sales' && <StoreSalesPage ctx={ctx}/>}
              {activeMenu === 'cancellation' && <CancellationPage ctx={ctx}/>}
              {activeMenu === 'store-manage' && <StoreManagePage ctx={ctx}/>}
              {activeMenu === 'store-accounts' && <StoreAccountsPage ctx={ctx}/>}
              {activeMenu === 'customer-info' && <CustomerInfoPage ctx={ctx}/>}
              {activeMenu === 'contract-tracking' && <ContractTrackingPage ctx={ctx}/>}
              {activeMenu === 'refund-log' && <RefundLog apiBase={API} showStore pollMs={15000} />}
              {activeMenu === 'audit-history' && <AuditHistoryPage ctx={ctx}/>}
              {activeMenu === 'issue-reports' && <IssueReportsPage ctx={ctx}/>}
            </div>
          </main>
        </div>

      <Modal open={showFoodCourtSettings} title="ตั้งค่าเวลาทำการ" subtitle="กำหนดเวลาเปิดและปิดศูนย์อาหารอัตโนมัติ" onClose={() => { if (!savingFoodCourtSchedule) setShowFoodCourtSettings(false); }} width={460} footer={
    <>
        <Button variant="ghost" onClick={() => setShowFoodCourtSettings(false)} disabled={savingFoodCourtSchedule}>ยกเลิก</Button>
        <Button variant="primary" icon="check" onClick={saveFoodCourtSchedule} disabled={savingFoodCourtSchedule}>{savingFoodCourtSchedule ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
    </>
}>
        <Field as="div" label="เวลาเปิดอัตโนมัติ" required hint="ศูนย์อาหารจะเริ่มรับออเดอร์ใหม่ตั้งแต่เวลานี้">
        <TimeSelect value={foodCourtOpenInput} onChange={setFoodCourtOpenInput} disabled={savingFoodCourtSchedule} presets={['06:00', '07:00', '08:00', '09:00', '10:00']} />
    </Field>
    <Field as="div" label="เวลาปิดอัตโนมัติ" required hint="เมื่อถึงเวลานี้ ระบบจะหยุดรับออเดอร์ใหม่">
        <TimeSelect value={foodCourtCloseInput} onChange={setFoodCourtCloseInput} disabled={savingFoodCourtSchedule} presets={['17:00', '18:00', '19:00','20:00', '21:00']} />
    </Field>
    <div style={{ marginTop: '4px', padding: '11px 13px', borderRadius: T.radiusMd, background: T.accentSoft, color: '#8A5A00', fontSize: '12.5px', lineHeight: 1.6 }}>
        การปิดศูนย์อาหารจะหยุดรับออเดอร์ใหม่เท่านั้น ออเดอร์ที่สร้างไว้ก่อนแล้วจะดำเนินการต่อได้ตามปกติ
    </div>
</Modal>
      <ConfirmDialog state={confirmState} onCancel={() => closeConfirm(false)} onConfirm={() => closeConfirm(true)}/>
      <ForceCloseDialog state={forceCloseState} onCancel={() => closeForceClose(null)} onChoose={closeForceClose}/>
      <ToastStack toasts={toasts} onDismiss={dismissToast}/>
      </div>
    </>);
}
 