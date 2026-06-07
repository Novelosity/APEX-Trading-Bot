'use client'

interface BalanceCardProps {
  title: string
  value: string
  subtitle?: string
  change?: number
  changePct?: number
  icon: React.ReactNode
  color?: string
  loading?: boolean
}

export function BalanceCard({
  title,
  value,
  subtitle,
  change,
  changePct,
  icon,
  color = '#4f8ef7',
  loading = false,
}: BalanceCardProps) {
  const isPositive = change !== undefined ? change >= 0 : undefined

  if (loading) {
    return (
      <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="skeleton h-4 w-20 rounded" />
          <div className="skeleton w-10 h-10 rounded-xl" />
        </div>
        <div className="skeleton h-8 w-32 rounded mb-2" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>
    )
  }

  return (
    <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-5 card-hover">
      <div className="flex items-start justify-between mb-4">
        <span className="text-sm text-[#6b6b80] font-medium">{title}</span>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18`, border: `1px solid ${color}30` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>

      <div className="text-2xl font-bold text-[#e8e8f0] font-mono mb-1">{value}</div>

      {(change !== undefined || subtitle) && (
        <div className="flex items-center gap-2">
          {change !== undefined && (
            <span
              className={`text-xs font-semibold font-mono flex items-center gap-1 ${
                isPositive ? 'text-[#00d68f]' : 'text-[#ff4757]'
              }`}
            >
              {isPositive ? '▲' : '▼'}
              {changePct !== undefined
                ? `${Math.abs(changePct).toFixed(2)}%`
                : `$${Math.abs(change).toFixed(2)}`}
            </span>
          )}
          {subtitle && <span className="text-xs text-[#6b6b80]">{subtitle}</span>}
        </div>
      )}
    </div>
  )
}
