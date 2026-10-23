import { useCallback, useEffect, useMemo, useState } from 'react';

// 💸 รายการคืนเงิน (ใช้ร่วมกันหลายหน้า)
//  ยกเลิกออเดอร์ / เปลี่ยนเป็นเมนูที่ถูกกว่า -> "รอคืน" (ไม่นับเป็นรายได้แล้ว)
//  ลูกค้าออนไลน์ (จ่ายโอนพร้อมสลิป) = โอนคืนเท่านั้น หลังลูกค้าระบุบัญชี ; walk-in = คืนเงินสดที่หน้าร้าน
//  canConfirm  : หน้าร้าน/เจ้าของร้าน กดคืนเงินได้ (backend ตรวจสิทธิ์และร้านซ้ำอีกชั้น)
//  isOwner     : เจ้าของร้านเท่านั้นที่โอนคืนได้ (เห็นข้อมูลบัญชีลูกค้า + แนบสลิปโอนบังคับ) ; หน้าร้านคืนเงินสด walk-in ได้อย่างเดียว
//  showStore   : บัญชี/ผู้บริหาร เห็นทุกร้าน -> แสดงคอลัมน์ร้าน + ตัวกรองร้าน + ส่งออก CSV
import { startPolling } from '../utils/polling';
import AuthImage, { openFile } from './AuthImage';

const C = {
  primary: '#FF6B00',
  primaryDark: '#C2410C',
  primarySoft: '#FFF1E6',
  text: '#1E293B',
  sub: '#64748B',
  border: '#F0E3D3',
  bg: '#FFFFFF',
  amber: '#B45309',
  amberSoft: '#FEF3C7',
  green: '#047857',
  greenSoft: '#D1FAE5',
  red: '#B91C1C',
  redSoft: '#FEE2E2',
};

export const TYPE_TH = { FULL_CANCEL: 'ยกเลิกออเดอร์', PRICE_DIFF: 'ส่วนต่างราคาเมนู', ITEM_CANCEL: 'ยกเลิกบางรายการ' };
export const STATUS_TH = { PENDING: 'รอคืนเงิน', DONE: 'คืนเงินแล้ว', FAILED: 'ไม่สำเร็จ' };

// ลูกค้าออนไลน์ที่ยังไม่ได้ระบุบัญชีรับเงินคืน (ร้านยังโอนไม่ได้)
export const awaitingAccount = (r) => r.RefundStatus === 'PENDING' && !r.IsWalkIn && r.PayoutMethod !== 'TRANSFER';
const PAYOUT_KIND_TH = { PROMPTPAY: 'พร้อมเพย์', BANK: 'ธนาคาร' };
const ROLE_TH = { FRONT_STAFF: 'หน้าร้าน', STORE_OWNER: 'เจ้าของร้าน', ACCOUNTANT: 'ฝ่ายบัญชี', EXECUTIVE: 'ผู้บริหาร' };

export const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toDate = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);
const fmtDateTime = (v) => {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};
export const fmtPhone = (p) => {
  const s = String(p || '');
  return s.length === 10 ? `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}` : s;
};

const MAX_SLIP_MB = 5;
const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(fr.result);
  fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
  fr.readAsDataURL(file);
});

// วิธีรับเงินของรายการ : ที่ลูกค้าเลือก (ยังรอคืน) หรือที่ร้านจ่ายจริง (คืนแล้ว)
export function payoutLabel(r) {
  if (r.RefundStatus === 'DONE') return r.PaidMethod === 'TRANSFER' ? 'โอนแล้ว' : 'เงินสด';
  if (r.IsWalkIn) return 'เงินสดที่ร้าน';
  if (r.PayoutMethod !== 'TRANSFER') return 'รอลูกค้าระบุบัญชี';
  const kind = PAYOUT_KIND_TH[r.PayoutKind] || 'โอน';
  return `โอน · ${kind}${r.PayoutAccountNo ? ` ${r.PayoutAccountNo}` : ''}`;
}

async function readError(res, fallback) {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) return data.detail.map(d => d?.msg).filter(Boolean).join(', ') || fallback;
  } catch { /* ไม่ใช่ JSON */ }
  return fallback;
}

