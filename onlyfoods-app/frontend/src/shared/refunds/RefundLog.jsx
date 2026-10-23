import { useCallback, useEffect, useMemo, useState } from 'react';

// 💸 รายการคืนเงิน (ใช้ร่วมกันหลายหน้า)
//  ยกเลิกออเดอร์ / เปลี่ยนเป็นเมนูที่ถูกกว่า -> "รอคืน" (ไม่นับเป็นรายได้แล้ว)
//  ลูกค้าออนไลน์ (จ่ายโอนพร้อมสลิป) = โอนคืนเท่านั้น หลังลูกค้าระบุบัญชี ; walk-in = คืนเงินสดที่หน้าร้าน
//  canConfirm  : หน้าร้าน/เจ้าของร้าน กดคืนเงินได้ (backend ตรวจสิทธิ์และร้านซ้ำอีกชั้น)
//  isOwner     : เจ้าของร้านเท่านั้นที่โอนคืนได้ (เห็นข้อมูลบัญชีลูกค้า + แนบสลิปโอนบังคับ) ; หน้าร้านคืนเงินสด walk-in ได้อย่างเดียว
//  showStore   : บัญชี/ผู้บริหาร เห็นทุกร้าน -> แสดงคอลัมน์ร้าน + ตัวกรองร้าน + ส่งออก CSV
import { startPolling } from '../../lib/polling';
import { openFile } from '../ui/AuthImage';
import { TYPE_TH, STATUS_TH, fmtDateTime, payoutLabel, awaitingAccount, ROLE_TH, money, fmtPhone, readError } from './refundText';
import { RefundActionModals } from './RefundModals';
import { RF_STYLES } from './styles';

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

