/* global React, Nav, CadastreField, SpecStrip, MapChip, Step, SectionHead, Footer, AerialParcel, Arrow */
// var-a.jsx — Variation A · "Kataster" — dark cartographic split hero (EcoLife lineage)

function VariationA() {
  return (
    <div className="mm mm--a" data-screen-label="A · Kataster"
      style={{
        width: 1280, height: 'auto', background:
          'radial-gradient(1100px 700px at 78% -8%, #1c3d20 0%, rgba(28,61,32,0) 60%),' +
          'radial-gradient(900px 600px at 6% 12%, #163018 0%, rgba(22,48,24,0) 55%),' +
          'linear-gradient(180deg, #0c1d0d 0%, #0a160b 100%)',
        display: 'flex', flexDirection: 'column',
      }}>
      {/* faint coordinate grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        backgroundImage:
          'linear-gradient(rgba(139,195,74,.05) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(139,195,74,.05) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }}></div>

      <div style={{ position: 'relative', padding: '34px 64px 0' }}>
        <Nav links={['Kuidas töötab', 'Andmed', 'Tulevik']} badge="Maa-amet · otseühendus" />
      </div>

      {/* HERO */}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.04fr 0.96fr', gap: 56, alignItems: 'center', padding: '64px 64px' }}>
        <div>
          <div className="eyebrow-row">
            <span className="line"></span>
            <span className="kicker" style={{ color: 'var(--leaf)' }}>Katastritunnus → aerofoto</span>
          </div>
          <h1 className="serif" style={{ fontSize: 74, lineHeight: 1.02, letterSpacing: '-0.02em', marginTop: 22, color: 'var(--mist)' }}>
            Vaata oma metsa<br /><span style={{ fontStyle: 'italic', color: 'var(--leaf-soft)' }}>linnulennult.</span>
          </h1>
          <p style={{ marginTop: 24, fontSize: 19, lineHeight: 1.55, color: 'var(--mist-dim)', maxWidth: 480 }}>
            Sisesta katastritunnus ja saad puhta aerofoto täpselt oma metsaüksusest — Maa-ameti otseandmetest, sinu krundi kujuga lõigatud.
          </p>
          <p className="en-sub" style={{ marginTop: 10, fontSize: 15, maxWidth: 470, fontStyle: 'italic' }}>
            Enter a cadastre code and get a clean aerial portrait of your exact forest parcel.
          </p>

          <div style={{ marginTop: 34 }}>
            <CadastreField />
          </div>

          <div style={{ marginTop: 40 }}>
            <SpecStrip items={[
              { k: 'Allikas', v: 'Maa-amet' },
              { k: 'Kiht', v: 'CIR / NGR' },
              { k: 'Süsteem', v: 'EPSG:3301' },
            ]} />
          </div>
        </div>

        {/* aerial visual */}
        <div style={{ position: 'relative', height: 540 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 24, padding: 10, background: 'linear-gradient(160deg, rgba(139,195,74,.28), rgba(139,195,74,0) 55%)', boxShadow: '0 40px 90px -40px rgba(0,0,0,.8)' }}>
            <AerialParcel id="a-hero" shape="default" mode="canopy" clip="dim" seed={11} radius={16} />
          </div>
          <MapChip style={{ position: 'absolute', left: 26, bottom: 26 }} rows={[
            { k: 'Tunnus', v: '79501:027:0011' },
            { k: 'Pindala', v: '1.41 ha' },
            { k: 'Piir', v: 'GeoJSON · 11 tippu' },
          ]} />
          <div className="chip mono" style={{ position: 'absolute', right: 22, top: 22, fontSize: 11, color: 'var(--mist-dim)', borderColor: 'rgba(139,195,74,.22)' }}>
            N 6 474 203 · E 658 365
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={{ position: 'relative', padding: '0 64px 0' }}>
        <SectionHead kicker="Kuidas see töötab" title="Tunnusest pildini, neljas sammus."
          sub="Iga samm voogesitatakse reaalajas otse sinu brauserisse." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 36 }}>
          <Step num="01" title="Sisesta tunnus" body="Maa-ameti katastrist laetakse krundi täpne piir GeoJSON-polügoonina." en="Boundary fetched from the cadastre." />
          <Step num="02" title="Arvuta ulatus" body="Polügoonist tuletatakse piirikast koos 5% varuga pildi jaoks." en="Bounding box with 5% padding." />
          <Step num="03" title="Lae aerofoto" body="Maa-ameti WMS-ist tõmmatakse värvi-infrapuna kiht — ideaalne taimestikule." en="Live colour-infrared WMS tile." />
          <Step num="04" title="Lõika kontuur" body="Pilt lõigatakse täpselt krundi kujuga — väljaspool läbipaistev." en="Clipped to your exact outline." />
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ position: 'relative', padding: '64px 64px 36px' }}>
        <Footer />
      </div>
    </div>
  );
}

window.VariationA = VariationA;
