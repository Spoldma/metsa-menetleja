import { useState, useEffect, type ReactNode } from 'react'
import type { AnalysisResult, TimberVolumeResult, ForestValueResult, ResourceData, SpeciesRatios, ValuationResult } from '../App'

interface Props {
  result: AnalysisResult
  onSave: () => void
  isSaved: boolean
  speciesRatios: SpeciesRatios | null; valuation: ValuationResult | null
  timberVolume?: TimberVolumeResult | null
  forestValue?: ForestValueResult | null
}

// ─── Utility functions ────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.round(n).toLocaleString('et-EE')
}

function fmtEur(n: number): string {
  if (n < 0) return `−€${fmt(-n)}`
  return `€${fmt(n)}`
}

function formatArea(m2: number): string {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${m2.toFixed(0)} m²`
}

function calcPerimeterM(coords: number[][][]): number {
  if (!coords || !coords[0] || coords[0].length < 2) return 0
  const ring = coords[0]
  let total = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0]
    const dy = ring[i + 1][1] - ring[i][1]
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return total
}

// ─── Species mapping ──────────────────────────────────────────────────────────

const SPECIES_ET: Record<string, string> = {
  MA: 'Mänd', KU: 'Kuusk', KS: 'Kask', HB: 'Haab',
  LM: 'Sanglepp', LV: 'Hall lepp', TM: 'Tamm',
}

// ─── RowData type ─────────────────────────────────────────────────────────────

type RowData = {
  num: string
  title: string
  source: string
  stat: { v: string; u: string }
  desc: string
  data: { l: string; v: string; s?: string }[]
  contrib?: { tag: string; txt: ReactNode; neg?: boolean }
  viz?: ReactNode
  wideViz?: ReactNode
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VizFrame({ cap, note, children }: { cap: string; note?: string; children: ReactNode }) {
  return (
    <div className="viz">
      <div className="viz-cap">
        <span className="t">{cap}</span>
        {note && <span className="n">{note}</span>}
      </div>
      {children}
    </div>
  )
}

type StackSegment = { name: string; label: string; val: number; color: string }

function StackBar({ cap, note, segments }: { cap: string; note?: string; segments: StackSegment[] }) {
  const total = segments.reduce((s, x) => s + x.val, 0)
  return (
    <VizFrame cap={cap} note={note}>
      <div className="stack">
        {segments.map(seg => (
          <i key={seg.name} style={{
            flex: total > 0 ? seg.val / total : 0,
            background: seg.color,
          }} />
        ))}
      </div>
      <div className="legend">
        {segments.map(seg => (
          <div key={seg.name} className="li">
            <span className="sw" style={{ background: seg.color }} />
            <span className="nm">{seg.label}</span>
            <span className="pc">{total > 0 ? `${((seg.val / total) * 100).toFixed(1)} %` : '—'}</span>
          </div>
        ))}
      </div>
    </VizFrame>
  )
}

function Histogram({ cap, note, classes: bars, meanLabel }: {
  cap: string; note?: string
  classes: { label: string; count: number }[]
  meanLabel?: string
}) {
  const max = Math.max(...bars.map(b => b.count), 1)
  return (
    <VizFrame cap={cap} note={note}>
      <div className="bars">
        {bars.map(b => {
          const pct = (b.count / max) * 100
          return (
            <div key={b.label} className="col">
              <span className="ct">{b.count > 0 ? `${b.count.toFixed(0)}%` : ''}</span>
              <div className="bar" style={{ height: `${Math.max(pct, 2)}%` }} />
              <span className="cl">{b.label}</span>
            </div>
          )
        })}
      </div>
      {meanLabel && <p className="axis-note">{meanLabel}</p>}
    </VizFrame>
  )
}

// Mulberry32 PRNG — deterministic, same as viz.jsx pattern
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// LEAN polygon — approximate parcel shape used for dot density
const LEAN_PTS: [number, number][] = [
  [0.18, 0.14], [0.42, 0.08], [0.72, 0.11], [0.88, 0.28],
  [0.92, 0.52], [0.78, 0.74], [0.58, 0.88], [0.34, 0.92],
  [0.12, 0.76], [0.06, 0.48],
]

function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function TreeDots({ cap, note }: { cap: string; note?: string }) {
  const W = 306, H = 160
  const rand = mulberry32(0xdeadbeef)
  const dots: { cx: number; cy: number }[] = []
  let attempts = 0
  while (dots.length < 120 && attempts < 3000) {
    attempts++
    const rx = rand(), ry = rand()
    const px = rx, py = ry
    if (pointInPolygon(px, py, LEAN_PTS)) {
      dots.push({ cx: rx * W, cy: ry * H })
    }
  }
  const poly = LEAN_PTS.map(([x, y]) => `${(x * W).toFixed(1)},${(y * H).toFixed(1)}`).join(' ')
  return (
    <VizFrame cap={cap} note={note}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', borderRadius: 6 }}>
        <polygon points={poly} fill="rgba(35,77,39,.35)" stroke="rgba(139,195,74,.3)" strokeWidth="1" />
        {dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r="2.2" fill="var(--leaf)" opacity="0.72" />
        ))}
      </svg>
    </VizFrame>
  )
}

function ValueLedger({ cap, note, rows, total }: {
  cap: string; note?: string
  rows: { name: string; val: number }[]
  total: number
}) {
  const maxVal = Math.max(...rows.map(r => Math.abs(r.val)), 1)
  return (
    <VizFrame cap={cap} note={note}>
      <div className="ledger">
        {rows.map(r => (
          <div key={r.name} style={{ display: 'contents' }}>
            <div className={`lr${r.val < 0 ? ' neg' : ''}`}>
              <span className="nm">{r.name}</span>
              <span className="amt">{fmtEur(r.val)}</span>
            </div>
            <div className={`track${r.val < 0 ? ' neg' : ''}`}>
              <i style={{ width: `${Math.min(100, (Math.abs(r.val) / maxVal) * 100).toFixed(1)}%` }} />
            </div>
          </div>
        ))}
        <div className="total">
          <span className="nm">Kokku</span>
          <span className="amt">{fmtEur(total)}</span>
        </div>
      </div>
    </VizFrame>
  )
}

function ResList({ cap, note, items }: {
  cap: string; note?: string
  items: { k: string; v: string; tone?: 'ok' | 'warn' | 'neutral' }[]
}) {
  return (
    <VizFrame cap={cap} note={note}>
      <div className="reslist">
        {items.map((item, i) => (
          <div key={i} className="resitem">
            <span className="nm">{item.k}</span>
            <span className={`v${item.tone === 'ok' ? ' ok' : item.tone === 'warn' ? ' warn' : ''}`}>
              {item.v}
            </span>
          </div>
        ))}
      </div>
    </VizFrame>
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
        <p style={{ fontSize: 11, color: 'var(--mist-dim)', marginTop: 3,
          fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.05em' }}>{subtitle}</p>
      </div>
      <div style={{
        minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8,
        background: checker ? undefined : dark ? 'rgba(10,22,11,.9)' : 'rgba(13,31,13,.7)',
      }} className={checker ? 'checkerboard' : ''}>
        <img src={src} alt={title}
          style={{ maxWidth: '100%', maxHeight: 340, borderRadius: 4, display: 'block' }} />
      </div>
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 7,10 12,4" />
    </svg>
  )
}

function AccRow({ row, open, onToggle }: { row: RowData; open: boolean; onToggle: () => void }) {
  return (
    <div className={`acc-row${open ? ' open' : ''}`}>
      <button className="acc-head" onClick={onToggle} aria-expanded={open}>
        <span className="acc-num">{row.num}</span>
        <span>
          <span className="acc-title">{row.title}</span>
          <span className="acc-source">{row.source}</span>
        </span>
        <span className="acc-stat">
          <span className="v">{row.stat.v}</span>
          <span className="u">{row.stat.u}</span>
        </span>
        <span className="acc-chev"><ChevronIcon /></span>
      </button>
      {open && (
        <div className="acc-panel">
          <div className="acc-panel-inner">
            {/* Left column */}
            <div>
              <p className="acc-desc">{row.desc}</p>
              {row.data.length > 0 && (
                <div className="datagrid">
                  {row.data.map((cell, i) => (
                    <div key={i} className="cell">
                      <div className="l">{cell.l}</div>
                      <div className="v">
                        {cell.v}
                        {cell.s && <small>{cell.s}</small>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {row.contrib && (
                <div className={`contrib${row.contrib.neg ? ' neg' : ''}`}>
                  <span className="tag">{row.contrib.tag}</span>
                  <span className="txt">{row.contrib.txt}</span>
                </div>
              )}
            </div>
            {/* Right column — viz */}
            {row.viz && <div>{row.viz}</div>}
          </div>
          {/* Full-width viz — spans the whole panel below the grid */}
          {row.wideViz && (
            <div style={{ padding: '0 6px 36px 56px' }}>{row.wideViz}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResultsDisplay({ result, onSave, isSaved, speciesRatios, timberVolume, forestValue, valuation }: Props) {
  const { info, tifFiles: _tifFiles, heightStats, resourceFile, treeCount, treePolygonPlot, clippedImage } = result

  const openDefault = forestValue ? 6 : 0
  const [openIdx, setOpenIdx] = useState<number>(openDefault)
  const [resourceItems, setResourceItems] = useState<string[]>([])

  useEffect(() => {
    if (!resourceFile) return
    fetch(`http://localhost:3001/cadastre/resources/${resourceFile}`)
      .then(r => r.json() as Promise<ResourceData>)
      .then(d => {
        const unique = [...new Set(
          d.features
            .map(f => String(f.properties['KASUTUSALA_NIMETUS'] ?? '').trim())
            .filter(Boolean)
        )]
        setResourceItems(unique)
      })
      .catch(() => {})
  }, [resourceFile])

  // Derived values
  const areaHa = info.area / 10000
  const perimeterM = calcPerimeterM(info.coordinates)

  // Headline value
  const headlineValue = forestValue?.totalEur ?? valuation?.valueRangeEur?.marketHighEur
  const headlineValueStr = headlineValue != null ? fmtEur(headlineValue) : '—'
  // Strip leading € for big-number display (we render the € separately)
  const headlineNum = headlineValueStr.startsWith('€') ? headlineValueStr.slice(1) : headlineValueStr

  // Today's date string
  const today = new Date().toLocaleDateString('et-EE', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // ── Row 03 species StackBar segments ──
  const speciesSegments = speciesRatios ? [
    { name: 'conifer', label: 'Okaspuu', val: speciesRatios.conifer, color: '#3d6e3d' },
    { name: 'broadleaf', label: 'Lehtpuu', val: speciesRatios.broadleaf, color: '#7ab648' },
  ] : []

  // ── Row 04 histogram from heightStats shares ──
  const histBars: { label: string; count: number }[] = heightStats
    ? heightStats.shares.map(s => ({ label: `>${s.threshold}m`, count: s.percentage }))
    : []

  // ── Row 05 sortiment StackBar ──
  const assortColors = ['#6aa84f', '#2f6b3a', '#234d27']
  const assortMap = new Map<string, number>()
  if (forestValue) {
    for (const el of forestValue.elements) {
      assortMap.set(el.assortment, (assortMap.get(el.assortment) ?? 0) + el.totalEur)
    }
  }
  const assortSegments: StackSegment[] = [...assortMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, val], i) => ({ name, label: name, val, color: assortColors[i] }))

  // ── Row 06 ResList items ──
  const restrictItems: { k: string; v: string; tone?: 'ok' | 'warn' | 'neutral' }[] = []
  if (valuation?.restrictions && valuation.restrictions.length > 0) {
    for (const r of valuation.restrictions) {
      restrictItems.push({ k: r, v: 'Tuvastatud', tone: 'warn' })
    }
  }
  restrictItems.push({ k: 'Kaitsealuseid liike', v: 'Ei tuvastatud', tone: 'ok' })
  restrictItems.push({ k: 'Natura 2000', v: 'Väljaspool', tone: 'ok' })
  for (const ri of resourceItems) {
    restrictItems.push({ k: ri, v: 'Registreeritud', tone: 'neutral' })
  }

  // ── Row 07 ValueLedger rows ──
  const speciesSumMap = new Map<string, number>()
  if (forestValue) {
    for (const el of forestValue.elements) {
      const name = SPECIES_ET[el.speciesCode] ?? el.speciesCode
      speciesSumMap.set(name, (speciesSumMap.get(name) ?? 0) + el.totalEur)
    }
  }
  const ledgerRows: { name: string; val: number }[] = [...speciesSumMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, val]) => ({ name, val }))
  const landVal = valuation?.option1_taxable?.totalEur
  if (landVal != null) {
    ledgerRows.push({ name: 'Maa väärtus', val: landVal })
  }
  const ledgerTotal = (forestValue?.totalEur ?? 0) + (valuation?.option1_taxable?.totalEur ?? 0)

  // ── Build 7 accordion rows ──
  const rows: RowData[] = [
    // 01 Pindala
    {
      num: '01',
      title: 'Pindala',
      source: 'Maa-amet · kataster',
      stat: { v: areaHa.toFixed(2), u: 'ha' },
      desc: 'Katastriüksuse registreeritud pindala ja piiri pikkus. Koordinaadid on EPSG:3301 tasapinnalises süsteemis, mõõdud meetrites.',
      data: [
        { l: 'Pindala', v: formatArea(info.area) },
        { l: 'Ümbermõõt', v: perimeterM > 0 ? `${Math.round(perimeterM)}` : '—', s: perimeterM > 0 ? 'm' : undefined },
        { l: 'Tunnus', v: info.code },
        { l: 'Aadress', v: info.address ?? '—' },
      ],
      contrib: {
        tag: 'Asukoht',
        txt: <><b>{info.address ?? info.code}</b> · katastritunnus {info.code}</>,
      },
    },
    // 02 Puude arv
    {
      num: '02',
      title: 'Puude arv',
      source: 'Ortofoto · segmentatsioon',
      stat: {
        v: treeCount != null ? fmt(treeCount) : '—',
        u: 'puud',
      },
      desc: 'Tuvastatud puude arv ortofoto segmentatsiooni põhjal. Tihedus näitab keskmist puude arvu hektari kohta.',
      data: [
        { l: 'Puude arv', v: treeCount != null ? fmt(treeCount) : '—' },
        { l: 'Tihedus', v: treeCount != null ? `${(treeCount / areaHa).toFixed(0)}` : '—', s: treeCount != null ? 'tk/ha' : undefined },
        { l: 'Meetod', v: 'Masinõpe' },
        { l: 'Allikas', v: 'CIR ortofoto' },
      ],
      viz: !treePolygonPlot
        ? <TreeDots cap="Puude jaotus" note={treeCount != null ? `${fmt(treeCount)} puud` : undefined} />
        : undefined,
      wideViz: treePolygonPlot
        ? <div style={{
            border: '1px solid rgba(139,195,74,.16)',
            borderRadius: 12,
            background: 'rgba(10,22,11,.55)',
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mist-dim)' }}>Tuvastatud puukroonid</span>
              {treeCount != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--leaf)' }}>{fmt(treeCount)} puud</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(197,216,189,.5)', margin: '0 0 8px' }}>Ortofoto</p>
                <img src={`data:image/png;base64,${clippedImage}`} alt="Ortofoto" style={{ width: '100%', borderRadius: 7, display: 'block', maxHeight: 420, objectFit: 'contain', background: 'rgba(0,0,0,.3)' }} />
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(197,216,189,.5)', margin: '0 0 8px' }}>Masinõpe</p>
                <img src={`data:image/png;base64,${treePolygonPlot}`} alt="Puukroonid" style={{ width: '100%', borderRadius: 7, display: 'block', maxHeight: 420, objectFit: 'contain', background: 'rgba(0,0,0,.3)' }} />
              </div>
            </div>
          </div>
        : undefined,
    },
    // 03 Puuliigid
    {
      num: '03',
      title: 'Puuliigid',
      source: 'Ortofoto · spektraalanalüüs',
      stat: {
        v: speciesRatios ? `${Math.round(speciesRatios.conifer * 100)} / ${Math.round(speciesRatios.broadleaf * 100)}` : '—',
        u: 'OK / LH %',
      },
      desc: 'Okaspuu ja lehtpuu osakaal arvutati CIR ortofotos põhineva spektraaltõlgenduse abil. Klassifitseerimine põhineb lähi-infrapuna kanalil.',
      data: [
        { l: 'Okaspuu', v: speciesRatios ? `${Math.round(speciesRatios.conifer * 100)}` : '—', s: speciesRatios ? '%' : undefined },
        { l: 'Lehtpuu', v: speciesRatios ? `${Math.round(speciesRatios.broadleaf * 100)}` : '—', s: speciesRatios ? '%' : undefined },
        { l: 'Meetod', v: 'Algorütm' },
        { l: 'Allikas', v: 'Ortofoto' },
      ],
      viz: speciesRatios
        ? <StackBar cap="Puuliikide jaotus" segments={speciesSegments} />
        : undefined,
    },
    // 04 Kõrgusandmed
    {
      num: '04',
      title: 'Kõrgusandmed',
      source: 'Lidar · kõrgusmudelianalüüs',
      stat: {
        v: heightStats ? `${heightStats.averageHeight.toFixed(1)}` : '—',
        u: 'm keskmine',
      },
      desc: 'Puude kõrgusjaotus saadud LiDAR kõrgusmudelist (DTM/DSM). Näitab, milline osakaal metsast küündib erinevatesse kõrgusklassidesse.',
      data: [
        { l: 'Keskmine kõrgus', v: heightStats ? `${heightStats.averageHeight.toFixed(1)}` : '—', s: heightStats ? 'm' : undefined },
        { l: 'Metsapikslit', v: heightStats ? fmt(heightStats.forestPixelCount) : '—' },
        { l: 'Metsakate', v: heightStats ? `${((heightStats.forestPixelCount / Math.max(1, heightStats.totalPixelCount)) * 100).toFixed(1)}` : '—', s: heightStats ? '%' : undefined },
        { l: 'Meetod', v: 'LiDAR DSM' },
      ],
      viz: histBars.length > 0
        ? <Histogram
            cap="Kõrgusjaotus"
            note={heightStats ? `Ø ${heightStats.averageHeight.toFixed(1)} m` : undefined}
            classes={histBars}
            meanLabel="Osakaal kõrgem kui lävi (% metsakattest)"
          />
        : undefined,
    },
    // 05 Puidu maht
    {
      num: '05',
      title: 'Puidu maht',
      source: 'Puistu tagavara · boniteet',
      stat: {
        v: timberVolume ? `${timberVolume.totalVolumeM3.toFixed(0)}` : '—',
        u: 'm³',
      },
      desc: 'Hinnanguline puidu tagavara kubeerimismeetodil. Arvutus põhineb mõõdetud läbimõõtudel, kõrgusel ja puistuelemendi boniteedil.',
      data: [
        { l: 'Tagavara', v: timberVolume ? `${timberVolume.totalVolumeM3.toFixed(0)}` : '—', s: timberVolume ? 'm³' : undefined },
        { l: 'Tagavara/ha', v: timberVolume ? `${timberVolume.totalVolumePerHaM3.toFixed(0)}` : '—', s: timberVolume ? 'm³/ha' : undefined },
        { l: 'Boniteet', v: timberVolume?.boniteet ?? '—' },
        { l: 'Puude arv', v: timberVolume ? fmt(timberVolume.totalTreeCount) : '—' },
      ],
      contrib: timberVolume ? {
        tag: 'Puistuelemendid',
        txt: <>{timberVolume.elements.map(e => SPECIES_ET[e.speciesCode] ?? e.speciesCode).join(', ')}</>,
      } : undefined,
      viz: assortSegments.length > 0
        ? <StackBar cap="Sortimentide jaotus" segments={assortSegments} note={forestValue ? fmtEur(forestValue.totalEur) : undefined} />
        : undefined,
    },
    // 06 Loodusvarad
    {
      num: '06',
      title: 'Loodusvarad',
      source: 'Maa-amet · kitsendused · WFS',
      stat: {
        v: valuation?.restrictions?.length != null ? String(valuation.restrictions.length) : '0',
        u: 'kitsendust',
      },
      desc: 'Kinnistule kehtivad avalik-õiguslikud kitsendused, looduskaitsealused objektid ja maavarade registreeritud leiukohad.',
      data: [
        { l: 'Kitsendusi', v: valuation?.restrictions?.length != null ? String(valuation.restrictions.length) : '0' },
        { l: 'Maavarasid', v: String(resourceItems.length) },
        { l: 'Sihtotstarve', v: valuation?.intendedPurpose ?? '—' },
        { l: 'Vald', v: valuation?.municipality ?? '—' },
      ],
      viz: <ResList
        cap="Kitsendused ja varad"
        note={`${restrictItems.length} kirjet`}
        items={restrictItems}
      />,
    },
    // 07 Puidu väärtus
    {
      num: '07',
      title: 'Puidu väärtus',
      source: 'Puiduturu hinnad · maa väärtus',
      stat: {
        v: forestValue ? fmt(forestValue.totalEur) : '—',
        u: '€',
      },
      desc: 'Hinnanguline tüvepuidu müügiväärtus kohaliku puiduturu hindade järgi ning maa maksustamishind. Lõplik tehinguhind sõltub metsa seisukorrast ja ostja huvidest.',
      data: [
        { l: 'Puidu väärtus', v: forestValue ? fmtEur(forestValue.totalEur) : '—' },
        { l: 'Maa väärtus', v: valuation?.option1_taxable ? fmtEur(valuation.option1_taxable.totalEur) : '—' },
        { l: 'Allikas', v: forestValue?.source ?? '—' },
        { l: 'Periood', v: forestValue?.period ?? '—' },
      ],
      contrib: forestValue ? {
        tag: 'Hinnatase',
        txt: <><b>{forestValue.period}</b> · {forestValue.source}</>,
      } : undefined,
      viz: ledgerRows.length > 0
        ? <ValueLedger
            cap="Väärtuse jaotus"
            note={fmtEur(ledgerTotal)}
            rows={ledgerRows}
            total={ledgerTotal}
          />
        : undefined,
    },
    // 08 Maa hind
    {
      num: '08',
      title: 'Maa hind',
      source: 'MKHIS · hindamisstatistika',
      stat: {
        v: valuation?.option2_market ? fmt(valuation.option2_market.totalHighEur) : '—',
        u: '€',
      },
      desc: 'Maa hinnanguline väärtus põhineb ametlikul maksustamishinnal ja piirkondlikul turustatistikal. Metsa ja maa kombineeritud hinnang annab parima üldpildi kinnistu koguväärtuest.',
      data: [
        { l: 'Maksustamishind', v: valuation?.option1_taxable ? fmtEur(valuation.option1_taxable.totalEur) : '—' },
        { l: 'Turuhind', v: valuation?.option2_market ? `${fmtEur(valuation.option2_market.totalLowEur)} – ${fmtEur(valuation.option2_market.totalHighEur)}` : '—' },
        { l: 'Sihtotstarve', v: valuation?.intendedPurpose ?? '—' },
        { l: 'Vald', v: valuation?.municipality ?? '—' },
      ],
      contrib: (forestValue && valuation?.option1_taxable) ? {
        tag: 'Mets + Maa',
        txt: <>Puidu väärtus <b>{fmtEur(forestValue.totalEur)}</b> + maa <b>{fmtEur(valuation.option1_taxable.totalEur)}</b> = <b>{fmtEur(forestValue.totalEur + valuation.option1_taxable.totalEur)}</b></>,
      } : undefined,
      viz: valuation
        ? <ResList
            cap="Maa hindamisandmed"
            note={valuation.municipality ?? undefined}
            items={[
              { k: 'Maksustamishind', v: valuation.option1_taxable ? `${fmtEur(valuation.option1_taxable.totalEur)} (${fmt(valuation.option1_taxable.eurPerHa)} €/ha)` : '—' },
              { k: 'Turuhind (madal)', v: valuation.option2_market ? fmtEur(valuation.option2_market.totalLowEur) : '—' },
              { k: 'Turuhind (kõrge)', v: valuation.option2_market ? fmtEur(valuation.option2_market.totalHighEur) : '—', tone: 'ok' },
              { k: 'Piirkond', v: valuation.county ?? '—' },
              { k: 'Andmeallikas', v: valuation.option2_market?.dataSource ?? '—' },
              { k: 'Andmeaasta', v: valuation.option2_market ? String(valuation.option2_market.dataYear) : '—' },
            ]}
          />
        : undefined,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ══ VALUE REVEAL ══════════════════════════════════════════════════════ */}
      <div style={{ padding: 'clamp(40px,5vw,72px) clamp(24px,5vw,64px) 0' }}>
        <div className="value-block">

          {/* Eyebrow */}
          <div className="value-eyebrow">
            <span className="line" />
            <span className="k">Analüüs valmis · {info.address ?? info.code}</span>
          </div>

          {/* Label */}
          <p className="value-label">Sinu metsa hinnanguline väärtus</p>

          {/* Big number */}
          <div className="big-number">
            <span className="eur">€</span>
            <span>{headlineNum}</span>
          </div>

          {/* Sub sentence */}
          <p className="value-sub">
            Kinnistu <b>{areaHa.toFixed(2)} ha</b>
            {treeCount != null ? <>, <b>{fmt(treeCount)} puu</b></> : null}
            {timberVolume ? <>, puidu tagavara <b>{timberVolume.totalVolumeM3.toFixed(0)} m³</b></> : null}
            {heightStats ? <>, keskmise kõrgusega <b>{heightStats.averageHeight.toFixed(1)} m</b></> : null}.
          </p>

          {/* Meta line */}
          <p className="value-meta">
            Kasvava metsa + maa väärtus · puiduhinnad {forestValue?.period ?? '—'} · hinnatud {today}
          </p>

          {/* Spec strip */}
          <div className="value-specs">
            <div className="specs">
              <span className="s">Pindala <b>{areaHa.toFixed(2)} ha</b></span>
              <span className="s">Puude arv <b>{treeCount != null ? fmt(treeCount) : '—'}</b></span>
              <span className="s">Tagavara <b>{timberVolume ? `${timberVolume.totalVolumeM3.toFixed(0)} m³` : '—'}</b></span>
              <span className="s">Kõrgus <b>{heightStats ? `${heightStats.averageHeight.toFixed(1)} m` : '—'}</b></span>
            </div>
          </div>

          {/* Save button */}
          <div style={{ marginTop: 28 }}>
            <button
              onClick={onSave}
              disabled={isSaved}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 24px', borderRadius: 999, fontSize: 14, fontWeight: 600,
                cursor: isSaved ? 'default' : 'pointer',
                background: isSaved ? 'rgba(139,195,74,.08)' : 'rgba(139,195,74,.18)',
                border: `1px solid ${isSaved ? 'rgba(139,195,74,.2)' : 'rgba(139,195,74,.45)'}`,
                color: isSaved ? 'var(--mist-dim)' : 'var(--leaf)',
                fontFamily: 'var(--font-body)',
                transition: 'background .15s',
              }}
              onMouseEnter={e => { if (!isSaved) e.currentTarget.style.background = 'rgba(139,195,74,.28)' }}
              onMouseLeave={e => { if (!isSaved) e.currentTarget.style.background = 'rgba(139,195,74,.18)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                {isSaved
                  ? <path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2z" />
                  : <path d="M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2zm0 15-5-2.18L7 18V5h10v13z" />}
              </svg>
              {isSaved ? 'Salvestatud' : 'Salvesta kinnistu'}
            </button>
          </div>
        </div>
      </div>

      {/* ══ BREAKDOWN ACCORDION ═══════════════════════════════════════════════ */}
      <div style={{ padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,64px)' }}>
        <div className="bd-head">
          <div className="row">
            <span className="line" />
            <span className="k">Jaotus</span>
          </div>
          <h2>Numbrid sinu metsa taga.</h2>
          <p>Iga samm näitab, milliseid andmeid leidsime — klõpsa real, et näha täpsemat infot.</p>
        </div>

        <div className="accordion">
          {rows.map((row, i) => (
            <AccRow
              key={row.num}
              row={row}
              open={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
            />
          ))}
        </div>
      </div>


    </div>
  )
}
