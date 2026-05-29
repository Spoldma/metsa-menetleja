import { useState } from 'react'
import type { SavedParcel } from '../App'

function formatArea(m2: number) {
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${m2.toFixed(0)} m²`
}

function LeafIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--leaf)" aria-hidden="true">
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-13 6 2-2 5-2.5 9-2z" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform .25s', transform: open ? 'rotate(180deg)' : 'none' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function BBoxGrid({ bbox }: { bbox: SavedParcel['info']['bbox'] }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.18em',
        textTransform: 'uppercase', color: 'var(--mist-dim)', marginBottom: 10 }}>Piirikast (EPSG:3301)</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {([['Min X', bbox.minX], ['Max X', bbox.maxX], ['Min Y', bbox.minY], ['Max Y', bbox.maxY]] as const).map(([l, v]) => (
          <div key={l} style={{ borderRadius: 10, background: 'rgba(10,22,11,.6)',
            padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--mist-dim)' }}>{l}</span>
            <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--mist)' }}>
              {(v as number).toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ParcelRow({ parcel, onDelete, onAnalyze }: {
  parcel: SavedParcel
  onDelete: (id: string) => void
  onAnalyze: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { info, clippedImage, savedAt, id } = parcel
  const date = new Date(savedAt).toLocaleDateString('et-EE', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div style={{
      borderRadius: 16, border: '1px solid rgba(139,195,74,.18)',
      background: open
        ? 'linear-gradient(180deg, rgba(35,77,39,.28), rgba(13,31,13,.28))'
        : 'linear-gradient(180deg, rgba(35,77,39,.14), rgba(13,31,13,.14))',
      overflow: 'hidden',
      transition: 'background .2s',
    }}>
      {/* ── Header row (always visible, click to expand) ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 20, textAlign: 'left',
        }}
      >
        {/* thumbnail */}
        <div style={{
          width: 64, height: 64, flexShrink: 0, borderRadius: 10,
          background: 'rgba(10,22,11,.7)', overflow: 'hidden', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }} className="checkerboard">
          <img src={`data:image/png;base64,${clippedImage}`} alt={info.code}
            style={{ maxWidth: 60, maxHeight: 60, objectFit: 'contain',
              filter: 'drop-shadow(0 0 6px rgba(139,195,74,.3))' }} />
        </div>

        {/* main info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color: 'var(--leaf)', fontWeight: 600 }}>
            {info.code}
          </span>
          {info.address && (
            <span style={{ fontSize: 13, color: 'var(--mist-dim)', lineHeight: 1.4 }}>{info.address}</span>
          )}
          <span style={{ fontSize: 13, color: 'var(--mist)', fontWeight: 500 }}>{formatArea(info.area)}</span>
        </div>

        {/* date + chevron */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: 'var(--mist-dim)' }}>{date}</span>
          <span style={{ color: 'var(--mist-dim)' }}><ChevronIcon open={open} /></span>
        </div>
      </button>

      {/* ── Expanded detail panel ── */}
      {open && (
        <div style={{ padding: '0 24px 28px', display: 'flex', flexDirection: 'column', gap: 28, animation: 'fadeIn .22s ease' }}>
          <div style={{ height: 1, background: 'rgba(139,195,74,.15)' }} />

          {/* image + fields side-by-side on wide screens */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 32, alignItems: 'start' }}>
            {/* large clipped image */}
            <div style={{
              borderRadius: 12, background: 'rgba(10,22,11,.7)', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 12, minWidth: 180,
            }} className="checkerboard">
              <img src={`data:image/png;base64,${clippedImage}`} alt={info.code}
                style={{ maxWidth: 220, maxHeight: 220, display: 'block',
                  filter: 'drop-shadow(0 0 14px rgba(139,195,74,.35))' }} />
            </div>

            {/* fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <InfoField label="Tunnus"   value={info.code} mono />
                <InfoField label="Pindala"  value={formatArea(info.area)} />
                <InfoField label="Salvestatud" value={date} />
                {info.address && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <InfoField label="Aadress" value={info.address} />
                  </div>
                )}
              </div>

              <BBoxGrid bbox={info.bbox} />
            </div>
          </div>

          {/* action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => onAnalyze(info.code)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                background: 'rgba(139,195,74,.14)', border: '1px solid rgba(139,195,74,.35)', color: 'var(--leaf)',
                transition: 'background .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,195,74,.25)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(139,195,74,.14)')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              Analüüsi uuesti
            </button>
            <button
              onClick={() => onDelete(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
                background: 'rgba(220,80,80,.1)', border: '1px solid rgba(220,80,80,.25)', color: '#f8a8a8',
                transition: 'background .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,80,80,.22)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(220,80,80,.1)')}
            >
              Eemalda
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '.18em',
        textTransform: 'uppercase', color: 'var(--mist-dim)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 14, color: 'var(--mist)', margin: 0,
        fontFamily: mono ? "'IBM Plex Mono',monospace" : 'inherit' }}>{value}</p>
    </div>
  )
}

interface Props {
  parcels: SavedParcel[]
  onDelete: (id: string) => void
  onAnalyze: (code: string) => void
  onBack: () => void
}

export default function MinuKinnistud({ parcels, onDelete, onAnalyze, onBack }: Props) {
  return (
    <div style={{ background: 'var(--ink)', minHeight: '100vh' }}>

      {/* ── Nav ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(8,16,8,.92)',
        backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(233,244,225,.08)',
        padding: '0 56px' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{
            display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
              background: 'rgba(139,195,74,.14)', border: '1px solid rgba(139,195,74,.3)' }}>
              <LeafIcon size={16} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--mist)' }}>Metsa Menetleja</span>
          </button>

          <button onClick={onBack} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px',
            borderRadius: 8, background: 'none', border: '1px solid rgba(233,244,225,.15)',
            color: 'var(--mist-dim)', fontSize: 13, cursor: 'pointer', transition: 'border-color .15s, color .15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(233,244,225,.35)'; e.currentTarget.style.color = 'var(--mist)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(233,244,225,.15)'; e.currentTarget.style.color = 'var(--mist-dim)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 6l-7 6 7 6" />
            </svg>
            Tagasi
          </button>
        </div>
      </div>

      {/* ── Page header ── */}
      <div style={{ padding: '56px 56px 40px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ height: 1, width: 40, background: 'rgba(139,195,74,.5)' }} />
          <span className="kicker">Minu kinnistud</span>
        </div>
        <h1 className="font-display" style={{
          fontSize: 46, lineHeight: 1.06, letterSpacing: '-0.02em',
          color: 'var(--mist)', margin: 0, fontWeight: 400,
        }}>
          Salvestatud kinnistud.
        </h1>
        <p style={{ marginTop: 14, fontSize: 16, color: 'var(--mist-dim)', lineHeight: 1.6 }}>
          {parcels.length === 0
            ? 'Sul pole veel salvestatud kinnistuid.'
            : `${parcels.length} kinnistu${parcels.length === 1 ? '' : 't'} salvestatud.`}
        </p>
      </div>

      {/* ── List ── */}
      <div style={{ padding: '0 56px 80px', maxWidth: 900, margin: '0 auto' }}>
        {parcels.length === 0 ? (
          <div style={{
            borderRadius: 16, border: '1px dashed rgba(139,195,74,.2)',
            padding: '48px 32px', textAlign: 'center',
          }}>
            <div style={{ marginBottom: 16 }}><LeafIcon size={32} /></div>
            <p style={{ fontSize: 15, color: 'var(--mist-dim)' }}>
              Analüüsi kinnistu ja vajuta <em style={{ color: 'var(--leaf)' }}>Salvesta kinnistu</em>, et see siia ilmuks.
            </p>
            <button onClick={onBack} style={{
              marginTop: 20, padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', background: 'rgba(139,195,74,.14)', border: '1px solid rgba(139,195,74,.35)',
              color: 'var(--leaf)', transition: 'background .15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,195,74,.25)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(139,195,74,.14)')}
            >
              Mine analüüsima
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {parcels.map(p => (
              <ParcelRow key={p.id} parcel={p} onDelete={onDelete} onAnalyze={onAnalyze} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
