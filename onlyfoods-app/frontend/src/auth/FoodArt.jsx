// รูปอาหาร SVG ลอยตกแต่งหน้า login

// 🍜 ภาพประกอบอาหารแบบ flat vector (วาดด้วย SVG ล้วน ไม่ต้องใช้ไฟล์รูป)
export const artProps = (p) => ({ xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, focusable: 'false', ...p });

export function BurgerArt(props) {
  return (
    <svg viewBox="0 0 240 216" {...artProps(props)}>
      <ellipse cx="120" cy="207" rx="94" ry="8" fill="rgba(80,30,0,0.2)" />
      <path d="M30 172 H210 Q210 198 178 198 H62 Q30 198 30 172Z" fill="#E88F25" />
      <rect x="22" y="150" width="196" height="28" rx="14" fill="#5E3219" />
      <rect x="36" y="155" width="64" height="5" rx="2.5" fill="rgba(255,255,255,0.2)" />
      <path d="M26 142 H214 V154 H198 L188 176 L174 154 H66 L52 174 L40 154 H26Z" fill="#FFC72C" />
      <rect x="28" y="130" width="184" height="18" rx="9" fill="#E8412F" />
      <rect x="44" y="134" width="50" height="4" rx="2" fill="rgba(255,255,255,0.3)" />
      <path d="M20 112 H220 V128 Q208 140 196 128 Q184 140 172 128 Q160 140 148 128 Q136 140 124 128 Q112 140 100 128 Q88 140 76 128 Q64 140 52 128 Q40 140 28 128 Q22 134 20 128Z" fill="#5CB85C" />
      <path d="M24 120 Q24 44 120 44 Q216 44 216 120Z" fill="#F4A93B" />
      <path d="M26 106 Q24 112 24 120 H216 Q216 112 214 106 Q120 118 26 106Z" fill="#E48B24" />
      <path d="M46 98 Q50 64 84 54" stroke="rgba(255,255,255,0.42)" strokeWidth="7" strokeLinecap="round" fill="none" />
      <g fill="#FFF3D6">
        <ellipse cx="100" cy="76" rx="6" ry="3" transform="rotate(-20 100 76)" />
        <ellipse cx="136" cy="64" rx="6" ry="3" transform="rotate(15 136 64)" />
        <ellipse cx="164" cy="86" rx="6" ry="3" transform="rotate(-8 164 86)" />
        <ellipse cx="120" cy="96" rx="6" ry="3" transform="rotate(25 120 96)" />
        <ellipse cx="82" cy="98" rx="6" ry="3" transform="rotate(10 82 98)" />
        <ellipse cx="184" cy="102" rx="5" ry="2.6" transform="rotate(-25 184 102)" />
      </g>
    </svg>
  );
}

export function SkewerArt(props) {
  return (
    <svg viewBox="0 0 120 320" {...artProps(props)}>
      <path d="M56 0 H64 V300 L60 320 L56 300Z" fill="#E2B877" />
      <rect x="18" y="40" width="84" height="48" rx="18" fill="#7A3B1D" />
      <rect x="27" y="46" width="30" height="7" rx="3.5" fill="rgba(255,255,255,0.22)" />
      <rect x="62" y="70" width="26" height="6" rx="3" fill="#4A2210" />
      <rect x="24" y="92" width="72" height="34" rx="14" fill="#E8412F" />
      <rect x="32" y="97" width="22" height="5" rx="2.5" fill="rgba(255,255,255,0.3)" />
      <rect x="14" y="130" width="92" height="50" rx="18" fill="#8A4524" />
      <rect x="24" y="136" width="34" height="7" rx="3.5" fill="rgba(255,255,255,0.2)" />
      <rect x="60" y="162" width="28" height="6" rx="3" fill="#4A2210" />
      <rect x="22" y="184" width="76" height="34" rx="14" fill="#5CB85C" />
      <rect x="30" y="189" width="24" height="5" rx="2.5" fill="rgba(255,255,255,0.3)" />
      <rect x="18" y="222" width="84" height="46" rx="18" fill="#7A3B1D" />
      <rect x="27" y="228" width="30" height="7" rx="3.5" fill="rgba(255,255,255,0.22)" />
      <rect x="26" y="272" width="68" height="30" rx="13" fill="#FF9A1F" />
      <rect x="34" y="277" width="22" height="5" rx="2.5" fill="rgba(255,255,255,0.3)" />
    </svg>
  );
}

