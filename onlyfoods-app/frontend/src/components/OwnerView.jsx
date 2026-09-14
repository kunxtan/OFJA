import React, { useState, useEffect, useRef } from 'react';

/* ============================================================
   OF Shop Owner — แดชบอร์ดเจ้าของร้านค้า (Executive Theme Colors)
   ============================================================ */

const fmtMoney = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// --- Helper Functions สำหรับคำนวณกราฟแบบ Executive ---
function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const alreadyHasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(alreadyHasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPeriodBounds(days) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start, end };
}

function ordersInsidePeriod(orders, days, storeId = null) {
  const { start, end } = getPeriodBounds(days);
  return (orders || []).filter(order => {
    const createdAt = parseOrderDate(order.CreatedAt);
    const correctStore = storeId === null || String(order.StoreId) === String(storeId);
    return createdAt && createdAt >= start && createdAt < end && correctStore;
  });
}

function orderIs(order, status) {
  return String(order.Status || '').toLowerCase() === status.toLowerCase();
}

function buildTrend(completedOrders, days) {
  const { start } = getPeriodBounds(days);
  if (days === 1) {
    return Array.from({ length: 24 }, (_, hour) => {
      const sales = completedOrders
        .filter(order => parseOrderDate(order.CreatedAt)?.getHours() === hour)
        .reduce((sum, order) => sum + Number(order.TotalAmount || 0), 0);
      return { label: `${String(hour).padStart(2, '0')}:00`, sales };
    });
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const sales = completedOrders
      .filter(order => {
        const createdAt = parseOrderDate(order.CreatedAt);
        return createdAt && createdAt.getFullYear() === year &&
          createdAt.getMonth() === month && createdAt.getDate() === day;
      })
      .reduce((sum, order) => sum + Number(order.TotalAmount || 0), 0);
    return {
      label: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}`,
      sales
    };
  });
}

function buildStoreReport(orders, storeId, days) {
  const periodOrders = ordersInsidePeriod(orders, days, storeId);
  const completed = periodOrders.filter(order => orderIs(order, 'Completed'));
  const cancelled = periodOrders.filter(order => orderIs(order, 'Cancelled'));
  const totalSales = completed.reduce((sum, order) => sum + Number(order.TotalAmount || 0), 0);
  const finishedCount = completed.length + cancelled.length;

  return {
    total_sales: totalSales,
    total_orders: completed.length,
    total_cancelled: cancelled.length,
    average_order: completed.length ? totalSales / completed.length : 0,
    cancellation_rate: finishedCount ? Number(((cancelled.length / finishedCount) * 100).toFixed(1)) : 0,
    trend: buildTrend(completed, days)
  };
}

const getStatusLabel = (status) => {
  const statusMap = {
    'Verifying_Slip': 'รอตรวจสอบสลิป',
    'Pending': 'รอดำเนินการ',
    'Cooking': 'กำลังปรุง',
    'Ready': 'รอรับอาหาร',
    'Completed': 'สำเร็จ',
    'Cancelled': 'ยกเลิก'
  };
  return statusMap[status] || status;
};

// --- Icons ---
function Icon({ name, size = 20 }) {
  const paths = {
    dashboard: <><path d="M4 4h6v8H4z" /><path d="M4 16h6v4H4z" /><path d="M14 12h6v8h-6z" /><path d="M14 4h6v4h-6z" /></>,
    menu: <><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" /></>,
    cancel: <><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 12l6 0" /></>,
    history: <><path d="M12 8l0 4l2 2" /><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" /></>,
    check: <><path d="M5 12l5 5l10 -10" /></>,
    power: <><path d="M7 6a7.75 7.75 0 1 0 10 0" /><line x1="12" y1="4" x2="12" y2="12" /></>,
    settings: <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543 .94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543 .826-3.31 2.37-2.37c1 .608 2.296 .07 2.572-1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></>,
    bell: <><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/></>,
    user: <><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /></>,
    logout: <><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" /></>,
    plus: <><path d="M12 5l0 14" /><path d="M5 12l14 0" /></>,
    trash: <><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></>,
    edit: <><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></>,
    users: <><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Badge({ tone, children }) {
  return <span className={`berry-badge tone-${tone}`}>{children}</span>;
}

function PeriodButtons({ days, setDays }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', background: 'var(--berry-purple-light)', padding: '4px', borderRadius: '8px' }}>
      {[1, 7, 14, 30].map(value => (
        <button
          key={value}
          type="button"
          onClick={() => setDays(value)}
          className={`berry-period-btn ${days === value ? 'active' : ''}`}
        >
          {value === 1 ? 'Today' : `${value} Days`}
        </button>
      ))}
    </div>
  );
}

function DashboardSmallCard({ label, value, icon, tone }) {
  return (
    <div className="berry-card berry-small-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className={`berry-avatar-box tone-${tone}`}>
          <Icon name={icon} size={24} />
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--berry-text-dark)' }}>{value}</div>
          <div style={{ color: 'var(--berry-text-muted)', fontSize: '13px', marginTop: '2px' }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function OverviewSalesBarChart({ data }) {
  if (!data || data.length === 0) {
    return <div style={{ minHeight: '300px', display: 'grid', placeItems: 'center', color: 'var(--berry-text-muted)' }}>ช่วงเวลานี้ยังไม่มียอดขายสำเร็จ</div>;
  }
  const width = 850, height = 300, left = 65, right = 20, top = 30, bottom = 40;
  const graphWidth = width - left - right, graphHeight = height - top - bottom;
  const values = data.map(item => Number(item.sales || 0));
  const maxValue = Math.max(...values, 1);
  const slotWidth = graphWidth / data.length;
  const barWidth = Math.min(24, slotWidth * 0.5);
  const labelStep = Math.max(1, Math.ceil(data.length / 10));
  const shortNumber = value => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value / 1000)}K` : Math.round(value).toString();

  return (
    <div style={{ overflowX: 'auto', marginTop: '16px' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: '600px', display: 'block' }}>
        {[0, 1, 2, 3, 4].map(line => {
          const ratio = line / 4, y = top + graphHeight * ratio, amount = maxValue * (1 - ratio);
          return (
            <g key={line}>
              <line x1={left} x2={width-right} y1={y} y2={y} stroke="var(--berry-border)" strokeDasharray="4 4" />
              <text x={left-10} y={y+4} textAnchor="end" fontSize="12" fill="var(--berry-text-muted)">{shortNumber(amount)}</text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const sales = Number(item.sales || 0), barHeight = (sales / maxValue) * graphHeight;
          const x = left + index * slotWidth + (slotWidth - barWidth) / 2, y = top + graphHeight - barHeight;
          const showLabel = index % labelStep === 0 || index === data.length - 1;
          return (
            <g key={`${item.label}-${index}`}>
              <rect x={x} y={y} width={barWidth} height={Math.max(barHeight,2)} rx="4" fill="var(--berry-purple)">
                <title>{item.label}: {sales.toLocaleString()} บาท</title>
              </rect>
              {sales > 0 && <text x={x+barWidth/2} y={Math.max(y-8,12)} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--berry-purple)">{shortNumber(sales)}</text>}
              {showLabel && <text x={x+barWidth/2} y={height-12} textAnchor="middle" fontSize="12" fill="var(--berry-text-muted)">{item.label}</text>}
            </g>
          );
        })}
        <line x1={left} x2={width-right} y1={top+graphHeight} y2={top+graphHeight} stroke="var(--berry-border)"/>
      </svg>
    </div>
  );
}

// --- Component อัปโหลดรูปภาพแบบ Drag & Drop ---
function ImageUploadZone({ image, onChange }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    processFile(file);
  };

  const handleChange = (e) => {
    const file = e.target.files[0];
    processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น');
      return;
    }
    // ตรวจสอบขนาดไม่เกิน 5 MB (5 * 1024 * 1024)
    if (file.size > 5242880) {
      alert('ขนาดไฟล์ต้องไม่เกิน 5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  return (
    <div
      className={`berry-upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={triggerFileSelect}
    >
      <input
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleChange}
      />
      {image ? (
        <div className="berry-upload-preview-container">
          <img src={image} alt="Preview" className="berry-upload-preview" />
          <div className="berry-upload-change-overlay">
            <Icon name="edit" size={24} />
            <span style={{ marginTop: '4px' }}>Click to change</span>
          </div>
        </div>
      ) : (
        <div className="berry-upload-placeholder">
          {/* Cloud Icon SVG with Executive Gradient */}
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--berry-purple)' }}>
            <defs>
              <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FDBF50" />
                <stop offset="100%" stopColor="#FF724C" />
              </linearGradient>
            </defs>
            <path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-12" fill="url(#cloudGrad)" fillOpacity="0.4" />
            <path d="M9 15l3 -3l3 3" />
            <path d="M12 12l0 9" />
          </svg>
          <button type="button" className="berry-btn-browse" onClick={(e) => { e.stopPropagation(); triggerFileSelect(); }}>Browse</button>
          <p>or drag files to upload to <strong>My Drive</strong> and select</p>
        </div>
      )}
    </div>
  );
}

export default function OwnerView({ user, apiBase, onLogout }) {
  useEffect(() => {
    if (!document.getElementById('berry-font-link')) {
      const link = document.createElement('link');
      link.id = 'berry-font-link';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Sarabun:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const storeId = user?.storeId || 1;
  const [dash, setDash] = useState({});
  const [cancels, setCancels] = useState([]);
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]); 
  const [staffList, setStaffList] = useState([]); 
  
  const [storeDays, setStoreDays] = useState(1);
  const [storeReport, setStoreReport] = useState(null);
  
  const [page, setPage] = useState('dashboard');
  
  // ให้ sidebar กางออกโดยเริ่มต้น
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState({ show: false, msg: '' });

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // --- ระบบนับจำนวนแจ้งเตือน ---
  const [unreadCancels, setUnreadCancels] = useState(0);
  const [knownCancelsCount, setKnownCancelsCount] = useState(0);
  const isFirstFetch = useRef(true);

  // --- Modal States ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMenu, setNewMenu] = useState({ name: '', price: '', img: '' });
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editMenu, setEditMenu] = useState({ id: null, name: '', price: '', img: '' });

  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({ username: '', password: '', fullName: '', role: 'Front Staff' });

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = () => {
    fetch(`${apiBase}/api/reports/dashboard?store_id=${storeId}`).then(r => r.json()).then(d => setDash(d[0] || {}));
    
    fetch(`${apiBase}/api/reports/cancellations?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => {
        setCancels(data);
        if (isFirstFetch.current) {
          setKnownCancelsCount(data.length);
          isFirstFetch.current = false;
        }
      });

    fetch(`${apiBase}/api/products?store_id=${storeId}`).then(r => r.json()).then(setProducts);
    fetch(`${apiBase}/api/orders?store_id=${storeId}`).then(r => r.json()).then(setHistory).catch(err => console.error(err));
    fetch(`${apiBase}/api/stores/${storeId}/staff`).then(r => r.json()).then(setStaffList).catch(err => console.error(err));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [storeId, apiBase]);

  useEffect(() => {
    if (history) {
      setStoreReport(buildStoreReport(history, storeId, storeDays));
    }
  }, [history, storeId, storeDays]);

  useEffect(() => {
    if (!isFirstFetch.current && cancels.length > knownCancelsCount) {
      if (page !== 'cancel') {
        setUnreadCancels(cancels.length - knownCancelsCount);
      } else {
        setKnownCancelsCount(cancels.length);
      }
    }
  }, [cancels.length, page, knownCancelsCount]);

  useEffect(() => {
    if (page === 'cancel') {
      setUnreadCancels(0);
      setKnownCancelsCount(cancels.length);
    }
  }, [page, cancels.length]);

  const showToast = (msg) => {
    setToast({ show: true, msg });
    clearTimeout(window.__avxToastTimer);
    window.__avxToastTimer = setTimeout(() => setToast({ show: false, msg: '' }), 2600);
  };

  const toggleStore = () => {
    fetch(`${apiBase}/api/stores/${storeId}/toggle`, { method: 'PUT' }).then(() => {
      fetchData();
      showToast(dash.IsOpen ? 'ปิดร้านชั่วคราวแล้ว' : 'เปิดรับออเดอร์แล้ว!');
    });
  };

  const toggleStock = (id, pName, isOutOfStock) => {
    fetch(`${apiBase}/api/products/${id}/toggle-stock`, { method: 'PUT' }).then(() => {
      fetchData();
      showToast(`อัปเดตสถานะ "${pName}" เป็น ${isOutOfStock ? 'มีสินค้า' : 'สินค้าหมด'} แล้ว`);
    });
  };

  const handleAddMenu = async (e) => {
    e.preventDefault();
    if (!newMenu.name || !newMenu.price) return;
    try {
      const res = await fetch(`${apiBase}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          StoreId: storeId,
          ProductName: newMenu.name,
          UnitPrice: Number(newMenu.price),
          IsOutOfStock: false,
          img: newMenu.img || ''
        })
      });
      if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Failed to add menu');
      }
      showToast('เพิ่มเมนูสำเร็จ');
      setNewMenu({ name: '', price: '', img: '' });
      setIsAddModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const openEditModal = (product) => {
    setEditMenu({
      id: product.ProductId,
      name: product.ProductName,
      price: product.UnitPrice,
      img: product.img || ''
    });
    setIsEditModalOpen(true);
  };

  const handleEditMenuSubmit = async (e) => {
    e.preventDefault();
    if (!editMenu.name || !editMenu.price) return;
    try {
      const res = await fetch(`${apiBase}/api/products/${editMenu.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ProductName: editMenu.name,
          UnitPrice: Number(editMenu.price),
          img: editMenu.img || ''
        })
      });
      if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Failed to update menu');
      }
      showToast('แก้ไขเมนูสำเร็จ');
      setIsEditModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const handleDeleteMenu = async (id, name) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบเมนู "${name}"?`)) return;
    try {
      const res = await fetch(`${apiBase}/api/products/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
          throw new Error('Failed to delete menu');
      }
      showToast('ลบเมนูสำเร็จ');
      fetchData();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการลบเมนู');
    }
  };

  // --- Staff Management ---
  const handleAddStaff = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/stores/${storeId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStaff)
      });
      if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Failed to add staff');
      }
      showToast('เพิ่มพนักงานสำเร็จ');
      setNewStaff({ username: '', password: '', fullName: '', role: 'Front Staff' });
      setIsStaffModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleDeleteStaff = async (userId, name) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบพนักงาน "${name}" ออกจากระบบ?`)) return;
    try {
      const res = await fetch(`${apiBase}/api/staff/${userId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
          throw new Error('Failed to delete staff');
      }
      showToast('ลบพนักงานสำเร็จ');
      fetchData();
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการลบพนักงาน');
    }
  };

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', caption: 'ภาพรวมร้านค้า', icon: 'dashboard' },
    { id: 'menu', label: 'Manage Menu', caption: 'จัดการเมนู/สต็อก', icon: 'menu' },
    { id: 'staff', label: 'Manage Staff', caption: 'จัดการพนักงาน', icon: 'users' },
    { id: 'history', label: 'Sales History', caption: 'ประวัติการขาย', icon: 'history' },
    { id: 'cancel', label: 'Cancellations', caption: 'ประวัติยกเลิกออเดอร์', icon: 'cancel', badge: unreadCancels > 0 ? unreadCancels : null },
  ];

  return (
    <div className="berry-root">
      <style>{BERRY_STYLES}</style>
      
      {/* ===== TOPBAR (HEADER) ===== */}
      <header className="berry-topbar">
        <div className="berry-topbar-left">
          <div className="berry-brand">
            <div className="brand-title">
              <span className="brand-icon">🍽️</span> 
              <span>Only Foods</span>
            </div>
            <div className="brand-subtitle">
              สถานะศูนย์อาหาร: 
              <span className="status-dot"></span> 
              <span className="status-text">เปิดให้บริการ</span>
            </div>
          </div>

          <button className="berry-icon-btn purple-light" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Icon name="menu" size={20} />
          </button>
        </div>

        <div className="berry-topbar-right">
          <button className="berry-icon-btn amber-light"><Icon name="bell" size={20} /></button>
          
          <div className="berry-profile-container" ref={profileRef}>
            <div className="berry-user-chip" onClick={() => setProfileOpen(!profileOpen)}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--berry-blue-dark)', padding: '0 8px' }}>
                {user?.name || 'Shop Owner'}
              </span>
              <div style={{ color: 'var(--berry-blue-dark)', display: 'flex', alignItems: 'center' }}>
                <Icon name="settings" size={18} />
              </div>
            </div>

            {profileOpen && (
              <div className="berry-profile-dropdown">
                <div className="dropdown-header">
                  <h4>Good Morning, {user?.name || user?.FullName || 'Owner'}</h4>
                  <p>Shop Owner (เจ้าของร้าน)</p>
                </div>
                
                <hr className="berry-divider" style={{ margin: '0 0 16px' }} />

                <div className="dropdown-item">
                  <Icon name="settings" size={18} /> Account Settings
                </div>
                <div className="dropdown-item">
                  <Icon name="user" size={18} /> Social Profile
                  <span className="dropdown-badge">02</span>
                </div>
                <div className="dropdown-item" onClick={handleLogout}>
                  <Icon name="logout" size={18} /> Logout
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== BODY (Sidebar + Main Content) ===== */}
      <div className="berry-body">
        
        {/* ===== SIDEBAR ===== */}
        <aside className={`berry-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <nav className="berry-nav">
            <div className="berry-nav-group">
              <div className="berry-nav-label hide-on-collapse">Shop Management</div>
              {navItems.map(n => (
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
          </nav>
        </aside>

        {/* ===== MAIN CONTENT ===== */}
        <main className="berry-content">
          {page === 'dashboard' && (
            <div className="berry-dashboard-grid">
              <div className="berry-stat-row">
                <div className="berry-card berry-bg-purple">
                  <div className="berry-decor-circle-1"></div>
                  <div className="berry-decor-circle-2"></div>
                  <div className="berry-card-header">
                    <div className="berry-icon-box dark"><Icon name="dashboard" size={24} /></div>
                  </div>
                  <div className="berry-card-body">
                    <h2>${fmtMoney(storeReport?.total_sales || 0)}.00</h2>
                    <p>Total Earning</p>
                  </div>
                </div>

                <div className="berry-card berry-bg-blue">
                  <div className="berry-decor-wave">
                     <svg viewBox="0 0 200 100" preserveAspectRatio="none"><path d="M0 50 C 40 10, 60 90, 100 50 C 140 10, 160 90, 200 50 L 200 100 L 0 100 Z" fill="rgba(255,255,255,0.1)"/></svg>
                  </div>
                  <div className="berry-card-header">
                    <div className="berry-icon-box dark blue"><Icon name="history" size={24} /></div>
                  </div>
                  <div className="berry-card-body">
                    <h2>{storeReport?.total_orders || 0}</h2>
                    <p>Total Order</p>
                  </div>
                </div>

                <div className="berry-stat-col">
                  <DashboardSmallCard 
                    label="Avg. Order Value" 
                    value={`$${fmtMoney(storeReport?.average_order || 0)}`} 
                    icon="check" 
                    tone="blue" 
                  />
                  <DashboardSmallCard 
                    label="Total Cancelled" 
                    value={storeReport?.total_cancelled || 0} 
                    icon="cancel" 
                    tone="amber" 
                  />
                </div>
              </div>

              <div className="berry-chart-row">
                <div className="berry-card" style={{ flex: '2 1 600px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: 'var(--berry-text-muted)', fontSize: '14px', fontWeight: '500' }}>Total Growth</div>
                      <h3 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: '700' }}>${fmtMoney(storeReport?.total_sales || 0)}.00</h3>
                    </div>
                    <PeriodButtons days={storeDays} setDays={setStoreDays} />
                  </div>
                  <OverviewSalesBarChart data={storeReport?.trend || []} />
                </div>

                <div className="berry-card" style={{ flex: '1 1 300px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Store Control</h3>
                  </div>
                  
                  <div className="berry-store-control">
                    <div className="status-indicator">
                      <strong>Current Status: </strong>
                      <span style={{ color: dash.IsOpen ? 'var(--berry-green)' : 'var(--berry-red)', fontWeight: '600' }}>
                        {dash.IsOpen ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <button 
                      onClick={toggleStore} 
                      className={`berry-btn ${dash.IsOpen ? 'btn-error' : 'btn-primary'}`}
                      style={{ width: '100%', marginTop: '16px' }}
                    >
                      <Icon name="power" size={18} /> 
                      {dash.IsOpen ? 'Turn Off Orders' : 'Turn On Orders'}
                    </button>
                    
                    <div style={{ marginTop: '32px' }}>
                      <h4 style={{ margin: '0 0 12px', fontSize: '15px' }}>Quick Stats</h4>
                      <div className="berry-list-item">
                        <div>
                          <div className="title">Cancellation Rate</div>
                          <div className="caption">Based on {storeDays} days</div>
                        </div>
                        <div className="value" style={{ color: 'var(--berry-red)' }}>{storeReport?.cancellation_rate || 0}%</div>
                      </div>
                      <hr className="berry-divider" />
                      <div className="berry-list-item">
                        <div>
                          <div className="title">Shop Name</div>
                          <div className="caption">ID: {storeId}</div>
                        </div>
                        <div className="value">{dash.StoreName || 'Loading...'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {page === 'menu' && (
            <div style={{ paddingBottom: '40px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Menu & Stock Management</h3>
                <button 
                  className="berry-btn btn-primary" 
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                  onClick={() => setIsAddModalOpen(true)}
                >
                  <Icon name="plus" size={16} /> Add New Menu
                </button>
              </div>

              {products.length === 0 ? (
                 <div className="berry-card empty-state" style={{ padding: '60px 20px' }}>No products found. Start by adding a new menu.</div>
              ) : (
                <div className="berry-product-grid">
                  {products.map(p => (
                    <div key={p.ProductId} className="berry-product-card">
                      <img 
                        src={p.img || `https://placehold.co/400x300/e3e8ef/697586?text=No+Image`} 
                        alt={p.ProductName} 
                        className="berry-product-img" 
                      />
                      <div className="berry-product-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <h4 className="berry-product-title">{p.ProductName}</h4>
                        </div>
                        <div className="berry-product-price">฿{fmtMoney(p.UnitPrice)}</div>
                        
                        <div>
                          <Badge tone={p.IsOutOfStock ? 'danger' : 'success'}>
                            {p.IsOutOfStock ? 'สินค้าหมด (Out of Stock)' : 'พร้อมขาย (In Stock)'}
                          </Badge>
                        </div>
                        
                        <div className="berry-product-actions">
                          <button 
                            onClick={() => toggleStock(p.ProductId, p.ProductName, p.IsOutOfStock)} 
                            className={`berry-btn-small ${p.IsOutOfStock ? 'btn-primary-light' : 'btn-error-light'}`}
                            style={{ flex: 1 }}
                          >
                            {p.IsOutOfStock ? 'ปรับเป็นพร้อมขาย' : 'ปรับเป็นสินค้าหมด'}
                          </button>
                          <button 
                            className="berry-btn-icon btn-primary-light" 
                            title="Edit"
                            onClick={() => openEditModal(p)}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                          <button 
                            className="berry-btn-icon btn-error-light" 
                            title="Delete"
                            onClick={() => handleDeleteMenu(p.ProductId, p.ProductName)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== STAFF MANAGEMENT PAGE ===== */}
          {page === 'staff' && (
            <div className="berry-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Staff Management</h3>
                <button 
                  className="berry-btn btn-primary" 
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                  onClick={() => setIsStaffModalOpen(true)}
                >
                  <Icon name="plus" size={16} /> Add Staff
                </button>
              </div>

              <div className="berry-table-container">
                <table className="berry-table">
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Username</th>
                      <th>Full Name</th>
                      <th>Role</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.length === 0 && <tr><td colSpan="5" className="empty-state">No staff accounts found.</td></tr>}
                    {staffList.map(s => (
                      <tr key={s.UserId}>
                        <td className="mono muted">#{s.UserId}</td>
                        <td className="bold">{s.Username}</td>
                        <td>{s.FullName}</td>
                        <td>
                          <Badge tone={s.Role === 'Front Staff' ? 'primary' : 'warning'}>
                            {s.Role === 'Front Staff' ? 'หน้าร้าน (Front)' : 'คนครัว (Kitchen)'}
                          </Badge>
                        </td>
                        <td>
                          <button 
                            className="berry-btn-icon btn-error-light" 
                            title="Delete Staff"
                            onClick={() => handleDeleteStaff(s.UserId, s.FullName)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {page === 'history' && (
            <div className="berry-card">
              <div className="berry-card-header-simple">
                <h3>Sales History</h3>
              </div>
              <div className="berry-table-container">
                <table className="berry-table">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Queue No.</th>
                      <th>Items</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 && <tr><td colSpan="5" className="empty-state">No sales history found.</td></tr>}
                    {history.map(h => (
                      <tr key={h.OrderID}>
                        <td className="mono muted">
                          {h.CreatedAt ? new Date(h.CreatedAt).toLocaleString('th-TH') : '-'}
                        </td>
                        <td className="mono" style={{ color: 'var(--berry-purple)', fontWeight: '600' }}>{h.QueueNo}</td>
                        <td>
                          {h.items?.map((item, idx) => (
                            <div key={idx} style={{ fontSize: '13px', marginBottom: '4px', color: 'var(--berry-text-dark)' }}>
                              • {item.ProductName} <span style={{ color: 'var(--berry-text-muted)' }}>(x{item.Qty})</span>
                            </div>
                          ))}
                        </td>
                        <td className="mono bold">${fmtMoney(h.TotalAmount)}</td>
                        <td>
                          <Badge tone={h.Status === 'Completed' ? 'success' : h.Status === 'Cancelled' ? 'danger' : 'warning'}>
                            {getStatusLabel(h.Status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {page === 'cancel' && (
            <div className="berry-card">
              <div className="berry-card-header-simple">
                <h3>Order Cancellations</h3>
              </div>
              <div className="berry-table-container">
                <table className="berry-table">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Queue No.</th>
                      <th>Amount</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancels.length === 0 && <tr><td colSpan="4" className="empty-state">No cancelled orders found.</td></tr>}
                    {cancels.map(c => (
                      <tr key={c.OrderID}>
                        <td className="mono muted">
                          {c.CreatedAt ? new Date(c.CreatedAt).toLocaleString('th-TH') : '-'}
                        </td>
                        <td className="mono" style={{ color: 'var(--berry-purple)', fontWeight: '600' }}>{c.QueueNo}</td>
                        <td className="mono bold">${fmtMoney(c.TotalAmount)}</td>
                        <td style={{ color: 'var(--berry-red)', fontWeight: '500' }}>{c.CancelReason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ===== ADD STAFF MODAL ===== */}
      {isStaffModalOpen && (
        <div className="berry-modal-overlay">
          <div className="berry-modal">
            <h3>Add New Staff</h3>
            <form onSubmit={handleAddStaff}>
              <div className="berry-form-group">
                <label>Username (ชื่อผู้ใช้เข้าสู่ระบบ)</label>
                <input 
                  type="text" 
                  value={newStaff.username} 
                  onChange={e => setNewStaff({...newStaff, username: e.target.value})} 
                  placeholder="เช่น front01"
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label>Password (รหัสผ่าน)</label>
                <input 
                  type="password" 
                  value={newStaff.password} 
                  onChange={e => setNewStaff({...newStaff, password: e.target.value})} 
                  placeholder="รหัสผ่าน"
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label>Full Name (ชื่อ-นามสกุล)</label>
                <input 
                  type="text" 
                  value={newStaff.fullName} 
                  onChange={e => setNewStaff({...newStaff, fullName: e.target.value})} 
                  placeholder="เช่น สมหมาย หน้าร้าน"
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label>Role (ตำแหน่ง)</label>
                <select 
                  className="berry-select"
                  value={newStaff.role} 
                  onChange={e => setNewStaff({...newStaff, role: e.target.value})}
                >
                  <option value="Front Staff">พนักงานหน้าร้าน (Front Staff)</option>
                  <option value="Kitchen Staff">คนครัว (Kitchen Staff)</option>
                </select>
              </div>
              
              <div className="berry-modal-actions">
                <button type="button" className="berry-btn btn-error-light" onClick={() => setIsStaffModalOpen(false)}>Cancel</button>
                <button type="submit" className="berry-btn btn-primary">Save Staff</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== ADD MENU MODAL ===== */}
      {isAddModalOpen && (
        <div className="berry-modal-overlay">
          <div className="berry-modal">
            <h3>Add New Menu</h3>
            <form onSubmit={handleAddMenu}>
              <div className="berry-form-group">
                <label>Menu Name (ชื่อเมนู)</label>
                <input 
                  type="text" 
                  value={newMenu.name} 
                  onChange={e => setNewMenu({...newMenu, name: e.target.value})} 
                  placeholder="เช่น ข้าวกะเพราหมูสับ"
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label>Price (ราคา)</label>
                <input 
                  type="number" 
                  value={newMenu.price} 
                  onChange={e => setNewMenu({...newMenu, price: e.target.value})} 
                  placeholder="0"
                  min="0"
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label style={{ marginBottom: '4px' }}>Image (รูปภาพ) *จำกัด 5 MB</label>
                <ImageUploadZone image={newMenu.img} onChange={(b64) => setNewMenu({...newMenu, img: b64})} />
              </div>
              <div className="berry-modal-actions">
                <button type="button" className="berry-btn btn-error-light" onClick={() => { setIsAddModalOpen(false); setNewMenu({ name: '', price: '', img: '' }); }}>Cancel</button>
                <button type="submit" className="berry-btn btn-primary">Save Menu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== EDIT MENU MODAL ===== */}
      {isEditModalOpen && (
        <div className="berry-modal-overlay">
          <div className="berry-modal">
            <h3>Edit Menu</h3>
            <form onSubmit={handleEditMenuSubmit}>
              <div className="berry-form-group">
                <label>Menu Name (ชื่อเมนู)</label>
                <input 
                  type="text" 
                  value={editMenu.name} 
                  onChange={e => setEditMenu({...editMenu, name: e.target.value})} 
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label>Price (ราคา)</label>
                <input 
                  type="number" 
                  value={editMenu.price} 
                  onChange={e => setEditMenu({...editMenu, price: e.target.value})} 
                  min="0"
                  required 
                />
              </div>
              <div className="berry-form-group">
                <label style={{ marginBottom: '4px' }}>Image (รูปภาพ) *จำกัด 5 MB</label>
                <ImageUploadZone image={editMenu.img} onChange={(b64) => setEditMenu({...editMenu, img: b64})} />
              </div>
              <div className="berry-modal-actions">
                <button type="button" className="berry-btn btn-error-light" onClick={() => setIsEditModalOpen(false)}>Cancel</button>
                <button type="submit" className="berry-btn btn-primary">Update Menu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Toast ===== */}
      <div className={`berry-toast ${toast.show ? 'show' : ''}`}>
        <div className="icon-wrapper"><Icon name="check" size={16} /></div>
        {toast.msg}
      </div>
    </div>
  );
}

/* ============================================================
   BERRY CSS STYLES
   ============================================================ */
const BERRY_STYLES = `
/* --- ซ่อน SCROLLBAR ทั้งหน้าเว็บ --- */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
  display: none;
}
* {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}
body, html {
  overflow: hidden; /* ป้องกันไม่ให้หน้าหลัก (body) เลื่อน */
  margin: 0;
  padding: 0;
}

.berry-root {
  --berry-bg: #F6F7FB;
  --berry-paper: #FFFFFF;
  
  /* Primary (Mapped from Executive Orange) */
  --berry-purple: #FF724C;
  --berry-purple-light: #FFEAE3;
  --berry-purple-dark: #E8552D;
  
  /* Secondary/Deep (Mapped from Executive Navy) */
  --berry-blue: #2A2C41;
  --berry-blue-light: #EDEEF4;
  --berry-blue-dark: #1D1F2F;
  
  /* Typography */
  --berry-text-dark: #2A2C41;
  --berry-text-muted: #8A8FA6;
  --berry-border: #E6E8F0;
  
  /* Status Colors */
  --berry-red: #E2452F;
  --berry-red-light: #FDEAE6;
  --berry-green: #17A673;
  --berry-green-light: #E3F6EE;
  --berry-amber: #E2A430;
  --berry-amber-light: #FFF4DE;

  /* Shadows/Radius */
  --radius-lg: 14px;
  --radius-md: 9px;
  --shadow-sm: 0 2px 10px rgba(42,44,65,0.05);
  
  font-family: 'Roboto', 'Sarabun', sans-serif;
  color: var(--berry-text-dark);
  
  /* FIXED LAYOUT TO PREVENT PAGE SCROLL */
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--berry-bg);
  z-index: 9999; 
}

.berry-root * { box-sizing: border-box; }

/* -------------------------------------------
   Top Header (Topbar)
   ------------------------------------------- */
.berry-topbar {
  height: 80px;
  background: var(--berry-paper);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid var(--berry-border);
  flex-shrink: 0;
  z-index: 110;
}
.berry-topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* Brand Logo Container (Inside Topbar) */
.berry-brand {
  width: 236px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  white-space: nowrap;
}
.brand-title {
  font-size: 20px;
  color: var(--berry-blue);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}
.brand-subtitle {
  font-size: 12px;
  margin-top: 4px;
  color: var(--berry-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--berry-green);
  display: inline-block;
}
.status-text {
  color: var(--berry-green);
  font-weight: 600;
}

/* Topbar Components */
.berry-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.berry-icon-btn.purple-light { background: var(--berry-purple-light); color: var(--berry-purple); }
.berry-icon-btn.purple-light:hover { background: var(--berry-purple); color: white; }
.berry-icon-btn.amber-light { background: var(--berry-amber-light); color: #f59e0b; }
.berry-icon-btn.amber-light:hover { background: #f59e0b; color: white; }

.berry-topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* Profile Dropdown */
.berry-profile-container {
  position: relative;
}
.berry-user-chip {
  background: var(--berry-blue-light);
  padding: 6px 12px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.berry-user-chip:hover {
  background: #d0e8fc;
}
.berry-profile-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  background: var(--berry-paper);
  width: 280px;
  border-radius: var(--radius-lg);
  box-shadow: 0px 8px 24px rgba(0,0,0,0.1);
  border: 1px solid var(--berry-border);
  padding: 20px;
  z-index: 1000;
  animation: slideDown 0.2s ease-out forwards;
}
@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.dropdown-header h4 { margin: 0; font-size: 15px; font-weight: 600; color: var(--berry-text-dark); }
.dropdown-header p { margin: 4px 0 16px; font-size: 13px; color: var(--berry-text-muted); }
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--berry-text-dark);
  transition: background 0.2s;
  margin-bottom: 2px;
}
.dropdown-item:hover { background: var(--berry-purple-light); color: var(--berry-purple); }
.dropdown-badge { margin-left: auto; background: var(--berry-amber-light); color: var(--berry-amber); font-size: 11px; padding: 2px 6px; border-radius: 10px; font-weight: 600; }

/* -------------------------------------------
   Body (Sidebar + Content Container)
   ------------------------------------------- */
.berry-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* -------------------------------------------
   Sidebar 
   ------------------------------------------- */
.berry-sidebar {
  width: 260px;
  background: var(--berry-paper);
  border-right: 1px solid var(--berry-border);
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
  overflow-x: hidden;
  flex-shrink: 0;
}
.berry-nav { padding: 16px; flex: 1; overflow-y: auto; overflow-x: hidden; }
.berry-nav-group { margin-bottom: 24px; }
.berry-nav-label { font-size: 14px; font-weight: 500; color: var(--berry-text-dark); padding: 12px 16px; margin-bottom: 4px; white-space: nowrap; }
.berry-nav-item { display: flex; align-items: center; gap: 16px; padding: 10px 16px; margin-bottom: 8px; border-radius: var(--radius-md); cursor: pointer; color: var(--berry-text-dark); transition: all 0.2s ease; white-space: nowrap; }
.berry-nav-item:hover, .berry-nav-item.active { background: var(--berry-purple-light); color: var(--berry-purple); }
.berry-nav-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.berry-nav-text .title { font-size: 14px; font-weight: 500; }
.berry-nav-text .caption { font-size: 12px; color: var(--berry-text-muted); margin-top: 2px; }
.berry-nav-item:hover .caption, .berry-nav-item.active .caption { color: var(--berry-purple); opacity: 0.8; }
.berry-nav-badge { margin-left: auto; background: var(--berry-blue); color: white; font-size: 12px; padding: 2px 8px; border-radius: 12px; font-weight: bold; }

/* -------------------------------------------
   Sidebar States (Collapsed & Mobile)
   ------------------------------------------- */
@media (min-width: 769px) {
  .berry-sidebar.collapsed { width: 88px; }
  .berry-sidebar.collapsed .hide-on-collapse { display: none !important; }
  .berry-sidebar.collapsed .berry-nav-item { justify-content: center; padding: 12px; }
  .berry-sidebar.collapsed .berry-nav-icon { margin: 0; }
}

@media (max-width: 768px) {
  .berry-sidebar {
    position: fixed;
    left: 0;
    top: 80px; /* ยึดไว้ใต้ Topbar */
    bottom: 0;
    width: 260px !important;
    transform: translateX(-100%);
    box-shadow: none;
  }
  .berry-sidebar.open {
    transform: translateX(0);
    box-shadow: 4px 0 24px rgba(0,0,0,0.1);
  }
  .berry-brand { width: auto; }
}

/* -------------------------------------------
   Main Content Area
   ------------------------------------------- */
.berry-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

/* Dashboard Grid */
.berry-dashboard-grid { display: flex; flex-direction: column; gap: 24px; }
.berry-stat-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
.berry-stat-col { display: flex; flex-direction: column; gap: 24px; }
.berry-chart-row { display: flex; flex-wrap: wrap; gap: 24px; }

/* Cards */
.berry-card { background: var(--berry-paper); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 24px; position: relative; overflow: hidden; }
.berry-card-header-simple h3 { margin: 0 0 20px; font-size: 18px; font-weight: 600; }
.berry-bg-purple { background: var(--berry-purple); color: white; }
.berry-bg-blue { background: var(--berry-blue); color: white; }
.berry-decor-circle-1 { position: absolute; width: 210px; height: 210px; background: var(--berry-purple-dark); border-radius: 50%; top: -85px; right: -95px; opacity: 0.5; }
.berry-decor-circle-2 { position: absolute; width: 210px; height: 210px; background: var(--berry-purple-dark); border-radius: 50%; top: -125px; right: -15px; opacity: 0.5; }
.berry-decor-wave { position: absolute; bottom: 0; right: 0; width: 100%; height: 100%; pointer-events: none; }
.berry-decor-wave svg { width: 100%; height: 100%; }
.berry-icon-box { width: 44px; height: 44px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; margin-bottom: 16px; position: relative; z-index: 2; }
.berry-icon-box.dark { background: var(--berry-purple-dark); }
.berry-icon-box.dark.blue { background: var(--berry-blue-dark); }
.berry-card-body { position: relative; z-index: 2; }
.berry-card-body h2 { margin: 0 0 4px; font-size: 30px; font-weight: 500; }
.berry-card-body p { margin: 0; font-size: 14px; opacity: 0.9; }

/* Small Card */
.berry-small-card { padding: 20px; display: flex; align-items: center; }
.berry-avatar-box { width: 48px; height: 48px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; }
.berry-avatar-box.tone-blue { background: var(--berry-blue-light); color: var(--berry-blue); }
.berry-avatar-box.tone-amber { background: var(--berry-amber-light); color: var(--berry-amber); }

/* Period Buttons */
.berry-period-btn { background: transparent; border: none; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; color: var(--berry-text-muted); cursor: pointer; font-family: inherit; transition: all 0.2s ease; }
.berry-period-btn:hover { color: var(--berry-text-dark); }
.berry-period-btn.active { background: var(--berry-paper); color: var(--berry-text-dark); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

/* -------------------------------------------
   Product Grid (Card Layout)
   ------------------------------------------- */
.berry-product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}
.berry-product-card {
  background: var(--berry-paper);
  border: 1px solid var(--berry-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s, box-shadow 0.2s;
}
.berry-product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.06);
}
.berry-product-img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  background: #f4f6f9;
  border-bottom: 1px solid var(--berry-border);
}
.berry-product-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 12px;
}
.berry-product-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--berry-text-dark);
  line-height: 1.4;
}
.berry-product-price {
  font-size: 18px;
  font-weight: 700;
  color: var(--berry-purple);
}
.berry-product-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--berry-border);
}
.berry-btn-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* -------------------------------------------
   Drag & Drop Upload Zone
   ------------------------------------------- */
.berry-upload-zone {
  border: 2px dashed #b0bec5;
  border-radius: 12px;
  background-color: #f8fafc;
  padding: 24px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}
.berry-upload-zone.dragging {
  border-color: var(--berry-blue);
  background-color: var(--berry-blue-light);
}
.berry-upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.berry-btn-browse {
  background-color: #1565c0;
  color: white;
  border: none;
  padding: 8px 24px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(21, 101, 192, 0.2);
  transition: background-color 0.2s;
}
.berry-btn-browse:hover {
  background-color: #0d47a1;
}
.berry-upload-placeholder p {
  margin: 0;
  font-size: 12px;
  color: #546e7a;
}
.berry-upload-preview-container {
  position: relative;
  width: 100%;
  height: 140px;
  border-radius: 8px;
  overflow: hidden;
}
.berry-upload-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: transparent;
}
.berry-upload-change-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: 500;
  opacity: 0;
  transition: opacity 0.2s;
}
.berry-upload-zone:hover .berry-upload-change-overlay {
  opacity: 1;
}

/* Lists & Tables */
.berry-list-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; }
.berry-list-item .title { font-size: 14px; font-weight: 500; color: var(--berry-text-dark); }
.berry-list-item .caption { font-size: 12px; color: var(--berry-text-muted); }
.berry-list-item .value { font-size: 14px; font-weight: 600; }
.berry-divider { border: none; border-top: 1px solid var(--berry-border); margin: 4px 0; }

.berry-table-container { overflow-x: auto; }
.berry-table { width: 100%; border-collapse: collapse; }
.berry-table th { text-align: left; padding: 16px; font-size: 14px; font-weight: 600; color: var(--berry-text-dark); border-bottom: 1px solid var(--berry-border); }
.berry-table td { padding: 16px; border-bottom: 1px solid var(--berry-border); font-size: 14px; vertical-align: middle; }
.berry-table tr:last-child td { border-bottom: none; }
.berry-table .mono { font-family: 'Roboto', monospace; }
.berry-table .bold { font-weight: 600; }
.berry-table .muted { color: var(--berry-text-muted); font-size: 13px; }
.empty-state { text-align: center; color: var(--berry-text-muted); padding: 32px !important; font-size: 14px; }

/* Buttons */
.berry-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px; border-radius: var(--radius-md); border: none; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all 0.2s ease; }
.btn-primary { background: var(--berry-purple); color: white; }
.btn-primary:hover { background: var(--berry-purple-dark); }
.btn-error { background: var(--berry-red); color: white; }
.btn-error:hover { opacity: 0.9; }

.berry-btn-small { padding: 6px 12px; border-radius: 6px; border: none; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; }
.btn-primary-light { background: var(--berry-purple-light); color: var(--berry-purple); }
.btn-primary-light:hover { background: var(--berry-purple); color: white; }
.btn-error-light { background: var(--berry-red-light); color: var(--berry-red); }
.btn-error-light:hover { background: var(--berry-red); color: white; }

/* Badges */
.berry-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 600; }
.berry-badge.tone-success { background: var(--berry-green-light); color: var(--berry-green); }
.berry-badge.tone-danger { background: var(--berry-red-light); color: var(--berry-red); }
.berry-badge.tone-warning { background: var(--berry-amber-light); color: var(--berry-amber); }
.berry-badge.tone-primary { background: var(--berry-blue-light); color: var(--berry-blue); }

/* Modal */
.berry-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.berry-modal {
  background: var(--berry-paper);
  padding: 24px;
  border-radius: var(--radius-lg);
  width: 440px;
  max-width: 90%;
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
}
.berry-modal h3 {
  margin: 0 0 20px;
  font-size: 18px;
  color: var(--berry-text-dark);
}
.berry-form-group {
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.berry-form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--berry-text-dark);
}
.berry-form-group input[type="text"],
.berry-form-group input[type="password"],
.berry-form-group input[type="number"],
.berry-select {
  padding: 10px 14px;
  border: 1px solid var(--berry-border);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 14px;
  outline: none;
}
.berry-form-group input:focus,
.berry-select:focus {
  border-color: var(--berry-purple);
}
.berry-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

/* Toast */
.berry-toast { position: fixed; bottom: 24px; right: 24px; background: var(--berry-paper); color: var(--berry-text-dark); padding: 12px 20px; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 12px; z-index: 1000; opacity: 0; transform: translateY(20px); pointer-events: none; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid var(--berry-border); }
.berry-toast.show { opacity: 1; transform: translateY(0); }
.berry-toast .icon-wrapper { background: var(--berry-green-light); color: var(--berry-green); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

/* Responsive Grid */
@media (max-width: 1024px) {
  .berry-stat-row { grid-template-columns: 1fr 1fr; }
  .berry-stat-col { grid-column: span 2; flex-direction: row; }
  .berry-stat-col > div { flex: 1; }
}

@media (max-width: 768px) {
  .berry-stat-row { grid-template-columns: 1fr; }
  .berry-stat-col { grid-column: span 1; flex-direction: column; }
}
`;