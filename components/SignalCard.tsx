import type { Signal } from '@/lib/types'

interface SignalCardProps {
  signal: Signal
  compact?: boolean
}

const TIER_CONFIG = {
  ULTRA_HIGH: { label: '🔥 Ultra High', color: '#ff4757', bg: 'bg-[#ff4757]/10', border: 'border-[#ff4757]/30' },
  HIGH: { label: '⭐ High', color: '#ffd700', bg: 'bg-[#ffd700]/10', border: 'border-[#ffd700]/30' },
  MODERATE: { label: '📊 Moderate', color: '#4f8ef7', bg: 'bg-[#4f8ef7]/10', border: 'border-[#4f8ef7]/30' },
}

export function SignalCard({ signal, compact = false }: SignalCardProps) {
  const tier = TIER_CONFIG[signal.tier]
  const isLong = signal.direction === 'long'

  const timeAgo = (() => {
    const diff = Date.now() - new Date(signal.createdAt).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (hours > 0) return `${hours}h ago`
    return `${mins}m ago`
  })()

  if (compact) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-[#2a2a35] last:border-0">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono font-bold text-sm text-[#e8e8f0]">{signal.pair}</span>
              <span
                className={`text-xs font-bold ${isLong ? 'text-[#00d68f]' : 'text-[#ff4757]'}`}
              >
                {isLong ? '▲ LONG' : '▼ SHORT'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${tier.bg} border ${tier.border}`}
                style={{ color: tier.color }}
              >
                {tier.label}
              </span>
              <span className="text-xs text-[#6b6b80]">{timeAgo}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-sm" style={{ color: tier.color }}>
            {signal.score}
          </div>
          <div className="text-xs text-[#6b6b80]">score</div>
          {signal.executed && (
            <span className="text-xs text-[#00d68f] font-semibold">✓ Executed</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-[#0d0d0f] border rounded-xl p-4 ${tier.border}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono font-bold text-[#e8e8f0]">{signal.pair}</span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                isLong ? 'bg-[#00d68f]/15 text-[#00d68f]' : 'bg-[#ff4757]/15 text-[#ff4757]'
              }`}
            >
              {isLong ? '▲ LONG' : '▼ SHORT'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tier.bg} border ${tier.border}`}
              style={{ color: tier.color }}
            >
              {tier.label}
            </span>
            <span className="text-xs text-[#6b6b80]">{timeAgo}</span>
          </div>
        </div>

        {/* Score circle */}
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center border-2 font-mono font-bold text-sm"
            style={{
              borderColor: tier.color,
              color: tier.color,
              background: `${tier.color}10`,
            }}
          >
            {signal.score}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-[#6b6b80] mb-1">
          <span>Signal Strength</span>
          <span style={{ color: tier.color }}>{signal.score}/100</span>
        </div>
        <div className="h-1.5 bg-[#2a2a35] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${signal.score}%`,
              background: `linear-gradient(90deg, ${tier.color}80, ${tier.color})`,
            }}
          />
        </div>
      </div>

      {/* Price levels */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[#6b6b80]">Entry: </span>
          <span className="font-mono text-[#e8e8f0]">
            ${signal.entry.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div>
          <span className="text-[#6b6b80]">SL: </span>
          <span className="font-mono text-[#ff4757]">
            ${signal.sl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div>
          <span className="text-[#6b6b80]">TP1: </span>
          <span className="font-mono text-[#00d68f]">
            ${signal.tp1.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div>
          <span className="text-[#6b6b80]">TP2: </span>
          <span className="font-mono text-[#00d68f]/70">
            ${signal.tp2.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* TFs aligned */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {signal.timeframesAligned.map((tf) => (
          <span
            key={tf}
            className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#00d68f]/10 text-[#00d68f]/80"
          >
            {tf}
          </span>
        ))}
        <span className="text-xs text-[#6b6b80]">aligned</span>
      </div>

      {signal.executed && (
        <div className="mt-3 pt-3 border-t border-[#2a2a35] flex items-center gap-2">
          <div className="w-4 h-4 bg-[#00d68f]/20 rounded-full flex items-center justify-center">
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="#00d68f" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-xs text-[#00d68f]">Trade Executed</span>
        </div>
      )}
    </div>
  )
}
