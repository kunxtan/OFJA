// CSS ของหน้า login + พื้นฐานทั้งแอป (สีจาก PALETTE)
import { PALETTE } from './theme';

// CSS ของหน้า login + พื้นฐานทั้งแอป (สีจาก PALETTE)
export const APP_STYLES = `
* { box-sizing: border-box; }
body { font-family: 'Prompt', 'Noto Sans Thai', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
html, body, #root {
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  background-color: #FFF5EA !important;
}

/* ===== Soft orange gradient viewport ===== */
.orange-viewport {
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: ${PALETTE.bgGradient};
  padding: 24px;
  overflow: hidden;
}
/* แสงส้มไล่ตามเมาส์ — อยู่หลังการ์ด จึงเห็นเฉพาะตอนเมาส์อยู่นอกการ์ด */
.cursor-glow {
  position: absolute;
  left: 0;
  top: 0;
  width: 560px;
  height: 560px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 122, 0, 0.42) 0%, rgba(255, 150, 40, 0.16) 45%, rgba(255, 150, 40, 0) 70%);
  transform: translate3d(calc(var(--gx, 50vw) - 50%), calc(var(--gy, 50vh) - 50%), 0);
  opacity: 0;
  transition: opacity 0.5s ease;
  pointer-events: none;
  z-index: 1;
  will-change: transform;
}
.orange-viewport[data-glow='on'] .cursor-glow { opacity: 1; }
@media (hover: none) { .cursor-glow { display: none; } }

/* ===== Card ===== */
.card-glowing-wrapper {
  position: relative;
  width: 100%;
  max-width: 1000px;
  height: 100%;
  max-height: 620px;
  border-radius: 28px;
  background: ${PALETTE.cream};
  box-shadow: 0 30px 70px -28px rgba(214, 90, 0, 0.28), 0 6px 22px rgba(15, 23, 42, 0.07), 0 0 0 1px rgba(240, 227, 211, 0.7);
  z-index: 10;
}
.modern-card {
  width: 100%;
  height: 100%;
  background: ${PALETTE.cream};
  border-radius: 28px;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* ===== Form side ===== */
.form-pane {
  flex: 1.1;
  padding: 36px 40px 26px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow-y: auto;
  scrollbar-width: none;
  background: ${PALETTE.cream};
}
.form-pane::-webkit-scrollbar { display: none; }

.tab-switcher {
  display: flex;
  background: ${PALETTE.creamDeep};
  border: 1px solid ${PALETTE.borderOrange};
  padding: 4px;
  border-radius: 14px;
  margin-bottom: 20px;
  position: relative;
}
.tab-pill {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: calc(50% - 4px);
  background: ${PALETTE.primaryGradient};
  border-radius: 10px;
  box-shadow: 0 6px 16px rgba(255, 107, 0, 0.30);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1;
}
.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  font-family: inherit;
  font-weight: 500;
  font-size: 13.5px;
  cursor: pointer;
  background: transparent;
  color: #8A6A4F;
  z-index: 2;
  transition: color 0.25s ease;
}
.tab-btn.active { color: #FFFFFF; font-weight: 600; }

.input-group { position: relative; margin-bottom: 12px; }
.input-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #A8A29E;
  transition: color 0.25s ease;
  pointer-events: none;
  display: flex;
}
.modern-input {
  width: 100%;
  padding: 13px 16px 13px 46px;
  border-radius: 14px;
  border: 1.5px solid ${PALETTE.border};
  background: rgba(255, 255, 255, 0.72);
  outline: none;
  font-family: inherit;
  font-size: 13.5px;
  color: ${PALETTE.slateText};
  font-weight: 400;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.modern-input::placeholder { color: #A8A29E; }
.modern-input:focus {
  border-color: ${PALETTE.primary};
  background: #FFFFFF;
  box-shadow: 0 0 0 4px ${PALETTE.primarySoft};
}
.modern-input:focus + .input-icon { color: ${PALETTE.primary}; }

.btn-primary {
  width: 100%;
  background: ${PALETTE.primaryGradient};
  color: #FFFFFF;
  border: none;
  padding: 14px;
  border-radius: 14px;
  font-family: inherit;
  font-weight: 600;
  font-size: 14.5px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  overflow: hidden;
  box-shadow: 0 12px 24px -8px rgba(255, 107, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 16px 28px -8px rgba(255, 107, 0, 0.6); }
.btn-primary:active { transform: translateY(0); }

.or-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0 14px;
  font-size: 11.5px;
  color: ${PALETTE.subText};
}
.or-divider::before, .or-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #EADCC9;
}

.btn-google {
  width: 100%;
  background: #FFFFFF;
  color: ${PALETTE.slateText};
  border: 1.5px solid #EDE1D2;
  padding: 12px 16px;
  border-radius: 14px;
  font-family: inherit;
  font-weight: 500;
  font-size: 13.5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.btn-google:hover {
  background: #FFFBF6;
  border-color: ${PALETTE.borderOrange};
  box-shadow: 0 4px 14px rgba(255, 107, 0, 0.10);
}

.tab-btn:focus-visible, .btn-primary:focus-visible, .btn-google:focus-visible, .link-btn:focus-visible {
  outline: 2px solid ${PALETTE.primary};
  outline-offset: 2px;
}

/* ===== Banner side ===== */
.banner-pane {
  flex: 0.95;
  background: ${PALETTE.bannerGradient};
  padding: 30px 32px 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
/* แสงสว่างตามเคอร์เซอร์ — แสดงเฉพาะตอนเมาส์อยู่ในแบนเนอร์ */
.banner-pane::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  background: radial-gradient(circle 230px at var(--bx, 50%) var(--by, 40%), rgba(255, 255, 255, 0.34), transparent 70%);
  opacity: 0;
  transition: opacity 0.35s ease;
  pointer-events: none;
}
.banner-pane:hover::before { opacity: 1; }
.doodle {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transform: scale(1.04);
}
.banner-top {
  position: relative;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.banner-label { font-size: 11px; font-weight: 500; color: rgba(255, 255, 255, 0.85); letter-spacing: 0.6px; }
.status-pill-light {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #FFFFFF;
  padding: 6px 14px;
  border-radius: 30px;
  font-size: 11.5px;
  font-weight: 600;
  box-shadow: 0 6px 16px rgba(120, 40, 0, 0.14);
}
.banner-title {
  position: relative;
  z-index: 5;
  margin: 24px 0 0;
  font-size: 26px;
  line-height: 1.35;
  font-weight: 600;
  color: #FFFFFF;
  text-shadow: 0 2px 14px rgba(150, 50, 0, 0.25);
}

/* ===== เวทีอาหาร + cursor parallax ===== */
.banner-stage {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 270px;
  width: 100%;
  max-width: 420px;
  margin: 6px auto 0;
}
.stage-sun {
  position: absolute;
  left: 12%;
  top: 14%;
  width: 76%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #FFC21A;
  box-shadow: 0 0 0 14px rgba(255, 194, 26, 0.25);
}
.food {
  position: absolute;
  pointer-events: none;
}
.food svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  filter: drop-shadow(0 10px 12px rgba(120, 40, 0, 0.22));
}
.food-float { animation: foodFloat 6s ease-in-out infinite; }
@keyframes foodFloat {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-9px) rotate(1.8deg); }
}

.f-pizza  { right: 0;    top: -2%;  width: 32%; z-index: 2; }
.f-skewer { left: 2%;    top: -8%;  width: 19%; z-index: 4; }
.f-egg    { left: 42%;   top: 0;    width: 15%; z-index: 3; }
.f-burger { left: 23%;   top: 24%;  width: 58%; z-index: 3; }
.f-noodle { left: -5%;   top: 52%;  width: 48%; z-index: 5; }
.f-tea    { right: -1%;  top: 36%;  width: 21%; z-index: 5; }
.f-lime   { right: 26%;  top: 78%;  width: 11%; z-index: 6; }
.f-spark  { z-index: 6; }
.f-spark1 { left: 30%;   top: 18%;  width: 6%; }
.f-spark2 { right: 30%;  top: 12%;  width: 5%; }
.f-spark3 { left: 14%;   top: 46%;  width: 4.5%; }
.f-spark .food-float { animation-name: sparkle; }
@keyframes sparkle {
  0%, 100% { transform: scale(0.7) rotate(0deg); opacity: 0.6; }
  50% { transform: scale(1.15) rotate(45deg); opacity: 1; }
}

.banner-footer {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 0 16px;
  font-size: 11.5px;
  font-weight: 500;
  color: #FFFFFF;
  text-shadow: 0 1px 8px rgba(60, 25, 0, 0.35);
}

.radar-box { position: relative; display: flex; align-items: center; justify-content: center; width: 10px; height: 10px; }
.radar-dot { width: 8px; height: 8px; border-radius: 50%; }
.radar-wave {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  opacity: 0.75;
  animation: radarPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
}
@keyframes radarPing { 75%, 100% { transform: scale(3); opacity: 0; } }

.modal-pop { animation: modalPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes modalPopIn {
  0% { opacity: 0; transform: scale(0.92) translateY(10px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

@media (max-width: 840px) {
  .orange-viewport { padding: 0; }
  .card-glowing-wrapper { max-width: 100%; max-height: 100%; border-radius: 0; box-shadow: none; }
  .modern-card { border-radius: 0; flex-direction: column-reverse; overflow-y: auto; }
  .form-pane { flex: none; padding: 26px 22px; overflow: visible; }
  .banner-pane { flex: none; padding: 22px 22px 0; }
  .banner-title { font-size: 21px; margin-top: 14px; }
  .banner-stage { flex: none; height: 240px; min-height: 0; margin-top: 4px; }
  .banner-footer { display: none; }
  .f-pizza  { right: 2%;  top: -4%;  width: 27%; }
  .f-skewer { left: 4%;   top: -12%; width: 15%; }
  .f-egg    { left: 44%;  top: -4%;  width: 13%; }
  .f-burger { left: 27%;  top: 22%;  width: 46%; }
  .f-noodle { left: 3%;   top: 52%;  width: 36%; }
  .f-tea    { right: 3%;  top: 32%;  width: 16%; }
  .f-lime   { right: 26%; top: 76%;  width: 9%; }
}
@media (max-width: 480px) {
  .form-pane { padding: 22px 18px; }
  .banner-pane { padding: 18px 18px 0; }
  .banner-title { font-size: 19px; }
  .banner-stage { height: 210px; }
}
@media (min-width: 841px) and (max-height: 640px) {
  .banner-stage { min-height: 200px; }
  .banner-title { font-size: 22px; margin-top: 14px; }
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;
