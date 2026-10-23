import { useState } from "react";
import { COLORS } from "./constants";

// บัญชีถูกผู้บริหารระงับ : แถบแจ้งบนทุกแท็บ + ยื่นอุทธรณ์ (1 ครั้งต่อการระงับ)
// ระหว่างระงับสั่งอาหารใหม่/รีวิวไม่ได้ แต่ออเดอร์ที่สั่งไว้แล้วยังเดินตามขั้นตอนปกติ
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function thaiDateTime(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} ${hh}:${mm} น.`;
}

function daysLeftText(endAt) {
  if (!endAt) return "";
  const ms = new Date(String(endAt).replace(" ", "T")).getTime() - Date.now();
  if (!(ms > 0)) return "";
  const days = Math.ceil(ms / 86400000);
  return days <= 1 ? "เหลือไม่ถึง 1 วัน" : `เหลืออีก ${days} วัน`;
}

const APPEAL_MIN = 10;

export default function SuspensionNotice({ active, apiBase, onChanged }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const submit = async () => {
    if (busy) return;
    const value = text.trim();
    if (value.length < APPEAL_MIN) return setError(`กรุณาอธิบายอย่างน้อย ${APPEAL_MIN} ตัวอักษร`);
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/me/suspension/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "ส่งคำอุทธรณ์ไม่สำเร็จ");
      setOpen(false);
      setText("");
      setSent(data.message || "ส่งคำอุทธรณ์แล้ว");
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const until = active.EndAt ? `ถึง ${thaiDateTime(active.EndAt)}` : "จนกว่าผู้บริหารจะปลดระงับ";
  const left = daysLeftText(active.EndAt);
  const appeal = active.AppealStatus;

  return (
    <>
      <div role="alert" style={{ margin: "14px 0 12px", padding: "16px 18px", borderRadius: "20px", background: "#FFF0ED",
        border: `1px solid ${COLORS.red}40`, display: "flex", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: COLORS.red, display: "grid", placeItems: "center", flexShrink: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" />
          </svg>
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontWeight: 900, color: COLORS.red, fontSize: "16px" }}>บัญชีของคุณถูกระงับการสั่งอาหาร</div>
          <div style={{ marginTop: "4px", fontSize: "13.5px", color: COLORS.text, lineHeight: 1.6 }}>
            {until}{left ? ` (${left})` : ""} · เหตุผล: <strong>{active.Reason}</strong>
          </div>
          <div style={{ marginTop: "2px", fontSize: "12.5px", color: COLORS.gray, lineHeight: 1.6 }}>
            ระหว่างนี้สั่งอาหารใหม่และรีวิวไม่ได้ ออเดอร์ที่สั่งไว้แล้วยังดำเนินการตามปกติ รับอาหารได้ตามเดิม
          </div>
          {appeal === "PENDING" && (
            <div style={{ marginTop: "8px", fontSize: "13px", fontWeight: 700, color: "#A66B00" }}>ส่งคำอุทธรณ์แล้ว รอผู้บริหารพิจารณา</div>
          )}
          {appeal === "REJECTED" && (
            <div style={{ marginTop: "8px", fontSize: "13px", color: COLORS.text }}>
              <strong style={{ color: COLORS.red }}>อุทธรณ์ไม่ได้รับการอนุมัติ</strong>
              {active.AppealResponse ? ` · ${active.AppealResponse}` : ""}
            </div>
          )}
          {sent && !appeal && <div style={{ marginTop: "8px", fontSize: "13px", color: COLORS.green, fontWeight: 700 }}>{sent}</div>}
        </div>
        {!appeal && (
          <button type="button" onClick={() => { setOpen(true); setError(""); }}
            style={{ alignSelf: "center", border: "none", borderRadius: "14px", padding: "11px 18px", background: COLORS.navy,
              color: COLORS.white, fontFamily: "inherit", fontWeight: 800, fontSize: "14px", cursor: "pointer", whiteSpace: "nowrap" }}>
            ยื่นอุทธรณ์
          </button>
        )}
      </div>

      {open && (
        <div onMouseDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center",
            justifyContent: "center", zIndex: 9998, padding: "20px", boxSizing: "border-box" }}>
          <div role="dialog" aria-modal="true" style={{ background: COLORS.white, borderRadius: "22px", padding: "22px", width: "100%", maxWidth: "460px", boxSizing: "border-box" }}>
            <div style={{ fontWeight: 900, fontSize: "18px", color: COLORS.text }}>ยื่นอุทธรณ์การระงับบัญชี</div>
            <div style={{ marginTop: "6px", fontSize: "13px", color: COLORS.gray, lineHeight: 1.6 }}>
              ถูกระงับเพราะ: {active.Reason} · ยื่นได้ 1 ครั้งต่อการระงับ ผู้บริหารจะแจ้งผลทางการแจ้งเตือน
            </div>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setError(""); }} maxLength={1000} disabled={busy} autoFocus
              placeholder="อธิบายว่าทำไมคุณคิดว่าไม่ควรถูกระงับ หรือสิ่งที่เกิดขึ้นจริง"
              style={{ marginTop: "14px", width: "100%", minHeight: "120px", boxSizing: "border-box", padding: "12px 14px", borderRadius: "14px",
                border: `1px solid ${error ? COLORS.red : COLORS.border}`, fontFamily: "inherit", fontSize: "14px", resize: "vertical", outlineColor: COLORS.orange }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginTop: "4px" }}>
              <span style={{ color: COLORS.red, fontWeight: 700 }}>{error}</span>
              <span style={{ color: COLORS.gray }}>{text.trim().length}/1000</span>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}
                style={{ flex: 1, padding: "13px", borderRadius: "14px", border: `1px solid ${COLORS.border}`, background: COLORS.white,
                  fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>ยกเลิก</button>
              <button type="button" onClick={submit} disabled={busy}
                style={{ flex: 1, padding: "13px", borderRadius: "14px", border: "none", background: busy ? "#CCCCCC" : COLORS.orange,
                  color: COLORS.white, fontFamily: "inherit", fontWeight: 900, cursor: busy ? "not-allowed" : "pointer" }}>
                {busy ? "กำลังส่ง..." : "ส่งคำอุทธรณ์"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
