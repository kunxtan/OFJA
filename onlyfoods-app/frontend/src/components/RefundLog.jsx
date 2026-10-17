import { useCallback, useEffect, useMemo, useState } from 'react';

// 💸 รายการคืนเงิน (ใช้ร่วมกันหลายหน้า)
//  ลูกค้ามารับเงินคืนที่หน้าร้าน : ยกเลิกออเดอร์ / เปลี่ยนเป็นเมนูที่ถูกกว่า -> "รอคืน" (ไม่นับเป็นรายได้แล้ว)
//  canConfirm  : หน้าร้าน/เจ้าของร้าน กด "คืนเงินแล้ว" ได้ (backend ตรวจสิทธิ์และร้านซ้ำอีกชั้น)
//  showStore   : บัญชี/ผู้บริหาร เห็นทุกร้าน -> แสดงคอลัมน์ร้าน + ตัวกรองร้าน + ส่งออก CSV
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

const TYPE_TH = { FULL_CANCEL: 'ยกเลิกออเดอร์', PRICE_DIFF: 'ส่วนต่างราคาเมนู', ITEM_CANCEL: 'ยกเลิกบางรายการ' };
const STATUS_TH = { PENDING: 'รอลูกค้ามารับ', DONE: 'คืนเงินแล้ว', FAILED: 'ไม่สำเร็จ' };
const ROLE_TH = { FRONT_STAFF: 'หน้าร้าน', STORE_OWNER: 'เจ้าของร้าน', ACCOUNTANT: 'ฝ่ายบัญชี', EXECUTIVE: 'ผู้บริหาร' };

const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toDate = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);
const fmtDateTime = (v) => {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const fmtPhone = (p) => {
  const s = String(p || '');
  return s.length === 10 ? `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}` : s;
};

async function readError(res, fallback) {
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) return data.detail.map(d => d?.msg).filter(Boolean).join(', ') || fallback;
  } catch { /* ไม่ใช่ JSON */ }
  return fallback;
}

function downloadCsv(rows, showStore) {
  const head = ['RefundId', 'วันที่ขอคืน', ...(showStore ? ['ร้าน'] : []), 'คิว', 'ลูกค้า', 'ประเภท', 'ยอดเงิน', 'เหตุผล', 'สถานะ', 'คืนเมื่อ', 'ผู้คืน'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map(r => [
    r.RefundId, fmtDateTime(r.RequestedAt), ...(showStore ? [r.StoreName] : []), r.QueueNo,
    r.IsWalkIn ? 'Walk-in' : (r.CustomerName || ''), TYPE_TH[r.RefundType] || r.RefundType, Number(r.Amount || 0).toFixed(2),
    r.Reason, STATUS_TH[r.RefundStatus] || r.RefundStatus, r.RefundedAt ? fmtDateTime(r.RefundedAt) : '', r.RefundedByName || '',
  ].map(esc).join(','));
  const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `refunds_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RefundLog({ apiBase, canConfirm = false, showStore = false, pollMs = 0, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
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
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!confirming) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) setConfirming(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, busy]);

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

  const confirmRefund = async () => {
    if (!confirming) return;
    setBusy(true);
    setConfirmError('');
    try {
      const res = await fetch(`${apiBase}/api/refunds/${confirming.RefundId}/done`, { method: 'PUT' });
      if (!res.ok) throw new Error(await readError(res, 'บันทึกการคืนเงินไม่สำเร็จ'));
      setFlash(`บันทึกแล้ว: คืนเงิน ฿${money(confirming.Amount)} คิว ${confirming.QueueNo}`);
      setConfirming(null);
      await load();
      onChanged?.();
    } catch (err) {
      setConfirmError(err.message || 'บันทึกการคืนเงินไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const colCount = 7 + (showStore ? 1 : 0) + (canConfirm ? 1 : 0);

  return (
    <div className="rf-root">
      <style>{RF_STYLES}</style>

      <div className="rf-head">
        <div>
          <h3>💸 คืนเงินลูกค้า</h3>
          <p>
            {canConfirm
              ? 'ลูกค้ามารับเงินคืนที่หน้าร้าน: ตรวจเลขคิวและชื่อให้ตรงก่อน จ่ายเงินแล้วกด "คืนเงินแล้ว"'
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
          <span>รอลูกค้ามารับ</span>
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
                {filter === 'PENDING' ? 'ไม่มีรายการที่รอลูกค้ามารับเงินคืน' : 'ไม่พบรายการคืนเงิน'}
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
                <td><span className={`rf-badge ${String(r.RefundStatus).toLowerCase()}`}>{STATUS_TH[r.RefundStatus] || r.RefundStatus}</span></td>
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
                      <button type="button" className="rf-btn rf-btn-primary" onClick={() => { setConfirmError(''); setConfirming(r); }}>
                        คืนเงินแล้ว
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirming && (
        <div className="rf-overlay" onClick={() => !busy && setConfirming(null)}>
          <div className="rf-modal" role="dialog" aria-modal="true" aria-labelledby="rf-modal-title" onClick={e => e.stopPropagation()}>
            <h4 id="rf-modal-title">ยืนยันคืนเงินให้ลูกค้า</h4>
            <div className="rf-modal-amount">฿{money(confirming.Amount)}</div>
            <dl className="rf-modal-list">
              <dt>คิว</dt><dd><span className="rf-queue">{confirming.QueueNo}</span></dd>
              <dt>ลูกค้า</dt><dd>{confirming.IsWalkIn ? 'Walk-in' : (confirming.CustomerName || '-')}{confirming.CustomerPhone ? ` · ${fmtPhone(confirming.CustomerPhone)}` : ''}</dd>
              <dt>เหตุผล</dt><dd>{confirming.Reason || TYPE_TH[confirming.RefundType]}</dd>
            </dl>
            <p className="rf-modal-note">ตรวจเลขคิวกับลูกค้าให้ตรงก่อนจ่ายเงิน เมื่อกดยืนยันแล้วจะแก้ไขไม่ได้</p>
            {confirmError && <div className="rf-error" role="alert">{confirmError}</div>}
            <div className="rf-modal-actions">
              <button type="button" className="rf-btn rf-btn-ghost" onClick={() => setConfirming(null)} disabled={busy}>ยกเลิก</button>
              <button type="button" className="rf-btn rf-btn-primary" onClick={confirmRefund} disabled={busy} autoFocus>
                {busy ? 'กำลังบันทึก…' : 'จ่ายเงินแล้ว ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const RF_STYLES = `
.rf-root { background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 16px; padding: 20px; color: ${C.text}; }
.rf-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
.rf-head h3 { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
.rf-head p { margin: 0; color: ${C.sub}; font-size: 13px; line-height: 1.5; max-width: 640px; }
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
.rf-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 2000; }
.rf-modal { background: ${C.bg}; border-radius: 16px; padding: 22px; width: 100%; max-width: 420px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); }
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
