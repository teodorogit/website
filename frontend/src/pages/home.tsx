import { getLocalTimeZone, today, CalendarDate } from '@internationalized/date'
import { useUser } from '@clerk/react'
import { useState, type FormEvent } from 'react'
import HeaderComponent from '../components/common/header/login-button'
import SaleCard from '../components/sales/sale-card'
import DailyFinancialSummary from '../components/sales/daily-financial-summary'
import SaleFormModal from '../components/sales/sale-form-modal'
import { salesRepository } from '../data/sales-repository'
import type { Sale } from '../data/sales'
import { productRepository } from '../data/product-repository'
import { salesGoalRepository } from '../data/sales-goal-repository'
import PrimaryActionButton from '../components/common/btn-primary'
import FooterNavigation from '../components/common/footer'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const HomePage = () => {
  const { user } = useUser()
  const [selectedDate, setSelectedDate] = useState<CalendarDate>(() => today(getLocalTimeZone()))
  const [period, setPeriod] = useState<'day' | 'week'>('day')
  const [sales, setSales] = useState<Sale[]>(() => salesRepository.list())
  const [salesGoal, setSalesGoal] = useState<number | null>(() => salesGoalRepository.get())
  const [isRegisteringGoal, setIsRegisteringGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [products] = useState(() => productRepository.list())
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false)
  const selectedJsDate = selectedDate.toDate(getLocalTimeZone())
  const mondayOffset = (selectedJsDate.getDay() + 6) % 7
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(selectedJsDate)
    date.setDate(date.getDate() - mondayOffset + index)
    return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
  })
  const selectedDateString = selectedDate.toString()
  const weekDateStrings = weekDates.map((date) => date.toString())
  const filteredSales = sales.filter((sale) => period === 'day'
    ? sale.date === selectedDateString
    : weekDateStrings.includes(sale.date))
  const dayLabel = period === 'day'
    ? selectedJsDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : `${weekDates[0].toDate(getLocalTimeZone()).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} - ${weekDates[6].toDate(getLocalTimeZone()).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
  const productCosts = new Map(products.map((product) => [
    product.name.trim().toLocaleLowerCase(),
    product.preparationCost,
  ]))
  const dailyRevenue = filteredSales.reduce((total, sale) => total + sale.price * sale.quantity, 0)
  const dailyPreparationCost = filteredSales.reduce((total, sale) => (
    total + (productCosts.get(sale.productName.trim().toLocaleLowerCase()) ?? 0) * sale.quantity
  ), 0)
  const dailyProfit = dailyRevenue - dailyPreparationCost
  const greetingName = user?.firstName ?? user?.username ?? 'there'
  const weekdayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  const handleSaveSale = (sale: Omit<Sale, 'id' | 'time'>) => {
    setSales(salesRepository.create(sale))
    setIsSaleModalOpen(false)
  }
  const handleSaveGoal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const goal = Number(goalDraft)
    if (!Number.isFinite(goal) || goal <= 0) return
    setSalesGoal(salesGoalRepository.save(goal))
    setGoalDraft('')
    setIsRegisteringGoal(false)
  }

  return (
    <main className="app-page sales-page">
      <HeaderComponent title="Home" />
      <section className="sales-dashboard">
        <div className="dashboard-intro">
          <h2>Welcome back {greetingName},</h2>
          {salesGoal === null ? (
            <div className="sales-goal-registration">
              {!isRegisteringGoal ? (
                <button className="sales-goal-register-button" onClick={() => setIsRegisteringGoal(true)} type="button">
                  Cadastrar meta de vendas
                </button>
              ) : (
                <form className="sales-goal-form" onSubmit={handleSaveGoal}>
                  <label htmlFor="sales-goal-input">Meta de vendas</label>
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
                    <button className="sales-goal-save-button" type="submit">Salvar</button>
                    <button className="sales-goal-cancel-button" onClick={() => setIsRegisteringGoal(false)} type="button">Cancelar</button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <p className="sales-goal-badge">Meta de vendas: {currencyFormatter.format(salesGoal)}</p>
          )}
        </div>

        <section aria-label="Selecionar período e dia" className="date-selector">
          <div className="period-switch" aria-label="Período do histórico">
            <button aria-pressed={period === 'day'} className={period === 'day' ? 'is-selected' : ''} onClick={() => setPeriod('day')} type="button">Dia</button>
            <button aria-pressed={period === 'week'} className={period === 'week' ? 'is-selected' : ''} onClick={() => setPeriod('week')} type="button">Semana</button>
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

        <section aria-labelledby="sales-history-heading" className="sales-history">
          <div className="sales-history-heading">
            <div>
              <p className="eyebrow">Histórico de vendas</p>
              <h3 id="sales-history-heading">{dayLabel}</h3>
            </div>
            <div className="daily-total">
              <span>Total</span>
              <strong>R$ {dailyRevenue.toFixed(2)}</strong>
            </div>
          </div>
          {filteredSales.length > 0 ? (
            <div className="sales-list">
              {filteredSales.map((sale) => <SaleCard key={sale.id} sale={sale} />)}
            </div>
          ) : (
            <p className="empty-sales">Nenhuma venda registrada neste período.</p>
          )}
        </section>
      </section>
      <PrimaryActionButton onClick={() => setIsSaleModalOpen(true)} />
      {isSaleModalOpen && (
        <SaleFormModal
          defaultDate={selectedDateString}
          onClose={() => setIsSaleModalOpen(false)}
          onSave={handleSaveSale}
          products={products}
        />
      )}
      <FooterNavigation />
    </main>
  )
}

export default HomePage
