import type { AnalysisResult, ForestHeightStats, SpeciesRatios } from '../App'

interface Props { result: AnalysisResult; onSave: () => void; isSaved: boolean; speciesRatios: SpeciesRatios | null }

function formatArea(m2: number): string {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${m2.toFixed(0)} m²`
}

const card: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(139,195,74,.18)',
  background: 'linear-gradient(180deg, rgba(35,77,39,.28), rgba(13,31,13,.28))',
  backdropFilter: 'blur(10px)',
}

export default function ResultsDisplay({ result, onSave, isSaved, speciesRatios }: Props) {
  const { info, originalImage, clippedImage, tifFiles, heightStats } = result

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Info card ── */}
      <div style={{ ...card, padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg style={{ width: 18, height: 18, color: 'var(--leaf)', fill: 'var(--leaf)', flexShrink: 0 }} viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--mist)', margin: 0 }}>Katastriüksuse info</h2>
          </div>
          <button
            onClick={onSave}
            disabled={isSaved}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: isSaved ? 'default' : 'pointer',
              background: isSaved ? 'rgba(139,195,74,.08)' : 'rgba(139,195,74,.15)',
              border: `1px solid ${isSaved ? 'rgba(139,195,74,.2)' : 'rgba(139,195,74,.4)'}`,
              color: isSaved ? 'var(--mist-dim)' : 'var(--leaf)',
              transition: 'background .15s',
            }}
            onMouseEnter={e => { if (!isSaved) e.currentTarget.style.background = 'rgba(139,195,74,.25)' }}
            onMouseLeave={e => { if (!isSaved) e.currentTarget.style.background = 'rgba(139,195,74,.15)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              {isSaved
                ? <path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" />
                : <path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2zm0 15-5-2.18L7 18V5h10v13z" />}
            </svg>
            {isSaved ? 'Salvestatud' : 'Salvesta kinnistu'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
          <Field label="Tunnus"  value={info.code}           mono />
          <Field label="Pindala" value={formatArea(info.area)} />
          {info.address && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Aadress" value={info.address} />
            </div>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.18em',
              textTransform: 'uppercase', color: 'var(--mist-dim)', marginBottom: 10 }}>Piirikast (EPSG:3301)</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['Min X', info.bbox.minX], ['Max X', info.bbox.maxX],
                ['Min Y', info.bbox.minY], ['Max Y', info.bbox.maxY],
              ].map(([l, v]) => (
                <div key={String(l)} style={{ borderRadius: 10, background: 'rgba(10,22,11,.6)',
                  padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--mist-dim)' }}>{l}</span>
                  <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--mist)' }}>
                    {(v as number).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Image panels ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ImageCard
          title="Originaal aerofoto"
          subtitle="WMS · CIR/NGR · EPSG:3301"
          src={`data:image/jpeg;base64,${originalImage}`}
          dark
        />
        <ImageCard
          title="Katastriüksus"
          subtitle="Lõigatud originaalpildist"
          src={`data:image/png;base64,${clippedImage}`}
          checker
        />
      </div>

      {/* ── TIF downloads ── */}
      {tifFiles?.length > 0 && (
        <div style={{ ...card, padding: '22px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
            <svg style={{ width: 16, height: 16, fill: 'var(--leaf)', flexShrink: 0 }} viewBox="0 0 24 24">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z" />
            </svg>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--mist)', margin: 0 }}>GeoTIFF failid</h3>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tifFiles.map(f => (
              <li key={f}>
                <a href={`http://localhost:3001/cadastre/tif/${f}`} download={f}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13,
                    fontFamily: "'IBM Plex Mono',monospace", color: 'var(--leaf)',
                    textDecoration: 'none', transition: 'color .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--mist)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--leaf)')}>
                  <svg style={{ width: 14, height: 14, fill: 'currentColor', flexShrink: 0 }} viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
                  </svg>
                  {f}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SpeciesCard ratios={speciesRatios} />

      {heightStats && <HeightStatsCard stats={heightStats} />}
    </div>
  )
}

function HeightStatsCard({ stats }: { stats: ForestHeightStats }) {
  const forestPct = stats.totalPixelCount > 0
    ? (stats.forestPixelCount / stats.totalPixelCount) * 100 : 0
  return (
    <div style={{ ...card, padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
        <svg style={{ width: 18, height: 18, fill: 'var(--leaf)', flexShrink: 0 }} viewBox="0 0 24 24">
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-13 6 2-2 5-2.5 9-2z" />
        </svg>
        <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--mist)', margin: 0 }}>Metsa kõrgus</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        <StatBadge label="Keskmine kõrgus" value={`${stats.averageHeight.toFixed(1)} m`} />
        <StatBadge label="Metsa osakaal" value={`${forestPct.toFixed(1)} %`} subtitle="(kõrgem kui 4 m)" />
        <StatBadge label="Metsakattega pikslit" value={stats.forestPixelCount.toLocaleString()} subtitle={`/ ${stats.totalPixelCount.toLocaleString()}`} />
      </div>
      <p style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.18em',
        textTransform: 'uppercase', color: 'var(--mist-dim)', marginBottom: 14 }}>
        Osakaal metsakattega alast (kõrgem kui 4 m)
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stats.shares.map(({ threshold, percentage }) => (
          <HeightBar key={threshold} threshold={threshold} percentage={percentage} />
        ))}
      </div>
    </div>
  )
}

