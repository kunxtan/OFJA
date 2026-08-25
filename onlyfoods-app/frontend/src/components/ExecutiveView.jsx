// ใหม่
import React, { useEffect, useState } from 'react';

function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const normalized = String(value).trim().replace(' ', 'T');
  const alreadyHasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);

  // MySQL/Docker ส่ง DATETIME ที่บันทึกแบบ UTC มาโดยไม่มีตัว Z
  // เติม Z เพื่อให้ browser แปลงเป็นเวลาท้องถิ่น เช่น Asia/Bangkok (+07:00)
  const parsed = new Date(
    alreadyHasTimezone ? normalized : `${normalized}Z`
  );

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
    const correctStore = storeId === null ||
      String(order.StoreId) === String(storeId);
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

function buildOverviewReport(orders, dashboard, days) {
  const periodOrders = ordersInsidePeriod(orders, days);
  const completed = periodOrders.filter(order => orderIs(order, 'Completed'));
  const cancelled = periodOrders.filter(order => orderIs(order, 'Cancelled'));
  const finishedCount = completed.length + cancelled.length;

  const stores = (dashboard || []).map(store => {
    const storeOrders = periodOrders.filter(
      order => String(order.StoreId) === String(store.StoreId)
    );
    const storeCompleted = storeOrders.filter(order => orderIs(order, 'Completed'));
    return {
      ...store,
      sales: storeCompleted.reduce(
        (sum, order) => sum + Number(order.TotalAmount || 0), 0
      ),
      completed_orders: storeCompleted.length,
      cancelled_orders: storeOrders.filter(order => orderIs(order, 'Cancelled')).length
    };
  }).sort((a, b) => b.sales - a.sales);

  return {
    total_sales: completed.reduce(
      (sum, order) => sum + Number(order.TotalAmount || 0), 0
    ),
    total_orders: completed.length,
    total_cancelled: cancelled.length,
    cancellation_rate: finishedCount
      ? Number(((cancelled.length / finishedCount) * 100).toFixed(1))
      : 0,
    total_stores: dashboard.length,
    trend: buildTrend(completed, days),
    stores
  };
}

function buildStoreReport(orders, store, storeId, days) {
  const periodOrders = ordersInsidePeriod(orders, days, storeId);
  const completed = periodOrders.filter(order => orderIs(order, 'Completed'));
  const cancelled = periodOrders.filter(order => orderIs(order, 'Cancelled'));
  const totalSales = completed.reduce(
    (sum, order) => sum + Number(order.TotalAmount || 0), 0
  );
  const finishedCount = completed.length + cancelled.length;

  return {
    store_id: storeId,
    store_name: store?.StoreName || '',
    total_sales: totalSales,
    total_orders: completed.length,
    total_cancelled: cancelled.length,
    average_order: completed.length ? totalSales / completed.length : 0,
    cancellation_rate: finishedCount
      ? Number(((cancelled.length / finishedCount) * 100).toFixed(1))
      : 0,
    trend: buildTrend(completed, days)
  };
}

