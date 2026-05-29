import type { AnalysisResult } from '../App'

interface Props {
  result: AnalysisResult
}

function formatArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`
  return `${m2.toFixed(0)} m²`
}

function formatCoord(v: number): string {
  return v.toFixed(2)
}

export default function ResultsDisplay({ result }: Props) {
  const { info, originalImage, clippedImage, tifFiles } = result

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Info card */}
      <div className="rounded-2xl border border-forest-light bg-forest/60 backdrop-blur p-8 shadow-xl">
        <h2 className="text-xl font-semibold text-mist mb-6 flex items-center gap-2">
          <svg className="w-5 h-5 text-leaf" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          Katastriüksuse info
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoItem label="Tunnus" value={info.code} mono />
          <InfoItem label="Pindala" value={formatArea(info.area)} />
          {info.address && <InfoItem label="Aadress" value={info.address} className="sm:col-span-2" />}
          <div className="sm:col-span-2">
            <dt className="text-xs text-forest-accent uppercase tracking-wider mb-2">
              Piirikast (EPSG:3301)
            </dt>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-mist">
              <BboxItem label="Min X" value={formatCoord(info.bbox.minX)} />
              <BboxItem label="Max X" value={formatCoord(info.bbox.maxX)} />
              <BboxItem label="Min Y" value={formatCoord(info.bbox.minY)} />
              <BboxItem label="Max Y" value={formatCoord(info.bbox.maxY)} />
            </div>
          </div>
        </dl>
      </div>

      {/* Images */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ImageCard
          title="Originaal aerofoto"
          subtitle="WMS · CIR/NGR · EPSG:3301"
          src={`data:image/jpeg;base64,${originalImage}`}
          imgClass="object-contain"
          bg="bg-forest-dark"
        />
        <ImageCard
          title="Katastriüksus"
          subtitle="Lõigatud originaalpildist"
          src={`data:image/png;base64,${clippedImage}`}
          imgClass="object-contain"
          bg="checkerboard"
        />
      </div>

      {/* TIF downloads */}
      {tifFiles?.length > 0 && (
        <div className="rounded-2xl border border-forest-light bg-forest/60 backdrop-blur p-6 shadow-xl">
          <h3 className="text-mist font-semibold mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-leaf" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z" />
            </svg>
            TIF failid
          </h3>
          <ul className="space-y-2">
            {tifFiles.map((f) => (
              <li key={f}>
                <a
                  href={`http://localhost:3001/cadastre/tif/${f}`}
                  download={f}
                  className="inline-flex items-center gap-2 text-sm text-leaf hover:text-mist transition-colors font-mono"
                >
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" />
                  </svg>
                  {f}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function InfoItem({
  label,
  value,
  mono,
  className = '',
}: {
  label: string
  value: string
  mono?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-forest-accent uppercase tracking-wider mb-1">{label}</dt>
      <dd className={`text-mist text-sm ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function BboxItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-forest-dark px-3 py-2 flex justify-between items-center">
      <span className="text-forest-accent">{label}</span>
      <span className="text-mist">{value}</span>
    </div>
  )
}

function ImageCard({
  title,
  subtitle,
  src,
  imgClass,
  bg,
}: {
  title: string
  subtitle: string
  src: string
  imgClass: string
  bg: string
}) {
  return (
    <div className="rounded-2xl border border-forest-light bg-forest/60 backdrop-blur shadow-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-forest-light">
        <h3 className="text-mist font-semibold">{title}</h3>
        <p className="text-forest-accent text-xs mt-0.5">{subtitle}</p>
      </div>
      <div className={`${bg} flex items-center justify-center p-2 min-h-64`}>
        <img
          src={src}
          alt={title}
          className={`max-w-full max-h-96 rounded ${imgClass}`}
        />
      </div>
    </div>
  )
}
