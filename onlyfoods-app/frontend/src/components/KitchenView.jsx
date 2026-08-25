import React, { useState, useEffect, useCallback } from 'react';

export default function KitchenView({ user, apiBase = "http://localhost:8000" }) {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState([]);

  // ดึงข้อมูลออเดอร์และสรุปวัตถุดิบ
  const fetchData = useCallback(() => {
    const storeId = user?.storeId || user?.StoreId || 1;

    // 1. ดึงข้อมูลออเดอร์
    fetch(`${apiBase}/api/orders?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => {
        const activeOrders = data.filter(o => o.Status === 'Pending' || o.Status === 'Cooking');
        
        // จัดเรียงออเดอร์ตามเวลานัดรับ (PickupTime)
        activeOrders.sort((a, b) => {
          const timeA = a.PickupTime || a.pickup_time || a.pickupTime || '';
          const timeB = b.PickupTime || b.pickup_time || b.pickupTime || '';
          return timeA.localeCompare(timeB);
        });

        setOrders(activeOrders);
      })
      .catch(err => console.error("Error fetching orders:", err));

    // 2. ดึงข้อมูลสรุปยอดวัตถุดิบ
    fetch(`${apiBase}/api/orders/kitchen-summary?store_id=${storeId}`)
      .then(r => r.json())
      .then(data => setSummary(data))
      .catch(err => console.error("Error fetching summary:", err));
  }, [user, apiBase]);

  useEffect(() => {
    if (!user) return;

    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [user, fetchData]);

  // อัปเดตสถานะออเดอร์
  const updateStatus = (id, status, cancelReason = null) => {
    fetch(`${apiBase}/api/orders/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: status,
        user_role: 'Kitchen Staff',
        cancel_reason: cancelReason
      })
    })
    .then(() => fetchData())
    .catch(err => console.error("Error updating status:", err));
  };

  // คำนวณยอดสรุปสถานะสำหรับ Header
  const pendingCount = orders.filter(o => o.Status === 'Pending').length;
  const cookingCount = orders.filter(o => o.Status === 'Cooking').length;

  return (
    <div style={styles.pageBackground}>
      {/* Top Header Bar (Only Foods Premium Style) */}
      <div style={styles.topHeader}>
        <div style={styles.headerTitleGroup}>
          <div style={styles.systemBadge}>OF Kitchen</div>
          <div>
            <h1 style={styles.brandTitle}>ระบบจัดการคำสั่งซื้อห้องครัว</h1>
            <div style={styles.statusIndicator}>
              <span style={styles.statusDot} />
              <span style={styles.statusText}>สถานะห้องครัว: เปิดรับออเดอร์</span>
            </div>
          </div>
        </div>

        {/* User Info / Refresh Badge */}
        <div style={styles.headerRightGroup}>
          <button style={styles.refreshBtn} onClick={fetchData}>
            🔄 รีเฟรชข้อมูล
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>ออเดอร์ทั้งหมดในครัว</span>
          <span style={styles.statValueBlue}>{orders.length}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>รอดำเนินการ</span>
          <span style={styles.statValueYellow}>{pendingCount}</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>กำลังปรุง</span>
          <span style={styles.statValueTeal}>{cookingCount}</span>
        </div>
      </div>

      {/* Ingredient Preparation Summary Box */}
      <div style={styles.summaryContainer}>
        <div style={styles.summaryHeader}>
          <div style={styles.summaryDot} />
          <span style={styles.summaryHeaderText}>สรุปวัตถุดิบที่ต้องเตรียมปรุง</span>
        </div>
        <div style={styles.summaryItemsWrapper}>
          {summary.length === 0 ? (
            <span style={styles.summaryEmpty}>ไม่มีรายการค้างปรุงในขณะนี้</span>
          ) : (
            summary.map((s, i) => {
              const productName = s.ProductName || s.product_name;
              const totalQty = s.TotalQty || s.total_qty;
              return (
                <div key={i} style={styles.summaryChip}>
                  <span style={styles.summaryChipName}>{productName}</span>
                  <span style={styles.summaryChipQty}>{totalQty} จาน</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Orders Grid Section */}
      <div style={styles.gridContainer}>
        {orders.length === 0 ? (
          <div style={styles.noOrdersBox}>
            <div style={styles.noOrdersTitle}>ไม่มีคำสั่งซื้อที่ค้างปรุง</div>
            <div style={styles.noOrdersSub}>ออเดอร์ใหม่จะแสดงขึ้นที่นี่อัตโนมัติ</div>
          </div>
        ) : (
          orders.map(o => {
            const orderId = o.OrderID || o.order_id;
            const queueNo = o.QueueNo || o.queue_no;
            const paymentMethod = o.PaymentMethod || o.payment_method || o.paymentMethod || 'PromptPay';
            
            const rawPickupTime = o.PickupTime || o.pickup_time || o.pickupTime;
            const pickupTime = (rawPickupTime && String(rawPickupTime).trim() !== '') 
              ? rawPickupTime 
              : 'รับทันที';

            const note = o.Note || o.note;
            const isCooking = o.Status === 'Cooking';

            return (
              <div 
                key={orderId} 
                style={{
                  ...styles.card,
                  borderTop: isCooking ? '4px solid #0d9488' : '4px solid #f59e0b'
                }}
              >
                {/* Card Header */}
                <div style={styles.cardHeader}>
                  <div>
                    <div style={styles.queueCaption}>QUEUE</div>
                    <div style={styles.queueNum}>คิว {queueNo}</div>
                  </div>
                  <div style={styles.badgeColumn}>
                    <span style={isCooking ? styles.badgeCooking : styles.badgePending}>
                      {isCooking ? 'กำลังปรุง' : 'รอดำเนินการ'}
                    </span>
                  </div>
                </div>

                {/* Time & Payment Bar */}
                <div style={styles.timeBar}>
                  <div>
                    <span style={styles.timeTextLabel}>ชำระเงิน: </span>
                    <span style={styles.timeTextValueDark}>{paymentMethod}</span>
                  </div>
                  <div>
                    <span style={styles.timeTextLabel}>เวลารับ: </span>
                    <span style={styles.timeTextValueTeal}>{pickupTime}</span>
                  </div>
                </div>

                {/* Order Note (if exists) */}
                {note && (
                  <div style={styles.orderNoteContainer}>
                    <div style={styles.noteHeader}>📌 หมายเหตุออเดอร์</div>
                    <div style={styles.noteBody}>{note}</div>
                  </div>
                )}

                {/* Order Items List */}
                <div style={styles.itemList}>
                  {(o.items || []).map((item, idx) => {
                    const productName = item.ProductName || item.product_name;
                    const qty = item.Qty || item.qty;
                    const itemNote = item.ItemNote || item.item_note;

                    return (
                      <div key={idx} style={styles.itemRow}>
                        <div style={styles.itemMainLine}>
                          <span style={styles.itemName}>{productName}</span>
                          <span style={styles.itemQty}>x{qty}</span>
                        </div>
                        {itemNote && (
                          <div style={styles.itemNoteBadge}>
                            ข้อความ: {itemNote}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Card Footer Actions */}
                <div style={styles.cardFooter}>
                  {!isCooking ? (
                    <button 
                      onClick={() => updateStatus(orderId, 'Cooking')} 
                      style={styles.btnStartCooking}
                    >
                      เริ่มปรุง
                    </button>
                  ) : (
                    <button 
                      onClick={() => updateStatus(orderId, 'Ready')} 
                      style={styles.btnFinish}
                    >
                      ปรุงเสร็จแล้ว
                    </button>
                  )}

                  <button 
                    onClick={() => {
                      const reason = prompt("ระบุเหตุผลที่ยกเลิกออเดอร์:");
                      if (reason) updateStatus(orderId, 'Cancelled', reason);
                    }} 
                    style={styles.btnCancel}
                  >
                    ยกเลิกออเดอร์
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Styling Object - Only Foods Light Mode Design System (Fixed Header Style)
const styles = {
  pageBackground: {
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    minHeight: '100vh',
    padding: '24px',
    boxSizing: 'border-box',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  },
  topHeader: {
    display: 'flex',
    justifyContent: 'space-between', // <--- แก้ไขจุดนี้แล้วครับ
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: '20px 24px',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 18px -2px rgba(15, 23, 42, 0.05)',
    marginBottom: '24px'
  },
  headerTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  systemBadge: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontWeight: '800',
    fontSize: '13px',
    padding: '10px 16px',
    borderRadius: '12px',
    letterSpacing: '0.5px',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
  },
  brandTitle: {
    fontSize: '20px',
    fontWeight: '800',
    margin: 0,
    color: '#0f172a',
    letterSpacing: '-0.3px'
  },
  statusIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '6px',
    backgroundColor: '#ecfdf5',
    border: '1px solid #a7f3d0',
    padding: '4px 12px',
    borderRadius: '20px'
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    boxShadow: '0 0 8px #10b981'
  },
  statusText: {
    fontSize: '12px',
    color: '#047857',
    fontWeight: '700'
  },
  headerRightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  refreshBtn: {
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    color: '#334155',
    padding: '10px 18px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s ease'
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '20px'
  },
  statCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
  },
  statLabel: {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: '600'
  },
  statValueBlue: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#2563eb'
  },
  statValueYellow: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#d97706'
  },
  statValueTeal: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#0d9488'
  },
  summaryContainer: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
  },
  summaryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px'
  },
  summaryDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#0d9488'
  },
  summaryHeaderText: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  summaryItemsWrapper: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px'
  },
  summaryChip: {
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '20px',
    padding: '6px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  summaryChipName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#1e293b'
  },
  summaryChipQty: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#0d9488',
    backgroundColor: '#ccfbf1',
    padding: '2px 8px',
    borderRadius: '12px'
  },
  summaryEmpty: {
    fontSize: '13px',
    color: '#94a3b8',
    fontStyle: 'italic'
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px'
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    justify: 'space-between',
    minHeight: '320px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px'
  },
  queueCaption: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: '1px'
  },
  queueNum: {
    fontSize: '26px',
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: '1.1'
  },
  badgeColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end'
  },
  badgePending: {
    backgroundColor: '#fef3c7',
    color: '#d97706',
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '20px'
  },
  badgeCooking: {
    backgroundColor: '#ccfbf1',
    color: '#0f766e',
    fontSize: '11px',
    fontWeight: '700',
    padding: '4px 10px',
    borderRadius: '20px'
  },
  timeBar: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    border: '1px solid #f1f5f9',
    padding: '8px 12px',
    borderRadius: '8px',
    marginBottom: '12px'
  },
  timeTextLabel: {
    fontSize: '12px',
    color: '#64748b'
  },
  timeTextValueDark: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#1e293b'
  },
  timeTextValueTeal: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#0d9488'
  },
  orderNoteContainer: {
    backgroundColor: '#fff7ed',
    border: '1px solid #ffedd5',
    borderRadius: '8px',
    padding: '8px 12px',
    marginBottom: '12px'
  },
  noteHeader: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#c2410c',
    marginBottom: '2px'
  },
  noteBody: {
    fontSize: '12px',
    color: '#9a3412'
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '18px',
    flexGrow: 1
  },
  itemRow: {
    borderBottom: '1px solid #f1f5f9',
    paddingBottom: '8px'
  },
  itemMainLine: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'center'
  },
  itemName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b'
  },
  itemQty: {
    fontSize: '15px',
    fontWeight: '800',
    color: '#0d9488'
  },
  itemNoteBadge: {
    display: 'inline-block',
    marginTop: '4px',
    backgroundColor: '#fef3c7',
    color: '#b45309',
    fontSize: '11px',
    fontWeight: '500',
    padding: '2px 6px',
    borderRadius: '4px'
  },
  cardFooter: {
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  btnStartCooking: {
    width: '100%',
    backgroundColor: '#0d9488',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  btnFinish: {
    width: '100%',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  btnCancel: {
    width: '100%',
    backgroundColor: '#fff1f2',
    color: '#e11d48',
    border: '1px solid #fecdd3',
    borderRadius: '8px',
    padding: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  noOrdersBox: {
    gridColumn: '1 / -1',
    backgroundColor: '#ffffff',
    border: '2px dashed #e2e8f0',
    borderRadius: '12px',
    padding: '60px 20px',
    textAlign: 'center'
  },
  noOrdersTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#64748b'
  },
  noOrdersSub: {
    fontSize: '13px',
    color: '#94a3b8',
    marginTop: '4px'
  }
};