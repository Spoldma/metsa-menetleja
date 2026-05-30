import { useState, useEffect } from 'react'
import type { AnalysisResult, ForestHeightStats, ResourceData, SpeciesRatios, ValuationResult } from '../App'

interface Props { result: AnalysisResult; onSave: () => void; isSaved: boolean; speciesRatios: SpeciesRatios | null; valuation: ValuationResult | null }

function TreeDetectionCard({ treeCount, treePolygonPlot, clippedImage }: {
  treeCount: number
  treePolygonPlot: string
  clippedImage: string
}) {
  return (
    <div style={{
      borderRadius: 16,
      border: '1px solid rgba(139,195,74,.18)',
      background: 'linear-gradient(180deg, rgba(35,77,39,.28), rgba(13,31,13,.28))',
      backdropFilter: 'blur(10px)',
      padding: '28px 32px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <svg style={{ width: 18, height: 18, fill: 'var(--leaf)', flexShrink: 0 }} viewBox="0 0 24 24">
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-13 6 2-2 5-2.5 9-2z" />
        </svg>
        <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--mist)', margin: 0 }}>
          Puude tuvastus
        </h3>
        <div style={{
          marginLeft: 'auto',
          borderRadius: 10, background: 'rgba(10,22,11,.6)', padding: '10px 20px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.18em',
            textTransform: 'uppercase', color: 'var(--mist-dim)', margin: '0 0 2px' }}>
            Tuvastatud puud
          </p>
          <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--leaf)', margin: 0 }}>
            {treeCount.toLocaleString()}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ImageCard
          title="Katastriüksus"
          subtitle="Ortofoto lõige · CIR/NGR"
          src={`data:image/png;base64,${clippedImage}`}
          checker
        />
        <ImageCard
          title="Tuvastatud puukroonid"
          subtitle={`${treeCount.toLocaleString()} puud · polygon mask`}
          src={`data:image/png;base64,${treePolygonPlot}`}
          dark
        />
      </div>
    </div>
  )
}