function downloadCsv(rows, showStore) {
  const head = ['RefundId', 'วันที่ขอคืน', ...(showStore ? ['ร้าน'] : []), 'คิว', 'ลูกค้า', 'ประเภท', 'ยอดเงิน', 'เหตุผล', 'วิธีรับเงิน', 'สถานะ', 'คืนเมื่อ', 'ผู้คืน'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map(r => [
    r.RefundId, fmtDateTime(r.RequestedAt), ...(showStore ? [r.StoreName] : []), r.QueueNo,
    r.IsWalkIn ? 'Walk-in' : (r.CustomerName || ''), TYPE_TH[r.RefundType] || r.RefundType, Number(r.Amount || 0).toFixed(2),
    r.Reason, payoutLabel(r), STATUS_TH[r.RefundStatus] || r.RefundStatus, r.RefundedAt ? fmtDateTime(r.RefundedAt) : '', r.RefundedByName || '',
  ].map(esc).join(','));
  const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `refunds_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RefundLog({ apiBase, canConfirm = false, isOwner = false, showStore = false, pollMs = 0, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [confirming, setConfirming] = useState(null);   // แถวที่เปิดหน้าต่าง "คืนเงินแล้ว / โอนคืน"
  const [checking, setChecking] = useState(null);       // แถวที่เปิดหน้าต่างตรวจสลิป (ออเดอร์ถูกบังคับยกเลิกก่อนร้านตรวจ)
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/refunds?limit=2000`);
      if (!res.ok) throw new Error(await readError(res, 'โหลดรายการคืนเงินไม่สำเร็จ'));
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message || 'โหลดรายการคืนเงินไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    load();
    if (!pollMs) return undefined;
    return startPolling(load, pollMs);
  }, [load, pollMs]);

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const stores = useMemo(() => {
    const m = new Map();
    rows.forEach(r => m.set(String(r.StoreId), r.StoreName));
    return [...m.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'th'));
  }, [rows]);

  const scoped = useMemo(() => rows.filter(r => storeFilter === 'all' || String(r.StoreId) === storeFilter), [rows, storeFilter]);
  const totals = useMemo(() => scoped.reduce((acc, r) => {
    const k = r.RefundStatus === 'DONE' ? 'done' : r.RefundStatus === 'PENDING' ? 'pending' : null;
    if (k) { acc[k].count += 1; acc[k].amount += Number(r.Amount || 0); }
    return acc;
  }, { pending: { count: 0, amount: 0 }, done: { count: 0, amount: 0 } }), [scoped]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter(r => {
      if (filter !== 'ALL' && r.RefundStatus !== filter) return false;
      if (!q) return true;
      return [r.QueueNo, r.CustomerName, r.CustomerPhone, r.OrderId, r.StoreName]
        .some(v => String(v ?? '').toLowerCase().includes(q));
    });
  }, [scoped, filter, search]);

  const colCount = 8 + (showStore ? 1 : 0) + (canConfirm ? 1 : 0);

  return (
    <div className="rf-root">
      <style>{RF_STYLES}</style>

      <div className="rf-head">
        <div>
          <h3>💸 คืนเงินลูกค้า</h3>
          <p>
            {canConfirm
              ? (isOwner
                ? 'ลูกค้าออนไลน์รับเงินคืนทางโอนเท่านั้น (แนบสลิปโอนทุกครั้ง) · walk-in คืนเงินสดที่หน้าร้าน'
                : 'คืนเงินสดให้ลูกค้า walk-in: ตรวจเลขคิวให้ตรงก่อน จ่ายเงินแล้วกด "คืนเงินสดแล้ว" · ลูกค้าออนไลน์เจ้าของร้านโอนคืนให้')
              : 'บันทึกการคืนเงินทุกรายการ (ดูอย่างเดียว) — แก้ไขย้อนหลังไม่ได้'}
            {' '}ยอดที่ "รอคืน" ไม่ถูกนับเป็นรายได้
          </p>
        </div>
        <div className="rf-head-actions">
          {showStore && <button type="button" className="rf-btn rf-btn-ghost" onClick={() => downloadCsv(visible, showStore)} disabled={!visible.length}>⬇ ส่งออก CSV</button>}
          <button type="button" className="rf-btn rf-btn-ghost" onClick={load}>↻ รีเฟรช</button>
        </div>
      </div>

      <div className="rf-summary">
        <div className="rf-stat pending">
          <span>รอคืนเงิน</span>
          <b>฿{money(totals.pending.amount)}</b>
          <small>{totals.pending.count} รายการ</small>
        </div>
        <div className="rf-stat done">
          <span>คืนเงินแล้ว</span>
          <b>฿{money(totals.done.amount)}</b>
          <small>{totals.done.count} รายการ</small>
        </div>
      </div>

      <div className="rf-toolbar">
        <div className="rf-tabs" role="tablist" aria-label="สถานะการคืนเงิน">
          {[['PENDING', `รอคืน (${totals.pending.count})`], ['DONE', 'คืนแล้ว'], ['ALL', 'ทั้งหมด']].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k}
              className={`rf-tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <div className="rf-filters">
          {showStore && (
            <select className="rf-input" value={storeFilter} onChange={e => setStoreFilter(e.target.value)} aria-label="กรองตามร้าน">
              <option value="all">ทุกร้าน</option>
              {stores.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          <input className="rf-input" type="search" placeholder="ค้นหาเลขคิว / ชื่อ / เบอร์" value={search}
            onChange={e => setSearch(e.target.value)} aria-label="ค้นหารายการคืนเงิน" />
        </div>
      </div>

      {flash && <div className="rf-flash" role="status">✅ {flash}</div>}
      {error && <div className="rf-error" role="alert">{error} <button type="button" className="rf-link" onClick={load}>ลองใหม่</button></div>}

      <div className="rf-table-wrap">
        <table className="rf-table">
          <thead>
            <tr>
              <th>คิว</th>
              {showStore && <th>ร้าน</th>}
              <th>ลูกค้า</th>
              <th>ประเภท / เหตุผล</th>
              <th className="num">ยอดคืน</th>
              <th>ขอคืนเมื่อ</th>
              <th>วิธีรับเงิน</th>
              <th>สถานะ</th>
              <th>ผู้คืน</th>
              {canConfirm && <th aria-label="ดำเนินการ"></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colCount} className="rf-empty">กำลังโหลดรายการคืนเงิน…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={colCount} className="rf-empty">
                {filter === 'PENDING' ? 'ไม่มีรายการที่รอคืนเงิน' : 'ไม่พบรายการคืนเงิน'}
              </td></tr>
            ) : visible.map(r => (
              <tr key={r.RefundId}>
                <td><span className="rf-queue">{r.QueueNo}</span><div className="rf-sub">#{r.OrderId}</div></td>
                {showStore && <td>{r.StoreName}</td>}
                <td>
                  {r.IsWalkIn ? <span className="rf-sub">Walk-in</span> : (r.CustomerName || '-')}
                  {r.CustomerPhone && <div className="rf-sub">{fmtPhone(r.CustomerPhone)}</div>}
                </td>
                <td>
                  <b>{TYPE_TH[r.RefundType] || r.RefundType}</b>
                  <div className="rf-sub rf-reason">{r.Reason || '-'}</div>
                </td>
                <td className="num"><b>฿{money(r.Amount)}</b></td>
                <td>{fmtDateTime(r.RequestedAt)}</td>
                <td>
                  <span className={`rf-method ${(r.RefundStatus === 'DONE' ? r.PaidMethod : r.PayoutMethod) === 'TRANSFER' ? 'transfer' : ''}`}>{payoutLabel(r)}</span>
                  {r.RefundStatus === 'PENDING' && r.PayoutMethod === 'TRANSFER' && r.PayoutBank && <div className="rf-sub">{r.PayoutBank}</div>}
                  {r.TransferSlipUrl && <div><button type="button" className="rf-link" onClick={() => openFile(apiBase, r.TransferSlipUrl)}>ดูสลิปโอน</button></div>}
                </td>
                <td>
                  <span className={`rf-badge ${String(r.RefundStatus).toLowerCase()}`}>{STATUS_TH[r.RefundStatus] || r.RefundStatus}</span>
                  {r.RefundStatus === 'PENDING' && r.SlipUnverified && (
                    <div><span className="rf-badge unverified" title="ออเดอร์ถูกยกเลิกก่อนร้านตรวจสลิป ต้องตรวจสลิปและยอดเข้าบัญชีก่อนคืนเงิน">สลิปยังไม่ได้ตรวจ</span></div>
                  )}
                </td>
                <td>
                  {r.RefundedAt ? (
                    <>
                      {r.RefundedByName || '-'}{r.RefundedByRole && <span className="rf-sub"> ({ROLE_TH[r.RefundedByRole] || r.RefundedByRole})</span>}
                      <div className="rf-sub">{fmtDateTime(r.RefundedAt)}</div>
                    </>
                  ) : <span className="rf-sub">-</span>}
                </td>
                {canConfirm && (
                  <td>
                    {r.RefundStatus === 'PENDING' && (
                      r.SlipUnverified
                        ? <button type="button" className="rf-btn rf-btn-ghost" onClick={() => setChecking(r)}>ตรวจสลิปก่อน</button>
                        : awaitingAccount(r)
                        ? <span className="rf-sub">รอลูกค้า<br />ระบุบัญชีรับเงินคืน</span>
                        : !r.IsWalkIn && !isOwner
                        ? <span className="rf-sub">รอเจ้าของร้าน<br />โอนคืน</span>
                        : (
                          <button type="button" className="rf-btn rf-btn-primary" onClick={() => setConfirming(r)}>
                            {r.IsWalkIn ? 'คืนเงินสดแล้ว' : 'โอนคืน'}
                          </button>
                        )
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RefundActionModals
        apiBase={apiBase}
        isOwner={isOwner}
        confirming={confirming}
        checking={checking}
        onClose={() => { setConfirming(null); setChecking(null); }}
        onDone={async (message) => {
          setFlash(message);
          setConfirming(null);
          setChecking(null);
          await load();
          onChanged?.();
        }}
      />
    </div>
  );
}

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

function useEscape(onClose, busy) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
}

function SlipCheckModal({ apiBase, row: checking, onClose, onDone }) {
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

function ConfirmRefundModal({ apiBase, isOwner, row: confirming, onClose, onDone }) {
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

  const pickSlip = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setConfirmError('กรุณาเลือกไฟล์รูปภาพ'); return; }
    if (file.size > MAX_SLIP_MB * 1024 * 1024) { setConfirmError(`ไฟล์รูปต้องไม่เกิน ${MAX_SLIP_MB} MB`); return; }
    try {
      setSlip({ name: file.name, dataUrl: await readFileAsDataUrl(file) });
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
            <label className="rf-slip">
              <span>แนบสลิปโอน <b>(บังคับ)</b></span>
              <input type="file" accept="image/*" onChange={pickSlip} disabled={busy} />
              {slip && <img className="rf-slip-preview" src={slip.dataUrl} alt="สลิปโอนที่เลือก" />}
            </label>
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

const RF_STYLES = `
.rf-root { background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 16px; padding: 20px; color: ${C.text}; }
.rf-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
.rf-head h3 { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
.rf-head p { margin: 0; color: ${C.sub}; font-size: 13px; line-height: 1.5; max-width: 640px; }
.rf-method { display: inline-block; padding: 2px 8px; border-radius: 8px; background: ${C.primarySoft}; color: ${C.primaryDark}; font-size: 12px; font-weight: 700; }
.rf-method.transfer { background: #E0F2FE; color: #0369A1; }
.rf-pay-box { background: #F8FAFC; border: 1px solid ${C.border}; border-radius: 12px; padding: 12px 14px; margin: 12px 0; display: grid; gap: 8px; }
.rf-acct { font-weight: 800; letter-spacing: .5px; font-variant-numeric: tabular-nums; }
.rf-qr { max-width: 160px; max-height: 160px; border-radius: 8px; border: 1px solid ${C.border}; }
.rf-slip { display: grid; gap: 6px; font-size: 13px; }
.rf-slip-preview { max-width: 180px; max-height: 220px; border-radius: 8px; border: 1px solid ${C.border}; }
.rf-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.rf-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
.rf-stat { border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
.rf-stat span { font-size: 12.5px; font-weight: 700; }
.rf-stat b { font-size: 22px; }
.rf-stat small { font-size: 12px; color: ${C.sub}; }
.rf-stat.pending { background: ${C.amberSoft}; color: ${C.amber}; }
.rf-stat.done { background: ${C.greenSoft}; color: ${C.green}; }
.rf-toolbar { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.rf-tabs { display: inline-flex; background: ${C.primarySoft}; border-radius: 10px; padding: 3px; gap: 2px; }
.rf-tab { border: 0; background: transparent; padding: 8px 14px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 700; color: ${C.sub}; cursor: pointer; min-height: 36px; }
.rf-tab.active { background: ${C.bg}; color: ${C.primaryDark}; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.rf-filters { display: flex; gap: 8px; flex-wrap: wrap; flex: 1 1 260px; justify-content: flex-end; }
.rf-input { font: inherit; font-size: 13px; padding: 8px 12px; border: 1px solid ${C.border}; border-radius: 10px; min-height: 38px; background: ${C.bg}; color: ${C.text}; min-width: 0; flex: 1 1 180px; max-width: 280px; }
.rf-btn { font: inherit; font-size: 13px; font-weight: 700; border-radius: 10px; padding: 8px 14px; min-height: 38px; cursor: pointer; border: 1px solid transparent; white-space: nowrap; }
.rf-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.rf-btn-primary { background: ${C.primary}; color: #fff; }
.rf-btn-primary:hover:not(:disabled) { background: ${C.primaryDark}; }
.rf-btn-ghost { background: ${C.bg}; border-color: ${C.border}; color: ${C.text}; }
.rf-btn-ghost:hover:not(:disabled) { border-color: ${C.primary}; color: ${C.primaryDark}; }
.rf-btn:focus-visible, .rf-tab:focus-visible, .rf-input:focus-visible, .rf-link:focus-visible { outline: 3px solid ${C.primary}; outline-offset: 2px; }
.rf-link { background: none; border: 0; color: inherit; text-decoration: underline; font: inherit; font-weight: 700; cursor: pointer; }
.rf-flash { background: ${C.greenSoft}; color: ${C.green}; padding: 10px 12px; border-radius: 10px; font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.rf-error { background: ${C.redSoft}; color: ${C.red}; padding: 10px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.rf-table-wrap { overflow-x: auto; border: 1px solid ${C.border}; border-radius: 12px; }
.rf-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 760px; }
.rf-table th { text-align: left; font-size: 12px; color: ${C.sub}; font-weight: 700; background: #FFFBF6; padding: 10px 12px; border-bottom: 1px solid ${C.border}; white-space: nowrap; }
.rf-table td { padding: 10px 12px; border-bottom: 1px solid ${C.border}; vertical-align: top; }
.rf-table tr:last-child td { border-bottom: 0; }
.rf-table .num { text-align: right; white-space: nowrap; }
.rf-empty { text-align: center; color: ${C.sub}; padding: 28px 12px !important; }
.rf-queue { display: inline-block; background: ${C.primarySoft}; color: ${C.primaryDark}; font-weight: 800; border-radius: 8px; padding: 2px 8px; }
.rf-sub { color: ${C.sub}; font-size: 12px; }
.rf-reason { max-width: 280px; }
.rf-badge { display: inline-block; border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.rf-badge.pending { background: ${C.amberSoft}; color: ${C.amber}; }
.rf-badge.done { background: ${C.greenSoft}; color: ${C.green}; }
.rf-badge.failed { background: ${C.redSoft}; color: ${C.red}; }
.rf-badge.unverified { background: #FEF3C7; color: #92400E; margin-top: 4px; }
.rf-btn-danger { background: ${C.redSoft}; color: ${C.red}; border-color: ${C.redSoft}; }
.rf-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 2000; }
.rf-modal { background: ${C.bg}; border-radius: 16px; padding: 22px; width: 100%; max-width: 420px; max-height: calc(100vh - 32px); overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.2); }
.rf-modal h4 { margin: 0 0 6px; font-size: 17px; }
.rf-modal-amount { font-size: 30px; font-weight: 800; color: ${C.primaryDark}; margin-bottom: 10px; }
.rf-modal-list { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0 0 12px; font-size: 14px; }
.rf-modal-list dt { color: ${C.sub}; }
.rf-modal-list dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.rf-modal-note { font-size: 12.5px; color: ${C.amber}; background: ${C.amberSoft}; border-radius: 10px; padding: 8px 10px; margin: 0 0 12px; }
.rf-modal-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
@media (max-width: 600px) {
  .rf-root { padding: 14px; border-radius: 12px; }
  .rf-filters { justify-content: stretch; }
  .rf-input { max-width: none; }
}
`;
