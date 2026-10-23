// หน้าต่างยืนยันคืนเงิน (โอนคืน / เงินสด walk-in) และตรวจสลิปของออเดอร์ที่ถูกบังคับยกเลิก
import { RF_STYLES } from './styles';
import { useEffect, useState } from 'react';
import AuthImage, { openFile } from '../ui/AuthImage';
import { money, fmtPhone, readError, TYPE_TH, PAYOUT_KIND_TH } from './refundText';
import { MAX_SLIP_MB, readFileAsDataUrl, SlipPicker, imageSize } from './SlipPicker';

// หน้าต่าง "คืนเงินแล้ว / โอนคืน" และ "ตรวจสลิปก่อนคืนเงิน" : ใช้ร่วมกันระหว่างตาราง RefundLog กับหน้าคืนเงินของเจ้าของร้าน
// เพื่อให้กติกาการคืนเงิน (บังคับสลิปเมื่อโอน, โหลดบัญชีลูกค้าเฉพาะเจ้าของร้าน) อยู่ที่เดียว
// onDone(message) ถูกเรียกหลังบันทึกสำเร็จ ; ฝั่งที่เรียกเป็นคนปิดหน้าต่างและโหลดข้อมูลใหม่
export function RefundActionModals({ apiBase, isOwner = false, confirming, checking, onClose, onDone }) {
  if (!confirming && !checking) return null;
  return (
    <>
      <style>{RF_STYLES}</style>
      {checking && <SlipCheckModal key={`c${checking.RefundId}`} apiBase={apiBase} row={checking} onClose={onClose} onDone={onDone} />}
      {confirming && <ConfirmRefundModal key={`r${confirming.RefundId}`} apiBase={apiBase} isOwner={isOwner} row={confirming} onClose={onClose} onDone={onDone} />}
    </>
  );
}

export function useEscape(onClose, busy) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
}