function formatArea(m2: number): string {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${m2.toFixed(0)} m²`
}

const card: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(139,195,74,.18)',
  background: 'linear-gradient(180deg, rgba(35,77,39,.28), rgba(13,31,13,.28))',
  backdropFilter: 'blur(10px)',
}

export default function ResultsDisplay({ result, onSave, isSaved, speciesRatios, valuation }: Props) {
  const { info, originalImage, clippedImage, tifFiles, heightStats, resourceFile, resourceCount, treeCount, treePolygonPlot } = result

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

      {/* ── Tree detection ── */}
      {treeCount !== undefined && treePolygonPlot && (
        <TreeDetectionCard
          treeCount={treeCount}
          treePolygonPlot={treePolygonPlot}
          clippedImage={clippedImage}
        />
      )}

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

      <ValuationCard valuation={valuation} />

      <SpeciesCard ratios={speciesRatios} />

      {heightStats && <HeightStatsCard stats={heightStats} />}

      <ResourcesPanel resourceFile={resourceFile} resourceCount={resourceCount} cadastreRing={info.coordinates[0]} bbox={info.bbox} />
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

// ─── Valuation card ───────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('et-EE', { maximumFractionDigits: 0 })
}

function ValuationCard({ valuation }: { valuation: ValuationResult | null }) {
  const loading = valuation === null

  return (
    <div style={{ ...card, padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <svg style={{ width: 18, height: 18, fill: 'var(--leaf)', flexShrink: 0 }} viewBox="0 0 24 24">
            <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
          </svg>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--mist)', margin: 0 }}>Krundi ligikaudne väärtus</h2>
        </div>
        <span style={{
          fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.12em',
          textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999,
          border: '1px solid rgba(233,244,225,.18)', color: 'var(--mist-dim)',
        }}>
          {loading ? 'Arvutan...' : 'MKHIS · kolvikud · WFS'}
        </span>
      </div>

      {loading ? (
        <p style={{ fontSize: 14, color: 'var(--mist-dim)', fontStyle: 'italic', margin: 0 }}>
          Laen hindamisandmeid…
        </p>
      ) : (
        <>
          {/* Two-column estimate panels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

            {/* Option 1 */}
            <div style={{ borderRadius: 12, background: 'rgba(10,22,11,.6)', padding: '20px 22px' }}>
              <p style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.16em',
                textTransform: 'uppercase', color: 'var(--mist-dim)', margin: '0 0 6px' }}>
                Meetod 1 — ametlik põrand
              </p>
              <p style={{ fontSize: 13, color: 'var(--mist-dim)', margin: '0 0 16px', lineHeight: 1.4 }}>
                Maa maksustamishind
              </p>
              <p style={{ fontSize: 34, fontWeight: 700, color: 'var(--leaf)', margin: '0 0 4px',
                fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '-0.02em' }}>
                {fmt(valuation.option1_taxable.totalEur)} €
              </p>
              <p style={{ fontSize: 13, color: 'var(--mist-dim)', margin: '0 0 16px',
                fontFamily: "'IBM Plex Mono',monospace" }}>
                {fmt(valuation.option1_taxable.eurPerHa)} €/ha
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <MetaRow label="Hindamisaasta" value={String(valuation.option1_taxable.valuationYear)} />
                <MetaRow label="Kehtib alates" value={valuation.option1_taxable.assessedDate} />
              </div>
            </div>

            {/* Option 2 */}
            <div style={{ borderRadius: 12, background: 'rgba(10,22,11,.6)', padding: '20px 22px' }}>
              <p style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.16em',
                textTransform: 'uppercase', color: 'var(--mist-dim)', margin: '0 0 6px' }}>
                Meetod 2 — turustatistika
              </p>
              <p style={{ fontSize: 13, color: 'var(--mist-dim)', margin: '0 0 16px', lineHeight: 1.4 }}>
                Piirkondlik võrdlushind
              </p>
              <p style={{ fontSize: 34, fontWeight: 700, color: 'var(--mist)', margin: '0 0 4px',
                fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '-0.02em' }}>
                {fmt(valuation.option2_market.totalLowEur)} – {fmt(valuation.option2_market.totalHighEur)} €
              </p>
              <p style={{ fontSize: 13, color: 'var(--mist-dim)', margin: '0 0 16px',
                fontFamily: "'IBM Plex Mono',monospace" }}>
                {fmt(valuation.option2_market.regionalAvgLowEurPerHa)} – {fmt(valuation.option2_market.regionalAvgHighEurPerHa)} €/ha
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <MetaRow label="Piirkond" value={valuation.county} />
                <MetaRow label="Maakasutus" value={valuation.option2_market.primaryLandUse} />
                <MetaRow label="Andmeaasta" value={String(valuation.option2_market.dataYear)} />
              </div>
            </div>
          </div>

          {/* Restrictions + metadata */}
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.16em',
              textTransform: 'uppercase', color: 'var(--mist-dim)', margin: '0 0 10px' }}>
              Kitsendused (avalik kiht)
            </p>
            {valuation.restrictions.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--mist-dim)', margin: 0 }}>Kitsendusi ei tuvastatud</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {valuation.restrictions.map(r => (
                  <li key={r} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f4a261', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--mist)' }}>{r}</span>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 14 }}>
              <MetaRow label="Sihtotstarve" value={valuation.intendedPurpose} />
              <MetaRow label="Vald / linn" value={valuation.municipality} />
            </div>
          </div>

          {/* Disclaimer */}
          <p style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: 'rgba(197,216,189,.45)',
            marginTop: 20, lineHeight: 1.6, margin: '20px 0 0' }}>
            Meetod 1 (maksustamishind) on ametlik massihindamise tulemus — tavaliselt alla turuhinna.
            Meetod 2 põhineb Maa-ameti maakondlikul tehingustatistikal (2023) ja ei sisalda puidu väärtust.
          </p>
        </>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--mist-dim)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--mist)', fontFamily: "'IBM Plex Mono',monospace",
        textAlign: 'right', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}

// ─── Resources panel — simple list of unique KASUTUSALA_NIMETUS values ───────
function ResourcesPanel({ resourceFile, cadastreRing: _r, bbox: _b }: {
  resourceFile?: string
  resourceCount?: number
  cadastreRing: number[][]
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
}) {
  const [items, setItems] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!resourceFile) return
    setLoading(true)
    fetch(`http://localhost:3001/cadastre/resources/${resourceFile}`)
      .then(r => r.json() as Promise<ResourceData>)
      .then(d => {
        const unique = [...new Set(
          d.features
            .map(f => String(f.properties['KASUTUSALA_NIMETUS'] ?? '').trim())
            .filter(Boolean)
        )]
        setItems(unique)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [resourceFile])

  return (
    <div style={{ ...card, padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
        <svg style={{ width: 18, height: 18, fill: 'var(--leaf)', flexShrink: 0 }} viewBox="0 0 24 24">
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-13 6 2-2 5-2.5 9-2z" />
        </svg>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--mist)', margin: 0 }}>Maavarad</h2>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: '.14em',
          textTransform: 'uppercase', padding: '3px 10px', borderRadius: 99,
          border: '1px solid rgba(233,244,225,.18)', color: 'var(--mist-dim)' }}>
          Maa-amet · maardlad
        </span>
      </div>

      {loading && (
        <p style={{ fontSize: 14, color: 'var(--mist-dim)', margin: 0, fontStyle: 'italic' }}>Laen…</p>
      )}
      {!loading && !resourceFile && (
        <p style={{ fontSize: 14, color: 'var(--mist-dim)', margin: 0 }}>
          Maavarasid ei tuvastatud.
        </p>
      )}
      {!loading && resourceFile && items.length === 0 && (
        <p style={{ fontSize: 14, color: 'var(--mist-dim)', margin: 0 }}>
          Maavarasid ei tuvastatud.
        </p>
      )}
      {items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(name => (
            <li key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--leaf)', flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: 'var(--mist)' }}>{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
