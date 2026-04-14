import { useState, useEffect, useCallback } from 'react'

const API = '/api'

/**
 * Custom hook for workflow configuration CRUD.
 * Manages pipelines, services, models, and routing rules.
 */
export function useConfig() {
  const [pipelines, setPipelines] = useState([])
  const [services, setServices] = useState([])
  const [models, setModels] = useState(null)
  const [routing, setRouting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)

  // ── Load all config on mount ─────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [plRes, svcRes, mdlRes, rtRes] = await Promise.all([
        fetch(`${API}/config/pipelines`),
        fetch(`${API}/config/services`),
        fetch(`${API}/config/models`),
        fetch(`${API}/config/routing`),
      ])
      const [pl, svc, mdl, rt] = await Promise.all([
        plRes.json(), svcRes.json(), mdlRes.json(), rtRes.json(),
      ])
      setPipelines(pl)
      setServices(svc)
      setModels(mdl)
      setRouting(rt)
    } catch (e) {
      setError('Failed to load configuration. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Flash success message helper ─────────────────────────────
  const flashSuccess = (msg) => {
    setSaveSuccess(msg)
    setTimeout(() => setSaveSuccess(null), 2500)
  }

  // ── Pipelines ─────────────────────────────────────────────────
  const updatePipeline = useCallback(async (name, changes) => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/config/pipelines/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setPipelines(prev => prev.map(p => p.name === name ? updated : p))
      flashSuccess(`Pipeline "${name}" saved`)
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [])

  const addStep = useCallback(async (pipelineName, step) => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/config/pipelines/${pipelineName}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(step),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setPipelines(prev => prev.map(p => p.name === pipelineName ? updated : p))
      flashSuccess('Step added')
    } catch (e) {
      setError(`Add step failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [])

  const deleteStep = useCallback(async (pipelineName, stepId) => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/config/pipelines/${pipelineName}/steps/${stepId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setPipelines(prev => prev.map(p => p.name === pipelineName ? updated : p))
      flashSuccess('Step removed')
    } catch (e) {
      setError(`Delete step failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [])

  // ── Services ──────────────────────────────────────────────────
  const updateService = useCallback(async (name, changes) => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/config/services/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setServices(prev => prev.map(s => s.name === name ? updated : s))
      flashSuccess(`Service "${name}" updated`)
    } catch (e) {
      setError(`Update failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [])

  // ── Models ────────────────────────────────────────────────────
  const updateModelTier = useCallback(async (tier, changes) => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/config/models/tiers/${tier}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setModels(prev => ({
        ...prev,
        tiers: { ...prev.tiers, [tier]: updated }
      }))
      flashSuccess(`Model tier "${tier}" saved`)
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [])

  const updatePreFilter = useCallback(async (changes) => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/config/models`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_filter: { ...models?.pre_filter, ...changes } }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setModels(updated)
      flashSuccess('Pre-filter settings saved')
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [models])

  // ── Routing ───────────────────────────────────────────────────
  const updateRouting = useCallback(async (changes) => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/config/routing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      setRouting(updated)
      flashSuccess('Routing rules saved')
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [])

  // ── Reset all ─────────────────────────────────────────────────
  const resetConfig = useCallback(async () => {
    setSaving(true)
    try {
      await fetch(`${API}/config/reset`, { method: 'POST' })
      await loadAll()
      flashSuccess('Configuration reset to defaults')
    } catch (e) {
      setError(`Reset failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [loadAll])

  return {
    pipelines, services, models, routing,
    loading, saving, error, saveSuccess,
    updatePipeline, addStep, deleteStep,
    updateService,
    updateModelTier, updatePreFilter,
    updateRouting,
    resetConfig,
    reload: loadAll,
  }
}
