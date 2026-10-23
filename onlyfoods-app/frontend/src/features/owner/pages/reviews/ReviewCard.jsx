import { Icon, useEscapeToClose } from '../../components/ui';
import { fmtMoney, timeAgo, thaiDate, thaiDateTime } from '../../lib/format';
import { StaffAvatar } from '../staff/StaffAvatar';

/* ============================================================
   รีวิวจากลูกค้า (rv-*)
   ============================================================ */
export const RATING_LABEL = { 5: 'ยอดเยี่ยม', 4: 'ดี', 3: 'พอใช้', 2: 'ควรปรับปรุง', 1: 'แย่' };

export const RATING_TONE = { 5: 'green', 4: 'green', 3: 'amber', 2: 'red', 1: 'red' };

export function Stars({ value, size = 16 }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span className="rv-stars" style={{ fontSize: size }} aria-label={`${v.toFixed(1)} จาก 5 ดาว`}>
      {[1, 2, 3, 4, 5].map(n => {
        const fill = Math.max(0, Math.min(1, v - (n - 1)));
        return (
          <span key={n} className="rv-star">
            ★<span className="rv-star-fill" style={{ width: `${fill * 100}%` }}>★</span>
          </span>
        );
      })}
    </span>
  );
}

// รูปรีวิวขนาดเต็ม
export function ReviewPhotoLightbox({ src, onClose }) {
  useEscapeToClose(onClose, false);
  return (
    <div className="rv-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label="รูปจากรีวิว">
      <img src={src} alt="รูปจากรีวิว" onClick={e => e.stopPropagation()} />
      <button type="button" className="rv-lightbox-close" onClick={onClose} aria-label="ปิด"><Icon name="close" size={20} /></button>
    </div>
  );
}

export function ReviewCard({ review, onPhoto }) {
  const r = review;
  const keyNum = parseInt(String(r.ReviewerKey || '0').slice(0, 6), 16) || 0;
  const comment = (r.Comment || '').trim();
  return (
    <article className={`rv-card tone-${RATING_TONE[r.Rating]}`}>
      <header className="rv-card-head">
        <StaffAvatar name={r.ReviewerName} id={keyNum} size={42} />
        <div className="rv-who">
          <div className="rv-name">
            {r.ReviewerName}
            {r.Visits >= 3 && <span className="rv-regular" title={`สั่งร้านนี้สำเร็จ ${r.Visits} ครั้ง`}><Icon name="award" size={12} /> ลูกค้าประจำ</span>}
          </div>
          <div className="rv-sub">
            สั่งร้านนี้ {fmtMoney(r.Visits)} ครั้ง
            {r.ReviewerReviewCount > 1 && <> · รีวิว {r.ReviewerReviewCount} ครั้ง</>}
          </div>
        </div>
        <div className="rv-rating">
          <Stars value={r.Rating} size={15} />
          <span className={`rv-rating-label tone-${RATING_TONE[r.Rating]}`}>{RATING_LABEL[r.Rating]}</span>
        </div>
      </header>

      <div className="rv-body">
        {comment
          ? <p className="rv-comment">{comment}</p>
          : <p className="rv-comment empty">ลูกค้าให้คะแนนโดยไม่ได้เขียนความเห็น</p>}
        {r.ImageUrl && (
          <button type="button" className="rv-photo" onClick={() => onPhoto(r.ImageUrl)} aria-label="ดูรูปขนาดเต็ม">
            <img src={r.ImageUrl} alt="รูปจากรีวิว" />
            <span><Icon name="photo" size={13} /> ดูรูป</span>
          </button>
        )}
      </div>

      <footer className="rv-order">
        <div className="rv-order-meta">
          {/* M15: ร้านไม่เห็นเลขคิว/ยอด/เวลาเป๊ะ (backend ไม่ส่งมา) เหลือวัน + ช่วงเวลา ; ผู้บริหารยังเห็นครบ */}
          {r.QueueNo && <span className="rv-queue">คิว {r.QueueNo}</span>}
          {r.OrderedAt
            ? <span>สั่งเมื่อ {thaiDateTime(r.OrderedAt)}</span>
            : r.OrderedDate && <span>สั่งวันที่ {thaiDate(r.OrderedDate)}{r.OrderedPeriod ? ` ช่วง${r.OrderedPeriod}` : ''}</span>}
          {r.TotalAmount != null && <span>฿{fmtMoney(r.TotalAmount)}</span>}
          {r.CreatedPeriod
            ? <span className="rv-time">รีวิววันที่ {thaiDate(r.CreatedAt)} ช่วง{r.CreatedPeriod}</span>
            : <span className="rv-time" title={thaiDateTime(r.CreatedAt, true)}>รีวิว {timeAgo(r.CreatedAt)}</span>}
        </div>
        {r.items?.length > 0 && (
          <div className="rv-items">
            {r.items.map((it, i) => (
              <span key={`${it.ProductId}-${i}`} className="rv-item">
                <span className="rv-item-img">{it.ImageUrl ? <img src={it.ImageUrl} alt="" /> : <Icon name="photo" size={11} />}</span>
                {it.ProductName} ×{it.Qty}
              </span>
            ))}
          </div>
        )}
      </footer>
    </article>
  );
}
