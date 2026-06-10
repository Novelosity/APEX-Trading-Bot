'use client'

import { useState, useCallback } from 'react'
import type { Signal } from '@/lib/types'

interface ApprovalQueueProps {
  signals: Signal[]
  onApproved: () => void
}

export function ApprovalQueue({ signals, onApproved }: ApprovalQueueProps) {
  const [acting, setActing] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const act = useCallback(async (signalId: string, action: 'approve' | 'reject') => {
    setActing((p) => ({ ...p, [signalId]: true }))
    setErrors((p) => { const n = { ...p }; delete n[signalId]; return n })
    try {
      const res = await fetch('/api/bot/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId, action }),
      })
      const data = await res.json()
      if (!data.success) {
        setErrors((p) => ({ ...p, [signalId]: data.error || 'Failed' }))
      } else {
        setResults((p) => ({ ...p, [signalId]: action === 'approve' ? 'approved' : 'rejected' }))
        onApproved()
      }
    } catch {
      setErrors((p) => ({ ...p, [signalId]: 'Network error' }))
    } finally {
      setActing((p) => ({ ...p, [signalId]: false }))
    }
  }, [onApproved])

  const pending = signals.filter((s) => !results[s.id])

  if (pending.length === 0) return null

  return (
    <div className="bg-[#16161a] border border-[#ffd700]/40 rounded-2xl overflow-hidden mb-4">
      <div className="px-5 py-4 border-b border-[#ffd700]/20 flex items-center gap-3">
        <span className="text-lg">✋</span>
        <div>
          <h3 className="font-semibold text-[#e8e8f0]">Approval Queue</h3>
          <p className="text-xs text-[#6b6b80]">{pending.length} signal{pending.length !== 1 ? 's' : ''} waiting for your review</p>
        </div>
        <span className="ml-auto text-xs bg-[#ffd700]/20 text-[#ffd700] px-2 py-0.5 rounded-full">{pending.length}</span>
      </div>

      <div className="divide-y divide-[#2a2a35]">
        {pending.map((signal) => {
          const isLong = signal.direction === 'long'
          const isLoading = acting[signal.id]
          const err = errors[signal.id]
          const expiresAt = signal.approvalExpiresAt ? new Date(signal.approvalExpiresAt) : null
          const minutesLeft = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000)) : null

          return (
            <div key={signal.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                {/* Signal info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-mono font-bold text-sm text-[#e8e8f0]">{signal.pair}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isLong ? 'bg-[#00d68f]/15 text-[#00d68f]' : 'bg-[#ff4757]/15 text-[#ff4757]'}`}>
                      {isLong ? '▲ LONG' : '▼ SHORT'}
                    </span>
                    <span className="text-xs font-mono font-bold text-[#ffd700]">{signal.score}/100</span>
                    {minutesLeft !== null && (
                      <span className={`text-xs font-mono ${minutesLeft < 15 ? 'text-[#ff4757]' : 'text-[#6b6b80]'}`}>
                        {minutesLeft}m left
                      </span>
                    )}
                  </div>

                  {/* Levels */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs mb-2">
                    <div><span className="text-[#6b6b80]">Entry </span><span className="font-mono text-[#e8e8f0]">${signal.entry.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
                    <div><span className="text-[#6b6b80]">SL </span><span className="font-mono text-[#ff4757]">${signal.sl.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
                    <div><span className="text-[#6b6b80]">TP1 </span><span className="font-mono text-[#00d68f]">${signal.tp1.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
                    <div><span className="text-[#6b6b80]">TP2 </span><span className="font-mono text-[#00d68f]/70">${signal.tp2.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
                  </div>

                  {/* R:R and TFs */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {signal.riskReward && (
                      <span className="text-xs text-[#e8e8f0]">R:R <span className="text-[#ffd700] font-mono">{signal.riskReward}x</span></span>
                    )}
                    {signal.timeframesAligned.map((tf) => (
                      <span key={tf} className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#00d68f]/10 text-[#00d68f]/80">{tf}</span>
                    ))}
                    {signal.marketRegime && (
                      <span className="text-xs text-[#6b6b80]">{signal.marketRegime}</span>
                    )}
                  </div>

                  {/* Trade spec if available */}
                  {signal.tradeSpec && (
                    <div className="mt-2 flex gap-3 text-xs flex-wrap">
                      <span className="text-[#6b6b80]">Size: <span className="text-[#e8e8f0] font-mono">${signal.tradeSpec.positionSizeUsd}</span></span>
                      <span className="text-[#6b6b80]">Risk: <span className="text-[#ff4757] font-mono">${signal.tradeSpec.riskAmountUsd}</span></span>
                      <span className="text-[#6b6b80]">Fee+slip: <span className="text-[#ffd700] font-mono">${(signal.tradeSpec.estimatedFeeUsd + signal.tradeSpec.estimatedSlippageUsd).toFixed(2)}</span></span>
                    </div>
                  )}

                  {err && <p className="text-xs text-[#ff4757] mt-1">{err}</p>}
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => act(signal.id, 'approve')}
                    disabled={isLoading}
                    className="px-4 py-2 bg-[#00d68f] text-black text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity min-w-[80px]"
                  >
                    {isLoading ? '...' : '✓ Execute'}
                  </button>
                  <button
                    onClick={() => act(signal.id, 'reject')}
                    disabled={isLoading}
                    className="px-4 py-2 bg-[#ff4757]/20 text-[#ff4757] border border-[#ff4757]/30 text-xs font-semibold rounded-lg hover:bg-[#ff4757]/30 disabled:opacity-50 transition-colors min-w-[80px]"
                  >
                    {isLoading ? '...' : '✗ Skip'}
                  </button>
                </div>
              </div>

              {/* Top reasons */}
              {signal.reasons && signal.reasons.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#2a2a35]/50">
                  <p className="text-xs text-[#6b6b80] mb-1">Why this signal:</p>
                  <div className="flex gap-2 flex-wrap">
                    {signal.reasons.slice(0, 3).map((r, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${r.bullish ? 'bg-[#00d68f]/10 text-[#00d68f]' : 'bg-[#ff4757]/10 text-[#ff4757]'}`}>
                        {r.indicator.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
