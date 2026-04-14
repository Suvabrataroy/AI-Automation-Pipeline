import { useState, useRef } from 'react'
import { Send, RotateCcw, Sparkles, GitBranch, Zap } from 'lucide-react'

const QUICK_PROMPTS = [
  { label: '🔍 Review PR #42', text: 'Review pull request #42 and create a Jira ticket for any issues found' },
  { label: '💳 Process Refund', text: 'Process refund for order ORD-7823' },
  { label: '🎯 Ticket Status', text: 'What is the current status of ticket ENG-456?' },
  { label: '📄 Analyze Docs', text: 'Analyze this architecture document and provide security recommendations' },
]

const PIPELINE_OPTIONS = [
  { value: null,                    label: 'Auto-route',        icon: <GitBranch size={11} />, color: 'slate' },
  { value: 'coding_workflow',       label: 'Code Review',       icon: '🔍', color: 'blue' },
  { value: 'refund_workflow',       label: 'Refund',            icon: '💳', color: 'green' },
  { value: 'create_ticket_workflow',label: 'Create Ticket',     icon: '🎯', color: 'amber' },
  { value: 'analysis_workflow',     label: 'Analysis',          icon: '📄', color: 'purple' },
]

export default function PromptInput({ onSubmit, onReset, status, disabled, onOpenConfig }) {
  const [value, setValue] = useState('')
  const [selectedPipeline, setSelectedPipeline] = useState(null)
  const textareaRef = useRef(null)
  const isRunning = ['routing', 'orchestrating', 'delegating'].includes(status)
  const isComplete = status === 'complete' || status === 'error'

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isRunning) return
    onSubmit(trimmed, selectedPipeline)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const useQuickPrompt = (text) => {
    setValue(text)
    textareaRef.current?.focus()
  }

  return (
    <div className="px-4 lg:px-6 py-3 border-b border-border-dim bg-bg-secondary/50 space-y-2.5">
      {/* Quick prompts */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-slate-500 flex items-center gap-1 mr-1">
          <Sparkles size={11} /> Quick start:
        </span>
        {QUICK_PROMPTS.map(qp => (
          <button
            key={qp.label}
            onClick={() => useQuickPrompt(qp.text)}
            disabled={isRunning}
            className="text-xs px-2.5 py-1 rounded-full border border-border-dim text-slate-400
                       hover:border-blue-500/40 hover:text-blue-400 hover:bg-blue-500/5
                       transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Pipeline selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Zap size={11} /> Pipeline:
        </span>
        {PIPELINE_OPTIONS.map(opt => {
          const isActive = selectedPipeline === opt.value
          const colorMap = {
            slate:  { active: 'bg-slate-500/15 text-slate-300 border-slate-500/40',  idle: 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/5' },
            blue:   { active: 'bg-blue-500/15 text-blue-400 border-blue-500/40',     idle: 'text-slate-500 border-transparent hover:text-blue-400 hover:bg-blue-500/5' },
            green:  { active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40', idle: 'text-slate-500 border-transparent hover:text-emerald-400 hover:bg-emerald-500/5' },
            amber:  { active: 'bg-amber-500/15 text-amber-400 border-amber-500/40',  idle: 'text-slate-500 border-transparent hover:text-amber-400 hover:bg-amber-500/5' },
            purple: { active: 'bg-purple-500/15 text-purple-400 border-purple-500/40', idle: 'text-slate-500 border-transparent hover:text-purple-400 hover:bg-purple-500/5' },
          }
          const cls = (colorMap[opt.color] || colorMap.slate)[isActive ? 'active' : 'idle']
          return (
            <button
              key={String(opt.value)}
              onClick={() => setSelectedPipeline(opt.value)}
              disabled={isRunning}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border
                          font-medium transition-all duration-150
                          disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
            >
              <span>{opt.icon}</span>
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Input area */}
      <div className="flex gap-3 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKey}
            disabled={isRunning}
            rows={2}
            placeholder={
              selectedPipeline
                ? `Describe the task — will run as "${selectedPipeline}"... (Enter to run)`
                : 'Describe a task for the SLM brain to orchestrate... (Enter to run)'
            }
            className="w-full bg-bg-tertiary border border-border-dim rounded-xl px-4 py-3
                       text-slate-200 placeholder-slate-600 text-sm resize-none
                       focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/30
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-150"
          />
          {isRunning && (
            <div className="absolute right-3 bottom-3 flex items-center gap-1.5 text-xs text-blue-400">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />
              Processing
            </div>
          )}
          {selectedPipeline && !isRunning && (
            <div className="absolute right-3 bottom-3 flex items-center gap-1 text-xs text-amber-400/70">
              <Zap size={10} />
              {selectedPipeline}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {isComplete ? (
            <button onClick={onReset} className="btn-ghost border border-border-dim">
              <RotateCcw size={15} />
              <span className="hidden sm:inline">Reset</span>
            </button>
          ) : null}
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || isRunning || disabled}
            className="btn-primary"
          >
            <Send size={15} />
            <span className="hidden sm:inline">
              {isRunning ? 'Running...' : 'Execute'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
