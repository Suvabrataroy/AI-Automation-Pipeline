import { CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react'

const SERVICE_CONFIG = {
  github:  { icon: '🐙', color: 'from-slate-600 to-slate-700', accent: '#64748b', label: 'GitHub' },
  jira:    { icon: '🎯', color: 'from-blue-700 to-blue-800',   accent: '#1d4ed8', label: 'Jira' },
  slack:   { icon: '💬', color: 'from-purple-700 to-purple-800', accent: '#7e22ce', label: 'Slack' },
  stripe:  { icon: '💳', color: 'from-indigo-700 to-indigo-800', accent: '#4338ca', label: 'Stripe' },
  s3:      { icon: '🗄️', color: 'from-amber-700 to-amber-800',  accent: '#b45309', label: 'AWS S3' },
  default: { icon: '⚡', color: 'from-gray-700 to-gray-800',   accent: '#374151', label: 'Service' },
}

export default function StepNode({ step, isSelected, onClick, stepNumber }) {
  const cfg = SERVICE_CONFIG[step.service] || SERVICE_CONFIG.default

  const isRunning = step.status === 'running'
  const isComplete = step.status === 'complete'
  const isPending = step.status === 'pending'
  const isError = step.status === 'error'

  const borderColor = isSelected ? 'border-accent-blue' :
                      isRunning  ? 'border-blue-500/50' :
                      isComplete ? 'border-emerald-500/30' :
                      isError    ? 'border-red-500/30' :
                                   'border-border-dim'

  const bgColor = isSelected ? 'bg-bg-tertiary' : 'bg-bg-card'

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer
                  transition-all duration-200 hover:border-border-bright hover:bg-bg-tertiary
                  ${borderColor} ${bgColor} ${isRunning ? 'animate-pulse-blue' : ''}
                  ${isComplete ? 'animate-pulse-green' : ''} animate-slide-up`}
      style={{ animationDelay: `${stepNumber * 60}ms` }}
    >
      {/* Step number */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-bg-primary border border-border-bright
                      flex items-center justify-center text-xs font-bold text-slate-400">
        {stepNumber}
      </div>

      {/* Service icon */}
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br ${cfg.color}
                       flex items-center justify-center text-lg shadow-sm`}>
        {cfg.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white truncate">{cfg.label}</span>
          <span className="tag-gray hidden sm:inline">{step.capability?.replace(/_/g, ' ')}</span>
        </div>
        <div className="text-xs text-slate-500 font-mono truncate sm:hidden mt-0.5">
          {step.capability}
        </div>
        {step.analysis?.summary && (
          <div className="text-xs text-slate-400 mt-0.5 truncate">
            {step.analysis.summary}
          </div>
        )}
      </div>

      {/* Status indicator */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        {isRunning && (
          <div className="flex items-center gap-1.5 text-blue-400">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs hidden sm:inline">running</span>
          </div>
        )}
        {isComplete && (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 size={15} />
            {step.latency_ms && (
              <span className="text-xs text-slate-500 hidden sm:inline">{step.latency_ms}ms</span>
            )}
          </div>
        )}
        {isPending && (
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-slate-600 rounded-full" />
            <div className="w-1.5 h-1.5 bg-slate-600 rounded-full" />
            <div className="w-1.5 h-1.5 bg-slate-600 rounded-full" />
          </div>
        )}
        {isError && <AlertCircle size={15} className="text-red-400" />}
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent-blue rounded-r" />
      )}
    </div>
  )
}
