// CSS ของหน้าจอคืนเงิน (ใช้สีจาก C จึงยังเป็น string ใน JS)

export const C = {
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

export const RF_STYLES = `
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
.rf-slip-label { font-weight: 700; color: ${C.text}; }
.rf-slip-label b { color: ${C.red}; }
.rf-dropzone { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 14px; border: 2px dashed ${C.border}; border-radius: 14px; background: ${C.bg}; text-align: center; cursor: pointer; outline: none; transition: border-color 0.2s ease, background 0.2s ease; }
.rf-dropzone:hover, .rf-dropzone:focus-visible, .rf-dropzone.dragging { border-color: ${C.primary}; background: ${C.primarySoft}; }
.rf-dropzone.has-error { border-color: ${C.red}; }
.rf-dropzone-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 50%; background: ${C.bg}; color: ${C.primary}; box-shadow: 0 4px 12px rgba(30,41,59,0.08); }
.rf-dropzone-title { margin-top: 2px; font-size: 13px; color: ${C.text}; }
.rf-dropzone-title span { color: ${C.primary}; font-weight: 700; }
.rf-dropzone-hint { font-size: 12px; color: ${C.sub}; }
.rf-slip-card { display: flex; gap: 12px; align-items: center; padding: 10px; border: 1px solid ${C.border}; border-radius: 14px; background: ${C.bg}; }
.rf-slip-thumb { padding: 0; border: 0; background: #F1F5F9; border-radius: 10px; cursor: zoom-in; flex-shrink: 0; }
.rf-slip-thumb img { display: block; width: 84px; height: 108px; object-fit: contain; border-radius: 10px; }
.rf-slip-meta { min-width: 0; flex: 1; }
.rf-slip-meta .name { font-size: 13.5px; font-weight: 700; color: ${C.text}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rf-slip-meta .sub { margin-top: 2px; font-size: 12px; color: ${C.sub}; }
.rf-slip-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.rf-mini-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border: 1px solid ${C.border}; border-radius: 9px; background: ${C.bg}; font: inherit; font-size: 12.5px; font-weight: 600; color: ${C.text}; cursor: pointer; }
.rf-mini-btn:hover:not(:disabled) { border-color: ${C.primary}; color: ${C.primaryDark}; }
.rf-mini-btn.danger:hover:not(:disabled) { border-color: ${C.red}; color: ${C.red}; }
.rf-mini-btn:disabled { opacity: 0.6; cursor: not-allowed; }
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