function StatBadge({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div style={{ borderRadius: 10, background: 'rgba(10,22,11,.6)', padding: '12px 16px', textAlign: 'center' }}>
      <p style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.18em',
        textTransform: 'uppercase', color: 'var(--mist-dim)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--mist)', margin: 0 }}>{value}</p>
      {subtitle && <p style={{ fontSize: 11, color: 'var(--mist-dim)', margin: '2px 0 0' }}>{subtitle}</p>}
    </div>
  )
}

function HeightBar({ threshold, percentage }: { threshold: number; percentage: number }) {
  const pct = Math.min(100, Math.max(0, percentage))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--mist-dim)',
        width: 54, textAlign: 'right', flexShrink: 0 }}>&gt; {threshold} m</span>
      <div style={{ flex: 1, borderRadius: 99, background: 'rgba(10,22,11,.6)', height: 18, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--leaf), #5a9a5a)', transition: 'width .7s' }} />
      </div>
      <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--mist)',
        width: 54, flexShrink: 0 }}>{pct.toFixed(1)} %</span>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.18em',
        textTransform: 'uppercase', color: 'var(--mist-dim)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 14, color: 'var(--mist)', margin: 0,
        fontFamily: mono ? "'IBM Plex Mono',monospace" : 'inherit' }}>{value}</p>
    </div>
  )
}

const SPECIES_CLASSES = [
  {
    key: 'conifer' as const,
    label: 'Okaspuu',
    gradient: 'linear-gradient(to right, hsl(110,34%,24%), hsl(130,32%,32%), hsl(150,28%,36%))',
  },
  {
    key: 'broadleaf' as const,
    label: 'Lehtpuu',
    gradient: 'linear-gradient(to right, hsl(65,52%,38%), hsl(82,48%,42%), hsl(100,42%,40%))',
  },
]

function SpeciesCard({ ratios }: { ratios: SpeciesRatios | null }) {
  const loading = ratios === null
  return (
    <div style={{ ...card, padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <svg style={{ width: 18, height: 18, fill: 'var(--leaf)', flexShrink: 0 }} viewBox="0 0 24 24">
            <path d="M12 3 C8 7 4 8 4 14c0 4.4 3.6 8 8 8s8-3.6 8-8c0-6-4-7-8-11zm0 14.5c-2.5 0-4.5-2-4.5-4.5 0-3.5 2-5 4.5-8 2.5 3 4.5 4.5 4.5 8 0 2.5-2 4.5-4.5 4.5z" />
          </svg>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--mist)', margin: 0 }}>Puuliigid</h3>
        </div>
        <span style={{
          fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.12em',
          textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999,
          border: '1px solid rgba(233,244,225,.18)', color: 'var(--mist-dim)',
        }}>
          {loading ? 'Arvutan...' : 'ortofoto algoritm'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {SPECIES_CLASSES.map(({ key, label, gradient }) => {
          const pct = loading ? 0 : Math.round((ratios[key]) * 1000) / 10
          return (
            <div key={key}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mist)' }}>{label}</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: loading ? 'var(--mist-dim)' : 'var(--mist)', fontFamily: "'IBM Plex Mono',monospace" }}>
                  {loading ? '—' : `${pct.toFixed(1)} %`}
                </span>
              </div>
              <div style={{ borderRadius: 99, background: 'rgba(10,22,11,.6)', height: 14, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: loading ? '0%' : `${pct}%`,
                  background: gradient,
                  transition: 'width .8s cubic-bezier(.4,0,.2,1)',
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {!loading && ratios.pixelCount > 0 && (
        <div style={{ marginTop: 24, borderRadius: 99, height: 8, overflow: 'hidden', display: 'flex', gap: 2 }}>
          {SPECIES_CLASSES.map(({ key, gradient }) => (
            <div key={key} style={{
              flex: ratios[key],
              background: gradient,
              minWidth: ratios[key] > 0 ? 4 : 0,
              transition: 'flex .8s cubic-bezier(.4,0,.2,1)',
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

function ImageCard({ title, subtitle, src, dark, checker }: {
  title: string; subtitle: string; src: string; dark?: boolean; checker?: boolean
}) {
  return (
    <div style={{ borderRadius: 16, border: '1px solid rgba(139,195,74,.18)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(139,195,74,.14)',
        background: 'rgba(13,31,13,.6)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--mist)', margin: 0 }}>{title}</h3>
        <p style={{ fontSize: 11, color: 'var(--mist-dim)', marginTop: 3, fontFamily: "'IBM Plex Mono',monospace",
          letterSpacing: '.05em' }}>{subtitle}</p>
      </div>
      <div style={{
        minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8,
        background: checker
          ? undefined
          : dark ? 'rgba(10,22,11,.9)' : 'rgba(13,31,13,.7)',
      }} className={checker ? 'checkerboard' : ''}>
        <img src={src} alt={title}
          style={{ maxWidth: '100%', maxHeight: 340, borderRadius: 4, display: 'block' }} />
      </div>
    </div>
  )
}
