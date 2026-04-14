import { useState, useCallback, useRef, useEffect } from 'react'

const API_BASE = '/api'

const INITIAL_STATE = {
  status: 'idle',      // idle | routing | orchestrating | delegating | complete | error
  runId: null,
  prompt: '',
  routeDecision: null,
  prefilter: null,
  steps: [],
  delegation: null,
  result: null,
  error: null,
  totalLatencyMs: 0,
}

export function useWorkflow() {
  const [state, setState] = useState(INITIAL_STATE)
  const [services, setServices] = useState([])
  const [backendReady, setBackendReady] = useState(false)
  const esRef = useRef(null)

  // Check backend health on mount
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`)
        if (res.ok) setBackendReady(true)
      } catch {
        setBackendReady(false)
        setTimeout(check, 3000)
      }
    }
    check()
  }, [])

  // Load services
  useEffect(() => {
    if (!backendReady) return
    fetch(`${API_BASE}/services`)
      .then(r => r.json())
      .then(setServices)
      .catch(() => {})
  }, [backendReady])

  const closeStream = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
  }, [])

  const startWorkflow = useCallback(async (prompt, pipeline = null) => {
    closeStream()
    setState({ ...INITIAL_STATE, status: 'routing', prompt })

    let runId
    try {
      const res = await fetch(`${API_BASE}/workflow/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(pipeline ? { pipeline } : {}) }),
      })
      const data = await res.json()
      runId = data.run_id
    } catch (err) {
      setState(s => ({ ...s, status: 'error', error: 'Failed to connect to backend' }))
      return
    }

    setState(s => ({ ...s, runId }))

    const es = new EventSource(`${API_BASE}/workflow/stream/${runId}`)
    esRef.current = es

    es.addEventListener('route_decision', (e) => {
      const data = JSON.parse(e.data)
      setState(s => ({ ...s, routeDecision: data, status: 'orchestrating' }))
    })

    es.addEventListener('prefilter', (e) => {
      const data = JSON.parse(e.data)
      setState(s => ({ ...s, prefilter: data }))
    })

    es.addEventListener('step_start', (e) => {
      const data = JSON.parse(e.data)
      setState(s => ({
        ...s,
        steps: [
          ...s.steps,
          {
            index: data.step_index,
            service: data.service,
            capability: data.capability,
            params: data.params,
            status: 'running',
            request: data.params,
            response: null,
            analysis: null,
            latency_ms: null,
          }
        ]
      }))
    })

    es.addEventListener('step_complete', (e) => {
      const data = JSON.parse(e.data)
      setState(s => ({
        ...s,
        steps: s.steps.map(step =>
          step.index === data.step_index
            ? {
                ...step,
                status: 'complete',
                response: data.response,
                analysis: data.analysis,
                latency_ms: data.latency_ms,
              }
            : step
        )
      }))
    })

    es.addEventListener('delegation_start', (e) => {
      const data = JSON.parse(e.data)
      setState(s => ({ ...s, status: 'delegating', delegation: { reason: data.reason, status: 'running' } }))
    })

    es.addEventListener('delegation_complete', (e) => {
      const data = JSON.parse(e.data)
      setState(s => ({
        ...s,
        delegation: { ...s.delegation, ...data, status: 'complete' }
      }))
    })

    es.addEventListener('workflow_complete', (e) => {
      const data = JSON.parse(e.data)
      setState(s => ({
        ...s,
        status: 'complete',
        result: data,
        totalLatencyMs: data.total_latency_ms,
      }))
      es.close()
    })

    es.addEventListener('error', (e) => {
      if (e.data) {
        const data = JSON.parse(e.data)
        setState(s => ({ ...s, status: 'error', error: data.message }))
      }
      es.close()
    })

    es.onerror = () => {
      setState(s => {
        if (s.status !== 'complete' && s.status !== 'error') {
          return { ...s, status: 'error', error: 'Stream connection lost' }
        }
        return s
      })
      es.close()
    }
  }, [closeStream])

  const reset = useCallback(() => {
    closeStream()
    setState(INITIAL_STATE)
  }, [closeStream])

  useEffect(() => () => closeStream(), [closeStream])

  return { ...state, services, backendReady, startWorkflow, reset }
}
