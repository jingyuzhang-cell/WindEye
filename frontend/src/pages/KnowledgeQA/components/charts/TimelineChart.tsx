import React from 'react'
import ReactECharts from 'echarts-for-react'

interface TimelineEvent {
  date: string
  count: number
  type?: string
  label?: string
}

interface TimelineChartProps {
  events: TimelineEvent[]
  onEventClick?: (date: string) => void
}

const TimelineChart: React.FC<TimelineChartProps> = ({ events, onEventClick }) => {
  if (!events || events.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>
        No timeline data available
      </div>
    )
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Group by type for multi-series
  const typeSet = new Set<string>()
  for (const e of sorted) {
    if (e.type) typeSet.add(e.type)
  }

  const dates = sorted.map((e) => e.date)

  const series =
    typeSet.size > 0
      ? Array.from(typeSet).map((t) => ({
          name: t,
          type: 'line' as const,
          smooth: true,
          symbol: 'circle' as const,
          symbolSize: 6,
          lineStyle: { width: 2 },
          data: sorted.map((e) => (e.type === t ? e.count : null)),
        }))
      : [
          {
            name: 'Events',
            type: 'line' as const,
            smooth: true,
            symbol: 'circle' as const,
            symbolSize: 6,
            lineStyle: { width: 2, color: '#2855D1' },
            itemStyle: { color: '#2855D1' },
            areaStyle: {
              color: {
                type: 'linear' as const,
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(40, 85, 209, 0.2)' },
                  { offset: 1, color: 'rgba(40, 85, 209, 0.02)' },
                ],
              },
            },
            data: sorted.map((e) => e.count),
          },
        ]

  const option = {
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params]
        let html = `<strong>${items[0]?.axisValue || ''}</strong><br/>`
        for (const p of items) {
          if (p.value !== null && p.value !== undefined) {
            html += `${p.marker} ${p.seriesName}: ${p.value}<br/>`
          }
        }
        return html
      },
    },
    legend:
      typeSet.size > 0
        ? { bottom: 0, textStyle: { fontSize: 10 } }
        : undefined,
    grid: {
      left: 40,
      right: 16,
      top: 12,
      bottom: typeSet.size > 0 ? 30 : 16,
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      data: dates,
      axisLabel: { fontSize: 10, color: '#94a3b8', rotate: dates.length > 8 ? 30 : 0 },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series,
  }

  const handleClick = (params: any) => {
    if (onEventClick && params.name) {
      onEventClick(params.name)
    }
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: '100%', width: '100%' }}
      onEvents={{ click: handleClick }}
    />
  )
}

export default TimelineChart
