import { useState, useRef } from 'react'
import ProgressSteps from './components/ProgressSteps'
import ResultsDisplay from './components/ResultsDisplay'
import MinuKinnistud from './pages/MinuKinnistud'

type Page = 'home' | 'kinnistud'

export type Phase = 'idle' | 'loading' | 'done' | 'error'
export interface ProgressStep { step: string; message: string }
export interface CadastreInfo {
  code: string; address: string; area: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
  coordinates: number[][][]
}
export interface ForestHeightStats {
  averageHeight: number
  forestPixelCount: number
  totalPixelCount: number
  shares: { threshold: number; percentage: number }[]
}

export interface ResourceFeature {
  type: string
  geometry: { type: string; coordinates: number[][][] | number[][][][] }
  properties: Record<string, string | number | null>
}
export interface ResourceData {
  type: string
  features: ResourceFeature[]
}
export interface AnalysisResult {
  info: CadastreInfo
  originalImage: string
  clippedImage: string
  tifFiles: string[]
  cirFile?: string
  heightStats?: ForestHeightStats
  resourceFile?: string
  resourceCount?: number
  treeCount?: number
  treePolygonPlot?: string
}
export interface SpeciesRatios {
  conifer: number
  broadleaf: number
  land: number
  pixelCount: number
}

export interface SavedParcel {
  id: string
  savedAt: string
  info: CadastreInfo
  clippedImage: string
}

const STORAGE_KEY = 'metsa-menetleja-saved'

function loadSaved(): SavedParcel[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function storeSaved(parcels: SavedParcel[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parcels))
}

// ─── Forest canopy SVG background (design's AerialParcel, wide/canopy mode) ──
function ForestCanopy() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
      width="100%" height="100%"
      style={{ position: 'absolute', inset: 0, display: 'block' }}>
      <defs>
        <filter id="tex-hero" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.016 0.022"
            numOctaves="5" seed="23" stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" type="matrix" result="m"
            values="0 0 0 0 0.13  0 0 0 0 0.32  0 0 0 0 0.13  0 0 0 0 1" />
          <feComponentTransfer in="m" result="mm">
            <feFuncR type="gamma" amplitude="1" exponent="0.8" offset="0" />
          </feComponentTransfer>
          <feBlend in="mm" in2="n" mode="multiply" />
        </filter>
        <radialGradient id="clr-hero" cx="38%" cy="34%" r="85%">
          <stop offset="0%"   stopColor="#5a9a4e" />
          <stop offset="42%"  stopColor="#3f7d3a" />
          <stop offset="78%"  stopColor="#1d3f1e" />
          <stop offset="100%" stopColor="#0f2410" />
        </radialGradient>
        {/* parcel polygon */}
        <clipPath id="cut-hero">
          <polygon points="8,28 30,12 62,16 92,30 84,56 60,72 96,84 40,90 14,66 20,46" />
        </clipPath>
        <mask id="out-hero">
          <rect x="0" y="0" width="100" height="100" fill="#fff" />
          <polygon points="8,28 30,12 62,16 92,30 84,56 60,72 96,84 40,90 14,66 20,46" fill="#000" />
        </mask>
      </defs>
      {/* base fill */}
      <rect x="0" y="0" width="100" height="100" fill="url(#clr-hero)" />
      <rect x="0" y="0" width="100" height="100" filter="url(#tex-hero)" opacity="0.62" />
      {/* stream / clearing */}
      <path d="M-5,68 C20,60 26,82 48,74 C70,66 76,86 105,78"
        fill="none" stroke="#16414a" strokeWidth="2.4" opacity="0.5" strokeLinecap="round" />
      {/* dim outside parcel */}
      <rect x="0" y="0" width="100" height="100" fill="#0c1d0d" opacity="0.6" mask="url(#out-hero)" />
      {/* coordinate grid */}
      {[20,40,60,80].map(v => (
        <line key={`gv${v}`} x1={v} y1="0" x2={v} y2="100" stroke="#cfe6a8" strokeWidth="0.18" opacity="0.35" />
      ))}
      {[20,40,60,80].map(v => (
        <line key={`gh${v}`} x1="0" y1={v} x2="100" y2={v} stroke="#cfe6a8" strokeWidth="0.18" opacity="0.35" />
      ))}
      {/* parcel boundary */}
      <polygon points="8,28 30,12 62,16 92,30 84,56 60,72 96,84 40,90 14,66 20,46"
        fill="none" stroke="#d8f3b0" strokeWidth="0.65"
        strokeDasharray="2.4 1.6" strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,.6))' }} />
      {/* vertex dots */}
      {'8,28 30,12 62,16 92,30 84,56 60,72 96,84 40,90 14,66 20,46'.split(' ').map((p, i) => {
        const [x, y] = p.split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r="0.7" fill="#d8f3b0" />
      })}
      {/* crosshair at centroid ~48,47 */}
      <g stroke="#d8f3b0" strokeWidth="0.4" opacity="0.9">
        <circle cx="48" cy="47" r="2.6" fill="none" />
        <line x1="43.5" y1="47" x2="52.5" y2="47" />
        <line x1="48" y1="42.5" x2="48" y2="51.5" />
      </g>
    </svg>
  )
}

