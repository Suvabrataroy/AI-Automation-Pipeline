import { Brain, Activity, Layers, Zap, Workflow, Settings } from 'lucide-react'

export default function Header({ status, backendReady, servicesCount, page, onPageChange }) {
  const statusConfig = {
    idle:          { label: 'Ready',           dot: 'status-dot-green',  text: 'text-emerald-400' },
    routing:       { label: 'Routing...',      dot: 'status-dot-blue',   text: 'text-blue-400' },
    orchestrating: { label: 'Orchestrating',   dot: 'status-dot-blue',   text: 'text-blue-400' },
    delegating:    { label: 'Delegating →LLM', dot: 'status-dot-amber',  text: 'text-amber-400' },
    complete:      { label: 'Complete',        dot: 'status-dot-green',  text: 'text-emerald-400' },
    error:         { label: 'Error',           dot: 'status-dot-amber',  text: 'text-red-400' },
  }

  const cfg = statusConfig[status] || statusConfig.idle

  return (
    <header className="bg-bg-secondary border-b border-border-dim px-4 lg:px-6 py-3 flex items-center justify-between flex-wrap gap-3">
      {/* Logo + Nav */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
            <Brain size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-white leading-tight text-sm lg:text-base">
              SLM Workflow Platform
            </div>
            <div className="text-slate-500 text-xs hidden sm:block">
              Local AI Orchestration Engine
            </div>
          </div>
        </div>

        {/* Page nav */}
        <nav className="flex items-center gap-1 ml-2">
          <button
            onClick={() => onPageChange('workflow')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
              ${page === 'workflow'
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
              }`}
          >
            <Workflow size={13} />
            <span className="hidden sm:inline">Workflow</span>
          </button>
          <button
            onClick={() => onPageChange('config')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
              ${page === 'config'
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
              }`}
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Configure</span>
          </button>
        </nav>
      </div>

      {/* Right side stats */}
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
        {/* Backend status */}
        <div className="flex items-center gap-1.5 text-xs">
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
            background: backendReady ? '#10b981' : '#f59e0b',
            boxShadow: backendReady ? '0 0 6px rgba(16,185,129,0.8)' : '0 0 6px rgba(245,158,11,0.8)'
          }} />
          <span className="text-slate-400 hidden sm:inline">
            {backendReady ? 'Backend Connected' : 'Connecting...'}
          </span>
        </div>

        {/* Services count */}
        {servicesCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Layers size={13} className="text-purple-400" />
            <span>{servicesCount} services</span>
          </div>
        )}

        {/* Current status — only shown on workflow page */}
        {page === 'workflow' && (
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full
            border ${status === 'idle' ? 'border-emerald-500/20 bg-emerald-500/5' :
                     status === 'complete' ? 'border-emerald-500/20 bg-emerald-500/5' :
                     status === 'error' ? 'border-red-500/20 bg-red-500/5' :
                     status === 'delegating' ? 'border-amber-500/20 bg-amber-500/5' :
                     'border-blue-500/20 bg-blue-500/5'}`}>
            <div style={{
              width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
              background: status === 'idle' || status === 'complete' ? '#10b981' :
                          status === 'error' ? '#ef4444' :
                          status === 'delegating' ? '#f59e0b' : '#3b82f6',
              boxShadow: `0 0 6px ${status === 'idle' || status === 'complete' ? 'rgba(16,185,129,0.8)' :
                                     status === 'error' ? 'rgba(239,68,68,0.8)' :
                                     status === 'delegating' ? 'rgba(245,158,11,0.8)' : 'rgba(59,130,246,0.8)'}`,
              animation: ['routing','orchestrating','delegating'].includes(status) ? 'pulse 1.5s ease-in-out infinite' : 'none'
            }} />
            <span className={cfg.text}>{cfg.label}</span>
          </div>
        )}

        {/* Model indicator */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 border border-border-dim rounded-full px-2.5 py-1">
          <Zap size={11} className="text-amber-400" />
          <span>phi3:mini</span>
          <span className="text-border-bright">→</span>
          <span>claude-sonnet</span>
        </div>
      </div>
    </header>
  )
}
