import { useEffect, useMemo, useRef, useState } from 'react'
import { DRAG_SCROLL_EDGE_PX, DRAG_SCROLL_MAX_STEP_PX } from './constants'

export function useRoundDragReorder(combinedCatalog) {
  const [roundOrder, setRoundOrder] = useState(() => combinedCatalog.map((round) => round.id))
  const [dragRoundId, setDragRoundId] = useState('')
  const dragPointerYRef = useRef(null)
  const dragAutoScrollRafRef = useRef(0)
  const combinedIds = useMemo(() => combinedCatalog.map((round) => round.id), [combinedCatalog])

  useEffect(() => {
    function stopAutoScroll() {
      if (typeof window !== 'undefined' && dragAutoScrollRafRef.current) {
        window.cancelAnimationFrame(dragAutoScrollRafRef.current)
      }
      dragAutoScrollRafRef.current = 0
      dragPointerYRef.current = null
    }

    if (!dragRoundId || typeof window === 'undefined') {
      stopAutoScroll()
      return undefined
    }

    const tick = () => {
      const pointerY = dragPointerYRef.current
      const viewportHeight = window.innerHeight || 0
      if (Number.isFinite(pointerY) && viewportHeight > 0) {
        const topEdge = DRAG_SCROLL_EDGE_PX
        const bottomEdge = viewportHeight - DRAG_SCROLL_EDGE_PX
        let delta = 0

        if (pointerY < topEdge) {
          const strength = Math.min(1, (topEdge - pointerY) / DRAG_SCROLL_EDGE_PX)
          delta = -Math.max(1, Math.round(strength * DRAG_SCROLL_MAX_STEP_PX))
        } else if (pointerY > bottomEdge) {
          const strength = Math.min(1, (pointerY - bottomEdge) / DRAG_SCROLL_EDGE_PX)
          delta = Math.max(1, Math.round(strength * DRAG_SCROLL_MAX_STEP_PX))
        }

        if (delta !== 0) window.scrollBy(0, delta)
      }

      dragAutoScrollRafRef.current = window.requestAnimationFrame(tick)
    }

    dragAutoScrollRafRef.current = window.requestAnimationFrame(tick)
    return () => stopAutoScroll()
  }, [dragRoundId])

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

  function reorderRound(fromRoundId, toRoundId) {
    const fromId = String(fromRoundId || '').trim()
    const toId = String(toRoundId || '').trim()
    if (!fromId || !toId || fromId === toId) return
    setRoundOrder((prev) => {
      const incomingSet = new Set(combinedIds)
      const kept = prev.filter((id) => incomingSet.has(id))
      const keptSet = new Set(kept)
      const base = [...kept, ...combinedIds.filter((id) => !keptSet.has(id))]
      const fromIndex = base.indexOf(fromId)
      const toIndex = base.indexOf(toId)
      if (fromIndex < 0 || toIndex < 0) return prev
      const next = [...base]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  function handleRoundDragStart(event, roundId) {
    const id = String(roundId || '').trim()
    if (!id) return
    setDragRoundId(id)
    dragPointerYRef.current = Number(event.clientY)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  function handleRoundDragOver(event, roundId) {
    if (!dragRoundId) return
    event.preventDefault()
    dragPointerYRef.current = Number(event.clientY)
    const targetId = String(roundId || '').trim()
    if (!targetId || targetId === dragRoundId) return
    setRoundOrder((prev) => {
      const incomingSet = new Set(combinedIds)
      const kept = prev.filter((id) => incomingSet.has(id))
      const keptSet = new Set(kept)
      const base = [...kept, ...combinedIds.filter((id) => !keptSet.has(id))]
      const fromIndex = base.indexOf(dragRoundId)
      const toIndex = base.indexOf(targetId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev
      const next = [...base]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  function handleRoundDrop(event, roundId) {
    event.preventDefault()
    dragPointerYRef.current = null
    const targetId = String(roundId || '').trim()
    const fromData = String(event.dataTransfer.getData('text/plain') || '').trim()
    const sourceId = String(dragRoundId || fromData || '').trim()
    if (sourceId && targetId && sourceId !== targetId) reorderRound(sourceId, targetId)
    setDragRoundId('')
  }

  function handleRoundDragEnd() {
    dragPointerYRef.current = null
    setDragRoundId('')
  }

  return {
    roundOrder,
    setRoundOrder,
    orderedCatalog,
    dragRoundId,
    reorderRound,
    handleRoundDragStart,
    handleRoundDragOver,
    handleRoundDrop,
    handleRoundDragEnd,
  }
}
