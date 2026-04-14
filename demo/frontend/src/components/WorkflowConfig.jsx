import { useState } from 'react'
import {
  Workflow, Server, Cpu, GitBranch, Plus, Trash2, Save,
  ChevronDown, ChevronRight, ToggleLeft, ToggleRight,
  RotateCcw, CheckCircle2, AlertCircle, Loader2, Settings,
  Zap, Shield, Code2, Brain, ArrowRight, Clock, Tag
} from 'lucide-react'
import { useConfig } from '../hooks/useConfig.js'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const SERVICE_META = {
  github:  { icon: '🐙', label: 'GitHub',  color: 'blue',   authType: 'bearer',  purpose: 'code_ops' },
  jira:    { icon: '🎯', label: 'Jira',    color: 'blue',   authType: 'oauth2',  purpose: 'ticket_ops' },
  slack:   { icon: '💬', label: 'Slack',   color: 'purple', authType: 'bearer',  purpose: 'notification' },
  stripe:  { icon: '💳', label: 'Stripe',  color: 'indigo', authType: 'api_key', purpose: 'payment_ops' },
  s3:      { icon: '🗄️', label: 'AWS S3',  color: 'amber',  authType: 'sigv4',   purpose: 'data_ops' },
}

const STEP_TYPE_META = {
  mcp_call:  { label: 'MCP Call',  color: 'blue',   icon: <Server size={11} /> },
  ai_task:   { label: 'AI Task',   color: 'purple', icon: <Brain size={11} /> },
  rest_call: { label: 'REST Call', color: 'green',  icon: <Zap size={11} /> },
  grpc_call: { label: 'gRPC Call', color: 'amber',  icon: <Zap size={11} /> },
  logic:     { label: 'Logic',     color: 'gray',   icon: <Code2 size={11} /> },
  condition: { label: 'Condition', color: 'red',    icon: <GitBranch size={11} /> },
}

const TIER_META = {
  slm:           { icon: <Brain size={14} />, color: 'blue',   label: 'SLM — Routing' },
  slm_guardrail: { icon: <Shield size={14} />, color: 'red',    label: 'SLM — Guardrail' },
  slm_coding:    { icon: <Code2 size={14} />,  color: 'purple', label: 'SLM — Coding' },
  llm:           { icon: <Zap size={14} />,    color: 'amber',  label: 'LLM — Reasoning' },
}

const COMPLEXITY_OPTIONS = ['low', 'medium', 'high']
const ESCALATION_OPTIONS = ['retry_with_llm', 'escalate_human', 'fail']
const MAX_RETRIES_OPTIONS = [1, 2, 3, 5]

// ─────────────────────────────────────────────
// Small shared sub-components
// ─────────────────────────────────────────────

function TabButton({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150
        ${active
          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
          : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
        }`}
    >
      {icon}
      {label}
    </button>
  )
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
        ${checked ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-slate-800/50 text-slate-500 border border-border-dim'}`}
    >
      {checked ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
      {label ?? (checked ? 'Enabled' : 'Disabled')}
    </button>
  )
}

function StepTypeBadge({ type }) {
  const meta = STEP_TYPE_META[type] || { label: type, color: 'gray', icon: null }
  return (
    <span className={`tag tag-${meta.color} flex items-center gap-1`}>
      {meta.icon}
      {meta.label}
    </span>
  )
}

