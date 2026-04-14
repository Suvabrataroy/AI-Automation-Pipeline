import { Brain, GitBranch, CheckCircle2, Loader2, AlertCircle, Zap } from 'lucide-react'
import StepNode from './StepNode.jsx'

function FlowConnector({ active, complete, error }) {
  return (
    <div className="flex justify-center items-center py-1">
      <div className="relative flex flex-col items-center">
        <div className={`w-0.5 h-8 transition-all duration-500
          ${complete ? 'bg-emerald-500/60' :
            active ? 'bg-blue-500/60' :
            error ? 'bg-red-500/40' :
            'bg-border-dim'}`}
        />
        {active && (
          <div className="absolute top-0 w-2 h-2 rounded-full bg-blue-400 animate-flow-down"
               style={{ left: '-3px' }} />
        )}
      </div>
    </div>
  )
}

function RouteDecisionCard({ decision }) {
  if (!decision) return null

  const complexityColor = {
    low: 'tag-green', medium: 'tag-amber', high: 'tag-red'
  }[decision.complexity] || 'tag-gray'

  const priorityColor = {
    low: 'tag-gray', medium: 'tag-blue', high: 'tag-amber'
  }[decision.priority] || 'tag-gray'

  return (
    <div className="card border-blue-500/30 bg-blue-500/5 p-3 animate-slide-up">
      <div className="flex items-center gap-2 mb-2">
        <GitBranch size={13} className="text-blue-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Route Decision</span>
        <div className="ml-auto text-xs text-slate-500 font-mono">
          {Math.round(decision.confidence * 100)}% conf.
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="tag-blue">{decision.intent}</span>
        <span className={complexityColor}>{decision.complexity}</span>
        <span className={priorityColor}>{decision.priority} priority</span>
        <span className="text-slate-500 text-xs">→</span>
        <span className="text-xs font-semibold text-white">{decision.route}</span>
      </div>
    </div>
  )
}

function DelegationNode({ delegation }) {
  if (!delegation) return null
  const isRunning = delegation.status === 'running'

  return (
    <div className={`card border-amber-500/30 bg-amber-500/5 p-3 animate-slide-up`}>
      <div className="flex items-center gap-2 mb-2">
        <Zap size={13} className="text-amber-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
          LLM Delegation
        </span>
        {isRunning && <Loader2 size={12} className="text-amber-400 animate-spin ml-auto" />}
      </div>
      <div className="text-xs text-slate-400 mb-1">
        Reason: <span className="text-amber-300">{delegation.reason}</span>
      </div>
      {delegation.model && (
        <div className="text-xs text-slate-500">Model: {delegation.model}</div>
      )}
      {delegation.content && (
        <div className="mt-2 text-xs text-slate-300 bg-bg-primary rounded-lg p-2 max-h-24 overflow-y-auto">
          {delegation.content.slice(0, 300)}{delegation.content.length > 300 ? '…' : ''}
        </div>
      )}
    </div>
  )
}

function CompleteNode({ result }) {
  if (!result) return null
  return (
    <div className="card border-emerald-500/30 bg-emerald-500/5 p-3 animate-slide-up">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-400" />
        <span className="text-xs font-semibold text-emerald-400">Workflow Complete</span>
        <div className="ml-auto flex gap-2 text-xs text-slate-500">
          <span>{result.total_steps} steps</span>
          <span>·</span>
          <span>{result.total_latency_ms}ms</span>
          {result.delegated && <span className="tag-amber">delegated</span>}
        </div>
      </div>
    </div>
  )
}

export default function PipelineFlow({
  status,
  routeDecision,
  steps,
  delegation,
  result,
  selectedStepIndex,
  onSelectStep,
}) {
  const isRouting = status === 'routing'
  const isOrchestrating = status === 'orchestrating' || status === 'delegating'
  const isComplete = status === 'complete'

  return (
    <div className="flex flex-col gap-0 h-full overflow-y-auto pr-1">
      {/* SLM Brain node — always visible */}
      <div className={`card p-3 border-purple-500/30
        ${isRouting || isOrchestrating ? 'bg-purple-500/5 animate-pulse-blue' : 'bg-bg-card'}
        transition-all duration-300`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600
                          flex items-center justify-center text-lg shadow-lg flex-shrink-0">
            🧠
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white">SLM Brain</div>
            <div className="text-xs text-slate-500">
              {isRouting ? 'Classifying intent...' :
               isOrchestrating ? 'Orchestrating steps...' :
               isComplete ? 'Orchestration complete' :
               'phi3:mini · Local'}
            </div>
          </div>
          {(isRouting || isOrchestrating) && (
            <Loader2 size={16} className="text-purple-400 animate-spin flex-shrink-0" />
          )}
          {isComplete && (
            <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Route Decision */}
      {routeDecision && (
        <>
          <FlowConnector active={false} complete={true} />
          <RouteDecisionCard decision={routeDecision} />
        </>
      )}

      {/* Steps */}
      {steps.map((step, idx) => {
        const prevComplete = idx === 0 ? !!routeDecision : steps[idx - 1]?.status === 'complete'
        const isActive = step.status === 'running'
        const isStepComplete = step.status === 'complete'

        return (
          <div key={step.index}>
            <FlowConnector
              active={isActive && prevComplete}
              complete={isStepComplete}
              error={step.status === 'error'}
            />
            <StepNode
              step={step}
              stepNumber={idx + 1}
              isSelected={selectedStepIndex === step.index}
              onClick={() => onSelectStep(step.index === selectedStepIndex ? null : step.index)}
            />
          </div>
        )
      })}

      {/* Delegation */}
      {delegation && (
        <>
          <FlowConnector active={delegation.status === 'running'} complete={delegation.status === 'complete'} />
          <DelegationNode delegation={delegation} />
        </>
      )}

      {/* Complete */}
      {result && (
        <>
          <FlowConnector active={false} complete={true} />
          <CompleteNode result={result} />
        </>
      )}

      {/* Empty state */}
      {status === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-dim
                          flex items-center justify-center text-3xl mb-4">
            🧠
          </div>
          <div className="text-slate-400 text-sm font-medium mb-1">SLM Brain Ready</div>
          <div className="text-slate-600 text-xs max-w-[200px]">
            Enter a task above to watch the orchestration pipeline in action
          </div>
        </div>
      )}
    </div>
  )
}