export default function ExecutiveView({ apiBase, user }) {
  const [dashboard, setDashboard] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedStoreDashboard, setSelectedStoreDashboard] =
    useState(null);

  const [newStoreName, setNewStoreName] = useState('');
  const [editingStoreId, setEditingStoreId] = useState(null);
  const [editingStoreName, setEditingStoreName] = useState('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [foodCourtOpen, setFoodCourtOpen] = useState(true);
  const [changingFoodCourt, setChangingFoodCourt] = useState(false);
  const [overviewDays, setOverviewDays] = useState(1);
  const [overviewReport, setOverviewReport] = useState({
    total_sales: 0,
    total_orders: 0,
    total_cancelled: 0,
    cancellation_rate: 0,
    total_stores: 0,
    trend: [],
    stores: []
  });
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [storeDays, setStoreDays] = useState(1);
  const [storeReport, setStoreReport] = useState({
    store_id: null,
    store_name: '',
    total_sales: 0,
    total_orders: 0,
    total_cancelled: 0,
    average_order: 0,
    cancellation_rate: 0,
    trend: []
  });
  const [storeReportLoading, setStoreReportLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeMenu, setActiveMenu] = useState('overview');
  const [searchText, setSearchText] = useState('');

const fetchFoodCourtStatus = async () => {
  try {
    const response = await fetch(
      `${apiBase}/api/food-court/status`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || 'โหลดสถานะศูนย์อาหารไม่สำเร็จ'
      );
    }

    setFoodCourtOpen(data.is_open);
  } catch (err) {
    setError(err.message);
  }
};

  useEffect(() => {
    fetchFoodCourtStatus();
  }, [apiBase]);

  const goPage = (pageId) => {
    setActiveMenu(pageId);
  };

  const accountName =
    user?.FullName || user?.name || user?.Username || 'ผู้บริหาร';
  const accountRole = user?.Role || user?.role || 'Executive';
  const filteredDashboard = dashboard.filter(store =>
    String(store.StoreName || '')
      .toLowerCase()
      .includes(searchText.trim().toLowerCase())
  );
  const pageTitle = {
    overview: ['ภาพรวมศูนย์อาหาร', 'สรุปยอดขายและการดำเนินงานของ Only Foods'],
    'store-dashboard': ['ยอดขายรายร้าน', 'เลือกดูข้อมูลและแนวโน้มยอดขายของร้านค้าแต่ละร้าน'],
    'store-management': ['จัดการร้านค้า', 'เพิ่ม แก้ไข และควบคุมสถานะร้านค้าภายในศูนย์อาหาร']
  }[activeMenu];

  // ใช้ API เดิมของโปรเจกต์ แล้วคำนวณรายงานใน ExecutiveView เท่านั้น
  const fetchOrdersForReports = async (showLoading = true) => {
    if (showLoading) setOverviewLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/orders`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'โหลดรายการออเดอร์ไม่สำเร็จ');
      }
      setAllOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'เชื่อมต่อรายงานยอดขายไม่สำเร็จ');
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();

    const interval = setInterval(() => {
      fetchDashboard(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [apiBase]);

  useEffect(() => {
    if (selectedStoreId) {
      fetchSingleStoreDashboard(selectedStoreId);
    } else {
      setSelectedStoreDashboard(null);
      setStoreReport({
        store_id: null,
        store_name: '',
        total_sales: 0,
        total_orders: 0,
        total_cancelled: 0,
        average_order: 0,
        cancellation_rate: 0,
        trend: []
      });
    }
  }, [selectedStoreId, apiBase]);

  useEffect(() => {
    setOverviewReport(
      buildOverviewReport(allOrders, dashboard, overviewDays)
    );
  }, [allOrders, dashboard, overviewDays]);

  useEffect(() => {
    if (!selectedStoreId) return;
    setStoreReportLoading(true);
    const selectedStore = dashboard.find(
      store => String(store.StoreId) === String(selectedStoreId)
    );
    setStoreReport(
      buildStoreReport(allOrders, selectedStore, selectedStoreId, storeDays)
    );
    setStoreReportLoading(false);
  }, [allOrders, dashboard, selectedStoreId, storeDays]);

  useEffect(() => {
    fetchOrdersForReports();
    const interval = setInterval(() => fetchOrdersForReports(false), 5000);
    return () => clearInterval(interval);
  }, [apiBase]);

  // ดึงแดชบอร์ดรวมและรายชื่อร้านทั้งหมด
  const fetchDashboard = async (showError = true) => {
    try {
      const response = await fetch(
        `${apiBase}/api/reports/dashboard`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || 'ไม่สามารถโหลดข้อมูลร้านค้าได้'
        );
      }

      setDashboard(data);
    } catch (err) {
      if (showError) {
        setError(err.message);
      }
    }
  };

  // ดึงแดชบอร์ดเฉพาะร้านที่เลือก
  const fetchSingleStoreDashboard = async (storeId) => {
    try {
      const response = await fetch(
        `${apiBase}/api/reports/dashboard?store_id=${storeId}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || 'ไม่สามารถโหลดแดชบอร์ดร้านได้'
        );
      }

      setSelectedStoreDashboard(
        data.length > 0 ? data[0] : null
      );
    } catch (err) {
      setError(err.message);
    }
  };

  // เพิ่มร้านค้า
  const addStore = async (event) => {
    event.preventDefault();

    setMessage('');
    setError('');

    if (!newStoreName.trim()) {
      setError('กรุณากรอกชื่อร้านค้า');
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${apiBase}/api/stores`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            store_name: newStoreName
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || 'เพิ่มร้านค้าไม่สำเร็จ'
        );
      }

      setNewStoreName('');
      setMessage('เพิ่มร้านค้าเรียบร้อยแล้ว');

      await fetchDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // เริ่มแก้ไขร้าน
  const startEditing = (store) => {
    setEditingStoreId(store.StoreId);
    setEditingStoreName(store.StoreName);
    setMessage('');
    setError('');
  };

  // ยกเลิกการแก้ไข
  const cancelEditing = () => {
    setEditingStoreId(null);
    setEditingStoreName('');
  };

  // บันทึกชื่อร้านใหม่
  const saveStoreEdit = async (storeId) => {
    setMessage('');
    setError('');

    if (!editingStoreName.trim()) {
      setError('กรุณากรอกชื่อร้านค้า');
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${apiBase}/api/stores/${storeId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            store_name: editingStoreName
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || 'แก้ไขร้านค้าไม่สำเร็จ'
        );
      }

      setEditingStoreId(null);
      setEditingStoreName('');
      setMessage('แก้ไขข้อมูลร้านค้าเรียบร้อยแล้ว');

      await fetchDashboard();

      if (String(selectedStoreId) === String(storeId)) {
        await fetchSingleStoreDashboard(storeId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // เปิดหรือปิดร้าน
  const toggleStore = async (storeId) => {
    setMessage('');
    setError('');

    try {
      const response = await fetch(
        `${apiBase}/api/stores/${storeId}/toggle`,
        {
          method: 'PUT'
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || 'เปลี่ยนสถานะร้านไม่สำเร็จ'
        );
      }

      setMessage('เปลี่ยนสถานะเปิด–ปิดร้านเรียบร้อยแล้ว');

      await fetchDashboard();

      if (String(selectedStoreId) === String(storeId)) {
        await fetchSingleStoreDashboard(storeId);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // ระงับหรือปลดระงับร้าน
  const suspendStore = async (storeId) => {
    setMessage('');
    setError('');

    try {
      const response = await fetch(
        `${apiBase}/api/stores/${storeId}/suspend`,
        {
          method: 'PUT'
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || 'เปลี่ยนสิทธิ์ร้านไม่สำเร็จ'
        );
      }

      setMessage('เปลี่ยนสถานะสิทธิ์ร้านเรียบร้อยแล้ว');

      await fetchDashboard();

      if (String(selectedStoreId) === String(storeId)) {
        await fetchSingleStoreDashboard(storeId);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const grandTotal = dashboard.reduce(
    (total, store) => total + Number(store.net_sales || 0),
    0
  );

  const totalOrders = dashboard.reduce(
    (total, store) => total + Number(store.total_orders || 0),
    0
  );


  // เปิดปิดศูนย์
  const toggleFoodCourt = async () => {
  const actionText = foodCourtOpen
    ? 'ปิดศูนย์อาหาร'
    : 'เปิดศูนย์อาหาร';

  const confirmed = window.confirm(
    `ยืนยันว่าต้องการ${actionText}หรือไม่?`
  );

  if (!confirmed) {
    return;
  }

  setMessage('');
  setError('');
  setChangingFoodCourt(true);

  try {
    const response = await fetch(
      `${apiBase}/api/food-court/toggle`,
      {
        method: 'PUT'
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || `${actionText}ไม่สำเร็จ`
      );
    }

    setFoodCourtOpen(data.is_open);
    setMessage(data.message);
  } catch (err) {
    setError(err.message);
  } finally {
    setChangingFoodCourt(false);
  }
};

  return (
    <div style={executiveShellStyle}>
      {sidebarOpen && (
        <aside style={sidebarStyle}>
          <div style={brandStyle}>
            <div style={brandIconStyle}>OF</div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '17px' }}>OF Executive</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Only Foods · ผู้บริหาร</div>
            </div>
          </div>

          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 'bold', margin: '22px 10px 8px' }}>เมนูหลัก</div>
          <SidebarButton active={activeMenu === 'overview'} icon="▦" label="ภาพรวมศูนย์อาหาร" onClick={() => goPage('overview')} />
          <SidebarButton active={activeMenu === 'store-dashboard'} icon="↗" label="ยอดขายรายร้าน" onClick={() => goPage('store-dashboard')} />
          <SidebarButton active={activeMenu === 'store-management'} icon="▤" label="จัดการร้านค้า" onClick={() => goPage('store-management')} />

          <div style={sidebarAccountStyle}>
            <div style={avatarStyle}>{String(accountName).charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{accountName}</div>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>{accountRole}</div>
            </div>
          </div>
        </aside>
      )}

      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={topbarStyle}>
          <button type="button" onClick={() => setSidebarOpen(open => !open)} style={menuToggleStyle}>☰</button>
          <div style={topSearchWrapStyle}>
            <span style={{ color: '#94a3b8' }}>⌕</span>
            <input
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              placeholder="ค้นหาร้านค้า..."
              style={topSearchInputStyle}
            />
          </div>
          <div style={topAccountStyle}>
            <div style={topAvatarStyle}>{String(accountName).charAt(0).toUpperCase()}</div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{accountName}</div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>{accountRole}</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#f1f5f9', padding: '22px', minHeight: '100vh', color: '#0f172a' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '28px', color: '#082f49' }}>{pageTitle[0]}</h2>
            <div style={{ color: '#64748b', marginTop: '5px' }}>{pageTitle[1]}</div>
          </div>

      {message && (
        <div style={successStyle}>
          {message}
        </div>
      )}

      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}

      {activeMenu === 'overview' && (
        <>
      <div
  style={{
    background: 'white',
    border: foodCourtOpen
      ? '1px solid #86efac'
      : '1px solid #fca5a5',
    padding: '20px',
    borderRadius: '14px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '15px',
    boxShadow: '0 2px 12px rgba(15,23,42,0.06)'
  }}
>
  <div>
    <h3 style={{ margin: '0 0 6px' }}>
      การควบคุมศูนย์อาหาร
    </h3>

    <div
      style={{
        color: foodCourtOpen ? '#166534' : '#991b1b',
        fontWeight: 'bold'
      }}
    >
      สถานะปัจจุบัน:{' '}
      {foodCourtOpen
        ? 'เปิดให้บริการ'
        : 'ปิดให้บริการ'}
    </div>

    {!foodCourtOpen && (
      <small style={{ color: '#991b1b' }}>
        ลูกค้าจะไม่สามารถสร้างออเดอร์ใหม่ได้
      </small>
    )}
  </div>

  <button
    type="button"
    onClick={toggleFoodCourt}
    disabled={changingFoodCourt}
    style={{
      padding: '11px 18px',
      background: foodCourtOpen ? '#dc2626' : '#16a34a',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: changingFoodCourt
        ? 'default'
        : 'pointer',
      fontWeight: 'bold'
    }}
  >
    {changingFoodCourt
      ? 'กำลังบันทึก...'
      : foodCourtOpen
        ? 'ปิดศูนย์อาหาร'
        : 'เปิดศูนย์อาหาร'}
  </button>
</div>

      <OverviewSalesDashboard
        days={overviewDays}
        setDays={setOverviewDays}
        report={overviewReport}
        loading={overviewLoading}
      />
        </>
      )}

      {/* ดูแดชบอร์ดแยกร้าน */}
      {activeMenu === 'store-dashboard' && (
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>
          ดูแดชบอร์ดแยกร้าน
        </h3>

        <select
          value={selectedStoreId}
          onChange={(event) =>
            setSelectedStoreId(event.target.value)
          }
          style={inputStyle}
        >
          <option value="">
            -- เลือกร้านค้าที่ต้องการดู --
          </option>

          {dashboard.map((store) => (
            <option
              key={store.StoreId}
              value={store.StoreId}
            >
              {store.StoreName}
            </option>
          ))}
        </select>

        {selectedStoreDashboard && (
          <div style={storeDashboardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0 }}>{selectedStoreDashboard.StoreName}</h3>
                <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>แสดงเฉพาะออเดอร์สำเร็จของร้านนี้</div>
              </div>
              <PeriodButtons days={storeDays} setDays={setStoreDays} />
            </div>

            <div style={detailGridStyle}>
              <DashboardDetail
                label={storeDays === 1 ? 'ยอดขายวันนี้' : `ยอดขาย ${storeDays} วัน`}
                value={`${Number(storeReport.total_sales || 0).toLocaleString()} บาท`}
              />

              <DashboardDetail
                label={storeDays === 1 ? 'ออเดอร์สำเร็จวันนี้' : `ออเดอร์สำเร็จ ${storeDays} วัน`}
                value={`${Number(storeReport.total_orders || 0).toLocaleString()} ออเดอร์`}
              />

              <DashboardDetail
                label="ออเดอร์ยกเลิก"
                value={`${Number(storeReport.total_cancelled || 0).toLocaleString()} ออเดอร์`}
              />

              <DashboardDetail
                label="ยอดเฉลี่ยต่อออเดอร์"
                value={`${Number(storeReport.average_order || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} บาท`}
              />

              <DashboardDetail
                label="อัตราการยกเลิก"
                value={`${Number(storeReport.cancellation_rate || 0).toLocaleString()}%`}
              />

              <DashboardDetail
                label="สถานะร้าน"
                value={
                  selectedStoreDashboard.IsOpen
                    ? 'เปิดให้บริการ'
                    : 'ปิดให้บริการ'
                }
              />

              <DashboardDetail
                label="สถานะสิทธิ์"
                value={
                  selectedStoreDashboard.IsSuspended
                    ? 'ถูกระงับสิทธิ์'
                    : 'ใช้งานปกติ'
                }
              />
            </div>

            <div style={{ marginTop: '18px', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', background: 'white' }}>
              <h4 style={{ margin: '0 0 4px' }}>กราฟยอดขายของ {selectedStoreDashboard.StoreName}</h4>
              <div style={{ color: '#64748b', fontSize: '12px' }}>
                {storeDays === 1 ? 'ยอดขายแยกตามชั่วโมงของวันนี้' : `ยอดขายแยกตามวัน ย้อนหลัง ${storeDays} วัน`}
              </div>
              {storeReportLoading
                ? <div style={{ minHeight: '250px', display: 'grid', placeItems: 'center', color: '#64748b' }}>กำลังโหลดข้อมูล...</div>
                : <OverviewSalesBarChart data={storeReport.trend || []} />}
            </div>
          </div>
        )}
      </div>
      )}

      {/* ฟอร์มเพิ่มร้าน */}
      {activeMenu === 'store-management' && (
      <>
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>
          เพิ่มร้านค้าใหม่
        </h3>

        <form
          onSubmit={addStore}
          style={addFormStyle}
        >
          <input
            type="text"
            required
            placeholder="กรอกชื่อร้านค้า"
            value={newStoreName}
            onChange={(event) =>
              setNewStoreName(event.target.value)
            }
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={saving}
            style={addButtonStyle}
          >
            {saving ? 'กำลังบันทึก...' : '+ เพิ่มร้านค้า'}
          </button>
        </form>
      </div>

      {/* ตารางร้านทั้งหมด */}
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>
          ตารางรายชื่อร้านค้า
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeaderStyle}>
                <th style={cellStyle}>ID</th>
                <th style={cellStyle}>ชื่อร้าน</th>
                <th style={cellStyle}>สถานะเปิดร้าน</th>
                <th style={cellStyle}>สถานะสิทธิ์</th>
                <th style={cellStyle}>ยอดขาย</th>
                <th style={cellStyle}>ออเดอร์</th>
                <th style={cellStyle}>จัดการ</th>
              </tr>
            </thead>

            <tbody>
              {filteredDashboard.map((store) => (
                <tr
                  key={store.StoreId}
                  style={tableRowStyle}
                >
                  <td style={cellStyle}>
                    {store.StoreId}
                  </td>

                  <td style={cellStyle}>
                    {editingStoreId === store.StoreId ? (
                      <input
                        value={editingStoreName}
                        onChange={(event) =>
                          setEditingStoreName(
                            event.target.value
                          )
                        }
                        style={smallInputStyle}
                      />
                    ) : (
                      <strong>{store.StoreName}</strong>
                    )}
                  </td>

                  <td style={cellStyle}>
                    <span
                      style={{
                        color: store.IsOpen
                          ? '#15803d'
                          : '#64748b',
                        fontWeight: 'bold'
                      }}
                    >
                      {store.IsOpen ? 'เปิด' : 'ปิด'}
                    </span>
                  </td>

                  <td style={cellStyle}>
                    <span
                      style={{
                        color: store.IsSuspended
                          ? '#dc2626'
                          : '#15803d',
                        fontWeight: 'bold'
                      }}
                    >
                      {store.IsSuspended
                        ? 'ถูกระงับ'
                        : 'ปกติ'}
                    </span>
                  </td>

                  <td style={cellStyle}>
                    {Number(
                      store.net_sales || 0
                    ).toLocaleString()} บาท
                  </td>

                  <td style={cellStyle}>
                    {store.total_orders || 0}
                  </td>

                  <td style={cellStyle}>
                    {editingStoreId === store.StoreId ? (
                      <>
                        <button
                          onClick={() =>
                            saveStoreEdit(store.StoreId)
                          }
                          style={saveButtonStyle}
                        >
                          บันทึก
                        </button>

                        <button
                          onClick={cancelEditing}
                          style={cancelButtonStyle}
                        >
                          ยกเลิก
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() =>
                            startEditing(store)
                          }
                          style={editButtonStyle}
                        >
                          แก้ไข
                        </button>

                        <button
                          onClick={() =>
                            toggleStore(store.StoreId)
                          }
                          style={
                            store.IsOpen
                              ? closeButtonStyle
                              : openButtonStyle
                          }
                        >
                          {store.IsOpen
                            ? 'ปิดร้าน'
                            : 'เปิดร้าน'}
                        </button>

                        <button
                          onClick={() =>
                            suspendStore(store.StoreId)
                          }
                          style={
                            store.IsSuspended
                              ? unsuspendButtonStyle
                              : suspendButtonStyle
                          }
                        >
                          {store.IsSuspended
                            ? 'ปลดระงับ'
                            : 'ระงับสิทธิ์'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}

              {filteredDashboard.length === 0 && (
                <tr>
                  <td
                    colSpan="7"
                    style={{
                      ...cellStyle,
                      textAlign: 'center',
                      color: '#64748b'
                    }}
                  >
                    ยังไม่มีร้านค้าในระบบ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
        </div>
      </main>
    </div>
  );
}

function SidebarButton({ active, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: '11px 12px',
        marginBottom: '5px',
        border: active ? '1px solid rgba(45,212,191,0.35)' : '1px solid transparent',
        borderRadius: '9px',
        background: active ? '#0f5967' : 'transparent',
        color: active ? 'white' : '#cbd5e1',
        cursor: 'pointer',
        textAlign: 'left',
        fontWeight: active ? 'bold' : 'normal'
      }}
    >
      <span style={{ width: '19px', textAlign: 'center', color: active ? '#5eead4' : '#94a3b8' }}>{icon}</span>
      {label}
    </button>
  );
}

function OverviewSalesDashboard({ days, setDays, report, loading }) {
  const periodLabel = days === 1 ? 'วันนี้' : `${days} วันย้อนหลัง`;
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f172a' }}>Dashboard</h3>
          <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>ข้อมูลจริงจากฐานข้อมูล · {periodLabel}</div>
        </div>
        <PeriodButtons days={days} setDays={setDays} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '18px' }}>
        <OverviewMetricCard title="ยอดขายสุทธิรวม" value={`${Number(report.total_sales || 0).toLocaleString()} บาท`} color="#0f766e" background="white" />
        <OverviewMetricCard title="ออเดอร์สำเร็จ" value={`${Number(report.total_orders || 0).toLocaleString()} ออเดอร์`} color="#0369a1" background="white" />
        <OverviewMetricCard title="ออเดอร์ที่ยกเลิก" value={`${Number(report.total_cancelled || 0).toLocaleString()} ออเดอร์`} color="#dc2626" background="white" />
        <OverviewMetricCard title="อัตราการยกเลิก" value={`${Number(report.cancellation_rate || 0).toLocaleString()}%`} color="#be123c" background="white" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: '16px', marginBottom: '18px' }}>
        <div style={chartPanelStyle}>
          <h4 style={{ margin: '0 0 4px' }}>ยอดขาย{days === 1 ? 'รายชั่วโมง' : 'รายวัน'}</h4>
          <div style={{ color: '#64748b', fontSize: '12px' }}>{days === 1 ? 'ช่วงเวลาใดยอดขายสูง กราฟจะแสดงแท่งสูงขึ้น' : `ยอดขายแต่ละวันย้อนหลัง ${days} วัน`}</div>
          {loading ? <ChartLoading /> : <OverviewSalesBarChart data={report.trend || []} />}
        </div>

        <div style={chartPanelStyle}>
          <h4 style={{ margin: '0 0 4px' }}>ยอดขายแยกร้าน</h4>
          <div style={{ color: '#64748b', fontSize: '12px' }}>เปรียบเทียบยอดขายของแต่ละร้านในช่วงเดียวกัน</div>
          {loading ? <ChartLoading /> : <StoreComparisonChart stores={report.stores || []} />}
        </div>
      </div>

      <div style={chartPanelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h4 style={{ margin: 0 }}>สรุปผลแต่ละร้าน</h4>
            <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>ทั้งหมด {Number(report.total_stores || 0).toLocaleString()} ร้าน</div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr style={tableHeaderStyle}><th style={cellStyle}>ร้านค้า</th><th style={cellStyle}>ออเดอร์สำเร็จ</th><th style={cellStyle}>ยอดขาย</th><th style={cellStyle}>ยกเลิก</th><th style={cellStyle}>สถานะ</th></tr></thead>
            <tbody>
              {(report.stores || []).map(store => (
                <tr key={store.StoreId} style={tableRowStyle}>
                  <td style={cellStyle}><strong>{store.StoreName}</strong></td>
                  <td style={cellStyle}>{Number(store.completed_orders || 0).toLocaleString()}</td>
                  <td style={cellStyle}>{Number(store.sales || 0).toLocaleString()} บาท</td>
                  <td style={cellStyle}>{Number(store.cancelled_orders || 0).toLocaleString()}</td>
                  <td style={cellStyle}><StatusBadge store={store} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChartLoading() {
  return <div style={{ minHeight: '250px', display: 'grid', placeItems: 'center', color: '#64748b' }}>กำลังโหลดข้อมูล...</div>;
}

function StatusBadge({ store }) {
  const suspended = Boolean(store.IsSuspended);
  const open = Boolean(store.IsOpen);
  const text = suspended ? 'ระงับสิทธิ์' : open ? 'เปิดบริการ' : 'ปิดร้าน';
  const color = suspended ? '#b91c1c' : open ? '#047857' : '#475569';
  const background = suspended ? '#fee2e2' : open ? '#d1fae5' : '#e2e8f0';
  return <span style={{ color, background, padding: '5px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 'bold' }}>{text}</span>;
}

function StoreComparisonChart({ stores }) {
  const rows = (stores || []).slice(0, 8);
  if (!rows.length) return <div style={{ minHeight: '250px', display: 'grid', placeItems: 'center', color: '#64748b' }}>ยังไม่มีร้านค้า</div>;
  const maxValue = Math.max(...rows.map(store => Number(store.sales || 0)), 1);
  return (
    <div style={{ minHeight: '250px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px', marginTop: '14px' }}>
      {rows.map((store, index) => {
        const sales = Number(store.sales || 0);
        return (
          <div key={store.StoreId}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', marginBottom: '5px' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '62%' }}>{store.StoreName}</span>
              <strong>{sales.toLocaleString()} บาท</strong>
            </div>
            <div style={{ height: '12px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max((sales / maxValue) * 100, sales > 0 ? 3 : 0)}%`, background: ['#0f766e', '#2563eb', '#d97706', '#7c3aed'][index % 4], borderRadius: '999px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PeriodButtons({ days, setDays }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {[1, 7, 14, 30].map(value => (
        <button
          key={value}
          type="button"
          onClick={() => setDays(value)}
          style={{
            padding: '9px 15px',
            border: '1px solid #c7d2fe',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            background: days === value ? '#4f46e5' : 'white',
            color: days === value ? 'white' : '#334155'
          }}
        >
          {value === 1 ? 'วันนี้' : `${value} วัน`}
        </button>
      ))}
    </div>
  );
}

