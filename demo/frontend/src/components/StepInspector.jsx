import { X, Clock, CheckCircle2, AlertCircle, Zap, ArrowRight } from 'lucide-react'
import JsonViewer from './JsonViewer.jsx'

const SERVICE_CONFIG = {
  github:  { icon: '🐙', label: 'GitHub',  color: 'text-slate-300' },
  jira:    { icon: '🎯', label: 'Jira',    color: 'text-blue-400' },
  slack:   { icon: '💬', label: 'Slack',   color: 'text-purple-400' },
  stripe:  { icon: '💳', label: 'Stripe',  color: 'text-indigo-400' },
  s3:      { icon: '🗄️', label: 'AWS S3',  color: 'text-amber-400' },
  default: { icon: '⚡', label: 'Service', color: 'text-slate-400' },
}

function AnalysisBadge({ analysis }) {
  if (!analysis) return null

  const config = {
    ok:       { label: '✓ OK',       cls: 'tag-green' },
    retry:    { label: '↺ Retry',    cls: 'tag-amber' },
    error:    { label: '✕ Error',    cls: 'tag-red' },
    escalate: { label: '⬆ Escalate', cls: 'tag-amber' },
  }[analysis.status] || { label: analysis.status, cls: 'tag-gray' }

  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-400 uppercase tracking-wide mb-1.5">
        <span>🧠</span> SLM Analysis
      </div>
      <div className="bg-bg-primary border border-border-dim rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={config.cls}>{config.label}</span>
        </div>
        {analysis.summary && (
          <div className="text-xs text-slate-300 mt-1">{analysis.summary}</div>
        )}
      </div>
    </div>
  )
}

export default function StepInspector({ step, onClose }) {
  if (!step) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-bg-tertiary border border-border-dim
                        flex items-center justify-center text-2xl mb-4">
          🔍
        </div>
        <div className="text-slate-400 text-sm font-medium mb-1">Step Inspector</div>
        <div className="text-slate-600 text-xs max-w-[200px]">
          Click any step in the pipeline to inspect its request and response
        </div>
      </div>
    )
  }

  const cfg = SERVICE_CONFIG[step.service] || SERVICE_CONFIG.default
  const isRunning = step.status === 'running'
  const isComplete = step.status === 'complete'

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-dim flex-shrink-0">
        <span className="text-xl">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
            <ArrowRight size={12} className="text-slate-600" />
            <span className="text-sm text-slate-300 font-mono truncate">
              {step.capability?.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {isRunning && (
              <span className="tag-blue flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
                Running
              </span>
            )}
            {isComplete && (
              <span className="tag-green flex items-center gap-1">
                <CheckCircle2 size={10} /> Complete
              </span>
            )}
            {isComplete && step.latency_ms && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Clock size={10} /> {step.latency_ms}ms
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-tertiary text-slate-500 hover:text-slate-300 transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">

        {/* Request */}
        <JsonViewer
          data={step.request}
          label="📤 Request"
          defaultOpen={true}
          colorClass="text-blue-400"
        />

        {/* Response */}
        {step.response && (
          <JsonViewer
            data={step.response}
            label="📥 Response"
            defaultOpen={true}
            colorClass="text-emerald-400"
          />
        )}

        {/* Running placeholder */}
        {isRunning && !step.response && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              📥 Response
            </div>
            <div className="bg-bg-primary border border-border-dim rounded-lg p-4 flex items-center gap-2 text-slate-500 text-xs">
              <div className="flex gap-0.5">
                <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              Awaiting service response...
            </div>
          </div>
        )}

        {/* SLM Analysis */}
        <AnalysisBadge analysis={step.analysis} />

        {/* Capability info */}
        <div className="mt-2 pt-3 border-t border-border-dim">
          <div className="text-xs text-slate-600 space-y-1">
            <div className="flex justify-between">
              <span>Service</span>
              <span className="text-slate-400 font-mono">{step.service}</span>
            </div>
            <div className="flex justify-between">
              <span>Capability</span>
              <span className="text-slate-400 font-mono">{step.capability}</span>
            </div>
            <div className="flex justify-between">
              <span>Transport</span>
              <span className="text-slate-400 font-mono">mcp</span>
            </div>
            {step.latency_ms && (
              <div className="flex justify-between">
                <span>Latency</span>
                <span className="text-slate-400 font-mono">{step.latency_ms}ms</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
