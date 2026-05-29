import { useState, type FormEvent } from 'react'

interface Props {
  onAnalyze: (code: string) => void
  disabled: boolean
}

export default function CadastreInput({ onAnalyze, disabled }: Props) {
  const [code, setCode] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim()
    if (trimmed) onAnalyze(trimmed)
  }

  return (
    <div className="rounded-2xl border border-forest-light bg-forest/60 backdrop-blur p-8 shadow-xl">
      <h2 className="text-xl font-semibold text-mist mb-2">Katastriüksuse analüüs</h2>
      <p className="text-forest-accent text-sm mb-6">
        Sisesta katastriüksuse tunnus (nt <span className="font-mono text-leaf">79501:027:0011</span>)
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="79501:027:0011"
          disabled={disabled}
          className="flex-1 rounded-xl bg-forest-dark border border-forest-light px-4 py-3 text-mist placeholder-forest-accent font-mono text-sm focus:outline-none focus:ring-2 focus:ring-leaf focus:border-transparent disabled:opacity-50 transition"
        />
        <button
          type="submit"
          disabled={disabled || !code.trim()}
          className="rounded-xl bg-leaf hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-forest-dark font-semibold px-8 py-3 transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          {disabled ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analüüsin...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              Analüüsi
            </>
          )}
        </button>
      </form>
    </div>
  )
}
