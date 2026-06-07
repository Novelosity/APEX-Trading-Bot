interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: 'bg-[#4f8ef7]/15', text: 'text-[#4f8ef7]', label: 'Open' },
  closed: { bg: 'bg-[#6b6b80]/15', text: 'text-[#6b6b80]', label: 'Closed' },
  cancelled: { bg: 'bg-[#6b6b80]/10', text: 'text-[#4a4a5a]', label: 'Cancelled' },
  long: { bg: 'bg-[#00d68f]/15', text: 'text-[#00d68f]', label: 'Long' },
  short: { bg: 'bg-[#ff4757]/15', text: 'text-[#ff4757]', label: 'Short' },
  ULTRA_HIGH: { bg: 'bg-[#ff4757]/15', text: 'text-[#ff4757]', label: '🔥 Ultra High' },
  HIGH: { bg: 'bg-[#ffd700]/15', text: 'text-[#ffd700]', label: '⭐ High' },
  MODERATE: { bg: 'bg-[#4f8ef7]/15', text: 'text-[#4f8ef7]', label: '📊 Moderate' },
  auto: { bg: 'bg-[#00d68f]/15', text: 'text-[#00d68f]', label: 'Auto' },
  manual: { bg: 'bg-[#6b6b80]/15', text: 'text-[#6b6b80]', label: 'Manual' },
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || { bg: 'bg-[#2a2a35]', text: 'text-[#6b6b80]', label: status }
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'

  return (
    <span className={`${style.bg} ${style.text} ${sizeClass} rounded-full font-semibold inline-block`}>
      {style.label}
    </span>
  )
}
