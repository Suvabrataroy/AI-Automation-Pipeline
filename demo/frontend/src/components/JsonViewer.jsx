import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

function formatJson(obj, indent = 0) {
  if (obj === null) return <span className="json-null">null</span>
  if (typeof obj === 'boolean') return <span className="json-boolean">{String(obj)}</span>
  if (typeof obj === 'number') return <span className="json-number">{obj}</span>
  if (typeof obj === 'string') return <span className="json-string">"{obj}"</span>

  if (Array.isArray(obj)) {
    if (obj.length === 0) return <span className="text-slate-400">[]</span>
    return (
      <span>
        <span className="text-slate-400">{'['}</span>
        <div style={{ paddingLeft: `${(indent + 1) * 16}px` }}>
          {obj.map((item, i) => (
            <div key={i}>
              {formatJson(item, indent + 1)}
              {i < obj.length - 1 && <span className="text-slate-600">,</span>}
            </div>
          ))}
        </div>
        <span className="text-slate-400">{']'}</span>
      </span>
    )
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj)
    if (keys.length === 0) return <span className="text-slate-400">{'{}'}</span>
    return (
      <span>
        <span className="text-slate-400">{'{'}</span>
        <div style={{ paddingLeft: `${(indent + 1) * 16}px` }}>
          {keys.map((key, i) => (
            <div key={key}>
              <span className="json-key">"{key}"</span>
              <span className="text-slate-400">: </span>
              {formatJson(obj[key], indent + 1)}
              {i < keys.length - 1 && <span className="text-slate-600">,</span>}
            </div>
          ))}
        </div>
        <span className="text-slate-400">{'}'}</span>
      </span>
    )
  }

  return <span className="text-slate-400">{String(obj)}</span>
}

export default function JsonViewer({ data, label, defaultOpen = true, colorClass = 'text-blue-400' }) {
  const [open, setOpen] = useState(defaultOpen)

  if (!data) return null

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-xs font-semibold mb-1.5 ${colorClass} uppercase tracking-wide hover:opacity-80 transition-opacity`}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
      </button>
      {open && (
        <div className="bg-bg-primary border border-border-dim rounded-lg p-3 font-mono text-xs leading-relaxed overflow-x-auto animate-fade-in">
          {formatJson(data)}
        </div>
      )}
    </div>
  )
}
