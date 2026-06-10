'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { Trade } from '@/lib/types'

interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface LiveChartData {
  candles: Candle[]
  indicators: {
    ema9: (number | null)[]
    ema21: (number | null)[]
    ema50: (number | null)[]
    rsi: (number | null)[]
    macd: (number | null)[]
    macdSignal: (number | null)[]
    macdHist: (number | null)[]
  }
  trades: {
    open: Trade[]
    closed: Trade[]
  }
}

interface LiveChartProps {
  pair: string
  timeframe: string
}

const PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'LTC/USDT', 'ADA/USDT', 'AVAX/USDT', 'LINK/USDT']
const TIMEFRAMES = ['15m', '1h', '4h', '1d']

export function LiveChart({ pair: initialPair, timeframe: initialTimeframe }: LiveChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<unknown>(null)
  const [pair, setPair] = useState(initialPair)
  const [timeframe, setTimeframe] = useState(initialTimeframe)
  const [data, setData] = useState<LiveChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastPrice, setLastPrice] = useState<number | null>(null)
  const [priceChange, setPriceChange] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/chart/live?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setData(json.data)
      const candles: Candle[] = json.data.candles
      if (candles.length >= 2) {
        const last = candles[candles.length - 1].close
        const prev = candles[candles.length - 2].close
        setLastPrice(last)
        setPriceChange(((last - prev) / prev) * 100)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chart')
    } finally {
      setLoading(false)
    }
  }, [pair, timeframe])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Build chart when data changes
  useEffect(() => {
    if (!data || !chartRef.current) return

    // Destroy previous chart
    if (chartInstanceRef.current) {
      ;(chartInstanceRef.current as { remove: () => void }).remove()
      chartInstanceRef.current = null
    }

    let chart: ReturnType<typeof import('lightweight-charts')['createChart']>

    import('lightweight-charts').then(({ createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers }) => {
      if (!chartRef.current) return

      chart = createChart(chartRef.current, {
        layout: {
          background: { color: '#0d0d0f' },
          textColor: '#6b6b80',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#1e1e2a' },
          horzLines: { color: '#1e1e2a' },
        },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: '#2a2a35' },
        timeScale: {
          borderColor: '#2a2a35',
          timeVisible: true,
          secondsVisible: false,
        },
        width: chartRef.current.clientWidth,
        height: chartRef.current.clientHeight,
      })

      chartInstanceRef.current = chart

      // ── Candlesticks (pane 0)
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#00d68f',
        downColor: '#ff4757',
        borderUpColor: '#00d68f',
        borderDownColor: '#ff4757',
        wickUpColor: '#00d68f',
        wickDownColor: '#ff4757',
      }, 0)

      const candleData = data.candles.map((c) => ({
        time: Math.floor(c.timestamp / 1000) as unknown as import('lightweight-charts').UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      candleSeries.setData(candleData)

      // ── EMA lines (pane 0)
      const ema9Series = chart.addSeries(LineSeries, {
        color: '#ff9f43',
        lineWidth: 1,
        title: 'EMA9',
        priceLineVisible: false,
        lastValueVisible: false,
      }, 0)
      const ema21Series = chart.addSeries(LineSeries, {
        color: '#4f8ef7',
        lineWidth: 1,
        title: 'EMA21',
        priceLineVisible: false,
        lastValueVisible: false,
      }, 0)
      const ema50Series = chart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 1,
        title: 'EMA50',
        priceLineVisible: false,
        lastValueVisible: false,
      }, 0)

      function buildLineData(arr: (number | null)[]) {
        return data!.candles
          .map((c, i) => arr[i] !== null ? {
            time: Math.floor(c.timestamp / 1000) as unknown as import('lightweight-charts').UTCTimestamp,
            value: arr[i] as number,
          } : null)
          .filter(Boolean) as { time: import('lightweight-charts').UTCTimestamp; value: number }[]
      }

      ema9Series.setData(buildLineData(data.indicators.ema9))
      ema21Series.setData(buildLineData(data.indicators.ema21))
      ema50Series.setData(buildLineData(data.indicators.ema50))

      // ── Trade markers on candlestick series
      const markers: import('lightweight-charts').SeriesMarker<import('lightweight-charts').UTCTimestamp>[] = []

      // Closed trades
      for (const trade of data.trades.closed) {
        const entryTime = Math.floor(new Date(trade.openedAt).getTime() / 1000) as unknown as import('lightweight-charts').UTCTimestamp
        markers.push({
          time: entryTime,
          position: trade.direction === 'long' ? 'belowBar' : 'aboveBar',
          color: trade.direction === 'long' ? '#00d68f' : '#ff4757',
          shape: trade.direction === 'long' ? 'arrowUp' : 'arrowDown',
          text: `${trade.direction === 'long' ? '▲' : '▼'} $${trade.entryPrice.toFixed(2)}`,
        })
        if (trade.closedAt && trade.exitPrice) {
          const exitTime = Math.floor(new Date(trade.closedAt).getTime() / 1000) as unknown as import('lightweight-charts').UTCTimestamp
          markers.push({
            time: exitTime,
            position: trade.direction === 'long' ? 'aboveBar' : 'belowBar',
            color: (trade.pnlUsd ?? 0) >= 0 ? '#00d68f' : '#ff4757',
            shape: 'circle',
            text: `✕ ${(trade.pnlUsd ?? 0) >= 0 ? '+' : ''}$${(trade.pnlUsd ?? 0).toFixed(2)}`,
          })
        }
      }

      // Open trades
      for (const trade of data.trades.open) {
        const entryTime = Math.floor(new Date(trade.openedAt).getTime() / 1000) as unknown as import('lightweight-charts').UTCTimestamp
        markers.push({
          time: entryTime,
          position: trade.direction === 'long' ? 'belowBar' : 'aboveBar',
          color: '#ffd700',
          shape: trade.direction === 'long' ? 'arrowUp' : 'arrowDown',
          text: `● OPEN $${trade.entryPrice.toFixed(2)}`,
        })
      }

      markers.sort((a, b) => (a.time as number) - (b.time as number))
      if (markers.length > 0) createSeriesMarkers(candleSeries, markers)

      // Open trade TP/SL price lines
      for (const trade of data.trades.open) {
        candleSeries.createPriceLine({ price: trade.slPrice, color: '#ff4757', lineWidth: 1, lineStyle: 2, title: 'SL' })
        candleSeries.createPriceLine({ price: trade.tp1Price, color: '#00d68f', lineWidth: 1, lineStyle: 2, title: 'TP1' })
        candleSeries.createPriceLine({ price: trade.tp2Price, color: '#00d68f', lineWidth: 1, lineStyle: 2, title: 'TP2' })
        candleSeries.createPriceLine({ price: trade.entryPrice, color: '#ffd700', lineWidth: 1, lineStyle: 1, title: 'Entry' })
      }

      // ── Volume (pane 1)
      chart.addPane()
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      }, 1)
      chart.priceScale('vol', 1).applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } })
      volumeSeries.setData(data.candles.map((c) => ({
        time: Math.floor(c.timestamp / 1000) as unknown as import('lightweight-charts').UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? '#00d68f40' : '#ff475740',
      })))

      // ── RSI (pane 2)
      chart.addPane()
      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#ffd700',
        lineWidth: 1,
        title: 'RSI',
        priceScaleId: 'rsi',
      }, 2)
      chart.priceScale('rsi', 2).applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 }, autoScale: true })
      rsiSeries.setData(buildLineData(data.indicators.rsi))
      rsiSeries.createPriceLine({ price: 70, color: '#ff475760', lineWidth: 1, lineStyle: 2, title: '' })
      rsiSeries.createPriceLine({ price: 30, color: '#00d68f60', lineWidth: 1, lineStyle: 2, title: '' })

      // ── MACD (pane 3)
      chart.addPane()
      const macdSeries = chart.addSeries(LineSeries, {
        color: '#4f8ef7',
        lineWidth: 1,
        title: 'MACD',
        priceScaleId: 'macd',
      }, 3)
      const macdSignalSeries = chart.addSeries(LineSeries, {
        color: '#ff9f43',
        lineWidth: 1,
        title: 'Signal',
        priceScaleId: 'macd',
      }, 3)
      const macdHistSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'macd',
      }, 3)

      macdSeries.setData(buildLineData(data.indicators.macd))
      macdSignalSeries.setData(buildLineData(data.indicators.macdSignal))
      macdHistSeries.setData(
        data.candles
          .map((c, i) => data.indicators.macdHist[i] !== null ? {
            time: Math.floor(c.timestamp / 1000) as unknown as import('lightweight-charts').UTCTimestamp,
            value: data.indicators.macdHist[i] as number,
            color: (data.indicators.macdHist[i] as number) >= 0 ? '#00d68f60' : '#ff475760',
          } : null)
          .filter(Boolean) as { time: import('lightweight-charts').UTCTimestamp; value: number; color: string }[]
      )

      chart.timeScale().fitContent()

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (chartRef.current && chart) {
          chart.applyOptions({ width: chartRef.current.clientWidth })
        }
      })
      if (chartRef.current) ro.observe(chartRef.current)
    })

    return () => {
      if (chart) chart.remove()
      chartInstanceRef.current = null
    }
  }, [data])

  return (
    <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#2a2a35] flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#e8e8f0] text-lg">{pair.replace('/', '/')}</span>
              {lastPrice !== null && (
                <span className="font-mono text-[#e8e8f0] text-sm">${lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
              )}
              {priceChange !== null && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${priceChange >= 0 ? 'text-[#00d68f] bg-[#00d68f]/10' : 'text-[#ff4757] bg-[#ff4757]/10'}`}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                </span>
              )}
            </div>
            <div className="flex gap-2 mt-0.5">
              <span className="text-[10px] text-[#4a4a5a]"><span className="text-[#ff9f43]">─</span> EMA9</span>
              <span className="text-[10px] text-[#4a4a5a]"><span className="text-[#4f8ef7]">─</span> EMA21</span>
              <span className="text-[10px] text-[#4a4a5a]"><span className="text-[#a855f7]">─</span> EMA50</span>
              {data?.trades.open && data.trades.open.length > 0 && (
                <span className="text-[10px] text-[#ffd700]">● {data.trades.open.length} open position{data.trades.open.length > 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>

        {/* Pair selector */}
        <div className="flex flex-wrap gap-1">
          {PAIRS.map((p) => (
            <button
              key={p}
              onClick={() => setPair(p)}
              className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors ${
                pair === p ? 'bg-[#4f8ef7]/20 text-[#4f8ef7]' : 'text-[#6b6b80] hover:text-[#e8e8f0]'
              }`}
            >
              {p.replace('/USDT', '')}
            </button>
          ))}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                timeframe === tf ? 'bg-[#2a2a35] text-[#e8e8f0]' : 'text-[#6b6b80] hover:text-[#e8e8f0]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="p-1.5 rounded-lg text-[#6b6b80] hover:text-[#e8e8f0] hover:bg-[#2a2a35] transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
            <polyline points="1 4 1 10 7 10" />
            <polyline points="23 20 23 14 17 14" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
        </button>
      </div>

      {/* Chart area */}
      <div className="relative" style={{ height: 560 }}>
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[#ff4757] text-sm">{error}</p>
              <button onClick={fetchData} className="mt-2 text-xs text-[#4f8ef7] hover:underline">Retry</button>
            </div>
          </div>
        ) : loading && !data ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-[#4f8ef7] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-[#6b6b80] text-sm">Loading chart…</p>
            </div>
          </div>
        ) : null}
        <div ref={chartRef} className="w-full h-full" />
      </div>

      {/* Legend */}
      <div className="px-5 py-2.5 border-t border-[#2a2a35] flex flex-wrap gap-4 text-[10px] text-[#4a4a5a]">
        <span><span className="text-[#00d68f]">▲</span> Long entry</span>
        <span><span className="text-[#ff4757]">▼</span> Short entry</span>
        <span><span className="text-[#ffd700]">●</span> Open position</span>
        <span><span className="text-[#6b6b80]">✕</span> Closed (P&L shown)</span>
        <span className="ml-auto text-[#2a2a35]">RSI 70/30 · TP/SL lines shown for open trades</span>
      </div>
    </div>
  )
}
