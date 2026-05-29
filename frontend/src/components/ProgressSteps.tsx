import type { Phase, ProgressStep } from '../App'

const STEP_ICONS: Record<string, string> = {
  fetching: '🗺️',
  bbox: '📐',
  kaardileht: '📋',
  downloading: '🛰️',
  tif_download: '⬇️',
  tif_warning: '⚠️',
  chm_download: '🌲',
  merging: '🔗',
  clipping: '✂️',
  complete: '✅',
  error: '❌',
}

interface Props {
  steps: ProgressStep[]
  phase: Phase
}

export default function ProgressSteps({ steps, phase }: Props) {
  return (
    <div className="rounded-2xl border border-forest-light bg-forest/60 backdrop-blur p-8 shadow-xl animate-fadeIn">
      <h2 className="text-lg font-semibold text-mist mb-6 flex items-center gap-2">
        <svg className="w-5 h-5 text-leaf animate-spin" viewBox="0 0 24 24" fill="none">
          {phase === 'loading' ? (
            <>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </>
          ) : null}
        </svg>
        {phase === 'loading' ? 'Töötan...' : 'Valmis'}
      </h2>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li
            key={i}
            className={`flex items-center gap-3 text-sm transition-all ${
              i === steps.length - 1 && phase === 'loading'
                ? 'text-leaf font-medium'
                : 'text-forest-accent'
            }`}
          >
            <span className="text-base w-6 text-center flex-shrink-0">
              {STEP_ICONS[s.step] ?? '⏳'}
            </span>
            <span>{s.message}</span>
          </li>
        ))}
        {phase === 'loading' && (
          <li className="flex items-center gap-3 text-sm text-forest-accent animate-pulse">
            <span className="w-6 text-center">⏳</span>
            <span>...</span>
          </li>
        )}
      </ol>
    </div>
  )
}
