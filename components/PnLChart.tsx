'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { ChartDataPoint } from '@/lib/types'

interface PnLChartProps {
  data: ChartDataPoint[]
  type?: 'daily' | 'cumulative'
  height?: number
}

interface TooltipPayload {
  value: number
  name: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  const value = payload[0].value
  const isPositive = value >= 0

  return (
    <div className="bg-[#1e1e24] border border-[#2a2a35] rounded-xl p-3 shadow-xl">
      <p className="text-xs text-[#6b6b80] mb-1">{label}</p>
      <p className={`font-mono font-bold text-sm ${isPositive ? 'text-[#00d68f]' : 'text-[#ff4757]'}`}>
        {isPositive ? '+' : ''}${value.toFixed(2)}
      </p>
    </div>
  )
}

export function PnLChart({ data, type = 'cumulative', height = 200 }: PnLChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    value: type === 'cumulative' ? d.cumulative : d.pnl,
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  const lastValue = chartData[chartData.length - 1]?.value ?? 0
  const isPositive = lastValue >= 0
  const strokeColor = isPositive ? '#00d68f' : '#ff4757'
  // fillColor used in gradient definition below via strokeColor
  void isPositive

  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-[#6b6b80] text-sm">
        No trade data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <defs>
          <linearGradient id="pnl-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={strokeColor} stopOpacity={0.2} />
            <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#6b6b80', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#6b6b80', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v >= 0 ? '+' : ''}${v.toFixed(0)}`}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#2a2a35" strokeDasharray="3 3" />
        <Area
          type="monotone"
          dataKey="value"
          stroke={strokeColor}
          strokeWidth={2}
          fill="url(#pnl-gradient)"
          dot={false}
          activeDot={{ r: 4, fill: strokeColor, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
