import { useMemo, useState } from 'react'

export function useRoundOrder(combinedCatalog) {
  const [roundOrder, setRoundOrder] = useState(() => combinedCatalog.map((round) => round.id))
  const combinedIds = useMemo(() => combinedCatalog.map((round) => round.id), [combinedCatalog])

  const orderedCatalog = useMemo(() => {
    const incomingSet = new Set(combinedIds)
    const kept = roundOrder.filter((id) => incomingSet.has(id))
    const keptSet = new Set(kept)
    const effectiveOrder = [...kept, ...combinedIds.filter((id) => !keptSet.has(id))]
    const byId = new Map(combinedCatalog.map((round) => [round.id, round]))
    const ordered = effectiveOrder.map((id) => byId.get(id)).filter(Boolean)
    const orderedIds = new Set(ordered.map((round) => round.id))
    const missing = combinedCatalog.filter((round) => !orderedIds.has(round.id))
    return [...ordered, ...missing]
  }, [combinedCatalog, combinedIds, roundOrder])

  return {
    setRoundOrder,
    orderedCatalog,
  }
}

