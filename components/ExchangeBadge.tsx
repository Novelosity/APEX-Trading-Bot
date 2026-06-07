import { getExchange } from '@/lib/exchanges'

interface ExchangeBadgeProps {
  exchangeId: string
  showName?: boolean
  size?: 'sm' | 'md'
}

export function ExchangeBadge({ exchangeId, showName = true, size = 'sm' }: ExchangeBadgeProps) {
  const exchange = getExchange(exchangeId)
  if (!exchange) return null

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClass}`}
      style={{
        background: `${exchange.color}12`,
        border: `1px solid ${exchange.color}30`,
        color: exchange.color === '#FFFFFF' ? '#e8e8f0' : exchange.color,
      }}
    >
      <span>{exchange.emoji}</span>
      {showName && <span>{exchange.name}</span>}
    </span>
  )
}
