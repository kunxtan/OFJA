import { BurgerArt, EggArt, LimeArt, NoodleBowlArt, PizzaArt, SkewerArt, SparkleArt, ThaiTeaArt } from './FoodArt';

// หน้าโหลดหลังกดเข้าสู่ระบบ : เบอร์เกอร์เด้งขึ้นกลางวงพระอาทิตย์ อาหาร 6 อย่างเด้งตามแล้วโคจรรอบ
// phase : login (รอ server ตอบ) -> loading (โหลดหน้าและข้อมูลอยู่ข้างหลัง) -> leaving (เฟดออก เห็นหน้าที่พร้อมแล้ว)
const MESSAGES = {
  login: 'กำลังเข้าสู่ระบบ',
  loading: 'กำลังเตรียมข้อมูลของคุณ',
  leaving: 'พร้อมแล้ว',
};

// อาหารรอบวง (เรียงตามเข็มนาฬิกาจากด้านบน) : w = ความกว้างเทียบช่อง, tilt = เอียงเล็กน้อยให้ดูมีชีวิต
const ORBIT = [
  { key: 'pizza', Art: PizzaArt, w: 0.9, tilt: 14 },
  { key: 'tea', Art: ThaiTeaArt, w: 0.62, tilt: 6 },
  { key: 'lime', Art: LimeArt, w: 0.66, tilt: 0 },
  { key: 'noodle', Art: NoodleBowlArt, w: 1, tilt: -4 },
  { key: 'skewer', Art: SkewerArt, w: 0.5, tilt: 24 },
  { key: 'egg', Art: EggArt, w: 0.8, tilt: -10 },
];

