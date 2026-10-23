// CSS ของหน้าพนักงานหน้าร้าน (ใช้สีจาก PALETTE จึงยังเป็น string ใน JS)
import { PALETTE } from './theme';

/* ============================================================
   STYLES: Berry Style Structure + Receipt Modal Additions
   ============================================================ */
export const CV_STYLES = `
::-webkit-scrollbar { width: 0px; background: transparent; display: none; }
* { scrollbar-width: none; -ms-overflow-style: none; }

.cv-root {
  --radius-lg: 14px;
  --radius-md: 9px;
  --shadow-sm: 0 2px 10px rgba(42,44,65,0.05);
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column;
  background: ${PALETTE.bg};
  font-family: 'Roboto', 'Sarabun', sans-serif;
  color: ${PALETTE.dark};
  overflow: hidden; z-index: 1000;
}
.cv-root * { box-sizing: border-box; }

/* ---------- Topbar ---------- */
.cv-topbar {
  height: 80px; background: ${PALETTE.white}; display: flex; align-items: center;
  justify-content: space-between; padding: 0 24px; border-bottom: 1px solid ${PALETTE.border};
  flex-shrink: 0; z-index: 110;
}
.cv-topbar-left { display: flex; align-items: center; gap: 16px; }
.cv-brand { width: 236px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: center; white-space: nowrap; }
.brand-title { font-size: 20px; color: ${PALETTE.dark}; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.brand-subtitle { font-size: 12px; margin-top: 4px; color: ${PALETTE.textSub}; display: flex; align-items: center; gap: 6px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: ${PALETTE.green}; display: inline-block; }
.status-dot.closed { background: ${PALETTE.red}; }
.status-text { color: ${PALETTE.green}; font-weight: 600; }
.status-text.closed { color: ${PALETTE.red}; }

.cv-icon-btn {
  width: 34px; height: 34px; border-radius: var(--radius-md); border: none;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  position: relative; transition: all 0.2s ease;
}
.cv-icon-btn.coral-light { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-icon-btn.coral-light:hover { background: ${PALETTE.coral}; color: #fff; }
.cv-icon-btn.yellow-light { background: ${PALETTE.yellowLight}; color: #F59E0B; }
.cv-icon-btn.yellow-light:hover { background: #F59E0B; color: #fff; }
.cv-badge-dot-count {
  position: absolute; top: -6px; right: -6px; background: ${PALETTE.red}; color: #fff;
  font-size: 10px; font-weight: 700; min-width: 18px; height: 18px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center; padding: 0 4px;
}
.cv-topbar-right { display: flex; align-items: center; gap: 16px; }

.cv-store-chip {
  display: flex; align-items: center; gap: 8px; background: ${PALETTE.bgSoft};
  padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: 500; color: ${PALETTE.dark};
}
.store-status-pill { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 12px; }
.store-status-pill.open { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; }
.store-status-pill.closed { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }

.cv-profile-container { position: relative; }
.cv-user-chip {
  background: ${PALETTE.bgSoft}; padding: 6px 12px; border-radius: 20px;
  display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s ease;
}
.cv-user-chip:hover { background: #E1E3EE; }
.cv-user-chip .user-name { font-size: 14px; font-weight: 500; color: ${PALETTE.dark}; }
.cv-user-chip .role-tag { font-size: 11px; background: ${PALETTE.dark}; color: #fff; padding: 2px 8px; border-radius: 10px; font-weight: 600; }

.cv-profile-dropdown {
  position: absolute; top: calc(100% + 10px); right: 0; background: ${PALETTE.white};
  width: 280px; border-radius: var(--radius-lg); box-shadow: 0px 8px 24px rgba(0,0,0,0.1);
  border: 1px solid ${PALETTE.border}; padding: 20px; z-index: 1000;
  animation: cvSlideDown 0.2s ease-out forwards;
}
@keyframes cvSlideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.cv-profile-dropdown .dropdown-header h4 { margin: 0; font-size: 15px; font-weight: 600; color: ${PALETTE.dark}; }
.cv-profile-dropdown .dropdown-header p { margin: 4px 0 16px; font-size: 13px; color: ${PALETTE.textSub}; }
.cv-profile-dropdown .dropdown-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 6px;
  cursor: pointer; font-size: 14px; color: ${PALETTE.dark}; transition: background 0.2s; margin-bottom: 2px;
}
.cv-profile-dropdown .dropdown-item:hover { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }

/* ---------- Body / Sidebar ---------- */
.cv-body { display: flex; flex: 1; overflow: hidden; position: relative; }
.cv-sidebar-backdrop { display: none; }
.cv-sidebar {
  width: 260px; background: ${PALETTE.white}; border-right: 1px solid ${PALETTE.border};
  display: flex; flex-direction: column; flex-shrink: 0; z-index: 100; overflow-x: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.cv-nav { padding: 16px; flex: 1; overflow-y: auto; overflow-x: hidden; }
.cv-nav-label { font-size: 14px; font-weight: 500; color: ${PALETTE.dark}; padding: 12px 16px; margin-bottom: 4px; white-space: nowrap; }
.cv-nav-item {
  display: flex; align-items: center; gap: 16px; padding: 10px 16px; margin-bottom: 8px;
  border-radius: var(--radius-md); cursor: pointer; color: ${PALETTE.dark}; transition: all 0.2s ease; white-space: nowrap;
}
.cv-nav-item:hover, .cv-nav-item.active { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-nav-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cv-nav-text .title { font-size: 14px; font-weight: 500; }
.cv-nav-text .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }
.cv-nav-item:hover .caption, .cv-nav-item.active .caption { color: ${PALETTE.coral}; opacity: 0.8; }
.cv-nav-badge { margin-left: auto; background: ${PALETTE.dark}; color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 12px; font-weight: bold; }

@media (min-width: 769px) {
  .cv-sidebar.collapsed { width: 88px; }
  .cv-sidebar.collapsed .hide-on-collapse { display: none !important; }
  .cv-sidebar.collapsed .cv-nav-item { justify-content: center; padding: 12px; }
}
@media (max-width: 768px) {
  .cv-sidebar { position: absolute; top: 0; bottom: 0; left: 0; transform: translateX(-100%); }
  .cv-sidebar.open { transform: translateX(0); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
  .cv-sidebar-backdrop { display: block; position: absolute; inset: 0; z-index: 99; background: rgba(15, 23, 42, 0.35); }
  .cv-brand { width: auto; }
  .cv-topbar-left, .cv-topbar-right { gap: 8px; min-width: 0; }
  .cv-topbar-right { flex-shrink: 1; justify-content: flex-end; }
  .brand-icon { display: none; }
  .brand-title { font-size: 17px; }
  .cv-store-chip { min-width: 0; padding: 6px 10px; font-size: 13px; }
  .cv-store-chip > span:not(.store-status-pill) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 28vw; }
  .cv-content { padding: 14px; }
  .cv-topbar { padding: 0 12px; }
}
@media (max-width: 560px) {
  .cv-user-chip .user-name { display: none; }
  .cv-store-chip > svg { display: none; }
}

/* ---------- Content / Cards ---------- */
.cv-content { flex: 1; padding: 24px; overflow-y: auto; }
.cv-live-error { margin-bottom: 14px; padding: 10px 14px; border-radius: 12px; background: #FEE2E2; color: #991B1B; font-weight: 700; font-size: 14px; }
.cv-stack { display: flex; flex-direction: column; gap: 24px; }
.cv-card {
  background: ${PALETTE.white}; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
  padding: 24px; position: relative; overflow: hidden;
}
.cv-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.cv-card-head h3 { margin: 0; font-size: 18px; font-weight: 600; color: ${PALETTE.dark}; }
.cv-card-head .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 4px; }

/* Stat cards (Owner: solid colour + decorative circles) */
.cv-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.cv-bg-coral { background: ${PALETTE.coral}; color: #fff; }
.cv-bg-yellow { background: ${PALETTE.yellowLight}; color: ${PALETTE.dark}; }
.cv-bg-dark { background: ${PALETTE.dark}; color: #fff; }
.cv-decor-circle-1 { position: absolute; width: 210px; height: 210px; background: ${PALETTE.coralDark}; border-radius: 50%; top: -85px; right: -95px; opacity: 0.5; }
.cv-bg-coral::after { content: ''; position: absolute; width: 210px; height: 210px; background: ${PALETTE.coralDark}; border-radius: 50%; top: -125px; right: -15px; opacity: 0.5; }
.cv-stat-body { position: relative; z-index: 2; }
.cv-stat-body h2 { margin: 0 0 4px; font-size: 30px; font-weight: 500; }
.cv-stat-body p { margin: 0; font-size: 14px; opacity: 0.9; }

.foodcourt-closed-banner, .store-closed-banner { display: flex; gap: 12px; align-items: center; padding: 14px 16px; border-radius: var(--radius-md); margin-bottom: 24px; }
.foodcourt-closed-banner { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }
.store-closed-banner { background: ${PALETTE.yellowLight}; color: #9A6A12; }
.foodcourt-closed-banner b, .store-closed-banner b { display: block; font-size: 14px; font-weight: 600; }
.foodcourt-closed-banner small, .store-closed-banner small { display: block; margin-top: 2px; font-size: 12px; opacity: .85; }

/* ---------- Tables ---------- */
.cv-table-wrapper { overflow-x: auto; }
.cv-table { width: 100%; border-collapse: collapse; }
.cv-table th { text-align: left; padding: 16px; font-size: 14px; font-weight: 600; color: ${PALETTE.dark}; border-bottom: 1px solid ${PALETTE.border}; }
.cv-table td { padding: 16px; border-bottom: 1px solid ${PALETTE.border}; font-size: 14px; vertical-align: middle; }
.cv-table tr:last-child td { border-bottom: none; }
.empty-state { text-align: center; color: ${PALETTE.textSub}; padding: 32px !important; font-size: 14px; }
.queue-pill { font-family: 'Roboto', monospace; background: ${PALETTE.bgSoft}; padding: 4px 10px; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block; }
.walkin-tag { display: block; width: fit-content; margin-top: 4px; background: ${PALETTE.dark}; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.item-row { margin-bottom: 3px; font-size: 14px; }
.item-note { color: ${PALETTE.amber}; font-size: 12px; margin-left: 4px; }
.order-note { font-size: 12px; color: ${PALETTE.textSub}; background: ${PALETTE.bg}; padding: 4px 8px; border-radius: 6px; margin-top: 4px; }
.slip-thumb { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.slip-thumb img { width: 42px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid ${PALETTE.border}; }
.slip-thumb span { font-size: 12px; color: ${PALETTE.coral}; font-weight: 500; }
.cv-action-buttons { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.action-lock-note { font-size: 12px; color: ${PALETTE.textSub}; padding: 6px 8px; }

/* ---------- Buttons ---------- */
.cv-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 40px; padding: 8px 16px; border-radius: 8px; border: none; font-size: 14px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: all 0.2s ease;
}
.cv-btn:disabled { opacity: .45; cursor: not-allowed; }
.cv-btn-lg { min-height: 52px; padding: 12px 24px; font-size: 17px; border-radius: 10px; }
.queue-search { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border: 2px solid ${PALETTE.border}; border-radius: 12px; background: #fff; margin-bottom: 12px; }
.queue-search:focus-within { border-color: ${PALETTE.coral}; }
.queue-search-icon { font-size: 20px; }
.queue-search input { flex: 1; border: none; outline: none; font-size: 22px; font-weight: 700; font-family: inherit; padding: 6px 0; min-width: 0; background: transparent; }
.queue-search-hint { font-size: 13px; color: ${PALETTE.textSub}; margin: -4px 0 10px; }
.queue-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.queue-tab { min-height: 44px; padding: 8px 16px; border-radius: 999px; border: 1px solid ${PALETTE.border}; background: #fff; font-family: inherit; font-size: 15px; font-weight: 600; color: ${PALETTE.dark}; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.queue-tab.active { background: ${PALETTE.dark}; border-color: ${PALETTE.dark}; color: #fff; }
.queue-tab-count { min-width: 26px; padding: 1px 8px; border-radius: 999px; background: ${PALETTE.bgSoft}; color: ${PALETTE.dark}; font-size: 13px; text-align: center; }
.queue-tab.active .queue-tab-count { background: rgba(255,255,255,.2); color: #fff; }
.queue-tab.alert:not(.active) { border-color: ${PALETTE.coral}; color: ${PALETTE.coral}; }
.queue-tab.alert .queue-tab-count { background: ${PALETTE.coral}; color: #fff; }
.handover-card { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding: 16px 18px; margin-bottom: 14px; border-radius: 14px; border: 2px solid ${PALETTE.border}; background: ${PALETTE.bgSoft}; }
.handover-card.ready { border-color: ${PALETTE.green}; background: ${PALETTE.greenLight}; }
.handover-main { display: flex; gap: 16px; align-items: center; min-width: 0; }
.handover-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.handover-queue { font-size: 34px; font-weight: 800; font-family: 'Roboto', monospace; color: ${PALETTE.dark}; }
.handover-name { font-size: 17px; font-weight: 700; color: ${PALETTE.dark}; }
.handover-items { font-size: 14px; color: ${PALETTE.textSub}; margin: 2px 0 6px; }
.handover-status { font-size: 13px; color: ${PALETTE.textSub}; }
.handover-wait { font-size: 14px; font-weight: 600; color: ${PALETTE.amber}; }
.cv-btn-icon {
  width: 40px; height: 40px; border-radius: 6px; border: none; background: ${PALETTE.bgSoft};
  display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${PALETTE.dark}; transition: all 0.2s ease;
}
.cv-btn-icon:hover { background: ${PALETTE.coral}; color: #fff; }
.btn-coral { background: ${PALETTE.coral}; color: #fff; }
.btn-coral:hover { background: ${PALETTE.coralDark}; }
.btn-dark { background: ${PALETTE.dark}; color: #fff; }
.btn-dark:hover { background: ${PALETTE.darkLight}; }
.btn-success { background: ${PALETTE.green}; color: #fff; }
.btn-success:hover { opacity: .9; }
.btn-danger { background: ${PALETTE.red}; color: #fff; }
.btn-danger:hover { opacity: .9; }
.btn-success-light { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; }
.btn-success-light:hover { background: ${PALETTE.green}; color: #fff; }
.btn-danger-light { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }
.btn-danger-light:hover { background: ${PALETTE.red}; color: #fff; }
.btn-warning-light { background: ${PALETTE.yellowLight}; color: ${PALETTE.amber}; }
.btn-warning-light:hover { background: ${PALETTE.amber}; color: #fff; }
.btn-ghost { background: ${PALETTE.bgSoft}; color: ${PALETTE.dark}; }
.btn-ghost:hover { background: #E1E3EE; }
.btn-danger-solid { background: ${PALETTE.red}; color: #fff; }
.btn-danger-solid:hover { opacity: .9; }
.btn-del { background: none; border: none; color: ${PALETTE.red}; cursor: pointer; font-size: 14px; }

/* ---------- Badges ---------- */
.cv-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 600; }
.cv-badge.tone-success { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; }
.cv-badge.tone-warning { background: ${PALETTE.yellowLight}; color: ${PALETTE.amber}; }
.cv-badge.tone-danger { background: ${PALETTE.redLight}; color: ${PALETTE.red}; }
.cv-badge.tone-coral { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; }
.cv-badge.tone-neutral { background: ${PALETTE.bgSoft}; color: ${PALETTE.dark}; }

/* ---------- Walk-in POS ---------- */
.cv-pos-grid { display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 24px; }
.cv-product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; }
.cv-product-card {
  background: ${PALETTE.white}; border: 1px solid ${PALETTE.border}; border-radius: var(--radius-lg);
  padding: 16px; display: flex; flex-direction: column; justify-content: space-between;
  transition: transform 0.2s, box-shadow 0.2s;
}
.cv-product-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }
.cv-product-info h4 { margin: 0 0 8px; font-size: 15px; font-weight: 600; color: ${PALETTE.dark}; line-height: 1.4; }
.cv-product-info .price { font-size: 18px; font-weight: 700; color: ${PALETTE.coral}; }
.out-of-stock-badge { background: ${PALETTE.redLight}; color: ${PALETTE.red}; padding: 8px; border-radius: 6px; text-align: center; font-size: 12px; font-weight: 600; margin-top: 8px; }
.cv-cart-card { display: flex; flex-direction: column; }
.cv-cart-body { display: flex; flex-direction: column; }
.cart-item-list { max-height: 280px; overflow-y: auto; margin-bottom: 14px; }
.cart-item { background: ${PALETTE.bg}; border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 8px; }
.cart-item .item-head { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
.cart-item .price-del { display: flex; align-items: center; gap: 10px; }
.cv-input-note, .cv-input-main, .cv-textarea {
  width: 100%; border: 1px solid ${PALETTE.border}; border-radius: var(--radius-md);
  font-family: inherit; outline: none; background: #fff; color: ${PALETTE.dark};
}
.cv-input-note { padding: 8px 12px; font-size: 13px; margin-top: 8px; }
.cv-input-main { padding: 10px 14px; font-size: 14px; }
.cv-textarea { padding: 10px 14px; font-size: 14px; resize: none; }
.cv-input-note:focus, .cv-input-main:focus, .cv-textarea:focus { border-color: ${PALETTE.coral}; }
.cart-total-box { display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed ${PALETTE.border}; padding: 16px 0; margin-bottom: 12px; font-weight: 600; font-size: 14px; }
.cart-total-box .total-amount { font-size: 24px; color: ${PALETTE.coral}; font-weight: 700; }

/* ---------- Stock / Reports ---------- */
.cv-stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
.cv-stock-item { border: 1px solid ${PALETTE.border}; border-radius: var(--radius-lg); padding: 16px; display: flex; justify-content: space-between; align-items: center; }
.report-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.report-card { background: ${PALETTE.bg}; border-radius: var(--radius-lg); padding: 20px; }
.report-card span { display: block; font-size: 14px; color: ${PALETTE.textSub}; }
.report-card b { display: block; font-size: 24px; font-weight: 700; margin: 6px 0; color: ${PALETTE.dark}; }
.report-card small { display: block; font-size: 12px; color: ${PALETTE.textSub}; }
@media (max-width: 900px) { .report-grid { grid-template-columns: repeat(2, 1fr); } }

.cv-print-alert { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:16px 18px; margin-bottom:16px; border:1px solid ${PALETTE.yellow}; background:${PALETTE.yellowLight}; border-radius:var(--radius-lg); }
.cv-print-alert small { display:block; color:${PALETTE.textSub}; margin-top:4px; }
.cv-printer-control { display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-bottom:12px; font-size:13px; color:${PALETTE.textSub}; }
.cv-printer-control b { color:${PALETTE.dark}; }
.cv-stale-actions { display:flex; flex-wrap:wrap; gap:8px; }
.cv-print-modal { width:500px; }
.cv-print-error { margin-top:10px; padding:10px 12px; border-radius:var(--radius-md); background:${PALETTE.redLight}; color:${PALETTE.red}; font-size:13px; line-height:1.5; }
.cv-print-error b { display:block; }
.display-note { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; padding:14px 18px; border-radius:var(--radius-lg); border:1px dashed ${PALETTE.border}; background:#fff; }
.display-note b { font-size:15px; }
.display-note span { flex:1 1 320px; font-size:13px; color:${PALETTE.textSub}; line-height:1.5; }
.display-note-actions { display:flex; gap:8px; }
.queue-display { position:relative; background:#14161F; color:#fff; border-radius:18px; padding:22px 26px 18px; min-height:460px; display:flex; flex-direction:column; }
.queue-display.full { border-radius:0; min-height:100vh; padding:36px 48px 28px; }
.qd-head { display:flex; justify-content:space-between; align-items:baseline; font-size:22px; font-weight:700; margin-bottom:18px; }
.queue-display.full .qd-head { font-size:34px; }
.qd-clock { font-family:'Roboto', monospace; opacity:.75; }
.qd-cols { flex:1; display:grid; grid-template-columns:1fr 1.4fr; gap:20px; }
.qd-col { border-radius:14px; padding:16px 18px; background:rgba(255,255,255,.05); }
.qd-col.ready { background:rgba(34,197,94,.12); border:1px solid rgba(34,197,94,.45); }
.qd-col h4 { margin:0 0 14px; font-size:20px; display:flex; align-items:center; gap:10px; }
.queue-display.full .qd-col h4 { font-size:30px; }
.qd-col h4 span { font-size:14px; padding:2px 10px; border-radius:999px; background:rgba(255,255,255,.12); }
.qd-grid { display:flex; flex-wrap:wrap; gap:12px; align-content:flex-start; }
.qd-num { font-family:'Roboto', monospace; font-weight:800; font-size:34px; padding:8px 16px; border-radius:12px; background:rgba(255,255,255,.08); letter-spacing:1px; }
.qd-col.ready .qd-num { font-size:48px; background:rgba(34,197,94,.22); color:#D9FBE5; }
.queue-display.full .qd-num { font-size:52px; }
.queue-display.full .qd-col.ready .qd-num { font-size:80px; padding:10px 24px; }
.qd-num.fresh { animation: qdFlash 1s ease-in-out infinite; }
@keyframes qdFlash { 0%,100% { background:rgba(34,197,94,.22); transform:scale(1); } 50% { background:#22C55E; color:#fff; transform:scale(1.06); } }
.qd-empty { font-size:18px; opacity:.5; }
.qd-foot { margin-top:16px; text-align:center; font-size:15px; opacity:.7; }
.queue-display.full .qd-foot { font-size:22px; }
.qd-exit { position:absolute; top:12px; right:16px; background:rgba(255,255,255,.1); color:#fff; border:none; border-radius:8px; padding:6px 12px; font-family:inherit; cursor:pointer; opacity:.4; }
.qd-exit:hover { opacity:1; }
@media (max-width: 768px) { .qd-cols { grid-template-columns:1fr; } }
.cv-pay-modal { width:520px; max-width:calc(100vw - 32px); }
.pay-total { display:flex; justify-content:space-between; align-items:baseline; padding:12px 16px; border-radius:12px; background:${PALETTE.bgSoft}; margin-bottom:14px; }
.pay-total span { font-size:15px; color:${PALETTE.textSub}; }
.pay-total b { font-size:30px; color:${PALETTE.coral}; }
.pay-methods { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:16px; }
.pay-method { min-height:52px; border-radius:12px; border:2px solid ${PALETTE.border}; background:#fff; font-family:inherit; font-size:15px; font-weight:700; color:${PALETTE.dark}; cursor:pointer; }
.pay-method.active { border-color:${PALETTE.coral}; background:${PALETTE.coralLight}; color:${PALETTE.coralDark}; }
.pay-label { display:block; font-size:13px; font-weight:700; color:${PALETTE.textSub}; margin-bottom:6px; }
.pay-cash-input { width:100%; box-sizing:border-box; font-size:32px; font-weight:800; text-align:right; padding:10px 14px; border-radius:12px; border:2px solid ${PALETTE.border}; font-family:inherit; outline:none; }
.pay-cash-input:focus { border-color:${PALETTE.coral}; }
.pay-quick { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 12px; }
.pay-quick .cv-btn { flex:1 1 64px; min-height:48px; padding:8px 6px; font-size:15px; white-space:nowrap; }
.pay-change { padding:14px 16px; border-radius:12px; background:${PALETTE.bgSoft}; color:${PALETTE.textSub}; font-size:15px; text-align:center; }
.pay-change b { font-size:28px; margin-left:6px; }
.pay-change.ok { background:${PALETTE.greenLight}; color:${PALETTE.green}; }
.pay-change.short { background:${PALETTE.redLight}; color:${PALETTE.red}; }
.pay-qr { display:flex; gap:16px; align-items:center; padding:12px; border-radius:12px; background:${PALETTE.bgSoft}; }
.pay-qr img { width:150px; height:150px; background:#fff; border-radius:10px; padding:6px; flex-shrink:0; }
.pay-qr b { display:block; font-size:16px; margin-bottom:6px; }
.pay-qr small { display:block; font-size:12px; color:${PALETTE.textSub}; line-height:1.5; }
.cv-stock-modal { width:560px; max-width:calc(100vw - 32px); }
.cv-stock-modal .modal-footer-btns { flex-wrap:wrap; }
.cv-stock-modal .modal-footer-btns .cv-btn { white-space:nowrap; }
.stock-affected { padding:12px 14px; border-radius:var(--radius-md); background:${PALETTE.yellowLight}; border:1px solid ${PALETTE.yellow}; font-size:13px; line-height:1.5; }
.stock-affected small { display:block; color:${PALETTE.textSub}; margin-top:6px; }
.stock-queue-list { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.stock-queue { padding:2px 10px; border-radius:999px; background:#fff; border:1px solid ${PALETTE.yellow}; font-weight:700; }
.stock-none { color:${PALETTE.textSub}; font-size:13px; }
.stock-silent { margin-top:10px; color:${PALETTE.textSub}; font-size:12px; }
.print-ticket-preview { background:#fff; border:1px dashed ${PALETTE.border}; border-radius:var(--radius-md); padding:16px; margin-bottom:12px; }
.cv-printer-ready, .cv-printer-offline { padding:10px 12px; border-radius:var(--radius-md); margin-top:10px; font-size:13px; }
.cv-printer-ready { background:${PALETTE.greenLight}; color:${PALETTE.green}; }
.cv-printer-offline { background:${PALETTE.redLight}; color:${PALETTE.red}; }
/* ---------- Modals ---------- */
.cv-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; }
.cv-modal { background: ${PALETTE.white}; padding: 24px; border-radius: var(--radius-lg); width: 440px; max-width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
.cv-cancel-modal { width: 480px; max-height: 92vh; overflow-y: auto; }
.cv-slip-review-modal { width: 560px; max-height: 90vh; overflow-y: auto; }
.cv-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.cv-modal-head h3 { margin: 0; font-size: 18px; font-weight: 600; color: ${PALETTE.dark}; }
.cv-modal-head .caption { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }
.cv-modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: ${PALETTE.textSub}; }
.pickup-eta { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: #EAF3FF; border: 1px solid #93C0F5; color: #1E4E8C; font-size: 12px; font-weight: 600; line-height: 1.5; max-width: 260px; }
.pickup-eta b { font-size: 16px; }
.pickup-eta .pickup-sub { display: block; font-size: 11px; font-weight: 500; color: #4A6E9C; }
.pickup-eta.compact { padding: 4px 8px; font-size: 11px; }
.pickup-eta.compact b { font-size: 12px; }
.pickup-warning { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: #FFF4E5; border: 1px solid #F5B461; color: #8A4B00; font-size: 12px; font-weight: 600; line-height: 1.5; max-width: 260px; }
.pickup-warning .pickup-phone { display: block; font-size: 18px; letter-spacing: .5px; color: #B45309; user-select: all; }
.pickup-warning .pickup-sub { display: block; font-size: 11px; font-weight: 500; color: #9A6B2F; }
.slip-history { margin-bottom: 16px; }
.slip-history-item { display: inline-flex; align-items: center; gap: 8px; margin: 6px 12px 0 0; font-size: 12px; color: inherit; text-decoration: none; background: none; border: 0; padding: 0; font-family: inherit; cursor: pointer; text-align: left; }
.slip-history-item img { width: 42px; height: 56px; object-fit: cover; border-radius: 6px; border: 1px solid ${PALETTE.border}; }
.slip-full-img { width: 100%; max-height: 55vh; object-fit: contain; border-radius: var(--radius-md); border: 1px solid ${PALETTE.border}; margin-bottom: 16px; }
.cv-customer-info .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid ${PALETTE.border}; font-size: 14px; }
.cv-customer-info .info-row span { color: ${PALETTE.textSub}; }
.cancel-icon-badge { width: 38px; height: 38px; border-radius: var(--radius-md); background: ${PALETTE.redLight}; color: ${PALETTE.red}; display: flex; align-items: center; justify-content: center; font-size: 18px; }

.receipt-summary-card, .slip-order-summary { background: ${PALETTE.bg}; border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 16px; }
.receipt-title { font-size: 12px; font-weight: 600; color: ${PALETTE.textSub}; margin-bottom: 8px; }
.receipt-items { max-height: 90px; overflow-y: auto; font-size: 14px; }
.receipt-item-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 14px; color: ${PALETTE.dark}; }
.receipt-divider { border-top: 1px solid ${PALETTE.border}; margin: 8px 0; }
.receipt-total-row { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 600; }
.receipt-total-val { font-size: 18px; color: ${PALETTE.coral}; font-weight: 700; }

.cancel-refund-note { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-md); background: ${PALETTE.bgSoft}; font-size: 13px; color: ${PALETTE.dark}; }
.cv-out-modal { width: 520px; max-width: calc(100vw - 32px); }
.out-label { font-size: 14px; font-weight: 700; margin-bottom: 8px; }
.out-items { display: flex; flex-direction: column; gap: 8px; }
.out-item { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 10px 14px; border-radius: 12px; border: 2px solid ${PALETTE.border}; background: #fff; cursor: pointer; font-size: 15px; }
.out-item.active { border-color: ${PALETTE.amber}; background: ${PALETTE.yellowLight}; }
.out-item input, .out-close input { width: 20px; height: 20px; accent-color: ${PALETTE.amber}; flex-shrink: 0; }
.out-name { flex: 1; font-weight: 600; }
.out-price { color: ${PALETTE.textSub}; }
.out-close { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; font-size: 13px; color: ${PALETTE.dark}; cursor: pointer; }
.btn-warning-solid { background: ${PALETTE.amber}; color: #fff; }
.btn-warning-solid:hover { opacity: .9; }
.action-opt { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid ${PALETTE.border}; cursor: pointer; transition: all 0.2s ease; background: #fff; }
.action-opt input { margin-top: 3px; accent-color: ${PALETTE.coral}; }
.action-opt.active { border-color: ${PALETTE.coral}; background: ${PALETTE.coralLight}; }
.opt-title { font-size: 14px; font-weight: 500; color: ${PALETTE.dark}; }
.opt-desc { font-size: 12px; color: ${PALETTE.textSub}; margin-top: 2px; }

.reason-section { margin-bottom: 20px; }
.reason-label { display: block; font-size: 13px; font-weight: 600; color: ${PALETTE.dark}; margin-bottom: 8px; }
.reason-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.reason-chip { background: #fff; border: 1px solid ${PALETTE.border}; border-radius: 16px; padding: 5px 12px; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer; transition: all 0.2s ease; color: ${PALETTE.dark}; }
.reason-chip:hover { border-color: ${PALETTE.coral}; color: ${PALETTE.coral}; }
.reason-chip.active { background: ${PALETTE.coralLight}; color: ${PALETTE.coral}; border-color: ${PALETTE.coral}; }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.modal-footer-btns .cv-btn { min-height: 48px; padding: 12px 22px; font-size: 15px; border-radius: var(--radius-md); }

/* ---------- Toast ---------- */
.cv-toast {
  position: fixed; bottom: 24px; right: 24px; background: ${PALETTE.white}; color: ${PALETTE.dark};
  padding: 12px 20px; border-radius: var(--radius-md); box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 12px; z-index: 10001;
  opacity: 0; transform: translateY(20px); pointer-events: none; border: 1px solid ${PALETTE.border};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.cv-toast.show { opacity: 1; transform: translateY(0); }
.cv-toast.error { border-color: ${PALETTE.red}; }
.cv-toast.error .toast-icon { background: ${PALETTE.redLight}; color: ${PALETTE.red}; font-weight: 900; }
.toast-icon { background: ${PALETTE.greenLight}; color: ${PALETTE.green}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

.bold { font-weight: 600; }
.cv-divider { border: none; border-top: 1px solid ${PALETTE.border}; margin: 4px 0 8px; }
/* มือถือ : วางท้ายสุดเพื่อให้ทับค่าตั้งต้นของ grid ด้านบน */
@media (max-width: 768px) {
  .cv-stat-grid { grid-template-columns: 1fr; gap: 12px; }
  .cv-pos-grid { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .cv-store-chip > span:not(.store-status-pill) { display: none; }
}
`;