function ScaleBar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', height: 6 }}>
        {['rgba(233,244,225,.8)', 'transparent', 'rgba(233,244,225,.8)', 'transparent'].map((c, i) => (
          <div key={i} style={{ width: 24, background: c, border: '1px solid rgba(233,244,225,.6)' }} />
        ))}
      </div>
      <span className="font-mono" style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--mist-dim)' }}>0 — 100 m</span>
    </div>
  )
}

function NorthArrow() {
  return (
    <svg width="30" height="38" viewBox="0 0 34 42" fill="none" aria-hidden="true">
      <path d="M17 2 L26 30 L17 23 L8 30 Z" fill="#e9f4e1" stroke="#0a160b" strokeWidth="1" />
      <text x="17" y="40" textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="11" fill="#e9f4e1">N</text>
    </svg>
  )
}

function LeafIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--leaf)" aria-hidden="true">
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-13 6 2-2 5-2.5 9-2z" />
    </svg>
  )
}
function ArrowRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
function PinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  )
}

function formatArea(m2: number) {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${m2.toFixed(0)} m²`
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [phase, setPhase] = useState<Phase>('idle')
  const [steps, setSteps] = useState<ProgressStep[]>([])
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [speciesRatios, setSpeciesRatios] = useState<SpeciesRatios | null>(null)
  const [error, setError] = useState('')
  const [inputVal, setInputVal] = useState('')
  const [savedParcels, setSavedParcels] = useState<SavedParcel[]>(loadSaved)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    if (!result) return
    const already = savedParcels.some(p => p.info.code === result.info.code)
    if (already) return
    const entry: SavedParcel = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      info: result.info,
      clippedImage: result.clippedImage,
    }
    const updated = [entry, ...savedParcels]
    setSavedParcels(updated)
    storeSaved(updated)
  }

  const handleDelete = (id: string) => {
    const updated = savedParcels.filter(p => p.id !== id)
    setSavedParcels(updated)
    storeSaved(updated)
  }

  const isAlreadySaved = result ? savedParcels.some(p => p.info.code === result.info.code) : false

  const handleAnalyze = (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setPage('home')
    setPhase('loading')
    setSteps([])
    setResult(null)
    setSpeciesRatios(null)
    setError('')

    const es = new EventSource(
      `http://localhost:3001/cadastre/analyze?code=${encodeURIComponent(trimmed)}`
    )
    es.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data) as ProgressStep & { payload?: AnalysisResult }
      setSteps(prev => {
        const last = prev[prev.length - 1]
        if (last?.step === data.step && data.step === 'tif_download')
          return [...prev.slice(0, -1), { step: data.step, message: data.message }]
        return [...prev, { step: data.step, message: data.message }]
      })
      if (data.step === 'complete' && data.payload) {
        setResult(data.payload); setPhase('done'); es.close()
        const speciesFile = data.payload.cirFile ?? data.payload.tifFiles?.[0]
        if (speciesFile) {
          fetch(`http://localhost:3001/cadastre/species/${encodeURIComponent(speciesFile)}`)
            .then(r => r.json())
            .then((d: SpeciesRatios) => setSpeciesRatios(d))
            .catch(e => console.error('[species]', e))
        }
      }
      if (data.step === 'error') {
        setError(data.message); setPhase('error'); es.close()
      }
    }
    es.onerror = () => {
      setError('Ühendus serveriga ebaõnnestus. Kontrolli, kas server töötab.')
      setPhase('error'); es.close()
    }
  }

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); handleAnalyze(inputVal) }

  const isLoading = phase === 'loading'
  const isDone    = phase === 'done' && !!result

  if (page === 'kinnistud') {
    return (
      <MinuKinnistud
        parcels={savedParcels}
        onDelete={handleDelete}
        onAnalyze={code => { setInputVal(code); handleAnalyze(code) }}
        onBack={() => setPage('home')}
      />
    )
  }

  return (
    <div style={{ background: 'var(--ink)', minHeight: '100vh' }}>

      {/* ═══════════════════════════════════ HERO ══════════════════════════════ */}
      <div style={{ position: 'relative', height: 760, overflow: 'hidden', background: '#0c1d0d' }}>

        {/* ── Background layer: SVG canopy → blurred WMS on done ── */}
        <div style={{ position: 'absolute', inset: 0, transition: 'opacity 0.8s ease' }}>
          {isDone ? (
            <>
              <img
                src={`data:image/jpeg;base64,${result.originalImage}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover',
                  filter: 'blur(28px) brightness(0.7)', transform: 'scale(1.12)',
                  display: 'block' }}
              />
              {/* dark wash */}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,16,8,0.45)' }} />
            </>
          ) : (
            <ForestCanopy />
          )}
        </div>

        {/* ── Centred parcel reveal (done state) ── */}
        {isDone && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 4, animation: 'fadeIn 0.9s ease',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10
          }}>
            <img
              src={`data:image/png;base64,${result.clippedImage}`}
              alt="Katastriüksus"
              style={{
                maxHeight: 380, maxWidth: 480,
                filter: 'drop-shadow(0 0 28px rgba(139,195,74,0.45)) drop-shadow(0 0 8px rgba(0,0,0,0.8))',
                borderRadius: 4,
              }}
            />
          </div>
        )}

        {/* ── Left legibility gradient ── */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(100deg, rgba(8,16,8,.88) 0%, rgba(8,16,8,.52) 38%, rgba(8,16,8,0) 62%)'
        }} />

        {/* ── Nav ── */}
        <div style={{ position: 'absolute', top: 30, left: 56, right: 56, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center',
              background: 'rgba(139,195,74,.14)', border: '1px solid rgba(139,195,74,.3)' }}>
              <LeafIcon size={18} />
            </div>
            <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--mist)' }}>Metsa Menetleja</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <a href="#how-it-works"
              style={{ fontSize: 14, fontWeight: 500, color: 'var(--mist-dim)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color='var(--mist)')}
              onMouseLeave={e => (e.currentTarget.style.color='var(--mist-dim)')}>Kuidas töötab</a>
            <a href="#"
              style={{ fontSize: 14, fontWeight: 500, color: 'var(--mist-dim)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color='var(--mist)')}
              onMouseLeave={e => (e.currentTarget.style.color='var(--mist-dim)')}>Andmed</a>
            <a href="https://register.metsad.ee/" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 14, fontWeight: 500, color: 'var(--mist-dim)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color='var(--mist)')}
              onMouseLeave={e => (e.currentTarget.style.color='var(--mist-dim)')}>Metsaregister</a>
            <button onClick={() => setPage('kinnistud')}
              style={{ fontSize: 14, fontWeight: 500, color: 'var(--mist-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color .15s', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => (e.currentTarget.style.color='var(--mist)')}
              onMouseLeave={e => (e.currentTarget.style.color='var(--mist-dim)')}>
              Minu kinnistud
              {savedParcels.length >= 1 && (
                <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", background: 'rgba(139,195,74,.18)', border: '1px solid rgba(139,195,74,.35)', color: 'var(--leaf)', borderRadius: 999, padding: '1px 7px', lineHeight: 1.6 }}>
                  {savedParcels.length}
                </span>
              )}
            </button>
          </div>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
            padding: '7px 14px', borderRadius: 999, border: '1px solid rgba(233,244,225,.22)', color: 'var(--mist-dim)' }}>
            Maa-amet · otseühendus
          </span>
        </div>

        {/* ── Coordinate HUD ── */}
        <div style={{ position: 'absolute', top: 108, right: 28, zIndex: 6,
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: '.08em',
          color: 'var(--mist-dim)', textAlign: 'right', lineHeight: 1.7 }}>
          <div>L-EST97 · EPSG:3301</div>
          {isDone && (
            <>
              <div style={{ color: 'var(--leaf)', marginTop: 4 }}>
                {result.info.bbox.minX.toFixed(0)} — {result.info.bbox.maxX.toFixed(0)}
              </div>
              <div style={{ color: 'var(--leaf)' }}>
                {result.info.bbox.minY.toFixed(0)} — {result.info.bbox.maxY.toFixed(0)}
              </div>
            </>
          )}
        </div>

        {/* ── Scale + North ── */}
        <div style={{ position: 'absolute', right: 28, bottom: 28, zIndex: 6, display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <ScaleBar />
          <NorthArrow />
        </div>

        {/* ── MapChip (done) ── */}
        {isDone && (
          <div className="map-chip animate-fadeIn" style={{ position: 'absolute', left: 56, bottom: 28, zIndex: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, padding: '2px 0' }}>
              <span style={{ color: 'var(--mist-dim)' }}>Tunnus</span>
              <span style={{ color: 'var(--leaf)' }}>{result.info.code}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, padding: '2px 0' }}>
              <span style={{ color: 'var(--mist-dim)' }}>Pindala</span>
              <span style={{ color: 'var(--leaf)' }}>{formatArea(result.info.area)}</span>
            </div>
          </div>
        )}

        {/* ── Left glass console ── */}
        <div style={{ position: 'absolute', left: 56, top: 160, maxWidth: 560, zIndex: 6 }}>
          {/* eyebrow */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ height: 1, width: 40, background: 'rgba(139,195,74,.5)' }} />
            <span className="kicker" style={{ color: 'var(--leaf-soft)' }}>Eesti metsakaart · tunnuse järgi</span>
            <div style={{ height: 1, width: 40, background: 'rgba(139,195,74,.5)' }} />
          </div>

          <h1 className="font-display" style={{
            fontSize: 62, lineHeight: 1.04, letterSpacing: '-0.02em',
            color: 'var(--mist)', margin: 0,
            textShadow: '0 2px 30px rgba(0,0,0,.5)',
          }}>
            Kas sa üldse tead,<br />
            <span style={{ fontStyle: 'italic', color: 'var(--leaf-soft)' }}>mis sinu metsas toimub?</span>
          </h1>

          <p className="font-mono" style={{
            marginTop: 20, fontSize: 17, lineHeight: 1.58,
            color: 'var(--mist)', maxWidth: 460,
            textShadow: '0 1px 16px rgba(0,0,0,.6)',
          }}>
            uusim ortofoto · puude tuvastus ja klassifitseerimine · hinna ennustus · ristkontroll metsaregistriga
          </p>

          <p className="font-mono" style={{ marginTop: 6, fontSize: 12, letterSpacing: '.04em', color: 'rgba(197,216,189,.6)', marginBottom: 24 }}>
            Latest orthophoto · tree detection &amp; classification · price prediction · forest register cross-check
          </p>

          {/* Input */}
          <form onSubmit={onSubmit}>
            <div className="cad-field" style={{ maxWidth: 440 }}>
              <span style={{ color: 'var(--leaf)', display: 'flex' }}><PinIcon size={17} /></span>
              <input
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="79501:027:0011"
                spellCheck={false}
                disabled={isLoading}
              />
              <button type="submit" className="go-btn" disabled={isLoading || !inputVal.trim()}>
                {isLoading ? 'Laen…' : 'Analüüsi'} <ArrowRight size={13} />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ═══════════════════════════ PROGRESS (loading / error) ════════════════ */}
      {(phase === 'loading' || phase === 'error') && steps.length > 0 && (
        <div style={{ background: 'var(--forest-d)', padding: '40px 56px' }}>
          <ProgressSteps steps={steps} phase={phase} />
        </div>
      )}
      {phase === 'error' && error && (
        <div style={{ padding: '0 56px 32px', background: 'var(--forest-d)' }}>
          <div style={{ borderRadius: 12, border: '1px solid rgba(220,80,80,.35)',
            background: 'rgba(80,20,20,.4)', padding: '14px 20px', color: '#f8a8a8', fontSize: 14 }}>
            {error}
          </div>
        </div>
      )}

      {/* ═══════════════════════════ HOW IT WORKS (hidden when done) ══════════ */}
      {!isDone && <div id="how-it-works" style={{ background: 'var(--forest-d)', padding: '60px 56px 0' }}>
        {/* section head */}
        <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ height: 1, width: 40, background: 'rgba(139,195,74,.5)' }} />
            <span className="kicker">Töövoog</span>
            <div style={{ height: 1, width: 40, background: 'rgba(139,195,74,.5)' }} />
          </div>
          <h2 className="font-display" style={{ fontSize: 38, lineHeight: 1.08, letterSpacing: '-0.015em', marginTop: 16, color: 'var(--mist)', fontWeight: 400 }}>
            Tunnusest metsahinnani.
          </h2>
          <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.6, color: 'var(--mist-dim)' }}>
            Iga etapp voogesitatakse otse sinu brauserisse. Automaatselt, reaalajas.
          </p>
        </div>

        {/* steps grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 40 }}>
          {[
            { num: '01', title: 'Piir',      body: 'Katastrist laetakse krundi täpne piir GeoJSON-polügoonina.',               en: 'Fetch boundary.' },
            { num: '02', title: 'Ortofoto',  body: 'Maa-ameti kaardilehelt alla laetud kõrgeima kvaliteediga GeoTIFF.',        en: 'Download latest GeoTIFF tile.' },
            { num: '03', title: 'Lõige',     body: 'Aerofoto lõigatakse täpselt katastriüksuse kujuga, muud alad mustaks.',    en: 'Clip to exact boundary.' },
            { num: '04', title: 'Analüüs',   body: 'Puud tuvastatakse, liigid klassifitseeritakse, metsahind ennustatakse. Ristkontroll metsaregistriga.', en: 'Tree detection · price prediction · forest register.' },
          ].map(s => (
            <div key={s.num} className="step-card">
              <div className="font-mono" style={{ fontSize: 12, color: 'var(--leaf)', letterSpacing: '.12em' }}>{s.num}</div>
              <h3 className="font-display" style={{ fontSize: 20, color: 'var(--mist)', marginTop: 14, letterSpacing: '-0.01em', fontWeight: 400 }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--mist-dim)', marginTop: 8, lineHeight: 1.6 }}>{s.body}</p>
              <p className="font-mono" style={{ fontSize: 12, color: 'rgba(197,216,189,.55)', marginTop: 6, fontStyle: 'italic' }}>{s.en}</p>
            </div>
          ))}
        </div>

        {/* CIR explainer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 40, alignItems: 'center',
          marginTop: 48, padding: '36px 0 0', borderTop: '1px solid rgba(233,244,225,.1)' }}>
          <div style={{ maxWidth: 540 }}>
            <span className="kicker" style={{ color: 'var(--cir)' }}>Värvi-infrapuna</span>
            <h3 className="font-display" style={{ fontSize: 30, color: 'var(--mist)', marginTop: 12, letterSpacing: '-0.01em', fontWeight: 400 }}>
              Terve taimestik helendab punaselt.
            </h3>
            <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.65, color: 'var(--mist-dim)', maxWidth: 480 }}>
              CIR-kiht peegeldab lähi-infrapuna valgust, mistõttu elujõuline mets paistab eredalt punasena.
              See on ideaalne alus puuliigituvastusele ja tüvede loendusele, millega me metsa hinda hindame.
            </p>
          </div>
          {/* CIR parcel mini visual */}
          <div style={{ height: 190, borderRadius: 14, overflow: 'hidden', background: '#241019', position: 'relative' }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"
              style={{ position: 'absolute', inset: 0 }}>
              <defs>
                <filter id="tex-cir">
                  <feTurbulence type="fractalNoise" baseFrequency="0.018 0.024" numOctaves="5" seed="5" result="n" />
                  <feColorMatrix in="n" type="matrix" result="m"
                    values="0 0 0 0 0.55  0 0 0 0 0.18  0 0 0 0 0.36  0 0 0 0 1" />
                  <feBlend in="m" in2="n" mode="multiply" />
                </filter>
                <clipPath id="cut-cir"><polygon points="24,10 70,16 88,40 80,70 52,90 20,72 10,40" /></clipPath>
              </defs>
              <g clipPath="url(#cut-cir)">
                <rect x="0" y="0" width="100" height="100" fill="#7d2f57" />
                <rect x="0" y="0" width="100" height="100" filter="url(#tex-cir)" opacity="0.7" />
              </g>
              <polygon points="24,10 70,16 88,40 80,70 52,90 20,72 10,40"
                fill="none" stroke="#ffd0e4" strokeWidth="0.7" strokeDasharray="2.4 1.6" />
              <g stroke="#ffd0e4" strokeWidth="0.45" opacity="0.85">
                <circle cx="48" cy="46" r="2.8" fill="none" />
                <line x1="43" y1="46" x2="53" y2="46" />
                <line x1="48" y1="41" x2="48" y2="51" />
              </g>
            </svg>
          </div>
        </div>
      </div>}

      {/* ═══════════════════════════ RESULTS ═══════════════════════════════════ */}
      {isDone && (
        <div style={{ background: 'var(--forest-d)', padding: '48px 56px' }} className="animate-fadeIn">
          <ResultsDisplay result={result} onSave={handleSave} isSaved={isAlreadySaved} speciesRatios={speciesRatios} />
        </div>
      )}

      {/* ═══════════════════════════ FOOTER ════════════════════════════════════ */}
      <div style={{ background: 'var(--forest-d)', padding: '28px 56px 36px',
        borderTop: '1px solid rgba(233,244,225,.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
              background: 'rgba(139,195,74,.14)', border: '1px solid rgba(139,195,74,.3)' }}>
              <LeafIcon size={16} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--mist)' }}>Metsa Menetleja</span>
          </div>
          <p className="font-mono" style={{ fontSize: 11, color: 'var(--mist-dim)', letterSpacing: '.04em' }}>
            Katastriandmed &amp; aerofotod: Maa-amet · EPSG:3301
          </p>
          <p style={{ fontSize: 13, color: 'var(--mist-dim)' }}>© 2026 Metsa Menetleja</p>
        </div>
      </div>

    </div>
  )
}
