/* global React, Nav, CadastreField, SpecStrip, SectionHead, Footer, AerialParcel, Arrow */
// var-c.jsx — Variation C · "Plaat" — light editorial, parcel as a framed cartographic specimen

function LightStep({ num, et, en, body }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', gap: 18, padding: '22px 0', borderTop: '1px solid var(--paper-line)' }}>
      <div className="mono serif" style={{ fontSize: 22, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{num}</div>
      <div>
        <h3 className="serif" style={{ fontSize: 21, color: 'var(--ink-on-paper)', letterSpacing: '-0.01em' }}>{et}</h3>
        <p style={{ marginTop: 6, fontSize: 15, lineHeight: 1.6, color: 'var(--muted-paper)', maxWidth: 360 }}>{body}</p>
        <p className="mono" style={{ marginTop: 6, fontSize: 12, color: '#8a967f', letterSpacing: '.03em' }}>{en}</p>
      </div>
    </div>
  );
}

function VariationC() {
  return (
    <div className="mm mm--c" data-screen-label="C · Plaat"
      style={{ width: 1280, height: 'auto', background:
        'radial-gradient(900px 500px at 50% -10%, #ffffff 0%, rgba(255,255,255,0) 60%), linear-gradient(180deg, #f3f5ee 0%, #eef1e7 100%)',
        color: 'var(--ink-on-paper)', display: 'flex', flexDirection: 'column' }}>

      <div style={{ position: 'relative', padding: '34px 72px 0' }}>
        <Nav links={['Kuidas töötab', 'Andmed', 'Tulevik']} dark cta="Ava rakendus" />
      </div>

      {/* HERO — centered */}
      <div style={{ position: 'relative', textAlign: 'center', padding: '58px 72px 0' }}>
        <div className="eyebrow-row" style={{ justifyContent: 'center' }}>
          <span className="line"></span>
          <span className="kicker" style={{ color: 'var(--accent)' }}>Eesti metsaüksuste atlas</span>
          <span className="line"></span>
        </div>
        <h1 className="serif" style={{ fontSize: 80, lineHeight: 1.0, letterSpacing: '-0.025em', marginTop: 22, color: 'var(--ink-on-paper)', maxWidth: 900, marginInline: 'auto' }}>
          Iga katastriüksus,<br /><span style={{ fontStyle: 'italic', color: 'var(--accent)' }}>üks selge pilt.</span>
        </h1>
        <p style={{ marginTop: 22, fontSize: 19, lineHeight: 1.55, color: 'var(--muted-paper)', maxWidth: 580, marginInline: 'auto' }}>
          Sisesta tunnus ja saad puhta aerofoto täpselt oma metsast — Maa-ameti otseandmetest, sinu krundi kujuga lõigatud.
        </p>
        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center' }}>
          <CadastreField light />
        </div>
        <p className="mono" style={{ marginTop: 16, fontSize: 12, color: '#8a967f', letterSpacing: '.06em' }}>
          NÄIDE — 79501:027:0011 · TAARA PST, TARTU
        </p>
      </div>

      {/* SPECIMEN PLATE */}
      <div style={{ position: 'relative', padding: '46px 72px 0' }}>
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--paper-line)', boxShadow: '0 50px 90px -50px rgba(22,36,26,.45)', padding: 22, display: 'grid', gridTemplateColumns: '1fr 300px' }}>
          {/* plate image */}
          <div style={{ position: 'relative', height: 380, borderRadius: 12, overflow: 'hidden', background: '#0c1d0d' }}>
            <AerialParcel id="c-plate" shape="default" mode="canopy" clip="dim" seed={14} radius={12} />
            <div className="mono" style={{ position: 'absolute', top: 16, left: 16, fontSize: 11, color: 'rgba(233,244,225,.85)', letterSpacing: '.1em', background: 'rgba(10,22,11,.6)', padding: '5px 10px', borderRadius: 6 }}>
              PL. I — KATASTRIÜKSUS
            </div>
          </div>
          {/* caption / data column */}
          <div style={{ padding: '6px 10px 6px 30px', display: 'flex', flexDirection: 'column' }}>
            <span className="kicker" style={{ color: 'var(--accent)' }}>Tulemus</span>
            <h3 className="serif" style={{ fontSize: 25, color: 'var(--ink-on-paper)', marginTop: 10, letterSpacing: '-0.01em' }}>
              Lõigatud metsaüksus
            </h3>
            <dl style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['Tunnus', '79501:027:0011'],
                ['Pindala', '1.41 ha · 14 080 m²'],
                ['Aadress', 'Taara pst 2, Tartu'],
                ['Piir', 'GeoJSON · 11 tippu'],
                ['Süsteem', 'EPSG:3301 (L-EST97)'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--paper-2)' }}>
                  <dt className="mono" style={{ fontSize: 11.5, color: '#8a967f', letterSpacing: '.08em', textTransform: 'uppercase' }}>{k}</dt>
                  <dd className="mono" style={{ fontSize: 13, color: 'var(--ink-on-paper)', textAlign: 'right' }}>{v}</dd>
                </div>
              ))}
            </dl>
            <a href="#" className="cta cta--dark" style={{ marginTop: 'auto', alignSelf: 'flex-start', padding: '12px 20px', fontSize: 14.5 }}>
              Lae alla TIF<span className="arrow" style={{ background: 'rgba(233,244,225,.18)' }}><Arrow size={13} /></span>
            </a>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS — editorial list */}
      <div style={{ position: 'relative', padding: '54px 72px 0', display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 64 }}>
        <SectionHead dark kicker="Kuidas see töötab" title="Tunnusest pildini." sub="Neli sammu, mis voogesitatakse reaalajas otse brauserisse." />
        <div>
          <LightStep num="01" et="Sisesta tunnus" body="Maa-ameti katastrist laetakse krundi täpne piir GeoJSON-polügoonina." en="Boundary fetched from the cadastre." />
          <LightStep num="02" et="Lae aerofoto" body="WMS-ist tõmmatakse värvi-infrapuna kiht — ideaalne taimestiku analüüsiks." en="Live colour-infrared WMS tile." />
          <LightStep num="03" et="Lõika kontuur" body="Pilt lõigatakse täpselt krundi kujuga — väljaspool läbipaistev." en="Clipped to your exact outline." />
          <LightStep num="04" et="Analüüsi (tulemas)" body="Puuliikide koosseis ja tüvede arv kaugseire mudelitega." en="Species & stem count — coming soon." />
        </div>
      </div>

      <div style={{ position: 'relative', padding: '64px 72px 36px' }}>
        <Footer dark />
      </div>
    </div>
  );
}

window.VariationC = VariationC;
