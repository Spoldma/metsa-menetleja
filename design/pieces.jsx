/* global React */
// pieces.jsx — shared landing-page building blocks. Exported to window.

// --- tiny inline icons (simple shapes only) ---
function LeafMark({ size = 18, color = 'var(--leaf)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-13 6 2-2 5-2.5 9-2z" />
    </svg>
  );
}
function PinIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}
function Arrow({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Brand({ name = 'Metsa Menetleja', dark }) {
  return (
    <div className="brand">
      <span className="mark" style={dark ? { background: 'rgba(74,124,74,.14)', borderColor: 'rgba(35,77,39,.4)' } : undefined}>
        <LeafMark size={18} color={dark ? '#2f6b2f' : 'var(--leaf)'} />
      </span>
      <span className="name" style={dark ? { color: 'var(--ink-on-paper)' } : undefined}>{name}</span>
    </div>
  );
}

function Nav({ links, dark, cta = 'Ava rakendus', badge }) {
  const linkColor = dark ? { color: 'var(--muted-paper)' } : undefined;
  return (
    <nav className="nav">
      <Brand dark={dark} />
      <div className="nav-links" style={{ position: dark ? 'static' : 'absolute', left: '50%', transform: dark ? 'none' : 'translateX(-50%)' }}>
        {links.map((l) => <a key={l} href="#" style={linkColor}>{l}</a>)}
      </div>
      {badge
        ? <span className="badge" style={dark ? { borderColor: 'var(--paper-line)', color: 'var(--muted-paper)' } : undefined}>{badge}</span>
        : <a href="#" className="cta" style={{ padding: '11px 20px', fontSize: 14.5, boxShadow: 'none' }}>{cta}<span className="arrow"><Arrow size={13} /></span></a>}
    </nav>
  );
}

// Cadastre lookup mock — visual only
function CadastreField({ light, placeholder = '79501:027:0011', label = 'Analüüsi' }) {
  return (
    <div className={`field${light ? ' field--light' : ''}`}>
      <span className="pin" style={light ? { color: 'var(--accent)' } : undefined}><PinIcon size={18} /></span>
      <input defaultValue="" placeholder={placeholder} spellCheck="false" />
      <button className="go" tabIndex={-1}>{label}<Arrow size={14} /></button>
    </div>
  );
}

function SpecStrip({ items, style }) {
  return (
    <div className="specs" style={style}>
      {items.map((it, i) => (
        <span className="s" key={i}>{it.k} <b>{it.v}</b></span>
      ))}
    </div>
  );
}

// info chip overlaid on a map
function MapChip({ rows, style }) {
  return (
    <div className="chip" style={style}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, padding: '2px 0' }}>
          <span className="k">{r.k}</span><span className="v">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function Step({ num, title, body, en }) {
  return (
    <div className="step">
      <div className="num">{num}</div>
      <h3 className="serif">{title}</h3>
      <p>{body}</p>
      {en && <p className="en">{en}</p>}
    </div>
  );
}

function SectionHead({ kicker, title, sub, dark, center }) {
  return (
    <div style={{ textAlign: center ? 'center' : 'left', maxWidth: center ? 720 : 560, marginInline: center ? 'auto' : 0 }}>
      <div className="eyebrow-row" style={{ justifyContent: center ? 'center' : 'flex-start' }}>
        {!center && <span className="line"></span>}
        <span className="kicker" style={{ color: dark ? 'var(--accent)' : 'var(--leaf)' }}>{kicker}</span>
        {center && <span className="line"></span>}
      </div>
      <h2 className="serif" style={{
        fontSize: 38, lineHeight: 1.08, letterSpacing: '-0.015em', marginTop: 16,
        color: dark ? 'var(--ink-on-paper)' : 'var(--mist)',
      }}>{title}</h2>
      {sub && <p style={{ marginTop: 14, fontSize: 16, lineHeight: 1.6, color: dark ? 'var(--muted-paper)' : 'var(--mist-dim)' }}>{sub}</p>}
    </div>
  );
}

function Footer({ dark }) {
  const c = dark ? 'var(--muted-paper)' : 'var(--mist-dim)';
  return (
    <div className="foot" style={{ borderColor: dark ? 'var(--paper-line)' : undefined, paddingTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
      <Brand dark={dark} />
      <p className="mono" style={{ fontSize: 12, color: c, letterSpacing: '.04em' }}>
        Katastriandmed &amp; aerofotod: Maa-amet · EPSG:3301
      </p>
      <p style={{ fontSize: 13, color: c }}>© 2026 Metsa Menetleja</p>
    </div>
  );
}

Object.assign(window, {
  LeafMark, PinIcon, Arrow, Brand, Nav, CadastreField,
  SpecStrip, MapChip, Step, SectionHead, Footer,
});
