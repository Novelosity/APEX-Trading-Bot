'use client'

import { useState } from 'react'

interface TradingToggleProps {
  execMode: 'manual' | 'auto' | 'approval'
  onToggle: (mode: 'manual' | 'auto' | 'approval') => Promise<void>
}

export function TradingToggle({ execMode, onToggle }: TradingToggleProps) {
  const [loading, setLoading] = useState(false)
  const isAuto = execMode === 'auto'

  const handleToggle = async () => {
    if (loading) return
    setLoading(true)
    try {
      if (execMode === 'auto') {
        await onToggle('manual')
      } else if (execMode === 'manual') {
        await onToggle('auto')
      } else {
        await onToggle('auto')
      }
    } finally {
      setLoading(false)
    }
  }

  const getStatusText = () => {
    if (loading) return 'Updating...'
    if (execMode === 'auto') return 'AUTO MODE ACTIVE'
    if (execMode === 'approval') return 'APPROVAL MODE'
    return 'MANUAL MODE'
  }

  const getDescription = () => {
    if (execMode === 'auto') return 'Bot will execute ULTRA_HIGH signals automatically'
    if (execMode === 'approval') return 'Bot queues trades — you approve each one'
    return 'Bot will alert only — you approve each trade'
  }

  return (
    <div
      className={`rounded-2xl p-6 border transition-all ${
        isAuto
          ? 'bg-[#00d68f]/5 border-[#00d68f]/30'
          : execMode === 'approval'
          ? 'bg-[#ffd700]/5 border-[#ffd700]/30'
          : 'bg-[#16161a] border-[#2a2a35]'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#e8e8f0] mb-0.5">Auto Trading</h3>
          <p className="text-xs text-[#6b6b80]">
            {getDescription()}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          className="relative"
          aria-label="Toggle auto trading"
        >
          <div
            className={`w-14 h-8 rounded-full transition-all duration-300 ${
              execMode === 'auto' ? 'bg-[#00d68f]/30' : execMode === 'approval' ? 'bg-[#ffd700]/30' : 'bg-[#2a2a35]'
            } ${loading ? 'opacity-50' : ''}`}
          >
            <div
              className={`absolute top-1 w-6 h-6 rounded-full transition-all duration-300 shadow-md ${
                execMode === 'auto'
                  ? 'left-7 bg-[#00d68f] shadow-[0_0_10px_rgba(0,214,143,0.5)]'
                  : execMode === 'approval'
                  ? 'left-4 bg-[#ffd700] shadow-[0_0_10px_rgba(255,215,0,0.5)]'
                  : 'left-1 bg-[#6b6b80]'
              }`}
            />
          </div>
        </button>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            execMode === 'auto' ? 'bg-[#00d68f] animate-pulse' : execMode === 'approval' ? 'bg-[#ffd700] animate-pulse' : 'bg-[#4a4a5a]'
          }`}
        />
        <span
          className={`text-xs font-semibold ${
            execMode === 'auto' ? 'text-[#00d68f]' : execMode === 'approval' ? 'text-[#ffd700]' : 'text-[#4a4a5a]'
          }`}
        >
          {getStatusText()}
        </span>
      </div>

      {execMode === 'auto' && (
        <div className="mt-4 pt-4 border-t border-[#00d68f]/20 flex items-center gap-2">
          <span className="text-xs text-[#6b6b80]">Scanning every</span>
          <span className="text-xs font-mono text-[#00d68f] bg-[#00d68f]/10 px-2 py-0.5 rounded">5 min</span>
          <span className="text-xs text-[#6b6b80]">Monitoring every</span>
          <span className="text-xs font-mono text-[#00d68f] bg-[#00d68f]/10 px-2 py-0.5 rounded">1 min</span>
        </div>
      )}
    </div>
  )
}
