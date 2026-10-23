import { fmtMoney, formatPhone, thaiDateTime, timeAgo } from '../lib/format';
import { Icon, Badge, useEscapeToClose } from './ui';

/* ============================================================
   รายละเอียดการแจ้งเตือน (nd-*)
   ============================================================ */
export const NOTIF_KIND_LABEL = {
  cancel: 'ออเดอร์ถูกยกเลิก',
  issue: 'รายงานปัญหาจากลูกค้า',
  stock: 'สินค้าหมด',
  system: 'ประกาศจากระบบ',
};

export const NOTIF_GO = {
  cancel: { page: 'history', label: 'ดูรายละเอียดในประวัติการขาย' },
  issue: { page: 'issues', label: 'ไปที่รายงานปัญหา' },
  stock: { page: 'menu', label: 'ไปที่จัดการเมนู' },
};

export const ISSUE_STATUS = {
  OPEN: { label: 'รอดำเนินการ', tone: 'warning' },
  IN_PROGRESS: { label: 'กำลังดำเนินการ', tone: 'primary' },
  RESOLVED: { label: 'แก้ไขแล้ว', tone: 'success' },
  REJECTED: { label: 'ปฏิเสธ', tone: 'neutral' },
};

export const ORDER_STATUS_TONE = { COMPLETED: 'success', CANCELLED: 'danger', NO_SHOW: 'neutral' };

export function NotifOrderBlock({ order }) {
  const items = Array.isArray(order.items) ? order.items : [];
  return (
    <section className="nd-section">
      <h4 className="sf-section-title"><Icon name="receipt" size={16} /> รายละเอียดออเดอร์</h4>
      <div className="nd-card">
        <div className="nd-order-head">
          <div>
            <span className="nd-queue">คิว {order.QueueNo || '-'}</span>
            <span className="nd-muted">ออเดอร์ #{order.OrderID}</span>
          </div>
          <Badge tone={ORDER_STATUS_TONE[order.StatusCode] || 'warning'}>{order.StatusNameTh || order.Status || '-'}</Badge>
        </div>
        <dl className="nd-grid">
          <div>
            <dt>ลูกค้า</dt>
            <dd>{order.IsWalkIn ? 'ลูกค้า Walk-in' : (order.CustomerName || '-')}</dd>
          </div>
          <div>
            <dt>เบอร์โทร</dt>
            <dd>{order.CustomerPhone ? <a href={`tel:${order.CustomerPhone}`}>{formatPhone(order.CustomerPhone)}</a> : '-'}</dd>
          </div>
          <div>
            <dt>เวลาสั่ง</dt>
            <dd>{thaiDateTime(order.CreatedAt, true)}</dd>
          </div>
          <div>
            <dt>ชำระเงิน</dt>
            <dd>{order.PaymentMethod || (order.IsWalkIn ? 'เงินสด' : '-')}</dd>
          </div>
          {order.CancelReason && (
            <div className="full">
              <dt>เหตุผลที่ยกเลิก</dt>
              <dd className="nd-danger-text">{order.CancelReason}</dd>
            </div>
          )}
          {order.Note && (
            <div className="full">
              <dt>หมายเหตุจากลูกค้า</dt>
              <dd>{order.Note}</dd>
            </div>
          )}
        </dl>
        {items.length > 0 && (
          <ul className="nd-items">
            {items.map(i => (
              <li key={i.OrderItemId || `${i.ProductId}-${i.Qty}`}>
                <span>
                  {i.ProductName} <b>× {i.Qty}</b>
                  {i.ItemStatus === 'OUT_OF_STOCK' && <em className="nd-tag">ของหมด</em>}
                  {i.ItemNote && <small>{i.ItemNote}</small>}
                </span>
                <span>฿{fmtMoney(Number(i.UnitPrice || 0) * Number(i.Qty || 0))}</span>
              </li>
            ))}
            <li className="total"><span>รวมทั้งหมด</span><span>฿{fmtMoney(order.TotalAmount)}</span></li>
          </ul>
        )}
        {items.length === 0 && (
          <div className="nd-total-only"><span>ยอดรวม</span><b>฿{fmtMoney(order.TotalAmount)}</b></div>
        )}
      </div>
    </section>
  );
}

