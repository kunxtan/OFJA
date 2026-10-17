import { COLORS } from "../constants";
import { StarIcon } from "../icons";

export default function ReviewModal({
  reviewOrder,
  setReviewOrder,
  isReadOnlyReview,
  rating,
  setRating,
  setHoverRating,
  hoverRating,
  reviewComment,
  setReviewComment,
  reviewImagePreview,
  handleReviewImageChange,
  submitReview,
}) {
  if (!reviewOrder) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }} onClick={() => setReviewOrder(null)}>
      <div onClick={e => e.stopPropagation()} style={{ background: COLORS.white, width: "min(420px, 100%)", borderRadius: "22px", padding: "25px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "20px" }}>{isReadOnlyReview ? "รีวิวของคุณ" : "ให้คะแนนร้าน"}</h3>
          <button onClick={() => setReviewOrder(null)} style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}>×</button>
        </div>
        <p style={{ color: COLORS.gray, fontSize: "13px" }}>คิว #{reviewOrder.QueueNo} • {reviewOrder.StoreName}</p>

        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <label style={{ fontSize: "14px", fontWeight: "800", display: "block", marginBottom: "8px" }}>คะแนนความพึงพอใจ</label>
          {isReadOnlyReview ? (
            <div style={{ fontSize: "30px" }}>
              {Array.from({ length: 5 }, (_, i) => (<StarIcon key={i} style={{color: i < Number(rating) ? "#FFD166" : "#D9D9D9"}}/>))}
              <span style={{ fontSize: "14px", color: COLORS.gray, marginLeft: "8px", fontWeight: "700" }}>({rating}/5)</span>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "center", gap: "8px", fontSize: "36px", cursor: "pointer", userSelect: "none" }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    style={{
                      transition: "transform 0.1s ease",
                      transform: (hoverRating >= star || (!hoverRating && rating >= star)) ? "scale(1.15)" : "scale(1)",
                      filter: (hoverRating >= star || (!hoverRating && rating >= star)) ? "none" : "grayscale(100%) opacity(0.3)"
                    }}
                  >
                    <StarIcon/>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: "13px", color: COLORS.orange, fontWeight: "800", marginTop: "6px" }}>
                {hoverRating ? `${hoverRating} ดาว` : `${rating} ดาว`}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: "18px" }}>
          <label style={{ fontSize: "13px", fontWeight: "800" }}>ความคิดเห็น (ไม่จำเป็นต้องใส่)</label>
          {isReadOnlyReview ? (
            <div style={{ marginTop: "7px", background: COLORS.lightGray, padding: "13px", borderRadius: "12px", fontSize: "13px" }}>{reviewComment}</div>
          ) : (
            <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="บอกความรู้สึกของคุณเกี่ยวกับอาหารและบริการ (ไม่จำเป็น)..." rows={3} style={{ width: "100%", boxSizing: "border-box", marginTop: "7px", padding: "11px", borderRadius: "12px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit", resize: "vertical" }} />
          )}
        </div>

        <div style={{ marginTop: "18px" }}>
          <label style={{ fontSize: "13px", fontWeight: "800", display: "block", marginBottom: "6px" }}>📷 แนบรูปภาพรีวิว (ไม่เกิน 5MB)</label>
          {isReadOnlyReview ? (
            reviewImagePreview ? (
              <img src={reviewImagePreview} alt="Review Attachment" style={{ width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "12px", marginTop: "5px" }} />
            ) : (
              <div style={{ fontSize: "12px", color: COLORS.gray, fontStyle: "italic" }}>ไม่มีรูปภาพแนบ</div>
            )
          ) : (
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={handleReviewImageChange}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "10px",
                  border: `1px dashed ${COLORS.orange}`,
                  background: COLORS.bg,
                  fontSize: "12px",
                  boxSizing: "border-box"
                }}
              />
              {reviewImagePreview && (
                <div style={{ marginTop: "10px", textAlign: "center" }}>
                  <img src={reviewImagePreview} alt="Review Preview" style={{ width: "100px", height: "100px", objectFit: "cover", borderRadius: "10px", border: `1px solid ${COLORS.border}` }} />
                </div>
              )}
            </div>
          )}
        </div>

        {!isReadOnlyReview && (
          <button onClick={submitReview} style={{ width: "100%", marginTop: "22px", padding: "13px", border: "none", borderRadius: "13px", background: COLORS.orange, color: COLORS.white, fontWeight: "900", fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>
            ส่งรีวิว 
          </button>
        )}
      </div>
    </div>
  );
}