export function SlipCheckModal({ apiBase, row: checking, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkReason, setCheckReason] = useState('');
  useEscape(onClose, busy);

  const submitSlipCheck = async (approved) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/refunds/${checking.RefundId}/slip-check`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, reason: approved ? '' : (checkReason.trim() || 'สลิปไม่ถูกต้อง / เงินไม่เข้าบัญชี') }),
      });
      if (!res.ok) throw new Error(await readError(res, 'บันทึกผลตรวจสลิปไม่สำเร็จ'));
      setBusy(false);
      await onDone?.(approved
        ? `สลิปคิว ${checking.QueueNo} ถูกต้อง: คืนเงิน ฿${money(checking.Amount)} ต่อได้ตามปกติ`
        : `สลิปคิว ${checking.QueueNo} ไม่ผ่าน: ไม่ต้องคืนเงินรายการนี้`, { kind: 'slip-check', approved, row: checking });
    } catch (err) {
      setError(err.message || 'บันทึกผลตรวจสลิปไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <div className="rf-overlay" onClick={() => !busy && onClose()}>
      <div className="rf-modal" role="dialog" aria-modal="true" aria-labelledby="rf-check-title" onClick={e => e.stopPropagation()}>
        <h4 id="rf-check-title">ตรวจสลิปก่อนคืนเงิน</h4>
        <div className="rf-modal-amount">฿{money(checking.Amount)}</div>
        <dl className="rf-modal-list">
          <dt>คิว</dt><dd><span className="rf-queue">{checking.QueueNo}</span></dd>
          <dt>ลูกค้า</dt><dd>{checking.CustomerName || '-'}{checking.CustomerPhone ? ` · ${fmtPhone(checking.CustomerPhone)}` : ''}</dd>
          <dt>สลิป</dt><dd>{checking.PaymentType === 'TOP_UP' ? 'ส่วนต่างค่าอาหาร' : 'ค่าอาหาร'}</dd>
        </dl>
        {checking.PaymentSlipUrl
          ? <button type="button" className="rf-link" onClick={() => openFile(apiBase, checking.PaymentSlipUrl)}><AuthImage apiBase={apiBase} className="rf-slip-preview" src={checking.PaymentSlipUrl} alt="สลิปที่ลูกค้าแนบ" /></button>
          : <div className="rf-sub">ไม่พบรูปสลิป</div>}
        <p className="rf-modal-note">
          ออเดอร์นี้ถูกยกเลิกตอนร้านยังไม่ได้ตรวจสลิป เช็คว่ายอดเข้าบัญชีร้านจริงก่อน
          ถ้าถูกต้อง รายการนี้จะกลับไปรอคืนเงินตามปกติ ถ้าไม่ถูกต้อง ไม่ต้องคืนเงิน
        </p>
        <label className="rf-slip">
          <span>เหตุผล (ถ้าสลิปไม่ถูกต้อง)</span>
          <input className="rf-input" style={{ maxWidth: 'none' }} value={checkReason} maxLength={200}
            onChange={e => setCheckReason(e.target.value)} placeholder="เช่น ยอดไม่เข้าบัญชี / สลิปซ้ำ" disabled={busy} />
        </label>
        {error && <div className="rf-error" role="alert" style={{ marginTop: '10px' }}>{error}</div>}
        <div className="rf-modal-actions" style={{ marginTop: '12px' }}>
          <button type="button" className="rf-btn rf-btn-ghost" onClick={onClose} disabled={busy}>ปิด</button>
          <button type="button" className="rf-btn rf-btn-danger" onClick={() => submitSlipCheck(false)} disabled={busy}>สลิปไม่ถูกต้อง</button>
          <button type="button" className="rf-btn rf-btn-primary" onClick={() => submitSlipCheck(true)} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'เงินเข้าแล้ว สลิปถูกต้อง'}</button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmRefundModal({ apiBase, isOwner, row: confirming, onClose, onDone }) {
  const transferRequested = isOwner && !confirming.IsWalkIn && confirming.PayoutMethod === 'TRANSFER';
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const payMethod = confirming.IsWalkIn ? 'CASH' : 'TRANSFER'; // ออนไลน์โอนคืนเท่านั้น ; walk-in เงินสดเท่านั้น
  const [slip, setSlip] = useState(null);               // { name, dataUrl }
  const [payInfo, setPayInfo] = useState(null);         // ข้อมูลบัญชีเต็มของลูกค้า (เจ้าของเปิดดู -> audit)
  const [payInfoError, setPayInfoError] = useState('');
  useEscape(onClose, busy);

  // หน้าต่างนี้ผูกกับแถวเดียว (key = RefundId) : ปิดก่อนคำตอบมา ก็ไม่ set state ทับ
  useEffect(() => {
    if (!transferRequested) return undefined;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/refunds/${confirming.RefundId}/payout-info`);
        if (!res.ok) throw new Error(await readError(res, 'โหลดข้อมูลบัญชีลูกค้าไม่สำเร็จ'));
        const info = await res.json();
        if (alive && info.refund_id === confirming.RefundId) setPayInfo(info);
      } catch (err) {
        if (alive) setPayInfoError(err.message || 'โหลดข้อมูลบัญชีลูกค้าไม่สำเร็จ');
      }
    })();
    return () => { alive = false; };
  }, [apiBase, confirming.RefundId, transferRequested]);

  const pickSlip = async (file) => {
    if (!file.type.startsWith('image/')) { setConfirmError('กรุณาเลือกไฟล์รูปภาพ'); return; }
    if (file.size > MAX_SLIP_MB * 1024 * 1024) { setConfirmError(`ไฟล์รูปต้องไม่เกิน ${MAX_SLIP_MB} MB`); return; }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSlip({ name: file.name, size: file.size, dataUrl, ...(await imageSize(dataUrl)) });
      setConfirmError('');
    } catch (err) {
      setConfirmError(err.message);
    }
  };

  const confirmRefund = async () => {
    if (payMethod === 'TRANSFER' && !slip) { setConfirmError('กรุณาแนบสลิปโอนเงินคืนก่อนยืนยัน'); return; }
    setBusy(true);
    setConfirmError('');
    try {
      const res = await fetch(`${apiBase}/api/refunds/${confirming.RefundId}/done`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: payMethod, slip_image: payMethod === 'TRANSFER' ? slip.dataUrl : null }),
      });
      if (!res.ok) throw new Error(await readError(res, 'บันทึกการคืนเงินไม่สำเร็จ'));
      setBusy(false);
      await onDone?.(`บันทึกแล้ว: คืนเงิน ฿${money(confirming.Amount)} คิว ${confirming.QueueNo}`, { kind: 'done', method: payMethod, row: confirming });
    } catch (err) {
      setConfirmError(err.message || 'บันทึกการคืนเงินไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <div className="rf-overlay" onClick={() => !busy && onClose()}>
      <div className="rf-modal" role="dialog" aria-modal="true" aria-labelledby="rf-modal-title" onClick={e => e.stopPropagation()}>
        <h4 id="rf-modal-title">ยืนยันคืนเงินให้ลูกค้า</h4>
        <div className="rf-modal-amount">฿{money(confirming.Amount)}</div>
        <dl className="rf-modal-list">
          <dt>คิว</dt><dd><span className="rf-queue">{confirming.QueueNo}</span></dd>
          <dt>ลูกค้า</dt><dd>{confirming.IsWalkIn ? 'Walk-in' : (confirming.CustomerName || '-')}{confirming.CustomerPhone ? ` · ${fmtPhone(confirming.CustomerPhone)}` : ''}</dd>
          <dt>เหตุผล</dt><dd>{confirming.Reason || TYPE_TH[confirming.RefundType]}</dd>
        </dl>
        {payMethod === 'TRANSFER' && (
          <div className="rf-pay-box">
            <b>โอนเงินคืนเข้าบัญชีลูกค้า</b>
            {payInfoError && <div className="rf-error" role="alert">{payInfoError}</div>}
            {!payInfo && !payInfoError && <div className="rf-sub">กำลังโหลดข้อมูลบัญชี…</div>}
            {payInfo && (
              <dl className="rf-modal-list">
                <dt>{PAYOUT_KIND_TH[payInfo.kind] || 'บัญชี'}</dt>
                <dd>
                  {payInfo.bank ? `${payInfo.bank} · ` : ''}<span className="rf-acct">{payInfo.account_no}</span>
                  <button type="button" className="rf-link" onClick={() => navigator.clipboard?.writeText(payInfo.account_no)}> คัดลอก</button>
                </dd>
                {payInfo.account_name && (<><dt>ชื่อบัญชี</dt><dd>{payInfo.account_name}</dd></>)}
                {payInfo.qr_image && (<><dt>QR</dt><dd><AuthImage apiBase={apiBase} className="rf-qr" src={payInfo.qr_image} alt="QR รับเงินของลูกค้า" /></dd></>)}
              </dl>
            )}
            <div className="rf-slip">
              <span className="rf-slip-label">แนบสลิปโอน <b>*</b></span>
              <SlipPicker slip={slip} onPick={pickSlip} onClear={() => setSlip(null)} disabled={busy}
                error={Boolean(confirmError) && !slip} />
            </div>
          </div>
        )}
        <p className="rf-modal-note">
          {payMethod === 'TRANSFER'
            ? 'ข้อมูลบัญชีลูกค้าจะถูกลบออกจากระบบเมื่อยืนยัน และเก็บเฉพาะสลิปโอนไว้เป็นหลักฐาน'
            : 'ลูกค้า walk-in : ตรวจเลขคิวให้ตรงก่อนจ่ายเงินสด เมื่อกดยืนยันแล้วจะแก้ไขไม่ได้'}
        </p>
        {confirmError && <div className="rf-error" role="alert">{confirmError}</div>}
        <div className="rf-modal-actions">
          <button type="button" className="rf-btn rf-btn-ghost" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="button" className="rf-btn rf-btn-primary" onClick={confirmRefund} disabled={busy || (payMethod === 'TRANSFER' && (!slip || !payInfo))}>
            {busy ? 'กำลังบันทึก…' : (payMethod === 'TRANSFER' ? 'โอนแล้ว ยืนยัน' : 'จ่ายเงินสดแล้ว ยืนยัน')}
          </button>
        </div>
      </div>
    </div>
  );
}
