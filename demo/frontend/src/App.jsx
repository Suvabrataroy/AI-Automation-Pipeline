import { useState } from 'react'
import Header from './components/Header.jsx'
import PromptInput from './components/PromptInput.jsx'
import PipelineFlow from './components/PipelineFlow.jsx'
import StepInspector from './components/StepInspector.jsx'
import ServiceBar from './components/ServiceBar.jsx'
import WorkflowConfig from './components/WorkflowConfig.jsx'
import ConfigDrawer from './components/ConfigDrawer.jsx'
import { useWorkflow } from './hooks/useWorkflow.js'
import { Settings } from 'lucide-react'

export default function App() {
  const [page, setPage] = useState('workflow') // 'workflow' | 'config'
  const [showDrawer, setShowDrawer] = useState(false)

  const {
    status, routeDecision, steps, delegation, result, error,
    services, backendReady,
    startWorkflow, reset,
  } = useWorkflow()

  const [selectedStepIndex, setSelectedStepIndex] = useState(null)

  const selectedStep = steps.find(s => s.index === selectedStepIndex) || null

  const handleSelectStep = (idx) => setSelectedStepIndex(idx)

  const handleReset = () => {
    setSelectedStepIndex(null)
    reset()
  }

  // Auto-select last complete or running step
  const shouldAutoSelect = selectedStepIndex === null
  if (shouldAutoSelect && steps.length > 0) {
    const running = steps.find(s => s.status === 'running')
    const lastComplete = [...steps].reverse().find(s => s.status === 'complete')
    const autoIdx = running?.index ?? lastComplete?.index ?? null
    if (autoIdx !== null && autoIdx !== selectedStepIndex) {
      setSelectedStepIndex(autoIdx)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
      {/* Header */}
      <Header
        status={status}
        backendReady={backendReady}
        servicesCount={services.length}
        page={page}
        onPageChange={setPage}
      />

      {/* Workflow page */}
      {page === 'workflow' && (
        <>
          {/* Prompt Input — receives (prompt, pipeline) from PromptInput */}
          <PromptInput
            onSubmit={startWorkflow}
            onReset={handleReset}
            status={status}
            disabled={!backendReady}
          />

          {/* Error banner */}
          {error && (
            <div className="mx-4 mt-3 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg
                            text-red-400 text-xs flex items-center gap-2 animate-fade-in">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Pipeline Flow — left panel */}
            <div className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 border-r border-border-dim
                            overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-border-dim flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                  Pipeline Flow
                </span>
                {steps.length > 0 && (
                  <span className="text-xs text-slate-600">
                    {steps.filter(s => s.status === 'complete').length}/{steps.length} steps
                  </span>
                )}
                {/* Live configure button */}
                <button
                  onClick={() => setShowDrawer(true)}
                  title="Configure workflows on the fly"
                  className={`ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border
                              transition-all duration-150
                              ${showDrawer
                                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/5 hover:border-border-dim'
                              }`}
                >
                  <Settings size={12} />
                  <span className="hidden sm:inline">Configure</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <PipelineFlow
                  status={status}
                  routeDecision={routeDecision}
                  steps={steps}
                  delegation={delegation}
                  result={result}
                  selectedStepIndex={selectedStepIndex}
                  onSelectStep={handleSelectStep}
                />
              </div>
            </div>

            {/* Step Inspector — right panel */}
            <div className={`flex-1 overflow-hidden flex flex-col
              ${!selectedStep && steps.length === 0 ? 'hidden lg:flex' : 'flex'}`}>
              <div className="px-3 py-2 border-b border-border-dim flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                  Step Inspector
                </span>
                {selectedStep && (
                  <span className="text-xs text-slate-600 font-mono">
                    {selectedStep.service}.{selectedStep.capability}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                <StepInspector
                  step={selectedStep}
                  onClose={() => setSelectedStepIndex(null)}
                />
              </div>
            </div>
          </div>

          {/* Service Bar */}
          <ServiceBar services={services} />
        </>
      )}

      {/* Config page */}
      {page === 'config' && (
        <WorkflowConfig />
      )}

      {/* Live Config Drawer — overlays the workflow page */}
      <ConfigDrawer open={showDrawer} onClose={() => setShowDrawer(false)} />
    </div>
  )
}
