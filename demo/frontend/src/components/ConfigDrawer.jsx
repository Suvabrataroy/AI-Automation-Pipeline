import { useState, useEffect } from 'react'
import {
  X, Plus, Trash2, Save, Loader2, Brain, Shield, Code2, Zap,
  Server, GitBranch, ToggleLeft, ToggleRight, CheckCircle2,
  Workflow, Cpu, ArrowRight, Clock,
} from 'lucide-react'
import { useConfig } from '../hooks/useConfig.js'

// ─── constants ───────────────────────────────────────────────

const STEP_TYPE_META = {
  mcp_call:  { label: 'MCP',       color: 'blue'   },
  ai_task:   { label: 'AI Task',   color: 'purple' },
  rest_call: { label: 'REST',      color: 'green'  },
  grpc_call: { label: 'gRPC',      color: 'amber'  },
  logic:     { label: 'Logic',     color: 'gray'   },
  condition: { label: 'Condition', color: 'red'    },
}

const SERVICE_ICONS = { github: '🐙', jira: '🎯', slack: '💬', stripe: '💳', s3: '🗄️' }

const TIER_STYLE = {
  slm:           { label: 'SLM Routing',   icon: <Brain size={13} />,  dot: '#60a5fa' },
  slm_guardrail: { label: 'SLM Guardrail', icon: <Shield size={13} />, dot: '#f87171' },
  slm_coding:    { label: 'SLM Coding',    icon: <Code2 size={13} />,  dot: '#a78bfa' },
  llm:           { label: 'LLM Reasoning', icon: <Zap size={13} />,    dot: '#fbbf24' },
}

const COMPLEXITY_OPTS = ['low', 'medium', 'high']
const ESCALATION_OPTS = ['retry_with_llm', 'escalate_human', 'fail']
const RETRIES_OPTS    = [1, 2, 3, 5]

// ─── tiny helpers ────────────────────────────────────────────

function TabBtn({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-150
        ${active
          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
          : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
        }`}
    >
      {icon}{label}
    </button>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
        ${checked
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
          : 'bg-slate-800/50 text-slate-500 border border-border-dim'
        }`}
    >
      {checked ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
      {checked ? 'On' : 'Off'}
    </button>
  )
}

function TypeBadge({ type }) {
  const m = STEP_TYPE_META[type] || { label: type, color: 'gray' }
  return <span className={`tag tag-${m.color} text-[10px]`}>{m.label}</span>
}

function SaveBtn({ saving, onClick, label = 'Save' }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="btn-primary text-xs px-3 py-1.5 h-7"
    >
      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
      {label}
    </button>
  )
}

function SuccessToast({ message }) {
  if (!message) return null
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-3 py-2
                    bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs
                    animate-fade-in shadow-xl">
      <CheckCircle2 size={13} />
      {message}
    </div>
  )
}

// ─── Pipeline tab ─────────────────────────────────────────────

