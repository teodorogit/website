type DailyFinancialSummaryProps = {
  period: 'day' | 'week'
  revenue: number
  profit: number
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const DailyFinancialSummary = ({ period, revenue, profit }: DailyFinancialSummaryProps) => (
  <section aria-label="Resumo financeiro" className="daily-financial-summary">
    <div className="daily-financial-metric">
      <span className="daily-financial-label">
        Faturamento {period === 'day' ? 'do dia' : 'da semana'}
      </span>
      <strong className="daily-financial-value">{currencyFormatter.format(revenue)}</strong>
    </div>
    <div className="daily-financial-metric">
      <span className="daily-financial-label">
        Lucro {period === 'day' ? 'do dia' : 'da semana'}
      </span>
      <strong className="daily-financial-value">{currencyFormatter.format(profit)}</strong>
    </div>
  </section>
)

export default DailyFinancialSummary