function OverviewMetricCard({ title, value, color, background }) {
  return (
    <div style={{ padding: '19px', borderRadius: '12px', background, border: '1px solid rgba(148,163,184,0.18)' }}>
      <div style={{ color: '#475569', fontSize: '13px', fontWeight: 'bold' }}>{title}</div>
      <div style={{ color, fontSize: '25px', fontWeight: 'bold', marginTop: '7px' }}>{value}</div>
    </div>
  );
}

function OverviewSalesBarChart({ data }) {
  if (!data || data.length === 0) {
    return <div style={{ minHeight: '250px', display: 'grid', placeItems: 'center', color: '#64748b' }}>ช่วงเวลานี้ยังไม่มียอดขายสำเร็จ</div>;
  }
  const width = 850, height = 300, left = 65, right = 20, top = 30, bottom = 50;
  const graphWidth = width - left - right, graphHeight = height - top - bottom;
  const values = data.map(item => Number(item.sales || 0));
  const maxValue = Math.max(...values, 1);
  const slotWidth = graphWidth / data.length;
  const barWidth = Math.min(44, slotWidth * 0.62);
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const shortNumber = value => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value / 1000)}K` : Math.round(value).toString();

  return (
    <div style={{ overflowX: 'auto', marginTop: '12px' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: '620px', display: 'block' }}>
        {[0, 1, 2, 3, 4].map(line => {
          const ratio = line / 4, y = top + graphHeight * ratio, amount = maxValue * (1 - ratio);
          return <g key={line}><line x1={left} x2={width-right} y1={y} y2={y} stroke="#e5e7eb"/><text x={left-10} y={y+4} textAnchor="end" fontSize="11" fill="#64748b">{shortNumber(amount)}</text></g>;
        })}
        {data.map((item, index) => {
          const sales = Number(item.sales || 0), barHeight = (sales / maxValue) * graphHeight;
          const x = left + index * slotWidth + (slotWidth - barWidth) / 2, y = top + graphHeight - barHeight;
          const showLabel = index % labelStep === 0 || index === data.length - 1;
          return <g key={`${item.label}-${index}`}><rect x={x} y={y} width={barWidth} height={Math.max(barHeight,2)} rx="5" fill="#168a86"><title>{item.label}: {sales.toLocaleString()} บาท</title></rect>{sales > 0 && <text x={x+barWidth/2} y={Math.max(y-7,12)} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0f766e">{shortNumber(sales)}</text>}{showLabel && <text x={x+barWidth/2} y={height-18} textAnchor="middle" fontSize="11" fill="#64748b">{item.label}</text>}</g>;
        })}
        <line x1={left} x2={width-right} y1={top+graphHeight} y2={top+graphHeight} stroke="#cbd5e1"/>
      </svg>
    </div>
  );
}

function DashboardDetail({ label, value }) {
  return (
    <div style={detailCardStyle}>
      <div style={{ color: '#64748b', fontSize: '13px' }}>
        {label}
      </div>

      <div
        style={{
          marginTop: '6px',
          fontSize: '20px',
          fontWeight: 'bold'
        }}
      >
        {value}
      </div>
    </div>
  );
}

const executiveShellStyle = {
  display: 'flex',
  alignItems: 'stretch',
  width: '100%',
  minHeight: '100vh',
  background: '#f1f5f9'
};

const sidebarStyle = {
  width: '235px',
  minWidth: '235px',
  minHeight: '100vh',
  padding: '18px 14px',
  boxSizing: 'border-box',
  background: 'linear-gradient(180deg, #082f49 0%, #0b2940 100%)',
  color: 'white',
  position: 'sticky',
  top: 0,
  alignSelf: 'flex-start',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 20
};

const brandStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 5px 17px',
  borderBottom: '1px solid rgba(148,163,184,0.18)'
};

const brandIconStyle = {
  width: '38px',
  height: '38px',
  display: 'grid',
  placeItems: 'center',
  borderRadius: '10px',
  background: '#0d9488',
  color: 'white',
  fontWeight: 'bold'
};

const sidebarAccountStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginTop: 'auto',
  padding: '15px 5px 4px',
  borderTop: '1px solid rgba(148,163,184,0.18)'
};

const avatarStyle = {
  width: '34px',
  height: '34px',
  minWidth: '34px',
  display: 'grid',
  placeItems: 'center',
  borderRadius: '50%',
  background: '#0f766e',
  color: 'white',
  fontWeight: 'bold'
};

const topbarStyle = {
  minHeight: '68px',
  padding: '10px 22px',
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  background: 'white',
  borderBottom: '1px solid #e2e8f0',
  position: 'sticky',
  top: 0,
  zIndex: 15,
  boxSizing: 'border-box'
};

const menuToggleStyle = {
  width: '38px',
  height: '38px',
  border: '1px solid #cbd5e1',
  borderRadius: '9px',
  background: 'white',
  color: '#0f172a',
  cursor: 'pointer',
  fontSize: '18px'
};

const topSearchWrapStyle = {
  width: 'min(420px, 50%)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '9px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  background: '#f8fafc'
};

const topSearchInputStyle = {
  width: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: '#0f172a'
};

const topAccountStyle = {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  padding: '7px 11px',
  border: '1px solid #e2e8f0',
  borderRadius: '999px',
  background: 'white'
};

const topAvatarStyle = {
  width: '32px',
  height: '32px',
  display: 'grid',
  placeItems: 'center',
  borderRadius: '50%',
  background: '#0f766e',
  color: 'white',
  fontWeight: 'bold'
};

const sectionStyle = {
  background: 'white',
  padding: '20px',
  borderRadius: '14px',
  marginBottom: '20px',
  boxShadow: '0 2px 12px rgba(15,23,42,0.06)'
};

const chartPanelStyle = {
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: '14px',
  padding: '18px',
  boxShadow: '0 2px 10px rgba(15,23,42,0.04)'
};

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '15px',
  marginBottom: '20px'
};

const darkCardStyle = {
  background: '#0f172a',
  color: 'white',
  padding: '22px',
  borderRadius: '12px'
};

const blueCardStyle = {
  background: '#1d4ed8',
  color: 'white',
  padding: '22px',
  borderRadius: '12px'
};

const purpleCardStyle = {
  background: '#7e22ce',
  color: 'white',
  padding: '22px',
  borderRadius: '12px'
};

const cardLabelStyle = {
  color: '#e2e8f0',
  fontSize: '14px'
};

const greenValueStyle = {
  color: '#4ade80',
  fontSize: '28px',
  fontWeight: 'bold',
  marginTop: '8px'
};

const whiteValueStyle = {
  color: 'white',
  fontSize: '28px',
  fontWeight: 'bold',
  marginTop: '8px'
};

const addFormStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '10px'
};

const inputStyle = {
  width: '100%',
  padding: '10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  boxSizing: 'border-box'
};

const smallInputStyle = {
  width: '100%',
  minWidth: '170px',
  padding: '7px',
  border: '1px solid #94a3b8',
  borderRadius: '5px',
  boxSizing: 'border-box'
};

const addButtonStyle = {
  padding: '10px 18px',
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '900px'
};

const tableHeaderStyle = {
  background: '#f1f5f9',
  textAlign: 'left'
};

const tableRowStyle = {
  borderBottom: '1px solid #e2e8f0'
};

const cellStyle = {
  padding: '12px',
  verticalAlign: 'middle'
};

const baseActionButton = {
  padding: '6px 9px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  color: 'white',
  fontWeight: 'bold',
  marginRight: '5px',
  marginBottom: '4px'
};

const editButtonStyle = {
  ...baseActionButton,
  background: '#f59e0b'
};

const saveButtonStyle = {
  ...baseActionButton,
  background: '#16a34a'
};

const cancelButtonStyle = {
  ...baseActionButton,
  background: '#64748b'
};

const closeButtonStyle = {
  ...baseActionButton,
  background: '#475569'
};

const openButtonStyle = {
  ...baseActionButton,
  background: '#2563eb'
};

const suspendButtonStyle = {
  ...baseActionButton,
  background: '#dc2626'
};

const unsuspendButtonStyle = {
  ...baseActionButton,
  background: '#16a34a'
};

const successStyle = {
  padding: '11px',
  marginBottom: '15px',
  background: '#dcfce7',
  color: '#166534',
  borderRadius: '6px'
};

const errorStyle = {
  padding: '11px',
  marginBottom: '15px',
  background: '#fee2e2',
  color: '#991b1b',
  borderRadius: '6px'
};

const storeDashboardStyle = {
  marginTop: '15px',
  padding: '18px',
  border: '1px solid #dbeafe',
  borderRadius: '8px',
  background: '#eff6ff'
};

const detailGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: '10px'
};

const detailCardStyle = {
  background: 'white',
  padding: '14px',
  borderRadius: '7px'
};