export function NotifDetailModal({ item, order, issue, product, onClose, onGo }) {
  useEscapeToClose(onClose, false);
  const go = NOTIF_GO[item.kind];
  const issueStatus = issue ? (ISSUE_STATUS[issue.IssueStatus] || { label: issue.IssueStatus, tone: 'neutral' }) : null;
  return (
    <div className="berry-modal-overlay mf-overlay" onClick={onClose}>
      <div className="mf-modal nd-modal" role="dialog" aria-modal="true" aria-labelledby="nd-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className={`nd-icon tone-${item.tone}`}><Icon name={item.icon} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className={`nd-kind tone-${item.tone}`}>{NOTIF_KIND_LABEL[item.kind] || 'การแจ้งเตือน'}</span>
            <h3 id="nd-title">{item.title}</h3>
            <p><Icon name="clock" size={12} /> {thaiDateTime(item.at, true)} · {timeAgo(item.at)}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="mf-body">
          {item.message && <div className="nd-message">{item.message}</div>}

          {item.kind === 'issue' && (issue ? (
            <section className="nd-section">
              <h4 className="sf-section-title"><Icon name="alert" size={16} /> รายงานปัญหา</h4>
              <div className="nd-card">
                <div className="nd-order-head">
                  <div><span className="nd-queue">{issue.IssueType || 'ไม่ระบุประเภท'}</span></div>
                  <Badge tone={issueStatus.tone}>{issueStatus.label}</Badge>
                </div>
                <dl className="nd-grid">
                  <div><dt>ผู้แจ้ง</dt><dd>{issue.CustomerName || '-'}</dd></div>
                  <div><dt>แจ้งเมื่อ</dt><dd>{thaiDateTime(issue.CreatedAt, true)}</dd></div>
                  <div className="full"><dt>รายละเอียดจากลูกค้า</dt><dd className="nd-quote">{issue.Description || '-'}</dd></div>
                  {issue.AdminNote && <div className="full"><dt>หมายเหตุจากผู้ดูแล</dt><dd>{issue.AdminNote}</dd></div>}
                </dl>
              </div>
            </section>
          ) : (
            <div className="sf-note"><Icon name="alert" size={16} /> ไม่พบรายละเอียดของรายงานนี้แล้ว ดูรายงานทั้งหมดได้ที่หน้ารายงานปัญหา</div>
          ))}

          {order && <NotifOrderBlock order={order} />}
          {item.kind === 'cancel' && !order && (
            <div className="sf-note"><Icon name="receipt" size={16} /> ไม่พบรายละเอียดออเดอร์นี้ในประวัติที่โหลดไว้</div>
          )}

          {item.kind === 'stock' && (product ? (
            <section className="nd-section">
              <h4 className="sf-section-title"><Icon name="box" size={16} /> เมนูที่เกี่ยวข้อง</h4>
              <div className="nd-card nd-product">
                <span className="nd-product-img">{product.img ? <img src={product.img} alt="" /> : <Icon name="photo" size={22} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nd-product-name">{product.ProductName}</div>
                  <div className="nd-muted">฿{fmtMoney(product.UnitPrice)}</div>
                </div>
                <Badge tone={product.IsOutOfStock ? 'danger' : 'success'}>{product.IsOutOfStock ? 'ยังหมดอยู่' : 'กลับมาขายแล้ว'}</Badge>
              </div>
            </section>
          ) : (
            <div className="sf-note"><Icon name="box" size={16} /> เมนูนี้อาจถูกลบหรือเปลี่ยนชื่อไปแล้ว</div>
          ))}
        </div>

        <div className="mf-footer" style={go ? undefined : { gridTemplateColumns: '1fr' }}>
          <button type="button" className="mf-btn ghost" onClick={onClose}>ปิด</button>
          {go && (
            <button type="button" className="mf-btn primary" onClick={() => onGo(go.page)}>
              {go.label} <Icon name="arrowRight" size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
