import { useState } from 'react'
import CadastreInput from './components/CadastreInput'
import ProgressSteps from './components/ProgressSteps'
import ResultsDisplay from './components/ResultsDisplay'

export type Phase = 'idle' | 'loading' | 'done' | 'error'

export interface ProgressStep {
  step: string
  message: string
}

export interface CadastreInfo {
  code: string
  address: string
  area: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
  coordinates: number[][][]
}

export interface AnalysisResult {
  info: CadastreInfo
  originalImage: string
  clippedImage: string
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [steps, setSteps] = useState<ProgressStep[]>([])
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string>('')

  const handleAnalyze = (code: string) => {
    setPhase('loading')
    setSteps([])
    setResult(null)
    setError('')

    const es = new EventSource(
      `http://localhost:3001/cadastre/analyze?code=${encodeURIComponent(code)}`,
    )

    es.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data) as ProgressStep & { payload?: AnalysisResult }
      setSteps((prev) => [...prev, { step: data.step, message: data.message }])

      if (data.step === 'complete' && data.payload) {
        setResult(data.payload)
        setPhase('done')
        es.close()
      }

      if (data.step === 'error') {
        setError(data.message)
        setPhase('error')
        es.close()
      }
    }

    es.onerror = () => {
      setError('Ühendus serveriga ebaõnnestus. Kontrolli, kas server töötab.')
      setPhase('error')
      es.close()
    }
  }

  return (
    <div className="min-h-screen bg-forest-dark">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-b from-forest-dark via-forest to-forest-light">
        <div className="absolute inset-0 opacity-10">
          <svg viewBox="0 0 1200 200" preserveAspectRatio="none" className="w-full h-full">
            {[...Array(20)].map((_, i) => (
              <g key={i} transform={`translate(${i * 65}, 0)`}>
                <polygon
                  points={`30,200 0,80 60,80`}
                  fill="#4a7c4a"
                  opacity={0.6 + (i % 3) * 0.2}
                />
                <polygon
                  points={`30,160 5,60 55,60`}
                  fill="#2d5a2d"
                  opacity={0.7}
                />
                <rect x="26" y="160" width="8" height="40" fill="#6b4226" opacity={0.8} />
              </g>
            ))}
          </svg>
        </div>
        <div className="relative z-10 text-center py-16 px-4">
          <div className="inline-flex items-center gap-3 mb-4">
            <svg className="w-10 h-10 text-leaf" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-13 6 2-2 5-2.5 9-2z" />
            </svg>
            <h1 className="text-4xl md:text-5xl font-bold text-mist tracking-tight">
              Metsa Menetleja
            </h1>
          </div>
          <p className="text-forest-accent text-lg md:text-xl max-w-xl mx-auto">
            Sisesta katastriüksuse tunnus ja analüüsi oma metsa
          </p>
          <p className="text-forest-bright text-sm mt-1 opacity-70">
            Forest analysis from cadastre data
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 space-y-10">
        {/* Input */}
        <CadastreInput onAnalyze={handleAnalyze} disabled={phase === 'loading'} />

        {/* Progress */}
        {(phase === 'loading' || phase === 'error') && steps.length > 0 && (
          <ProgressSteps steps={steps} phase={phase} />
        )}

        {/* Error banner */}
        {phase === 'error' && error && (
          <div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {phase === 'done' && result && <ResultsDisplay result={result} />}
      </main>

      <footer className="text-center py-8 text-forest-accent text-xs opacity-50">
        Metsa Menetleja · Katastriandmed: Maa-amet
      </footer>
    </div>
  )
}
