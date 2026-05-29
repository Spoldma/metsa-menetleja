/* global React */
// map-visual.jsx — generated, abstract aerial forest imagery (no photos).
// Uses SVG feTurbulence for canopy texture, a parcel polygon, and the
// app's signature "clip to your exact boundary" treatment.
// Exports: AerialParcel, CanopyTexture

const { useMemo } = React;

// An irregular but believable parcel polygon, authored in a 0..100 box.
const PARCELS = {
  default: '18,12 46,8 64,18 82,14 90,34 78,58 86,78 60,92 30,84 12,60 22,38',
  lean:    '24,10 70,16 88,40 80,70 52,90 20,72 10,40',
  wide:    '8,28 30,12 62,16 92,30 84,56 60,72 96,84 40,90 14,66 20,46',
};

function centroid(pts) {
  const a = pts.trim().split(/\s+/).map((p) => p.split(',').map(Number));
  const x = a.reduce((s, p) => s + p[0], 0) / a.length;
  const y = a.reduce((s, p) => s + p[1], 0) / a.length;
  return [x, y];
}

// Reusable canopy fill — green ("canopy") or magenta ("cir" = colour infrared)
function CanopyTexture({ id, mode = 'canopy', seed = 7 }) {
  const greens = mode === 'cir'
    ? { base: '#2a1422', a: '#d96b96', b: '#7d2f57', c: '#3a1c30', water: '#16323f' }
    : { base: '#0f2410', a: '#3f7d3a', b: '#1d3f1e', c: '#5a9a4e', water: '#15414a' };

  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id={`tex-${id}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.016 0.022"
            numOctaves="5" seed={seed} stitchTiles="stitch" result="n" />
          {/* push noise toward canopy tones */}
          <feColorMatrix in="n" type="matrix" result="m" values={
            mode === 'cir'
              ? '0 0 0 0 0.55  0 0 0 0 0.18  0 0 0 0 0.36  0 0 0 0 1'
              : '0 0 0 0 0.13  0 0 0 0 0.32  0 0 0 0 0.13  0 0 0 0 1'
          } />
          <feComponentTransfer in="m" result="mm">
            <feFuncR type="gamma" amplitude="1" exponent="0.8" offset="0" />
          </feComponentTransfer>
          <feBlend in="mm" in2="n" mode="multiply" />
        </filter>

        <radialGradient id={`clr-${id}`} cx="38%" cy="34%" r="85%">
          <stop offset="0%" stopColor={greens.c} />
          <stop offset="42%" stopColor={greens.a} />
          <stop offset="78%" stopColor={greens.b} />
          <stop offset="100%" stopColor={greens.base} />
        </radialGradient>
      </defs>
    </svg>
  );
}

/*
  AerialParcel
  ------------
  props:
    id        unique string (filter ids)
    shape     'default' | 'lean' | 'wide'
    mode      'canopy' | 'cir'
    clip      'dim'  → full tile, outside boundary dimmed (the live view)
              'cut'  → only the parcel shown, transparent outside (the result)
    seed      turbulence seed
    grid      show coordinate grid + ticks
    crosshair show centroid crosshair
    radius    css border-radius of the frame
*/
function AerialParcel({
  id = 'p', shape = 'default', mode = 'canopy', clip = 'dim',
  seed = 7, grid = true, crosshair = true, radius = 16, style = {},
}) {
  const pts = PARCELS[shape] || PARCELS.default;
  const [cx, cy] = useMemo(() => centroid(pts), [pts]);
  const stroke = mode === 'cir' ? '#ffd0e4' : '#d8f3b0';
  const tile = mode === 'cir' ? '#241019' : '#0c1d0d';

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      borderRadius: radius, overflow: 'hidden', background: tile,
      ...style,
    }}>
      <CanopyTexture id={id} mode={mode} seed={seed} />

      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
        width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <clipPath id={`cut-${id}`}><polygon points={pts} /></clipPath>
          <mask id={`out-${id}`}>
            <rect x="0" y="0" width="100" height="100" fill="#fff" />
            <polygon points={pts} fill="#000" />
          </mask>
        </defs>

        {/* base colour wash + canopy noise; clipped to parcel when clip='cut' */}
        <g clipPath={clip === 'cut' ? `url(#cut-${id})` : undefined}>
          <rect x="0" y="0" width="100" height="100" fill={`url(#clr-${id})`} />
          <rect x="0" y="0" width="100" height="100" filter={`url(#tex-${id})`} opacity="0.62" />
          {/* a winding clearing / stream for organic interest */}
          <path d="M-5,68 C20,60 26,82 48,74 C70,66 76,86 105,78"
            fill="none" stroke={mode === 'cir' ? '#1d4250' : '#16414a'}
            strokeWidth="2.4" opacity="0.5" strokeLinecap="round" />
        </g>

        {/* dim everything outside the parcel — the app's clip signature */}
        {clip === 'dim' && (
          <rect x="0" y="0" width="100" height="100" fill={tile} opacity="0.6" mask={`url(#out-${id})`} />
        )}

        {/* coordinate grid */}
        {grid && (
          <g opacity={clip === 'cut' ? '0.0' : '0.5'}>
            {[20, 40, 60, 80].map((v) => (
              <line key={`v${v}`} x1={v} y1="0" x2={v} y2="100" stroke="#cfe6a8" strokeWidth="0.18" opacity="0.35" />
            ))}
            {[20, 40, 60, 80].map((v) => (
              <line key={`h${v}`} x1="0" y1={v} x2="100" y2={v} stroke="#cfe6a8" strokeWidth="0.18" opacity="0.35" />
            ))}
          </g>
        )}

        {/* parcel boundary */}
        <polygon points={pts} fill="none" stroke={stroke} strokeWidth="0.7"
          strokeDasharray="2.4 1.6" strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,.6))' }} />
        {/* vertex ticks */}
        {pts.split(' ').map((p, i) => {
          const [x, y] = p.split(',').map(Number);
          return <circle key={i} cx={x} cy={y} r="0.7" fill={stroke} />;
        })}

        {/* centroid crosshair */}
        {crosshair && (
          <g stroke={stroke} strokeWidth="0.4" opacity="0.9">
            <circle cx={cx} cy={cy} r="2.6" fill="none" />
            <line x1={cx - 4.5} y1={cy} x2={cx + 4.5} y2={cy} />
            <line x1={cx} y1={cy - 4.5} x2={cx} y2={cy + 4.5} />
          </g>
        )}
      </svg>
    </div>
  );
}

Object.assign(window, { AerialParcel, CanopyTexture });
