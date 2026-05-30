import { useState, useEffect } from 'react'
import type { Phase, ProgressStep } from '../App'

const PHRASES = [
  'Loen põtru…',
  'Küsin metsalt nõu…',
  'Kaelan kaski…',
  'Vaatan, kas karu magab…',
  'Arvutan tihumeetreid…',
  'Lasen droonil lennata…',
  'Kleebin katastrikaarte…',
  'Kuulan metsa hingamist…',
  'Kontrollin LiDAR-i pilvi…',
  'Keeran koordinaate…',
  'Otsin metsnikku…',
  'Küsin kahelt oravalt…',
  'Mõõdan metsa sammudega…',
  'Kaardin kuuski…',
  'Ootan, kuni kased lehtivad…',
  'Konsulteerin metsamehega…',
  'Arvutan hektareid…',
  'Kontrollin, kas droon tagasi jõudis…',
  'Loen aastarõngaid…',
  'Küsin käolt prognoosi…',
]

const STEP_COLOR: Record<string, string> = {
  tif_warning: 'rgba(255,200,100,0.85)',
  error:       '#f87171',
  complete:    'var(--leaf)',
}

interface Props {
  steps: ProgressStep[]
  phase: Phase
}

export default function ProgressSteps({ steps, phase }: Props) {
  const [phraseIdx, setPhraseIdx] = useState(() => Math.floor(Math.random() * PHRASES.length))

  useEffect(() => {
    if (phase !== 'loading') return
    const id = setInterval(() => {
      setPhraseIdx(i => (i + 1) % PHRASES.length)
    }, 2200)
    return () => clearInterval(id)
  }, [phase])

  return (
    <div style={{
      borderRadius: 16,
      border: '1px solid rgba(139,195,74,.18)',
      background: 'linear-gradient(180deg, rgba(35,77,39,.28), rgba(13,31,13,.28))',
      backdropFilter: 'blur(10px)',
      padding: '32px 40px',
      width: '100%',
      maxWidth: 560,
      textAlign: 'center',
    }}>

      {/* Spinner + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
        {phase === 'loading' && (
          <svg style={{ width: 17, height: 17, color: 'var(--leaf)', animation: 'spin 1s linear infinite', flexShrink: 0 }}
            viewBox="0 0 24 24" fill="none">
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        <span style={{
          fontSize: 14, fontWeight: 600, letterSpacing: '.01em',
          color: phase === 'loading' ? 'var(--mist)' : phase === 'error' ? '#f87171' : 'var(--leaf)',
        }}>
          {phase === 'loading' ? 'Töötan' : phase === 'error' ? 'Viga' : 'Valmis'}
        </span>
      </div>

      {/* Cycling forestry phrase */}
      {phase === 'loading' && (
        <p style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 15,
          color: 'var(--leaf-soft)',
          fontStyle: 'italic',
          marginBottom: 24,
          minHeight: '1.4em',
          transition: 'opacity 0.4s ease',
          letterSpacing: '.01em',
        }}>
          {PHRASES[phraseIdx]}
        </p>
      )}

      {/* Step list */}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7, textAlign: 'left' }}>
        {steps.map((s, i) => {
          const isLatest = i === steps.length - 1 && phase === 'loading'
          const color = STEP_COLOR[s.step] ?? (isLatest ? 'var(--leaf-soft)' : 'var(--mist-dim)')
          return (
            <li key={i} style={{
              fontSize: s.step === 'tif_warning' ? 11.5 : 13,
              fontWeight: isLatest ? 500 : 400,
              color,
              fontFamily: s.step === 'tif_warning' ? "'IBM Plex Mono',monospace" : 'inherit',
              transition: 'color 0.2s',
              letterSpacing: s.step === 'tif_warning' ? '.03em' : 'inherit',
            }}>
              {s.message}
            </li>
          )
        })}
        {phase === 'loading' && (
          <li style={{
            fontSize: 13, color: 'rgba(197,216,189,.35)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            …
          </li>
        )}
      </ol>
    </div>
  )
}
