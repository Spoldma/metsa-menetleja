/* global React, Nav, CadastreField, SpecStrip, MapChip, Step, SectionHead, Footer, AerialParcel, Arrow */
// var-b.jsx — Variation B · "Kaart" — immersive full-bleed map hero with a floating glass console

function ScaleBar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', height: 6 }}>
        {['#e9f4e1', 'transparent', '#e9f4e1', 'transparent'].map((c, i) => (
          <div key={i} style={{ width: 26, background: c, border: '1px solid rgba(233,244,225,.7)' }}></div>
        ))}
      </div>
      <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', color: 'var(--mist-dim)' }}>0 — 100 m</span>
    </div>
  );
}
function NorthArrow() {
  return (
    <svg width="34" height="42" viewBox="0 0 34 42" fill="none" aria-hidden="true">
      <path d="M17 2 L26 30 L17 23 L8 30 Z" fill="#e9f4e1" stroke="#0a160b" strokeWidth="1" />
      <text x="17" y="40" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="11" fill="#e9f4e1">N</text>
    </svg>
  );
}

function VariationB() {
  return (
    <div className="mm mm--b" data-screen-label="B · Kaart"
      style={{ width: 1280, height: 'auto', background: '#0a160b', display: 'flex', flexDirection: 'column' }}>

      {/* ===== FULL-BLEED MAP HERO ===== */}
      <div style={{ position: 'relative', height: 760, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <AerialParcel id="b-hero" shape="wide" mode="canopy" clip="dim" seed={23} grid radius={0} crosshair />
        </div>
        {/* legibility wash on the left */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(8,16,8,.86) 0%, rgba(8,16,8,.5) 38%, rgba(8,16,8,0) 62%)' }}></div>

        {/* nav */}
        <div style={{ position: 'absolute', top: 34, left: 64, right: 64, zIndex: 5 }}>
          <Nav links={['Kuidas töötab', 'Andmed', 'Tulevik']} badge="Maa-amet · otseühendus" />
        </div>

        {/* HUD: corner coordinates */}
        <div className="mono" style={{ position: 'absolute', top: 110, right: 28, fontSize: 11, letterSpacing: '.08em', color: 'var(--mist-dim)', textAlign: 'right', lineHeight: 1.7 }}>
          <div>L-EST97 · EPSG:3301</div>
          <div>X 658 320 — 658 386</div>
          <div>Y 6 474 148 — 6 474 206</div>
        </div>
        <div style={{ position: 'absolute', right: 30, bottom: 30, display: 'flex', alignItems: 'flex-end', gap: 26 }}>
          <ScaleBar />
          <NorthArrow />
        </div>
        <MapChip style={{ position: 'absolute', left: 64, bottom: 30 }} rows={[
          { k: 'Tunnus', v: '79501:027:0011' },
          { k: 'Pindala', v: '1.41 ha' },
        ]} />

        {/* glass console */}
        <div style={{ position: 'absolute', left: 64, top: 168, maxWidth: 560 }}>
          <div className="eyebrow-row">
            <span className="line"></span>
            <span className="kicker" style={{ color: 'var(--leaf-soft)' }}>Eesti metsakaart · tunnuse järgi</span>
          </div>
          <h1 className="serif" style={{ fontSize: 66, lineHeight: 1.03, letterSpacing: '-0.02em', marginTop: 20, color: 'var(--mist)', textShadow: '0 2px 30px rgba(0,0,0,.5)' }}>
            Sinu mets,<br /><span style={{ fontStyle: 'italic', color: 'var(--leaf-soft)' }}>kaardilt lahti lõigatud.</span>
          </h1>
          <p style={{ marginTop: 22, fontSize: 18, lineHeight: 1.55, color: 'var(--mist)', maxWidth: 470, textShadow: '0 1px 16px rgba(0,0,0,.6)' }}>
            Üks tunnus, üks selge pilt. Tõmbame Maa-ameti aerofoto ja lõikame selle täpselt sinu katastriüksuse piirini.
          </p>
          <div style={{ marginTop: 30 }}>
            <CadastreField />
          </div>
          <p className="en-sub mono" style={{ marginTop: 18, fontSize: 12, letterSpacing: '.04em' }}>
            Enter a cadastre code · live aerial, clipped to your parcel
          </p>
        </div>
      </div>

      {/* ===== HOW IT WORKS — dark band ===== */}
      <div style={{ position: 'relative', padding: '54px 64px 0', display: 'flex', flexDirection: 'column' }}>
        <SectionHead kicker="Töövoog" title="Reaalajas, samm-sammult." center
          sub="Iga etapp voogesitatakse otse sinu brauserisse, nii et näed töö kulgu." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginTop: 40 }}>
          <Step num="01" title="Piir" body="Katastrist laetakse krundi täpne piir GeoJSON-polügoonina." en="Fetch boundary." />
          <Step num="02" title="Ulatus" body="Arvutatakse piirikast koos 5% varuga." en="Bounding box + padding." />
          <Step num="03" title="Aerofoto" body="WMS-ist tõmmatakse värvi-infrapuna kiht." en="Colour-infrared tile." />
          <Step num="04" title="Lõige" body="Pilt lõigatakse täpselt krundi kujuga." en="Clip to outline." />
        </div>

        {/* infrared explainer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 40, alignItems: 'center', marginTop: 48, padding: '34px 0 0', borderTop: '1px solid rgba(233,244,225,.12)' }}>
          <div style={{ maxWidth: 560 }}>
            <span className="kicker" style={{ color: 'var(--cir)' }}>Värvi-infrapuna</span>
            <h3 className="serif" style={{ fontSize: 30, color: 'var(--mist)', marginTop: 12, letterSpacing: '-0.01em' }}>
              Terve taimestik helendab punaselt.
            </h3>
            <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.6, color: 'var(--mist-dim)', maxWidth: 500 }}>
              CIR-kiht peegeldab lähi-infrapuna valgust, mistõttu elujõuline mets paistab eredalt — ideaalne alus tulevasele liigituvastusele ja tüvede loendusele.
            </p>
          </div>
          <div style={{ height: 200 }}>
            <AerialParcel id="b-cir" shape="lean" mode="cir" clip="cut" seed={5} grid={false} radius={14} />
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', padding: '54px 64px 36px' }}>
        <Footer />
      </div>
    </div>
  );
}

window.VariationB = VariationB;
