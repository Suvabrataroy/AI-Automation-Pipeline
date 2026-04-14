import { Server } from 'lucide-react'

const SERVICE_META = {
  github:  { icon: '🐙', label: 'GitHub',  desc: 'Code ops & PR review',  color: 'hover:border-slate-500/50' },
  jira:    { icon: '🎯', label: 'Jira',    desc: 'Ticket management',      color: 'hover:border-blue-500/40' },
  slack:   { icon: '💬', label: 'Slack',   desc: 'Team notifications',     color: 'hover:border-purple-500/40' },
  stripe:  { icon: '💳', label: 'Stripe',  desc: 'Payments & refunds',     color: 'hover:border-indigo-500/40' },
  s3:      { icon: '🗄️', label: 'AWS S3',  desc: 'Object storage',         color: 'hover:border-amber-500/40' },
}

export default function ServiceBar({ services }) {
  const displayServices = services.length > 0
    ? services
    : Object.entries(SERVICE_META).map(([name, meta]) => ({
        name, ...meta, enabled: true, transport_type: 'mcp'
      }))

  return (
    <div className="border-t border-border-dim bg-bg-secondary px-4 lg:px-6 py-3">
      <div className="flex items-center gap-2 mb-2.5">
        <Server size={12} className="text-slate-500" />
        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">
          Registered Services
        </span>
        <span className="text-xs text-slate-600">({displayServices.length})</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {displayServices.map(svc => {
          const meta = SERVICE_META[svc.name] || {}
          const icon = meta.icon || '⚡'
          const label = meta.label || svc.name
          const desc = meta.desc || svc.description || ''
          const color = meta.color || 'hover:border-slate-500/50'

          return (
            <div
              key={svc.name}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg
                          border border-border-dim bg-bg-card ${color}
                          transition-all duration-150 cursor-default`}
            >
              <span className="text-base">{icon}</span>
              <div className="hidden sm:block">
                <div className="text-xs font-semibold text-slate-300 whitespace-nowrap">{label}</div>
                <div className="text-xs text-slate-600 whitespace-nowrap">{desc}</div>
              </div>
              <div className="sm:hidden text-xs font-medium text-slate-400">{label}</div>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                   style={{
                     background: svc.enabled !== false ? '#10b981' : '#475569',
                     boxShadow: svc.enabled !== false ? '0 0 5px rgba(16,185,129,0.6)' : 'none'
                   }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