export default function FoodSplash({ phase }) {
  const message = MESSAGES[phase] || MESSAGES.loading;
  return (
    <div className={`fs-root fs-${phase}`} role="status" aria-live="polite" aria-label={message}>
      <style>{SPLASH_CSS}</style>
      <span className="fs-blob fs-blob1" aria-hidden="true" />
      <span className="fs-blob fs-blob2" aria-hidden="true" />
      <svg className="fs-wave" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 80 C 60 20, 120 120, 200 70 S 340 30, 400 80" />
      </svg>

      <div className="fs-stage" aria-hidden="true">
        <div className="fs-sun"><span className="fs-sun-glow" /></div>
        <div className="fs-orbit">
          {ORBIT.map(({ key, Art, w, tilt }, i) => (
            <div key={key} className="fs-slot" style={{ '--a': `${i * 60}deg` }}>
              <div className="fs-upright">
                <div className="fs-pop" style={{ '--i': i + 1 }}>
                  <div className="fs-bob" style={{ '--bob': `${2.6 + (i % 3) * 0.4}s`, '--bd': `${-i * 0.35}s` }}>
                    <Art style={{ width: `${w * 100}%`, transform: `rotate(${tilt}deg)` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="fs-hero">
          <div className="fs-pop fs-pop-hero" style={{ '--i': 0 }}>
            <div className="fs-bob" style={{ '--bob': '3s', '--bd': '0s' }}><BurgerArt /></div>
          </div>
        </div>
        <span className="fs-spark fs-spark1"><SparkleArt /></span>
        <span className="fs-spark fs-spark2"><SparkleArt /></span>
        <span className="fs-spark fs-spark3"><SparkleArt /></span>
      </div>

      <div className="fs-text">
        <div className="fs-brand">ONLYFOODS</div>
        <div className="fs-msg">
          {message}
          {phase !== 'leaving' && <span className="fs-dots" aria-hidden="true"><i /><i /><i /></span>}
        </div>
        <div className="fs-bar" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}

const SPLASH_CSS = `
.fs-root {
  --stage: min(340px, 78vw);
  --slot: calc(var(--stage) * 0.22);
  --radius: calc(var(--stage) * 0.40);
  position: fixed; inset: 0; z-index: 10050;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px;
  overflow: hidden; color: #FFFFFF;
  background: linear-gradient(160deg, #FF7A00 0%, #F25C00 100%);
  font-family: 'Prompt', 'Sarabun', system-ui, sans-serif;
  transition: opacity 0.5s ease 0.15s;
}
.fs-blob { position: absolute; border-radius: 50%; background: rgba(255,255,255,0.07); pointer-events: none; }
.fs-blob1 { width: 520px; height: 520px; top: -220px; right: -180px; }
.fs-blob2 { width: 380px; height: 380px; bottom: -200px; left: -140px; background: rgba(255,255,255,0.06); }
.fs-wave { position: absolute; left: -5%; bottom: 8%; width: 110%; height: 120px; opacity: 0.35; }
.fs-wave path { fill: none; stroke: #FFFFFF; stroke-width: 2; }

.fs-stage { position: relative; width: var(--stage); height: var(--stage); transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
.fs-sun { position: absolute; inset: 22%; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #FFD54A 0%, #FFC21A 60%, #F7A800 100%);
  box-shadow: 0 0 0 calc(var(--stage) * 0.05) rgba(255,199,44,0.28), 0 18px 40px rgba(120,40,0,0.25);
  animation: fsSunIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both, fsBreathe 3.2s ease-in-out 0.6s infinite; }
.fs-sun-glow { position: absolute; inset: -18%; border-radius: 50%; border: 2px dashed rgba(255,255,255,0.35); animation: fsSpin 30s linear infinite; }

.fs-orbit { position: absolute; inset: 0; animation: fsSpin 18s linear infinite; }
.fs-slot { position: absolute; left: 50%; top: 50%; width: var(--slot); height: var(--slot);
  margin: calc(var(--slot) / -2) 0 0 calc(var(--slot) / -2);
  transform: rotate(var(--a)) translateY(calc(var(--radius) * -1)) rotate(calc(var(--a) * -1)); }
.fs-upright { width: 100%; height: 100%; animation: fsSpin 18s linear infinite reverse; }
.fs-pop { width: 100%; height: 100%; animation: fsPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: calc(0.25s + var(--i) * 0.09s); }
.fs-bob { width: 100%; height: 100%; display: grid; place-items: center; animation: fsBob var(--bob) ease-in-out var(--bd) infinite; }
.fs-bob svg { display: block; height: auto; max-height: 100%; filter: drop-shadow(0 6px 8px rgba(110,35,0,0.25)); }

.fs-hero { position: absolute; left: 50%; top: 50%; width: calc(var(--stage) * 0.42); height: calc(var(--stage) * 0.42); transform: translate(-50%, -46%); }
.fs-pop-hero { animation-delay: 0.1s; animation-duration: 0.7s; }
.fs-hero .fs-bob svg { width: 100%; }

.fs-spark { position: absolute; width: calc(var(--stage) * 0.07); color: #FFFFFF; animation: fsTwinkle 2.4s ease-in-out infinite; }
.fs-spark svg { width: 100%; height: auto; display: block; }
.fs-spark1 { top: 6%; left: 12%; }
.fs-spark2 { top: 18%; right: 4%; animation-delay: -0.8s; width: calc(var(--stage) * 0.05); }
.fs-spark3 { bottom: 8%; left: 30%; animation-delay: -1.6s; width: calc(var(--stage) * 0.045); }

.fs-text { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; animation: fsFadeUp 0.6s ease 0.5s both; }
.fs-brand { font-size: 13px; font-weight: 700; letter-spacing: 0.32em; opacity: 0.85; }
.fs-msg { font-size: 18px; font-weight: 600; display: flex; align-items: baseline; gap: 2px; }
.fs-dots { display: inline-flex; gap: 3px; margin-left: 4px; }
.fs-dots i { width: 5px; height: 5px; border-radius: 50%; background: #FFFFFF; animation: fsDot 1.2s ease-in-out infinite; }
.fs-dots i:nth-child(2) { animation-delay: 0.15s; }
.fs-dots i:nth-child(3) { animation-delay: 0.3s; }
.fs-bar { width: 180px; height: 5px; margin-top: 6px; border-radius: 999px; background: rgba(255,255,255,0.25); overflow: hidden; }
.fs-bar span { display: block; height: 100%; width: 12%; border-radius: inherit; background: #FFFFFF; transition: width 0.4s ease; }
.fs-login .fs-bar span { width: 35%; transition: width 1.2s ease; }
.fs-loading .fs-bar span { width: 88%; transition: width 6s cubic-bezier(0.1, 0.7, 0.3, 1); }
.fs-leaving .fs-bar span { width: 100%; transition: width 0.25s ease; }

/* ออก : อาหารขยายเบา ๆ แล้วทั้งหน้าจางหาย เห็นหน้าที่โหลดเสร็จแล้วข้างหลัง */
.fs-leaving { opacity: 0; pointer-events: none; }
.fs-leaving .fs-stage { transform: scale(1.08); }

@keyframes fsSpin { to { transform: rotate(360deg); } }
@keyframes fsPop { 0% { opacity: 0; transform: scale(0) rotate(-25deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes fsSunIn { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
@keyframes fsBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
@keyframes fsBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7%); } }
@keyframes fsTwinkle { 0%, 100% { opacity: 0.2; transform: scale(0.6) rotate(0); } 50% { opacity: 1; transform: scale(1) rotate(45deg); } }
@keyframes fsFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes fsDot { 0%, 80%, 100% { opacity: 0.3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }

@media (prefers-reduced-motion: reduce) {
  .fs-root *, .fs-root { animation: none !important; }
  .fs-stage { transition: none; }
}
`;