export function NoodleBowlArt(props) {
  return (
    <svg viewBox="0 0 220 170" {...artProps(props)}>
      <ellipse cx="110" cy="161" rx="80" ry="7" fill="rgba(80,30,0,0.2)" />
      <path d="M26 84 Q30 34 110 30 Q190 34 194 84Z" fill="#FFD966" />
      <g stroke="#FFF1B8" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M38 76 Q56 52 74 72 T110 66 T146 62 T182 74" />
        <path d="M44 62 Q62 40 84 56 T126 48 T170 56" />
        <path d="M60 46 Q84 30 108 42 T152 40" />
      </g>
      <ellipse cx="78" cy="58" rx="24" ry="15" fill="#FFFFFF" />
      <circle cx="80" cy="57" r="9" fill="#FFB400" />
      <path d="M126 46 Q150 26 168 50 Q174 66 158 68 Q164 56 148 54 Q138 54 130 62Z" fill="#FF8A4C" />
      <g fill="#5CB85C">
        <circle cx="110" cy="40" r="4" />
        <circle cx="100" cy="66" r="4" />
        <circle cx="148" cy="72" r="4" />
        <circle cx="58" cy="76" r="4" />
      </g>
      <g stroke="#7B4A22" strokeWidth="5" strokeLinecap="round">
        <line x1="168" y1="2" x2="116" y2="52" />
        <line x1="182" y1="10" x2="128" y2="58" />
      </g>
      <path d="M14 80 H206 Q206 150 110 156 Q14 150 14 80Z" fill="#E8412F" />
      <rect x="10" y="74" width="200" height="12" rx="6" fill="#C93322" />
      <path d="M18 104 H202 Q200 114 196 122 H24 Q20 114 18 104Z" fill="#FFC72C" />
      <path d="M28 94 Q30 122 52 142" stroke="rgba(255,255,255,0.3)" strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function ThaiTeaArt(props) {
  return (
    <svg viewBox="0 0 100 192" {...artProps(props)}>
      <ellipse cx="50" cy="189" rx="34" ry="4" fill="rgba(80,30,0,0.2)" />
      <path d="M14 38 L24 178 Q25 186 34 186 H66 Q75 186 76 178 L86 38Z" fill="rgba(255,255,255,0.5)" />
      <path d="M17 84 H83 L76 178 Q75 186 66 186 H34 Q25 186 24 178Z" fill="#F28A2E" />
      <path d="M17 84 Q33 74 50 84 T83 84 V104 Q66 96 50 106 T17 102Z" fill="#FFE9CF" />
      <rect x="30" y="118" width="22" height="22" rx="5" fill="rgba(255,255,255,0.55)" transform="rotate(-12 41 129)" />
      <rect x="50" y="144" width="20" height="20" rx="5" fill="rgba(255,255,255,0.5)" transform="rotate(10 60 154)" />
      <path d="M26 56 L32 170" stroke="rgba(255,255,255,0.6)" strokeWidth="5" strokeLinecap="round" />
      <rect x="10" y="32" width="80" height="10" rx="5" fill="#FFFFFF" />
      <line x1="66" y1="2" x2="56" y2="132" stroke="#3D5AFE" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

export function PizzaArt(props) {
  return (
    <svg viewBox="0 0 200 190" {...artProps(props)}>
      <path d="M14 54 H186 L100 176Z" fill="#FFC83D" stroke="#FFC83D" strokeWidth="12" strokeLinejoin="round" />
      <path d="M4 44 Q100 18 196 44 Q202 66 190 70 Q100 46 10 70 Q-2 66 4 44Z" fill="#E8A04A" />
      <g>
        <circle cx="66" cy="92" r="14" fill="#D63A2A" />
        <circle cx="62" cy="88" r="5" fill="rgba(255,255,255,0.25)" />
        <circle cx="122" cy="88" r="14" fill="#D63A2A" />
        <circle cx="118" cy="84" r="5" fill="rgba(255,255,255,0.25)" />
        <circle cx="98" cy="132" r="12" fill="#D63A2A" />
        <circle cx="95" cy="129" r="4" fill="rgba(255,255,255,0.25)" />
      </g>
      <g fill="#5CB85C">
        <rect x="90" y="96" width="12" height="5" rx="2.5" transform="rotate(30 96 98)" />
        <rect x="140" y="106" width="12" height="5" rx="2.5" transform="rotate(-20 146 108)" />
        <rect x="76" y="116" width="12" height="5" rx="2.5" transform="rotate(-35 82 118)" />
      </g>
    </svg>
  );
}

export function EggArt(props) {
  return (
    <svg viewBox="0 0 120 100" {...artProps(props)}>
      <path d="M18 52 Q10 20 46 16 Q70 0 96 22 Q116 40 100 68 Q90 90 56 86 Q24 86 18 52Z" fill="#FFFFFF" />
      <circle cx="58" cy="50" r="20" fill="#FFB400" />
      <circle cx="51" cy="43" r="6" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

export function LimeArt(props) {
  return (
    <svg viewBox="0 0 60 60" {...artProps(props)}>
      <circle cx="30" cy="30" r="28" fill="#7CC34F" />
      <circle cx="30" cy="30" r="22" fill="#D9F2A8" />
      <g stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
        <line x1="30" y1="10" x2="30" y2="50" />
        <line x1="10" y1="30" x2="50" y2="30" />
        <line x1="16" y1="16" x2="44" y2="44" />
        <line x1="44" y1="16" x2="16" y2="44" />
      </g>
      <circle cx="30" cy="30" r="4" fill="#FFFFFF" />
    </svg>
  );
}

export function SparkleArt(props) {
  return (
    <svg viewBox="-12 -12 24 24" {...artProps(props)}>
      <path d="M0 -11 Q0 0 11 0 Q0 0 0 11 Q0 0 -11 0 Q0 0 0 -11Z" fill="#FFFFFF" />
    </svg>
  );
}

// ตัวห่อ: ชั้นนอก = ขยับตามเมาส์ (parallax), ชั้นใน = ลอยขึ้นลงเบา ๆ
export function Food({ cls, d = 10, r = 0, delay = '0s', dur = '6s', children }) {
  return (
    <div className={`food ${cls}`} style={{ '--d': d, '--r': r }}>
      <div className="food-float" style={{ animationDelay: delay, animationDuration: dur }}>{children}</div>
    </div>
  );
}
