import { COLORS } from "../constants";
import { CommentIcon, StarIcon } from "../icons";

export default function StoreReviewsModal({ selectedStoreForReviews, setSelectedStoreForReviews, isLoadingReviews, storeReviewsList }) {
  if (!selectedStoreForReviews) return null;

  return (
    <div 
      style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.6)", zIndex: 2500, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }}
      onClick={() => setSelectedStoreForReviews(null)}
    >
      <div 
        onClick={e => e.stopPropagation()} 
        style={{ background: COLORS.white, width: "min(500px, 100%)", maxHeight: "80vh", borderRadius: "24px", padding: "25px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: `1px solid ${COLORS.border}`, paddingBottom: "12px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900" }}> รีวิวจากลูกค้า</h3>
            <div style={{ fontSize: "13px", color: COLORS.gray, marginTop: "2px" }}>ร้าน: {selectedStoreForReviews.StoreName}</div>
          </div>
          <button onClick={() => setSelectedStoreForReviews(null)} style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}>×</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingRight: "5px" }}>
          {isLoadingReviews ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.gray }}>กำลังโหลดรีวิว...</div>
          ) : storeReviewsList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.gray }}>
              <div style={{ fontSize: "40px", marginBottom: "8px" }}> <CommentIcon/> </div> ยังไม่มีความคิดเห็นสำหรับร้านนี้ 
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {storeReviewsList.map((rev, index) => (
                <div key={rev.ReviewID || index} style={{ background: COLORS.bg, padding: "14px", borderRadius: "16px", border: `1px solid ${COLORS.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "800", fontSize: "13px" }}>{rev.ReviewerName || rev.CustomerName || rev.FullName || "ผู้ใช้บริการ"}</span>
                    <span style={{ fontSize: "11px", color: COLORS.gray }}>{rev.CreatedAt || rev.ReviewDate || ""}</span>
                  </div>
                  <div style={{ fontSize: "14px", marginBottom: "6px", display: "flex", gap: "2px" }}>
                    {Array.from({ length: Number(rev.Rating || rev.rating || 5) }, (_, i) => <StarIcon key={i} />)}
                  </div>

                  {rev.Comment || rev.comment ? (
                    <div style={{ fontSize: "13px", color: COLORS.navy, lineHeight: "1.4" }}>
                      {rev.Comment || rev.comment}
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: COLORS.gray, fontStyle: "italic" }}>ไม่ได้ระบุข้อความ</div>
                  )}

                  {(rev.ImageUrl || rev.image_url) && (
                    <img 
                      src={rev.ImageUrl || rev.image_url} 
                      alt="Review Attachment" 
                      style={{ width: "100%", maxHeight: "160px", objectFit: "cover", borderRadius: "10px", marginTop: "10px" }} 
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
