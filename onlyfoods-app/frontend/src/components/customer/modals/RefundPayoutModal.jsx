// เลือกวิธีรับเงินคืน: เงินสดที่ร้าน หรือให้เจ้าของร้านโอนให้ (พร้อมเพย์ / บัญชีธนาคาร)
import { useState } from "react";
import { COLORS, MAX_FILE_SIZE } from "../constants";

const BANKS = ["กสิกรไทย", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "กรุงศรีอยุธยา", "ทหารไทยธนชาต (ttb)", "ออมสิน", "ธ.ก.ส.", "ยูโอบี", "ซีไอเอ็มบี ไทย", "อื่น ๆ"];

const field = { width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: "12px", border: `1.5px solid ${COLORS.border}`, fontSize: "15px", background: COLORS.white, color: COLORS.text };
const label = { display: "block", fontSize: "13px", fontWeight: "700", margin: "12px 0 6px", color: COLORS.navy };

const readFile = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
  fr.readAsDataURL(file);
});

export default function RefundPayoutModal({ order, refunds, onClose, onSave, saving, error }) {
  const first = refunds[0] || {};
  const total = refunds.reduce((a, r) => a + Number(r.Amount || 0), 0);
  const [method, setMethod] = useState(first.PayoutMethod === "TRANSFER" ? "TRANSFER" : "CASH");
  const [kind, setKind] = useState(first.PayoutKind || "PROMPTPAY");
  const [bank, setBank] = useState(first.PayoutBank || "");
  const [accountNo, setAccountNo] = useState(first.PayoutAccountNo || "");
  const [accountName, setAccountName] = useState(first.PayoutAccountName || "");
  const [qr, setQr] = useState(null);
  const [localError, setLocalError] = useState("");

  const pickQr = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLocalError("กรุณาเลือกไฟล์รูปภาพ"); return; }
    if (file.size > MAX_FILE_SIZE) { setLocalError("ไฟล์รูปต้องไม่เกิน 5 MB"); return; }
    try { setQr(await readFile(file)); setLocalError(""); } catch (err) { setLocalError(err.message); }
  };

  const submit = () => {
    setLocalError("");
    if (method === "TRANSFER") {
      const digits = accountNo.replace(/[\s-]/g, "");
      if (kind === "PROMPTPAY" && !/^(0\d{9}|\d{13})$/.test(digits)) { setLocalError("พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก หรือเลขบัตรประชาชน 13 หลัก"); return; }
      if (kind === "BANK") {
        if (!bank) { setLocalError("กรุณาเลือกธนาคาร"); return; }
        if (!/^\d{10,15}$/.test(digits)) { setLocalError("เลขบัญชีต้องเป็นตัวเลข 10–15 หลัก"); return; }
        if (!accountName.trim()) { setLocalError("กรุณากรอกชื่อบัญชี"); return; }
      }
    }
    onSave({ method, kind, bank: kind === "BANK" ? bank : null, account_no: accountNo, account_name: accountName, qr_image: qr });
  };

  const shownError = localError || error;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box", overflowY: "auto" }}
      onClick={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="เลือกวิธีรับเงินคืน" onClick={(e) => e.stopPropagation()}
        style={{ background: COLORS.white, width: "min(480px, 100%)", maxHeight: "90vh", overflowY: "auto", borderRadius: "24px", padding: "24px", boxSizing: "border-box" }}>
        <h3 style={{ margin: 0, color: COLORS.navy }}>💸 รับเงินคืน {total.toFixed(2)} ฿</h3>
        <div style={{ color: COLORS.gray, fontSize: "13px", marginTop: "4px" }}>คิว #{order.QueueNo} · {order.StoreName}</div>

        {[["CASH", "รับเงินสดที่ร้าน", `แจ้งเลขคิว #${order.QueueNo} กับพนักงานหน้าร้าน`],
          ["TRANSFER", "ให้เจ้าของร้านโอนให้", "ไม่ต้องเดินมาที่ร้าน"]].map(([k, title, sub]) => (
          <label key={k} style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginTop: "12px", padding: "12px 14px", borderRadius: "14px", cursor: "pointer",
            border: `2px solid ${method === k ? COLORS.orange : COLORS.border}`, background: method === k ? "#FFF0EB" : COLORS.white }}>
            <input type="radio" name="refund-method" checked={method === k} onChange={() => setMethod(k)} style={{ marginTop: "4px" }} />
            <span><b>{title}</b><br /><span style={{ fontSize: "12px", color: COLORS.gray }}>{sub}</span></span>
          </label>
        ))}

        {method === "TRANSFER" && (
          <div style={{ marginTop: "6px" }}>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              {[["PROMPTPAY", "พร้อมเพย์"], ["BANK", "บัญชีธนาคาร"]].map(([k, t]) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  style={{ flex: 1, padding: "10px", borderRadius: "12px", fontWeight: "700", cursor: "pointer", border: `2px solid ${kind === k ? COLORS.orange : COLORS.border}`, background: kind === k ? COLORS.orange : COLORS.white, color: kind === k ? COLORS.white : COLORS.navy }}>{t}</button>
              ))}
            </div>
            {kind === "BANK" && (
              <>
                <label style={label} htmlFor="rp-bank">ธนาคาร</label>
                <select id="rp-bank" style={field} value={bank} onChange={(e) => setBank(e.target.value)}>
                  <option value="">เลือกธนาคาร</option>
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </>
            )}
            <label style={label} htmlFor="rp-acct">{kind === "PROMPTPAY" ? "เบอร์พร้อมเพย์ หรือเลขบัตรประชาชน" : "เลขบัญชี"}</label>
            <input id="rp-acct" style={field} inputMode="numeric" maxLength={20} value={accountNo}
              placeholder={kind === "PROMPTPAY" ? "เช่น 0812345678" : "เช่น 123-4-56789-0"} onChange={(e) => setAccountNo(e.target.value)} />
            <label style={label} htmlFor="rp-name">ชื่อบัญชี{kind === "PROMPTPAY" ? " (ไม่บังคับ)" : ""}</label>
            <input id="rp-name" style={field} maxLength={100} value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            <label style={label} htmlFor="rp-qr">แนบรูป QR รับเงิน (ไม่บังคับ)</label>
            <input id="rp-qr" type="file" accept="image/*" onChange={pickQr} />
            {qr && <img src={qr} alt="QR ที่เลือก" style={{ display: "block", maxWidth: "140px", marginTop: "8px", borderRadius: "10px", border: `1px solid ${COLORS.border}` }} />}
            <div style={{ fontSize: "12px", color: COLORS.gray, marginTop: "10px", lineHeight: 1.5 }}>
              ข้อมูลบัญชีเห็นเฉพาะเจ้าของร้านและจะถูกลบออกจากระบบหลังโอนคืนเสร็จ แก้ไขได้จนกว่าร้านจะโอน
            </div>
          </div>
        )}

        {shownError && <div role="alert" style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "12px", background: "#FFF0ED", color: COLORS.red, fontWeight: "700", fontSize: "13px" }}>{shownError}</div>}

        <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ flex: 1, padding: "13px", borderRadius: "14px", border: `1.5px solid ${COLORS.border}`, background: COLORS.white, fontWeight: "700", cursor: "pointer" }}>ปิด</button>
          <button type="button" onClick={submit} disabled={saving} style={{ flex: 2, padding: "13px", borderRadius: "14px", border: "none", background: COLORS.orange, color: COLORS.white, fontWeight: "800", cursor: "pointer" }}>
            {saving ? "กำลังบันทึก…" : "บันทึกวิธีรับเงินคืน"}
          </button>
        </div>
      </div>
    </div>
  );
}
