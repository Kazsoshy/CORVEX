import logo from '../../assets/corvex-logo.png';

function GridLines() {
  const vertical = Array.from({ length: 13 }, (_, index) => {
    const x = 36 + index * 46;
    return (
      <line
        key={`v-${index}`}
        x1={x}
        y1="210"
        x2={x - 70}
        y2="690"
        stroke="rgba(186, 214, 255, 0.45)"
        strokeWidth="1"
      />
    );
  });
  const horizontal = Array.from({ length: 8 }, (_, index) => {
    const y = 250 + index * 52;
    return (
      <line
        key={`h-${index}`}
        x1="10"
        y1={y}
        x2="590"
        y2={y - index * 8}
        stroke="rgba(186, 214, 255, 0.34)"
        strokeWidth="1"
      />
    );
  });
  return (
    <svg className="cvx-visual-grid" viewBox="0 0 600 700" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {vertical}
      {horizontal}
      <circle cx="430" cy="250" r="3" fill="#7eb6ff" />
      <circle cx="300" cy="360" r="2.5" fill="rgba(255,255,255,0.7)" />
      <circle cx="210" cy="470" r="2" fill="#7eb6ff" />
    </svg>
  );
}

export function HeroVisual() {
  return (
    <div className="cvx-visual" aria-hidden="true">
      <div className="cvx-visual-glow" />
      <div className="cvx-visual-ring" />
      <div className="cvx-visual-ring cvx-visual-ring-inner" />
      <GridLines />

      <div className="cvx-shard cvx-shard-a">
        <svg viewBox="0 0 220 280" className="cvx-shard-art">
          <circle cx="110" cy="92" r="46" stroke="rgba(255,255,255,0.72)" strokeWidth="1.2" fill="none" />
          <circle cx="110" cy="92" r="6" fill="#7eb6ff" />
          <path d="M36 168 H184" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
          <path d="M48 196 H172" stroke="rgba(255,255,255,0.28)" strokeWidth="1" />
          <path d="M60 224 H140" stroke="rgba(126,182,255,0.85)" strokeWidth="1.4" />
          <rect x="148" y="208" width="28" height="28" fill="none" stroke="#7eb6ff" strokeWidth="1.2" />
        </svg>
      </div>

      <div className="cvx-shard cvx-shard-b">
        <svg viewBox="0 0 280 150" className="cvx-shard-art">
          <path d="M28 48 H168 V78 H36 Z" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.3" />
          <path d="M168 58 H248 V96 H176" fill="none" stroke="#9ec4ff" strokeWidth="1.3" />
          <path d="M52 78 V118" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
          <path d="M146 78 V118" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
          <path d="M214 96 V124" stroke="rgba(158,196,255,0.8)" strokeWidth="1.2" />
          <path d="M24 124 H252" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        </svg>
      </div>

      <div className="cvx-shard cvx-shard-c">
        <svg viewBox="0 0 140 140" className="cvx-shard-art">
          <path d="M70 18 A52 52 0 0 1 122 70" fill="none" stroke="#7eb6ff" strokeWidth="1.4" />
          <path d="M70 34 A36 36 0 0 1 106 70" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
          <path d="M70 50 A20 20 0 0 1 90 70" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
          <circle cx="70" cy="70" r="3" fill="#fff" />
          <path d="M70 70 L108 48" stroke="rgba(126,182,255,0.9)" strokeWidth="1" />
        </svg>
      </div>

      <img src={logo} alt="" className="cvx-visual-logo" />
    </div>
  );
}