function SaveButton({ saving, onClick, label = 'Save Changes' }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="btn-primary text-xs px-3 py-1.5 h-8"
    >
      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────
// New Step Form
// ─────────────────────────────────────────────

function AddStepForm({ pipelineSteps, onAdd, onCancel }) {
  const [form, setForm] = useState({
    id: '',
    type: 'mcp_call',
    service: 'github',
    capability: '',
    depends_on: [],
    output_key: '',
    timeout_seconds: 30,
    model_tier: 'slm',
    on_error: 'skip',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const availableDepends = pipelineSteps.map(s => s.id)

  return (
    <div className="bg-bg-primary border border-blue-500/20 rounded-xl p-4 space-y-3 animate-fade-in">
      <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">New Step</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Step ID</label>
          <input
            className="w-full bg-bg-secondary border border-border-dim rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-slate-600"
            placeholder="e.g. notify_user"
            value={form.id}
            onChange={e => set('id', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Type</label>
          <select
            className="w-full bg-bg-secondary border border-border-dim rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
            value={form.type}
            onChange={e => set('type', e.target.value)}
          >
            {Object.keys(STEP_TYPE_META).map(t => (
              <option key={t} value={t}>{STEP_TYPE_META[t].label}</option>
            ))}
          </select>
        </div>
        {form.type === 'mcp_call' && (
          <>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Service</label>
              <select
                className="w-full bg-bg-secondary border border-border-dim rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                value={form.service}
                onChange={e => set('service', e.target.value)}
              >
                {Object.keys(SERVICE_META).map(s => (
                  <option key={s} value={s}>{SERVICE_META[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Capability</label>
              <input
                className="w-full bg-bg-secondary border border-border-dim rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-slate-600"
                placeholder="e.g. send_message"
                value={form.capability}
                onChange={e => set('capability', e.target.value)}
              />
            </div>
          </>
        )}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Output Key</label>
          <input
            className="w-full bg-bg-secondary border border-border-dim rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50 placeholder-slate-600"
            placeholder="e.g. result"
            value={form.output_key}
            onChange={e => set('output_key', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Timeout (s)</label>
          <input
            type="number"
            className="w-full bg-bg-secondary border border-border-dim rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
            value={form.timeout_seconds}
            min={5} max={300}
            onChange={e => set('timeout_seconds', parseInt(e.target.value) || 30)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Model Tier</label>
          <select
            className="w-full bg-bg-secondary border border-border-dim rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
            value={form.model_tier}
            onChange={e => set('model_tier', e.target.value)}
          >
            {Object.keys(TIER_META).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">On Error</label>
          <select
            className="w-full bg-bg-secondary border border-border-dim rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
            value={form.on_error}
            onChange={e => set('on_error', e.target.value)}
          >
            {['skip', 'fail', 'retry', 'escalate_human'].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {availableDepends.length > 0 && (
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Depends On</label>
          <div className="flex flex-wrap gap-2">
            {availableDepends.map(dep => (
              <label key={dep} className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-blue-500"
                  checked={form.depends_on.includes(dep)}
                  onChange={e => set('depends_on', e.target.checked
                    ? [...form.depends_on, dep]
                    : form.depends_on.filter(d => d !== dep)
                  )}
                />
                {dep}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onAdd(form)}
          disabled={!form.id.trim()}
          className="btn-primary text-xs px-3 py-1.5 h-8"
        >
          <Plus size={13} /> Add Step
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs">Cancel</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Pipeline Card
// ─────────────────────────────────────────────

function PipelineCard({ pipeline, saving, onUpdate, onAddStep, onDeleteStep }) {
  const [expanded, setExpanded] = useState(false)
  const [showAddStep, setShowAddStep] = useState(false)
  const [editDesc, setEditDesc] = useState(false)
  const [desc, setDesc] = useState(pipeline.description)

  const tagColors = {
    code: 'blue', github: 'blue', jira: 'blue', slack: 'purple',
    payment: 'green', stripe: 'green', ticket: 'amber', analysis: 'amber',
    llm: 'purple', delegation: 'red',
  }

  const handleSaveDesc = () => {
    onUpdate(pipeline.name, { description: desc })
    setEditDesc(false)
  }

  const handleAddStep = (step) => {
    onAddStep(pipeline.name, step)
    setShowAddStep(false)
  }

  return (
    <div className="card overflow-hidden transition-all duration-200">
      {/* Card header */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Workflow size={15} className="text-blue-400 flex-shrink-0" />
            <span className="font-semibold text-white text-sm font-mono">{pipeline.name}</span>
            <span className="tag tag-gray font-mono">v{pipeline.version}</span>
          </div>

          {editDesc ? (
            <div className="flex gap-2 mt-1.5" onClick={e => e.stopPropagation()}>
              <input
                className="flex-1 bg-bg-secondary border border-blue-500/30 rounded px-2 py-1 text-xs text-white focus:outline-none"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                autoFocus
              />
              <button onClick={handleSaveDesc} className="tag tag-blue cursor-pointer hover:bg-blue-500/20">Save</button>
              <button onClick={() => { setDesc(pipeline.description); setEditDesc(false) }} className="tag tag-gray cursor-pointer">Cancel</button>
            </div>
          ) : (
            <p
              className="text-xs text-slate-400 mt-0.5 hover:text-slate-300 cursor-text"
              onClick={e => { e.stopPropagation(); setEditDesc(true) }}
              title="Click to edit description"
            >
              {pipeline.description}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 mt-2">
            {(pipeline.tags || []).map(t => (
              <span key={t} className={`tag tag-${tagColors[t] || 'gray'}`}>{t}</span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-500">{pipeline.steps.length} steps</div>
            <div className="text-xs text-slate-600 mt-0.5">
              {pipeline.trigger?.route === 'llm' ? (
                <span className="text-amber-400/70">LLM route</span>
              ) : (
                <span className="text-blue-400/70">SLM route</span>
              )}
            </div>
          </div>
          {expanded ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-500" />}
        </div>
      </div>

      {/* Expanded step list */}
      {expanded && (
        <div className="border-t border-border-dim px-4 pb-4 pt-3 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Steps (DAG)</span>
            <button
              onClick={() => setShowAddStep(s => !s)}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus size={12} />
              Add Step
            </button>
          </div>

          {pipeline.steps.map((step, idx) => (
            <div key={step.id} className="flex items-start gap-3 group">
              {/* Step connector line */}
              <div className="flex flex-col items-center pt-1 flex-shrink-0" style={{width: '20px'}}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                     style={{background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa'}}>
                  {idx + 1}
                </div>
                {idx < pipeline.steps.length - 1 && (
                  <div className="w-px h-6 mt-1" style={{background: 'linear-gradient(to bottom, rgba(59,130,246,0.4), rgba(59,130,246,0.1))'}} />
                )}
              </div>

              {/* Step card */}
              <div className="flex-1 bg-bg-secondary rounded-lg px-3 py-2.5 border border-border-dim group-hover:border-border-bright transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-semibold text-slate-300">{step.id}</span>
                    <StepTypeBadge type={step.type} />
                    {step.service && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <span>{SERVICE_META[step.service]?.icon || '⚡'}</span>
                        <span>{step.service}</span>
                        {step.capability && <><span className="text-slate-700">·</span><span className="text-slate-400">{step.capability}</span></>}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onDeleteStep(pipeline.name, step.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                    title="Remove step"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mt-1.5">
                  {step.depends_on?.length > 0 && (
                    <span className="text-xs text-slate-600 flex items-center gap-1">
                      <ArrowRight size={10} className="text-slate-700" />
                      depends: {step.depends_on.join(', ')}
                    </span>
                  )}
                  {step.output_key && (
                    <span className="text-xs text-slate-600 font-mono">→ {step.output_key}</span>
                  )}
                  <span className="text-xs text-slate-700 flex items-center gap-0.5">
                    <Clock size={9} /> {step.timeout_seconds}s
                  </span>
                  <span className="tag tag-gray text-[10px]">{step.on_error}</span>
                </div>
              </div>
            </div>
          ))}

          {pipeline.steps.length === 0 && (
            <div className="text-center py-4 text-xs text-slate-600">
              No steps configured. Add a step to get started.
            </div>
          )}

          {showAddStep && (
            <AddStepForm
              pipelineSteps={pipeline.steps}
              onAdd={handleAddStep}
              onCancel={() => setShowAddStep(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Pipelines Tab
// ─────────────────────────────────────────────

function PipelinesTab({ pipelines, saving, onUpdate, onAddStep, onDeleteStep }) {
  return (
    <div>
      <SectionHeader
        title="Pipeline Definitions"
        subtitle="Configure the steps, services, and routing for each workflow pipeline."
      />
      <div className="space-y-3">
        {pipelines.map(p => (
          <PipelineCard
            key={p.name}
            pipeline={p}
            saving={saving}
            onUpdate={onUpdate}
            onAddStep={onAddStep}
            onDeleteStep={onDeleteStep}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Services Tab
// ─────────────────────────────────────────────

function ServicesTab({ services, saving, onUpdate }) {
  return (
    <div>
      <SectionHeader
        title="MCP Service Registry"
        subtitle="Enable or disable services and manage their capabilities. Auth tokens are resolved from Vault at runtime."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map(svc => {
          const meta = SERVICE_META[svc.name] || { icon: '⚡', label: svc.name, color: 'gray', authType: 'bearer', purpose: '' }
          const borderAccent = {
            blue: 'hover:border-blue-500/40', purple: 'hover:border-purple-500/40',
            indigo: 'hover:border-indigo-500/40', amber: 'hover:border-amber-500/40', gray: 'hover:border-slate-500/40',
          }[meta.color] || 'hover:border-slate-500/40'

          return (
            <div key={svc.name} className={`card p-4 transition-all duration-200 ${borderAccent} ${!svc.enabled ? 'opacity-60' : ''}`}>
              {/* Service header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{meta.icon}</span>
                  <div>
                    <div className="font-semibold text-white text-sm">{meta.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{svc.description}</div>
                  </div>
                </div>
                <Toggle
                  checked={svc.enabled !== false}
                  onChange={(v) => onUpdate(svc.name, { enabled: v })}
                />
              </div>

              {/* Metadata row */}
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="tag tag-gray flex items-center gap-1">
                  <Server size={10} /> {svc.transport_type || 'mcp'}
                </span>
                <span className="tag tag-gray">
                  auth: {meta.authType}
                </span>
                <span className="tag tag-gray">
                  {meta.purpose}
                </span>
                {svc.slm_tier && (
                  <span className="tag tag-blue">{svc.slm_tier}</span>
                )}
              </div>

              {/* Capabilities */}
              <div>
                <div className="text-xs text-slate-600 mb-1.5 uppercase tracking-wide">Capabilities</div>
                <div className="flex flex-wrap gap-1.5">
                  {(svc.capabilities || []).map(cap => (
                    <span key={cap} className="tag tag-gray font-mono text-[10px]">{cap}</span>
                  ))}
                </div>
              </div>

              {/* Auth hint */}
              <div className="mt-3 pt-3 border-t border-border-dim">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Shield size={10} />
                  <span className="font-mono">{'{{ secret:' + svc.name + '/token }}'}</span>
                  <span className="text-slate-700">— resolved via Vault</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Models Tab
// ─────────────────────────────────────────────

function ModelTierCard({ tierKey, tier, saving, onUpdate }) {
  const [editPrimary, setEditPrimary] = useState(tier.primary?.model || '')
  const [editFallback, setEditFallback] = useState(tier.fallback?.model || '')
  const [editTimeout, setEditTimeout] = useState(tier.primary?.timeout_ms || 300)
  const meta = TIER_META[tierKey] || { icon: <Zap size={14} />, color: 'gray', label: tierKey }

  const colorBg = {
    blue: 'rgba(59,130,246,0.08)', red: 'rgba(239,68,68,0.08)',
    purple: 'rgba(139,92,246,0.08)', amber: 'rgba(245,158,11,0.08)', gray: 'rgba(100,116,139,0.08)',
  }[meta.color]
  const colorBorder = {
    blue: 'rgba(59,130,246,0.25)', red: 'rgba(239,68,68,0.25)',
    purple: 'rgba(139,92,246,0.25)', amber: 'rgba(245,158,11,0.25)', gray: 'rgba(100,116,139,0.25)',
  }[meta.color]
  const colorText = {
    blue: '#60a5fa', red: '#f87171', purple: '#a78bfa', amber: '#fbbf24', gray: '#94a3b8',
  }[meta.color]

  const handleSave = () => {
    onUpdate(tierKey, {
      primary: { ...tier.primary, model: editPrimary, timeout_ms: Number(editTimeout) },
      fallback: { ...tier.fallback, model: editFallback },
    })
  }

  return (
    <div className="card p-4" style={{ borderColor: colorBorder }}>
      <div className="flex items-center gap-2 mb-3" style={{ color: colorText }}>
        {meta.icon}
        <span className="font-semibold text-sm">{tier.label || meta.label}</span>
      </div>

      <div className="space-y-3">
        {/* Primary model */}
        <div className="bg-bg-secondary rounded-lg p-3 border border-border-dim">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Primary Model</span>
            <span className="tag tag-green text-[10px]">{tier.primary?.provider}</span>
          </div>
          <input
            className="w-full bg-bg-primary border border-border-dim rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500/40"
            value={editPrimary}
            onChange={e => setEditPrimary(e.target.value)}
          />
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1">
              <div className="text-xs text-slate-600 mb-1">Timeout (ms)</div>
              <input
                type="number"
                className="w-full bg-bg-primary border border-border-dim rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500/40"
                value={editTimeout}
                min={50} max={60000}
                onChange={e => setEditTimeout(e.target.value)}
              />
            </div>
            {tier.primary?.max_tokens !== undefined && (
              <div className="flex-1">
                <div className="text-xs text-slate-600 mb-1">Max Tokens</div>
                <div className="text-xs text-slate-400 px-2 py-1 bg-bg-primary border border-border-dim rounded">
                  {tier.primary.max_tokens}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fallback model */}
        {tier.fallback && (
          <div className="bg-bg-secondary rounded-lg p-3 border border-border-dim">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Fallback Model</span>
              <span className="tag tag-amber text-[10px]">{tier.fallback?.provider}</span>
            </div>
            <input
              className="w-full bg-bg-primary border border-border-dim rounded px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500/40"
              value={editFallback}
              onChange={e => setEditFallback(e.target.value)}
            />
          </div>
        )}

        <SaveButton saving={saving} onClick={handleSave} />
      </div>
    </div>
  )
}

function ModelsTab({ models, saving, onUpdateTier, onUpdatePreFilter }) {
  if (!models) return <div className="text-slate-500 text-sm">Loading model config...</div>

  const [pfEnabled, setPfEnabled] = useState(models.pre_filter?.enabled ?? true)

  const handlePfToggle = (v) => {
    setPfEnabled(v)
    onUpdatePreFilter({ enabled: v })
  }

  const costs = models.cost_per_1k_tokens || {}

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Model Tiers"
        subtitle="Configure primary and fallback models for each tier. Changes apply to all new workflow runs."
      />

      {/* Tier cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Object.entries(models.tiers || {}).map(([tierKey, tier]) => (
          <ModelTierCard
            key={tierKey}
            tierKey={tierKey}
            tier={tier}
            saving={saving}
            onUpdate={onUpdateTier}
          />
        ))}
      </div>

      {/* Pre-filter */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Zap size={14} className="text-amber-400" /> Pre-filter (SmolLM2 360M)
        </h3>
        <div className="card p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-300">{models.pre_filter?.model}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Runs before SLM routing to reject invalid requests in &lt;10 ms.
              Disable to skip this stage and save latency.
            </p>
          </div>
          <Toggle
            checked={pfEnabled}
            onChange={handlePfToggle}
            label={pfEnabled ? 'Enabled' : 'Disabled'}
          />
        </div>
      </div>

      {/* Cost table */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Tag size={14} className="text-emerald-400" /> Cost per 1k Tokens
        </h3>
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-dim">
                <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Model</th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-medium">USD / 1k tokens</th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(costs).map(([model, cost]) => (
                <tr key={model} className="border-b border-border-dim/50 hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-mono text-slate-300">{model}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {cost === 0
                      ? <span className="text-emerald-400">Free</span>
                      : <span className="text-amber-400">${cost.toFixed(5)}</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={`tag ${cost === 0 ? 'tag-gray' : 'tag-amber'}`}>
                      {cost === 0 ? 'local' : 'api'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Routing Rules Tab
// ─────────────────────────────────────────────

function RoutingTab({ routing, saving, onUpdate }) {
  if (!routing) return <div className="text-slate-500 text-sm">Loading routing config...</div>

  const rules = routing.rules || {}
  const slmThreshold = rules.slm_threshold || {}
  const escalation = rules.escalation || {}
  const priorityOverride = rules.priority_override || {}

  const [complexity, setComplexity] = useState(slmThreshold.max_complexity || 'low')
  const [confidence, setConfidence] = useState(slmThreshold.min_confidence ?? 0.80)
  const [onGuardrailFail, setOnGuardrailFail] = useState(escalation.on_guardrail_fail || 'retry_with_llm')
  const [maxRetries, setMaxRetries] = useState(escalation.max_retries ?? 2)
  const [onMaxRetries, setOnMaxRetries] = useState(escalation.on_max_retries_exceeded || 'escalate_human')
  const [highPriorityLlm, setHighPriorityLlm] = useState(priorityOverride.high_priority_always_llm ?? true)

  const handleSave = () => {
    onUpdate({
      rules: {
        slm_threshold: { max_complexity: complexity, min_confidence: parseFloat(confidence) },
        escalation: { on_guardrail_fail: onGuardrailFail, max_retries: maxRetries, on_max_retries_exceeded: onMaxRetries },
        priority_override: { high_priority_always_llm: highPriorityLlm },
      }
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <SectionHeader
        title="Routing Rules"
        subtitle="Control how requests are routed between the SLM and LLM tiers based on complexity and confidence."
        action={<SaveButton saving={saving} onClick={handleSave} />}
      />

      {/* SLM Threshold */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Brain size={14} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-white">SLM Threshold</h3>
        </div>
        <p className="text-xs text-slate-500 -mt-3">
          Requests matching both conditions are handled by the SLM tier. Anything above escalates to the LLM.
        </p>

        {/* Max complexity */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Max Complexity for SLM
          </label>
          <div className="flex gap-2">
            {COMPLEXITY_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => setComplexity(opt)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all duration-150 capitalize
                  ${complexity === opt
                    ? opt === 'low' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : opt === 'medium' ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'bg-red-500/15 border-red-500/40 text-red-400'
                    : 'bg-transparent border-border-dim text-slate-600 hover:text-slate-400 hover:border-border-bright'
                  }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Confidence threshold */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-400">Min Confidence Score</label>
            <span className="text-sm font-bold text-blue-400 font-mono">{Number(confidence).toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.50} max={1.00} step={0.01}
            value={confidence}
            onChange={e => setConfidence(parseFloat(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-700 mt-1">
            <span>0.50 — more SLM</span>
            <span>1.00 — more LLM</span>
          </div>
        </div>
      </div>

      {/* Escalation settings */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Escalation Settings</h3>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">On Guardrail Failure</label>
          <div className="flex flex-wrap gap-2">
            {ESCALATION_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => setOnGuardrailFail(opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150
                  ${onGuardrailFail === opt
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-400'
                    : 'bg-transparent border-border-dim text-slate-600 hover:text-slate-400'
                  }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">Max Retries</label>
          <div className="flex gap-2">
            {MAX_RETRIES_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setMaxRetries(n)}
                className={`w-10 h-9 rounded-lg text-sm font-bold border transition-all duration-150
                  ${maxRetries === n
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                    : 'bg-transparent border-border-dim text-slate-600 hover:text-slate-400'
                  }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">On Max Retries Exceeded</label>
          <div className="flex flex-wrap gap-2">
            {['escalate_human', 'fail'].map(opt => (
              <button
                key={opt}
                onClick={() => setOnMaxRetries(opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150
                  ${onMaxRetries === opt
                    ? 'bg-red-500/15 border-red-500/40 text-red-400'
                    : 'bg-transparent border-border-dim text-slate-600 hover:text-slate-400'
                  }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Priority override */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap size={14} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-white">High Priority → Always LLM</h3>
            </div>
            <p className="text-xs text-slate-500">
              When enabled, any request classified as high priority is always escalated to the LLM tier, regardless of complexity or confidence scores.
            </p>
          </div>
          <Toggle
            checked={highPriorityLlm}
            onChange={setHighPriorityLlm}
          />
        </div>
      </div>

      {/* Routing logic summary */}
      <div className="rounded-xl p-4 border border-border-dim bg-bg-secondary">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Current Routing Logic</p>
        <div className="space-y-1.5 text-xs text-slate-400 font-mono">
          <div className="flex items-start gap-2">
            <span className="text-blue-400 flex-shrink-0">IF</span>
            <span>complexity ≤ <span className="text-emerald-400">{complexity}</span> AND confidence ≥ <span className="text-emerald-400">{Number(confidence).toFixed(2)}</span></span>
          </div>
          <div className="flex items-start gap-2 pl-4">
            <span className="text-slate-600">→</span>
            <span className="text-blue-400">route to SLM tier</span>
          </div>
          {highPriorityLlm && (
            <>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 flex-shrink-0">ELIF</span>
                <span>priority == <span className="text-amber-400">"high"</span></span>
              </div>
              <div className="flex items-start gap-2 pl-4">
                <span className="text-slate-600">→</span>
                <span className="text-amber-400">route to LLM tier</span>
              </div>
            </>
          )}
          <div className="flex items-start gap-2">
            <span className="text-purple-400 flex-shrink-0">ELSE</span>
            <span className="text-purple-400">→ route to LLM tier</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main WorkflowConfig page
// ─────────────────────────────────────────────

export default function WorkflowConfig() {
  const [activeTab, setActiveTab] = useState('pipelines')
  const {
    pipelines, services, models, routing,
    loading, saving, error, saveSuccess,
    updatePipeline, addStep, deleteStep,
    updateService,
    updateModelTier, updatePreFilter,
    updateRouting,
    resetConfig,
  } = useConfig()

  const tabs = [
    { id: 'pipelines', label: 'Pipelines',     icon: <Workflow size={14} /> },
    { id: 'services',  label: 'Services',       icon: <Server size={14} /> },
    { id: 'models',    label: 'Models',         icon: <Cpu size={14} /> },
    { id: 'routing',   label: 'Routing Rules',  icon: <GitBranch size={14} /> },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="bg-bg-secondary border-b border-border-dim px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          {tabs.map(tab => (
            <TabButton
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
        <button
          onClick={resetConfig}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors border border-border-dim hover:border-border-bright rounded-lg px-3 py-1.5"
          title="Reset all config to defaults"
        >
          <RotateCcw size={12} />
          <span className="hidden sm:inline">Reset Defaults</span>
        </button>
      </div>

      {/* Status bar */}
      {(saveSuccess || error) && (
        <div className={`px-4 py-2 text-xs flex items-center gap-2 animate-fade-in
          ${saveSuccess ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border-b border-red-500/20'}`}>
          {saveSuccess ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {saveSuccess || error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading configuration...</span>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'pipelines' && (
              <PipelinesTab
                pipelines={pipelines}
                saving={saving}
                onUpdate={updatePipeline}
                onAddStep={addStep}
                onDeleteStep={deleteStep}
              />
            )}
            {activeTab === 'services' && (
              <ServicesTab
                services={services}
                saving={saving}
                onUpdate={updateService}
              />
            )}
            {activeTab === 'models' && (
              <ModelsTab
                models={models}
                saving={saving}
                onUpdateTier={updateModelTier}
                onUpdatePreFilter={updatePreFilter}
              />
            )}
            {activeTab === 'routing' && (
              <RoutingTab
                routing={routing}
                saving={saving}
                onUpdate={updateRouting}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
