import type { Phase, ProgressStep } from '../App'

const STEP_ICONS: Record<string, string> = {
  fetching:     '🗺️',
  bbox:         '📐',
  downloading:  '🛰️',
  kaardileht:   '📋',
  tif_download: '⬇️',
  tif_warning:  '⚠️',
  chm_download:   '🌲',
  resources:      '⛏️',
  tree_detection: '🌳',
  merging:        '🔗',
  clipping:     '✂️',
  complete:     '✅',
  error:        '❌',
}

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
  return (
    <div style={{
      borderRadius: 16,
      border: '1px solid rgba(139,195,74,.18)',
      background: 'linear-gradient(180deg, rgba(35,77,39,.28), rgba(13,31,13,.28))',
      backdropFilter: 'blur(10px)',
      padding: '28px 32px',
      maxWidth: 680,
    }}>
      <h2 style={{
        fontSize: 15, fontWeight: 600, color: 'var(--mist)',
        marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10
      }}>
        {phase === 'loading' && (
          <svg style={{ width: 18, height: 18, color: 'var(--leaf)', animation: 'spin 1s linear infinite' }}
            viewBox="0 0 24 24" fill="none">
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        <span style={{ color: phase === 'loading' ? 'var(--mist)' : 'var(--leaf)' }}>
          {phase === 'loading' ? 'Töötan…' : phase === 'error' ? 'Viga' : 'Valmis'}
        </span>
      </h2>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s, i) => {
          const isLatest = i === steps.length - 1 && phase === 'loading'
          const color = STEP_COLOR[s.step] ?? (isLatest ? 'var(--leaf-soft)' : 'var(--mist-dim)')
          return (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14,
              fontWeight: isLatest ? 500 : 400, color, transition: 'color 0.2s' }}>
              <span style={{ width: 22, textAlign: 'center', flexShrink: 0, fontSize: 15 }}>
                {STEP_ICONS[s.step] ?? '⏳'}
              </span>
              <span style={{ fontFamily: s.step === 'tif_warning' ? "'IBM Plex Mono',monospace" : 'inherit',
                fontSize: s.step === 'tif_warning' ? 12 : 14 }}>
                {s.message}
              </span>
            </li>
          )
        })}
        {phase === 'loading' && (
          <li style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14,
            color: 'rgba(197,216,189,.4)', animation: 'pulse 1.5s ease-in-out infinite' }}>
            <span style={{ width: 22, textAlign: 'center' }}>⏳</span>
            <span>…</span>
          </li>
        )}
      </ol>
    </div>
  )
}