function AddStepForm({ existingIds, onAdd, onCancel }) {
  const [form, setForm] = useState({
    id: '', type: 'mcp_call', service: 'github', capability: '',
    depends_on: [], output_key: '', timeout_seconds: 30,
    model_tier: 'slm', on_error: 'skip',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="bg-bg-primary border border-blue-500/20 rounded-xl p-3 space-y-2.5 animate-fade-in">
      <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">New Step</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Step ID</label>
          <input
            className="w-full bg-bg-secondary border border-border-dim rounded px-2 py-1.5 text-xs text-white
                       focus:outline-none focus:border-blue-500/40 placeholder-slate-600"
            placeholder="e.g. notify_user"
            value={form.id}
            onChange={e => set('id', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Type</label>
          <select
            className="w-full bg-bg-secondary border border-border-dim rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            value={form.type} onChange={e => set('type', e.target.value)}
          >
            {Object.entries(STEP_TYPE_META).map(([t, m]) => <option key={t} value={t}>{m.label}</option>)}
          </select>
        </div>
        {form.type === 'mcp_call' && (
          <>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Service</label>
              <select
                className="w-full bg-bg-secondary border border-border-dim rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                value={form.service} onChange={e => set('service', e.target.value)}
              >
                {Object.keys(SERVICE_ICONS).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Capability</label>
              <input
                className="w-full bg-bg-secondary border border-border-dim rounded px-2 py-1.5 text-xs text-white
                           focus:outline-none focus:border-blue-500/40 placeholder-slate-600"
                placeholder="e.g. send_message"
                value={form.capability} onChange={e => set('capability', e.target.value)}
              />
            </div>
          </>
        )}
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Output Key</label>
          <input
            className="w-full bg-bg-secondary border border-border-dim rounded px-2 py-1.5 text-xs text-white
                       focus:outline-none focus:border-blue-500/40 placeholder-slate-600"
            placeholder="e.g. result"
            value={form.output_key} onChange={e => set('output_key', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Timeout (s)</label>
          <input
            type="number" min={5} max={300}
            className="w-full bg-bg-secondary border border-border-dim rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            value={form.timeout_seconds}
            onChange={e => set('timeout_seconds', parseInt(e.target.value) || 30)}
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Model Tier</label>
          <select
            className="w-full bg-bg-secondary border border-border-dim rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            value={form.model_tier} onChange={e => set('model_tier', e.target.value)}
          >
            {Object.keys(TIER_STYLE).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">On Error</label>
          <select
            className="w-full bg-bg-secondary border border-border-dim rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            value={form.on_error} onChange={e => set('on_error', e.target.value)}
          >
            {['skip', 'fail', 'retry', 'escalate_human'].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {existingIds.length > 0 && (
        <div>
          <label className="block text-[10px] text-slate-500 mb-1.5">Depends On</label>
          <div className="flex flex-wrap gap-2">
            {existingIds.map(dep => (
              <label key={dep} className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" className="accent-blue-500"
                  checked={form.depends_on.includes(dep)}
                  onChange={e => set('depends_on', e.target.checked
                    ? [...form.depends_on, dep]
                    : form.depends_on.filter(d => d !== dep))}
                />
                {dep}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onAdd(form)} disabled={!form.id.trim()}
          className="btn-primary text-xs px-3 py-1.5 h-7"
        >
          <Plus size={12} /> Add
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs">Cancel</button>
      </div>
    </div>
  )
}

function PipelineTab({ pipelines, saving, onUpdate, onAddStep, onDeleteStep }) {
  const [activePipeline, setActivePipeline] = useState(null)
  const [showAddStep, setShowAddStep] = useState(false)

  useEffect(() => {
    if (pipelines.length > 0 && !activePipeline) {
      setActivePipeline(pipelines[0].name)
    }
  }, [pipelines, activePipeline])

  const pipeline = pipelines.find(p => p.name === activePipeline)

  return (
    <div className="space-y-4">
      {/* Pipeline selector */}
      <div>
        <label className="block text-xs text-slate-500 mb-2">Active Pipeline</label>
        <div className="flex flex-wrap gap-1.5">
          {pipelines.map(p => (
            <button
              key={p.name}
              onClick={() => { setActivePipeline(p.name); setShowAddStep(false) }}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-mono transition-all duration-150
                ${activePipeline === p.name
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'text-slate-500 border-border-dim hover:text-slate-300 hover:bg-white/5'
                }`}
            >
              <Workflow size={11} />
              {p.name.replace(/_workflow$/, '')}
              <span className="text-slate-600 text-[10px]">({p.steps.length})</span>
            </button>
          ))}
        </div>
      </div>

      {pipeline && (
        <>
          {/* Pipeline meta */}
          <div className="bg-bg-primary rounded-lg p-3 border border-border-dim space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-white">{pipeline.name}</span>
              <div className="flex items-center gap-2">
                <span className="tag tag-gray font-mono text-[10px]">v{pipeline.version}</span>
                <span className={`tag text-[10px] ${pipeline.trigger?.route === 'llm' ? 'tag-amber' : 'tag-blue'}`}>
                  {pipeline.trigger?.route || 'slm'} route
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400">{pipeline.description}</p>
          </div>

          {/* Step list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Steps ({pipeline.steps.length})
              </span>
              <button
                onClick={() => setShowAddStep(s => !s)}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Plus size={12} /> Add Step
              </button>
            </div>

            <div className="space-y-1.5">
              {pipeline.steps.map((step, idx) => (
                <div key={step.id} className="flex items-start gap-2 group">
                  <div className="flex flex-col items-center pt-1 w-5 flex-shrink-0">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                         style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa' }}>
                      {idx + 1}
                    </div>
                    {idx < pipeline.steps.length - 1 && (
                      <div className="w-px flex-1 mt-1 min-h-[16px]"
                           style={{ background: 'linear-gradient(to bottom, rgba(59,130,246,0.35), rgba(59,130,246,0.05))' }} />
                    )}
                  </div>
                  <div className="flex-1 bg-bg-secondary rounded-lg px-3 py-2 border border-border-dim group-hover:border-border-bright transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-slate-300">{step.id}</span>
                        <TypeBadge type={step.type} />
                        {step.service && (
                          <span className="text-xs text-slate-500">
                            {SERVICE_ICONS[step.service] || '⚡'} {step.service}
                            {step.capability && <span className="text-slate-600"> · {step.capability}</span>}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => onDeleteStep(pipeline.name, step.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all flex-shrink-0"
                        title="Remove step"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {step.depends_on?.length > 0 && (
                        <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                          <ArrowRight size={9} /> {step.depends_on.join(', ')}
                        </span>
                      )}
                      {step.output_key && <span className="text-[10px] text-slate-600 font-mono">→ {step.output_key}</span>}
                      <span className="text-[10px] text-slate-700 flex items-center gap-0.5">
                        <Clock size={9} /> {step.timeout_seconds}s
                      </span>
                      <span className="tag tag-gray text-[10px]">{step.on_error}</span>
                    </div>
                  </div>
                </div>
              ))}

              {pipeline.steps.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-600">
                  No steps. Add one to get started.
                </div>
              )}
            </div>

            {showAddStep && (
              <div className="mt-2">
                <AddStepForm
                  existingIds={pipeline.steps.map(s => s.id)}
                  onAdd={(step) => { onAddStep(pipeline.name, step); setShowAddStep(false) }}
                  onCancel={() => setShowAddStep(false)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Models tab ───────────────────────────────────────────────

function TierRow({ tierKey, tier, saving, onUpdate }) {
  const [primary, setPrimary] = useState(tier.primary?.model || '')
  const [timeout, setTimeout_] = useState(tier.primary?.timeout_ms || 300)
  const [fallback, setFallback] = useState(tier.fallback?.model || '')
  const meta = TIER_STYLE[tierKey] || { label: tierKey, icon: <Zap size={13} />, dot: '#94a3b8' }

  return (
    <div className="bg-bg-secondary rounded-xl p-3 border border-border-dim space-y-2">
      <div className="flex items-center gap-2">
        <span style={{ color: meta.dot }}>{meta.icon}</span>
        <span className="text-xs font-semibold text-white">{tier.label || meta.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Primary Model</label>
          <input
            className="w-full bg-bg-primary border border-border-dim rounded px-2 py-1.5 text-xs font-mono text-white
                       focus:outline-none focus:border-blue-500/40"
            value={primary} onChange={e => setPrimary(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Timeout (ms)</label>
          <input
            type="number" min={50} max={60000}
            className="w-full bg-bg-primary border border-border-dim rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            value={timeout} onChange={e => setTimeout_(e.target.value)}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-slate-500 mb-1">Fallback Model</label>
          <input
            className="w-full bg-bg-primary border border-border-dim rounded px-2 py-1.5 text-xs font-mono text-white
                       focus:outline-none focus:border-blue-500/40"
            value={fallback} onChange={e => setFallback(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <SaveBtn saving={saving} onClick={() => onUpdate(tierKey, {
          primary: { ...tier.primary, model: primary, timeout_ms: Number(timeout) },
          fallback: { ...tier.fallback, model: fallback },
        })} />
      </div>
    </div>
  )
}

function ModelsTab({ models, saving, onUpdateTier, onUpdatePreFilter }) {
  if (!models) return <div className="text-slate-500 text-sm py-4 text-center">Loading…</div>

  const [pfOn, setPfOn] = useState(models.pre_filter?.enabled ?? true)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-white">Pre-filter</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{models.pre_filter?.model} — rejects invalid requests in &lt;10 ms</p>
        </div>
        <Toggle checked={pfOn} onChange={v => { setPfOn(v); onUpdatePreFilter({ enabled: v }) }} />
      </div>

      <div className="space-y-3">
        {Object.entries(models.tiers || {}).map(([k, tier]) => (
          <TierRow key={k} tierKey={k} tier={tier} saving={saving} onUpdate={onUpdateTier} />
        ))}
      </div>
    </div>
  )
}

// ─── Routing tab ──────────────────────────────────────────────

function RoutingTab({ routing, saving, onUpdate }) {
  const rules = routing?.rules || {}
  const slm = rules.slm_threshold || {}
  const esc = rules.escalation || {}
  const pri = rules.priority_override || {}

  const [complexity, setComplexity] = useState(slm.max_complexity || 'low')
  const [confidence, setConfidence] = useState(slm.min_confidence ?? 0.80)
  const [onFail, setOnFail] = useState(esc.on_guardrail_fail || 'retry_with_llm')
  const [retries, setRetries] = useState(esc.max_retries ?? 2)
  const [onMax, setOnMax] = useState(esc.on_max_retries_exceeded || 'escalate_human')
  const [hiPriLLM, setHiPriLLM] = useState(pri.high_priority_always_llm ?? true)

  const handleSave = () => onUpdate({
    rules: {
      slm_threshold: { max_complexity: complexity, min_confidence: confidence },
      escalation: { on_guardrail_fail: onFail, max_retries: retries, on_max_retries_exceeded: onMax },
      priority_override: { high_priority_always_llm: hiPriLLM },
    },
  })

  const BtnGroup = ({ options, value, onChange }) => (
    <div className="flex gap-1">
      {options.map(o => (
        <button key={String(o)} onClick={() => onChange(o)}
          className={`text-[10px] px-2 py-1 rounded font-medium border transition-all duration-150
            ${value === o
              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
              : 'text-slate-500 border-border-dim hover:text-slate-300 hover:bg-white/5'
            }`}
        >
          {String(o)}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white">SLM Routing Rules</p>
        <SaveBtn saving={saving} onClick={handleSave} label="Save Rules" />
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-2">Max Complexity → SLM</label>
          <BtnGroup options={COMPLEXITY_OPTS} value={complexity} onChange={setComplexity} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400">Min Confidence</label>
            <span className="text-xs font-mono text-blue-400">{confidence.toFixed(2)}</span>
          </div>
          <input type="range" min={0.50} max={1.00} step={0.01}
            value={confidence} onChange={e => setConfidence(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>0.50 (loose)</span><span>1.00 (strict)</span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-2">On Guardrail Fail</label>
          <BtnGroup options={ESCALATION_OPTS} value={onFail} onChange={setOnFail} />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-2">Max Retries</label>
          <BtnGroup options={RETRIES_OPTS} value={retries} onChange={setRetries} />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-2">On Max Retries Exceeded</label>
          <BtnGroup options={ESCALATION_OPTS} value={onMax} onChange={setOnMax} />
        </div>

        <div className="flex items-center justify-between py-3 border-t border-border-dim">
          <div>
            <p className="text-xs text-slate-300">High Priority → Always LLM</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Skip SLM routing for high-priority requests</p>
          </div>
          <Toggle checked={hiPriLLM} onChange={setHiPriLLM} />
        </div>

        {/* Routing logic preview */}
        <div className="bg-bg-primary rounded-lg p-3 border border-border-dim">
          <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">Logic Preview</p>
          <pre className="text-[10px] text-slate-400 font-mono leading-relaxed whitespace-pre-wrap">
{`if complexity == "${complexity}" and confidence > ${confidence.toFixed(2)}:
    → SLM pipeline
elif priority == "high" and high_priority_always_llm:
    → LLM tier
else:
    → LLM tier`}
          </pre>
        </div>
      </div>
    </div>
  )
}

// ─── Main Drawer ──────────────────────────────────────────────

export default function ConfigDrawer({ open, onClose }) {
  const [tab, setTab] = useState('pipeline')
  const {
    pipelines, models, routing, saving, error, saveSuccess,
    updatePipeline, addStep, deleteStep,
    updateModelTier, updatePreFilter,
    updateRouting,
  } = useConfig()

  // close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[480px] flex flex-col
                      bg-bg-secondary border-l border-border-bright shadow-2xl
                      animate-slide-in-right">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-dim flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600
                            flex items-center justify-center">
              <Cpu size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Live Configuration</p>
              <p className="text-[10px] text-slate-500">Changes apply to the next workflow run</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X size={17} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-3 pb-0 flex-shrink-0">
          <TabBtn label="Pipeline" icon={<Workflow size={12} />}   active={tab === 'pipeline'} onClick={() => setTab('pipeline')} />
          <TabBtn label="Models"   icon={<Brain size={12} />}      active={tab === 'models'}   onClick={() => setTab('models')} />
          <TabBtn label="Routing"  icon={<GitBranch size={12} />}  active={tab === 'routing'}  onClick={() => setTab('routing')} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/25 rounded-lg
                          text-red-400 text-xs flex-shrink-0">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {tab === 'pipeline' && (
            <PipelineTab
              pipelines={pipelines}
              saving={saving}
              onUpdate={updatePipeline}
              onAddStep={addStep}
              onDeleteStep={deleteStep}
            />
          )}
          {tab === 'models' && (
            <ModelsTab
              models={models}
              saving={saving}
              onUpdateTier={updateModelTier}
              onUpdatePreFilter={updatePreFilter}
            />
          )}
          {tab === 'routing' && (
            <RoutingTab
              routing={routing}
              saving={saving}
              onUpdate={updateRouting}
            />
          )}
        </div>
      </div>

      {/* Toast */}
      <SuccessToast message={saveSuccess} />
    </>
  )
}
