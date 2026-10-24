import { useState } from 'react'
import HeaderComponent from '../components/common/header/login-button'
import FooterNavigation from '../components/common/footer'
import { salesGoalRepository } from '../data/sales-goal-repository'
import { salesRepository } from '../data/sales-repository'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const chartColors = ['#3478c8', '#2e9b62', '#e7b832']

const weeklyRevenueFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const getMonday = (date: Date) => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}

const toDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const DashboardPage = () => {
  const [salesGoal] = useState(() => salesGoalRepository.get())
  const [sales] = useState(() => salesRepository.list())
  const sold = sales.reduce((total, sale) => total + sale.price * sale.quantity, 0)
  const remaining = salesGoal === null ? 0 : Math.max(0, salesGoal - sold)
  const chartData = [
    { name: 'Meta de vendas', value: salesGoal ?? 0 },
    { name: 'Vendido', value: sold },
    { name: 'Falta vender', value: remaining },
  ]
  const hasChartData = chartData.some((item) => item.value > 0)
  const chartTotal = chartData.reduce((total, item) => total + item.value, 0)
  const goalStop = chartTotal ? (chartData[0].value / chartTotal) * 100 : 0
  const soldStop = chartTotal ? goalStop + (chartData[1].value / chartTotal) * 100 : 0
  const chartBackground = `conic-gradient(${chartColors[0]} 0% ${goalStop}%, ${chartColors[1]} ${goalStop}% ${soldStop}%, ${chartColors[2]} ${soldStop}% 100%)`
  const currentMonday = getMonday(new Date())
  const weeklySales = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(currentMonday)
    start.setDate(start.getDate() - (7 - index) * 7)
    return { start, total: 0 }
  })
  const weekTotals = new Map(weeklySales.map((week) => [toDateKey(week.start), week]))

  sales.forEach((sale) => {
    const [year, month, day] = sale.date.split('-').map(Number)
    const saleDate = new Date(year!, month! - 1, day!)
    if (Number.isNaN(saleDate.getTime())) return
    const week = weekTotals.get(toDateKey(getMonday(saleDate)))
    if (week) week.total += sale.price * sale.quantity
  })

  const maxWeeklyRevenue = Math.max(...weeklySales.map((week) => week.total))
  const chartMax = maxWeeklyRevenue || 1
  const chartPlot = { left: 94, right: 780, top: 24, bottom: 250 }
  const getPoint = (value: number, index: number) => ({
    x: chartPlot.left + (index * (chartPlot.right - chartPlot.left)) / (weeklySales.length - 1),
    y: chartPlot.bottom - (value / chartMax) * (chartPlot.bottom - chartPlot.top),
  })
  const linePoints = weeklySales.map((week, index) => {
    const point = getPoint(week.total, index)
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  }).join(' ')
  const peakWeekIndex = weeklySales.findIndex((week) => week.total === maxWeeklyRevenue)
  const peakWeek = weeklySales[peakWeekIndex]
  const dateLabelFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })

  return (
    <main className="app-page dashboard-page">
      <HeaderComponent title="Dashboard" />
      <section aria-labelledby="sales-goal-chart-title" className="page-content">
        <p className="eyebrow">DESEMPENHO</p>
        <h2 id="sales-goal-chart-title">Meta de vendas</h2>
        <div className="sales-goal-chart">
          {hasChartData ? (
            <div
              aria-label={chartData.map((item) => `${item.name}: ${currencyFormatter.format(item.value)}`).join(', ')}
              className="sales-goal-chart-ring"
              role="img"
              style={{ background: chartBackground }}
            >
              <span>Total representado</span>
            </div>
          ) : (
            <p className="sales-goal-chart-empty">Cadastre uma meta de vendas na tela Home para acompanhar seu progresso.</p>
          )}
        </div>
        <ul aria-label="Valores da meta de vendas" className="sales-goal-legend">
          {chartData.map((item, index) => (
            <li key={item.name}>
              <span aria-hidden="true" className="sales-goal-legend-swatch" style={{ backgroundColor: chartColors[index] }} />
              <span>{item.name}</span>
              <strong>{currencyFormatter.format(item.value)}</strong>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="weekly-sales-title" className="page-content weekly-sales-section">
        <p className="eyebrow">EVOLUÇÃO</p>
        <h2 id="weekly-sales-title">Vendas por semana</h2>
        {maxWeeklyRevenue > 0 && peakWeek ? (
          <p className="weekly-sales-peak">
            Semana com maior venda: <strong>{dateLabelFormatter.format(peakWeek.start)} – {dateLabelFormatter.format(new Date(peakWeek.start.getFullYear(), peakWeek.start.getMonth(), peakWeek.start.getDate() + 6))}</strong>
            {' · '}{currencyFormatter.format(peakWeek.total)}
          </p>
        ) : (
          <p className="weekly-sales-peak">Ainda não há vendas registradas nas últimas 8 semanas.</p>
        )}
        <div className="weekly-sales-chart">
          <svg aria-labelledby="weekly-sales-title weekly-sales-description" role="img" viewBox="0 0 800 320">
            <desc id="weekly-sales-description">Faturamento de cada uma das últimas oito semanas.</desc>
            {[0, 1, 2, 3].map((tick) => {
              const value = (chartMax * tick) / 3
              const y = chartPlot.bottom - (tick * (chartPlot.bottom - chartPlot.top)) / 3
              return (
                <g key={tick}>
                  <line className="weekly-sales-gridline" x1={chartPlot.left} x2={chartPlot.right} y1={y} y2={y} />
                  <text className="weekly-sales-axis-label" textAnchor="end" x={chartPlot.left - 12} y={y + 4}>
                    {weeklyRevenueFormatter.format(value)}
                  </text>
                </g>
              )
            })}
            <path className="weekly-sales-line" d={linePoints} />
            {weeklySales.map((week, index) => {
              const point = getPoint(week.total, index)
              return (
                <g key={toDateKey(week.start)}>
                  <circle className="weekly-sales-point" cx={point.x} cy={point.y} r={peakWeekIndex === index ? 6 : 4} />
                  <title>{`Semana de ${dateLabelFormatter.format(week.start)}: ${currencyFormatter.format(week.total)}`}</title>
                  <text className="weekly-sales-axis-label weekly-sales-date-label" textAnchor="middle" x={point.x} y={chartPlot.bottom + 28}>
                    {dateLabelFormatter.format(week.start)}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </section>
      <FooterNavigation />
    </main>
  )
}

export default DashboardPage