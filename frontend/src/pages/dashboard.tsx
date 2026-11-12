import { useEffect, useState } from 'react'
import HeaderComponent from '../components/common/header/login-button'
import FooterNavigation from '../components/common/footer'
import { errorMessage, useApi } from '../data/api-client'

type WeeklySales = {
  weekStart: string
  weekEnd: string
  total: number
}

type DashboardData = {
  currency: 'BRL'
  salesGoal: number | null
  sold: number
  remaining: number
  weeklySales: WeeklySales[]
  bestWeek: WeeklySales | null
}

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

const localDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

const dateLabelFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })

const DashboardPage = () => {
  const api = useApi()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [weeks, setWeeks] = useState(8)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!api.isReady) return
    let active = true
    api.get<DashboardData>(`/dashboard?weeks=${weeks}`)
      .then((result) => {
        if (active) setDashboard(result)
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [api, weeks])

  const chartData = [
    { name: 'Meta de vendas', value: dashboard?.salesGoal ?? 0 },
    { name: 'Vendido', value: dashboard?.sold ?? 0 },
    { name: 'Falta vender', value: dashboard?.remaining ?? 0 },
  ]
  const hasChartData = chartData.some((item) => item.value > 0)
  const chartMaxValue = Math.max(1, ...chartData.map((item) => item.value))
  const weeklySales = dashboard?.weeklySales ?? []
  const maxWeeklyRevenue = Math.max(0, ...weeklySales.map((week) => week.total))
  const chartMax = maxWeeklyRevenue || 1
  const chartPlot = { left: 94, right: 780, top: 24, bottom: 250 }
  const getPoint = (value: number, index: number) => ({
    x: chartPlot.left + (index * (chartPlot.right - chartPlot.left)) / Math.max(weeklySales.length - 1, 1),
    y: chartPlot.bottom - (value / chartMax) * (chartPlot.bottom - chartPlot.top),
  })
  const linePoints = weeklySales.map((week, index) => {
    const point = getPoint(week.total, index)
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  }).join(' ')
  const peakWeekIndex = dashboard?.bestWeek
    ? weeklySales.findIndex((week) => week.weekStart === dashboard.bestWeek?.weekStart)
    : -1

  return (
    <main className="app-page dashboard-page">
      <HeaderComponent title="Dashboard" />
      {error && <p className="api-error" role="alert">{error}</p>}
      {isLoading ? (
        <p className="page-content">Carregando dashboard...</p>
      ) : dashboard && (
        <>
          <section aria-labelledby="sales-goal-chart-title" className="page-content">
            <p className="eyebrow">DESEMPENHO</p>
            <h2 id="sales-goal-chart-title">Meta de lucro</h2>
            {hasChartData ? (
              <ul aria-label="Comparação da meta de vendas" className="sales-goal-bars">
                {chartData.map((item, index) => (
                  <li className="sales-goal-bar-item" key={item.name}>
                    <div className="sales-goal-bar-heading">
                      <span>{item.name}</span>
                      <strong>{currencyFormatter.format(item.value)}</strong>
                    </div>
                    <div className="sales-goal-bar-track" aria-hidden="true">
                      <span
                        className="sales-goal-bar-fill"
                        style={{
                          width: `${(item.value / chartMaxValue) * 100}%`,
                          backgroundColor: chartColors[index],
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sales-goal-chart-empty">Cadastre uma meta de vendas na tela Home para acompanhar seu progresso.</p>
            )}
          </section>
          <section aria-labelledby="weekly-sales-title" className="page-content weekly-sales-section">
            <div className="weekly-sales-heading">
              <div>
                <p className="eyebrow">EVOLUÇÃO</p>
                <h2 id="weekly-sales-title">Vendas por semana</h2>
              </div>
              <label className="weekly-sales-filter">
                <span>Exibir últimas</span>
                <select
                  aria-label="Período do gráfico de vendas por semana"
                  disabled={isLoading}
                  onChange={(event) => {
                    setIsLoading(true)
                    setError('')
                    setWeeks(Number(event.target.value))
                  }}
                  value={weeks}
                >
                  {[4, 8, 12, 26, 52].map((period) => (
                    <option key={period} value={period}>{period} semanas</option>
                  ))}
                </select>
              </label>
            </div>
            {dashboard.bestWeek ? (
              <p className="weekly-sales-peak">
                Semana com maior venda: <strong>{dateLabelFormatter.format(localDate(dashboard.bestWeek.weekStart))} – {dateLabelFormatter.format(localDate(dashboard.bestWeek.weekEnd))}</strong>
                {' · '}{currencyFormatter.format(dashboard.bestWeek.total)}
              </p>
            ) : (
              <p className="weekly-sales-peak">Ainda não há vendas registradas nas últimas {weeks} semanas.</p>
            )}
            <div className="weekly-sales-chart">
              <svg aria-labelledby="weekly-sales-title weekly-sales-description" role="img" viewBox="0 0 800 320">
                <desc id="weekly-sales-description">Faturamento de cada uma das últimas {weeks} semanas.</desc>
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
                  const weekStart = localDate(week.weekStart)
                  return (
                    <g key={week.weekStart}>
                      <circle className="weekly-sales-point" cx={point.x} cy={point.y} r={peakWeekIndex === index ? 6 : 4} />
                      <title>{`Semana de ${dateLabelFormatter.format(weekStart)}: ${currencyFormatter.format(week.total)}`}</title>
                      <text className="weekly-sales-axis-label weekly-sales-date-label" textAnchor="middle" x={point.x} y={chartPlot.bottom + 28}>
                        {dateLabelFormatter.format(weekStart)}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </section>
        </>
      )}
      <FooterNavigation />
    </main>
  )
}

export default DashboardPage
