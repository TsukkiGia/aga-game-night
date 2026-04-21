import { useEffect, useMemo, useState } from 'react'
import { isCustomTemplateRound, templateToRound } from '../../core/roundCatalog'

export function useTemplateLibrary({ session, initialCatalog }) {
  const [customTemplates, setCustomTemplates] = useState(() =>
    initialCatalog.filter((round) => isCustomTemplateRound(round))
  )

  const shouldLoadTemplates = useMemo(
    () => Boolean(session?.code && session?.pin),
    [session?.code, session?.pin]
  )
  const [templatesLoading, setTemplatesLoading] = useState(() => shouldLoadTemplates)
  const [templatesBootstrapped, setTemplatesBootstrapped] = useState(() => !shouldLoadTemplates)
  const [templatesError, setTemplatesError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!session?.code || !session?.pin) {
      setTemplatesLoading(false)
      setTemplatesBootstrapped(true)
      return undefined
    }

    async function loadTemplates() {
      setTemplatesBootstrapped(false)
      setTemplatesLoading(true)
      setTemplatesError('')
      try {
        const res = await fetch('/api/round-templates', {
          headers: {
            'x-session-code': session.code,
            'x-host-pin': session.pin,
          },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (cancelled) return
          setTemplatesError('Could not load custom rounds.')
          return
        }
        const fromApi = Array.isArray(data.templates)
          ? data.templates.map((template) => templateToRound(template)).filter(Boolean)
          : []
        if (cancelled) return

        setCustomTemplates((prev) => {
          const byId = new Map()
          prev.forEach((round) => byId.set(round.id, round))
          fromApi.forEach((round) => byId.set(round.id, round))
          return [...byId.values()]
        })
      } catch {
        if (!cancelled) setTemplatesError('Could not load custom rounds.')
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false)
          setTemplatesBootstrapped(true)
        }
      }
    }

    void loadTemplates()
    return () => { cancelled = true }
  }, [session?.code, session?.pin])

  return {
    customTemplates,
    setCustomTemplates,
    templatesLoading,
    templatesBootstrapped,
    templatesError,
  }
}
