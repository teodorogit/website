import { getLocalTimeZone, today, CalendarDate } from '@internationalized/date'
import { useUser } from '@clerk/react'
import { useEffect, useState, type FormEvent } from 'react'
import HeaderComponent from '../components/common/header/login-button'
import SaleCard from '../components/sales/sale-card'
import DailyFinancialSummary from '../components/sales/daily-financial-summary'
import SaleFormModal from '../components/sales/sale-form-modal'
import { salesRepository } from '../data/sales-repository'
import type { Sale } from '../data/sales'
import { productRepository } from '../data/product-repository'
import { salesGoalRepository } from '../data/sales-goal-repository'
import { errorMessage, useApi } from '../data/api-client'
import PrimaryActionButton from '../components/common/btn-primary'
import FooterNavigation from '../components/common/footer'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

type WeeklySalesData = {
  range: string
  sales: Sale[]
}

const HomePage = () => {
  const { user } = useUser()
  const api = useApi()
  const [selectedDate, setSelectedDate] = useState<CalendarDate>(() => today(getLocalTimeZone()))
  const [period, setPeriod] = useState<'day' | 'week'>('day')
  const [sales, setSales] = useState<Sale[]>([])
  const [weeklySalesData, setWeeklySalesData] = useState<WeeklySalesData | null>(null)
  const [salesGoal, setSalesGoal] = useState<number | null>(null)
  const [isRegisteringGoal, setIsRegisteringGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [isSavingGoal, setIsSavingGoal] = useState(false)
  const [products, setProducts] = useState<Awaited<ReturnType<typeof productRepository.list>>>([])
  const [productsStatus, setProductsStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false)
  const [isGoalLoaded, setIsGoalLoaded] = useState(false)
  const [isSalesLoading, setIsSalesLoading] = useState(true)
  const [salesRevision, setSalesRevision] = useState(0)
  const [error, setError] = useState('')
  const selectedJsDate = selectedDate.toDate(getLocalTimeZone())
  const mondayOffset = (selectedJsDate.getDay() + 6) % 7
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(selectedJsDate)
    date.setDate(date.getDate() - mondayOffset + index)
    return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
  })
  const selectedDateString = selectedDate.toString()
  const weekDateStrings = weekDates.map((date) => date.toString())
  const weekStart = weekDateStrings[0]!
  const weekEnd = weekDateStrings[6]!
  const weekRange = `${weekStart}:${weekEnd}`
  const weeklySales = weeklySalesData?.range === weekRange ? weeklySalesData.sales : null
  const filteredSales = sales
  const dayLabel = period === 'day'
    ? selectedJsDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : `${weekDates[0].toDate(getLocalTimeZone()).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} - ${weekDates[6].toDate(getLocalTimeZone()).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
  const productCosts = new Map(products.map((product) => [product.id, product.preparationCost]))
  const dailyRevenue = filteredSales.reduce((total, sale) => total + sale.price * sale.quantity, 0)
  const weeklyProfit = (weeklySales ?? []).reduce((total, sale) => (
    total + sale.price * sale.quantity
      - (sale.productId ? (productCosts.get(sale.productId) ?? 0) * sale.quantity : 0)
  ), 0)
  const dailyPreparationCost = filteredSales.reduce((total, sale) => (
    total + (sale.productId ? (productCosts.get(sale.productId) ?? 0) * sale.quantity : 0)
  ), 0)
  const dailyProfit = dailyRevenue - dailyPreparationCost
  const greetingName = user?.firstName ?? user?.username ?? ''
  const weekdayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  useEffect(() => {
    if (!api.isReady) return
    let active = true
    productRepository.list(api)
      .then((loadedProducts) => {
        if (!active) return
        setProducts(loadedProducts)
        setProductsStatus('loaded')
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setProductsStatus('error')
        setError(errorMessage(loadError))
      })
    return () => { active = false }
  }, [api])

  useEffect(() => {
    if (!api.isReady) return
    let active = true
    salesGoalRepository.get(api)
      .then((goal) => {
        if (!active) return
        setSalesGoal(goal.amount)
        setIsGoalLoaded(true)
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError))
      })
    return () => { active = false }
  }, [api])

  useEffect(() => {
    if (!api.isReady) return
    let active = true
    salesRepository.list(api, { startDate: weekStart, endDate: weekEnd })
      .then((page) => {
        if (!active) return
        setWeeklySalesData({ range: weekRange, sales: page.items })
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError))
      })
    return () => { active = false }
  }, [api, weekRange, weekStart, weekEnd, salesRevision])

  useEffect(() => {
    if (!api.isReady) return
    let active = true
    const filters = period === 'day'
      ? { date: selectedDateString }
      : { startDate: weekStart, endDate: weekEnd }
    salesRepository.list(api, filters)
      .then((page) => {
        if (active) setSales(page.items)
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (active) setIsSalesLoading(false)
      })
    return () => { active = false }
  }, [api, period, selectedDateString, weekStart, weekEnd])

  const handleSaveSale = async (sale: Omit<Sale, 'id' | 'time'>) => {
    const created = await salesRepository.create(api, sale)
    setSales((currentSales) => [...currentSales, created])
    setWeeklySalesData((currentData) => currentData?.range === weekRange
      ? { range: weekRange, sales: [...currentData.sales, created] }
      : currentData)
    setSalesRevision((revision) => revision + 1)
    setIsSaleModalOpen(false)
  }

  const handleSaveGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const goal = Number(goalDraft)
    if (!Number.isFinite(goal) || goal <= 0) return
    setIsSavingGoal(true)
    try {
      const savedGoal = await salesGoalRepository.save(api, goal)
      setSalesGoal(savedGoal.amount)
      setGoalDraft('')
      setIsRegisteringGoal(false)
      setError('')
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setIsSavingGoal(false)
    }
  }

  const startEditingGoal = () => {
    setGoalDraft(salesGoal?.toFixed(2) ?? '')
    setIsRegisteringGoal(true)
  }

  return (
    <main className="app-page sales-page">
      <HeaderComponent title="Home" />
      {error && <p className="api-error" role="alert">{error}</p>}
      <div className="home-layout">
        <section className="sales-dashboard">
          <div className="dashboard-intro">
            <h2>{greetingName ? `Bem-vindo de volta, ${greetingName}` : 'Visão geral das vendas'}</h2>
            {(isGoalLoaded || salesGoal !== null) && (
              <section aria-label="Meta de lucro semanal" className="home-goal-card">
                <div className="home-goal-card-header">
                  <div>
                    <p className="eyebrow">PLANEJAMENTO</p>
                    <h3>Meta de lucro semanal</h3>
                  </div>
                  {salesGoal !== null && !isRegisteringGoal && (
                    <button className="sales-goal-register-button" onClick={startEditingGoal} type="button">
                      Alterar meta
                    </button>
                  )}
                </div>
                {isRegisteringGoal ? (
                  <form className="sales-goal-form" onSubmit={handleSaveGoal}>
                    <label htmlFor="sales-goal-input">Valor da meta</label>
                    <div className="sales-goal-form-controls">
                      <input
                        autoFocus
                        id="sales-goal-input"
                        min="0.01"
                        onChange={(event) => setGoalDraft(event.target.value)}
                        placeholder="R$ 0,00"
                        required
                        step="0.01"
                        type="number"
                        value={goalDraft}
                      />
                      <button className="sales-goal-save-button" disabled={isSavingGoal} type="submit">
                        {isSavingGoal ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button className="sales-goal-cancel-button" disabled={isSavingGoal} onClick={() => {
                        setIsRegisteringGoal(false)
                        setGoalDraft('')
                      }} type="button">Cancelar</button>
                    </div>
                  </form>
                ) : salesGoal === null ? (
                  <div className="home-goal-empty">
                    <p>Defina quanto deseja lucrar nesta semana.</p>
                    <button className="sales-goal-register-button" onClick={startEditingGoal} type="button">
                      Cadastrar meta de lucro
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="sales-goal-badge">{currencyFormatter.format(salesGoal)}</p>
                    {weeklySales === null ? (
                      <p className="sales-goal-progress-loading">Atualizando progresso...</p>
                    ) : (
                      <div className="sales-goal-progress">
                        <div className="sales-goal-progress-heading">
                          <span>Lucro nesta semana</span>
                          <strong>
                            {currencyFormatter.format(weeklyProfit)} / {currencyFormatter.format(salesGoal)}
                          </strong>
                        </div>
                        <div
                          aria-label="Progresso da meta semanal"
                          aria-valuemax={salesGoal}
                          aria-valuemin={0}
                          aria-valuenow={Math.min(Math.max(weeklyProfit, 0), salesGoal)}
                          className="sales-goal-progress-track"
                          role="progressbar"
                        >
                          <span
                            className="sales-goal-progress-fill"
                            style={{
                              width: `${Math.min(Math.max((weeklyProfit / salesGoal) * 100, 0), 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </div>

          <section aria-label="Selecionar período e dia" className="date-selector">
            <div className="date-selector-heading">
              <p className="eyebrow">ACOMPANHAMENTO</p>
              <p className="date-selector-hint">Clique em um dia para filtrar o histórico de vendas.</p>
            </div>
            <div className="period-switch" aria-label="Período do histórico">
              <button aria-pressed={period === 'day'} className={period === 'day' ? 'is-selected' : ''} onClick={() => {
                setIsSalesLoading(true)
                setPeriod('day')
              }} type="button">Dia</button>
              <button aria-pressed={period === 'week'} className={period === 'week' ? 'is-selected' : ''} onClick={() => {
                setIsSalesLoading(true)
                setPeriod('week')
              }} type="button">Semana</button>
            </div>
            <div className="date-strip">
              {weekDates.map((date, index) => {
                const isSelected = date.compare(selectedDate) === 0
                return (
                  <button
                    aria-label={`${weekdayLabels[index]}, ${date.day}`}
                    aria-pressed={isSelected}
                    className={`date-tile${isSelected ? ' is-selected' : ''}`}
                    key={date.toString()}
                    onClick={() => {
                      setIsSalesLoading(true)
                      setSelectedDate(date)
                      setPeriod('day')
                    }}
                    type="button"
                  >
                    <span>{weekdayLabels[index]}</span>
                    <strong>{date.day}</strong>
                  </button>
                )
              })}
            </div>
          </section>

          <DailyFinancialSummary period={period} revenue={dailyRevenue} profit={dailyProfit} />
        </section>

        <aside aria-label="Histórico de vendas" className="sales-history-aside">
          <section aria-labelledby="sales-history-heading" className="sales-history">
            <div className="sales-history-heading">
              <div>
                <p className="eyebrow">Histórico de vendas</p>
                <h3 id="sales-history-heading">{dayLabel}</h3>
              </div>
              <div className="daily-total">
                <span>Total</span>
                <strong>{currencyFormatter.format(dailyRevenue)}</strong>
              </div>
            </div>
            {isSalesLoading ? (
              <p className="empty-sales">Carregando vendas...</p>
            ) : filteredSales.length > 0 ? (
              <div className="sales-list">
                {filteredSales.map((sale) => <SaleCard key={sale.id} sale={sale} />)}
              </div>
            ) : (
              <p className="empty-sales">Nenhuma venda registrada neste período.</p>
            )}
          </section>
        </aside>
      </div>
      <PrimaryActionButton onClick={() => setIsSaleModalOpen(true)} />
      {isSaleModalOpen && (
        <SaleFormModal
          defaultDate={selectedDateString}
          onClose={() => setIsSaleModalOpen(false)}
          onSave={handleSaveSale}
          products={products}
          productsStatus={productsStatus}
        />
      )}
      <FooterNavigation />
    </main>
  )
}

export default HomePage
