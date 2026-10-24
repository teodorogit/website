import { useState } from 'react'
import HeaderComponent from '../components/common/header/login-button'
import FooterNavigation from '../components/common/footer'
import SaleFormModal from '../components/sales/sale-form-modal'
import { productRepository } from '../data/product-repository'
import { salesRepository } from '../data/sales-repository'
import type { Sale } from '../data/sales'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const getToday = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatSaleDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

const SalesPage = () => {
  const [sales, setSales] = useState<Sale[]>(() => salesRepository.list())
  const [products] = useState(() => productRepository.list())
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const orderedSales = [...sales].sort((firstSale, secondSale) => (
    secondSale.date.localeCompare(firstSale.date) || secondSale.time.localeCompare(firstSale.time)
  ))
  const filteredSales = orderedSales.filter((sale) => (
    (!startDate || sale.date >= startDate) && (!endDate || sale.date <= endDate)
  ))

  const handleSave = (sale: Omit<Sale, 'id' | 'time'>) => {
    setSales(editingSale
      ? salesRepository.update(editingSale.id, sale)
      : salesRepository.create(sale))
    setEditingSale(null)
    setIsCreating(false)
  }

  const handleDelete = (sale: Sale) => {
    if (!window.confirm(`Excluir a venda de ${sale.productName}?`)) return
    setSales(salesRepository.remove(sale.id))
  }

  return (
    <main className="app-page sales-page">
      <HeaderComponent title="Vendas" />
      <section className="sales-history-page">
        <div className="sales-page-heading">
          <div>
            <p className="eyebrow">REGISTROS</p>
            <h2>Histórico de vendas</h2>
          </div>
          <button className="button-primary" onClick={() => setIsCreating(true)} type="button">
            Registrar venda
          </button>
        </div>

        <div aria-label="Filtrar vendas por data" className="sales-date-filters">
          <label>
            De
            <input aria-label="Data inicial" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
          </label>
          <label>
            Até
            <input aria-label="Data final" onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
          </label>
          {(startDate || endDate) && (
            <button onClick={() => {
              setStartDate('')
              setEndDate('')
            }} type="button">Limpar filtros</button>
          )}
        </div>

        {filteredSales.length > 0 ? (
          <div className="sales-record-list">
            {filteredSales.map((sale) => (
              <article className="sales-record" key={sale.id}>
                <div className="sales-record-details">
                  <div className="sales-record-title">
                    <h3>{sale.productName}</h3>
                    <span>{sale.quantity} un.</span>
                  </div>
                  <p>{formatSaleDate(sale.date)} · {sale.time}</p>
                  <strong>{currencyFormatter.format(sale.price * sale.quantity)}</strong>
                </div>
                <div className="sales-record-actions">
                  <button onClick={() => setEditingSale(sale)} type="button">Editar</button>
                  <button className="sales-record-delete" onClick={() => handleDelete(sale)} type="button">Excluir</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-sales-records">
            {sales.length ? 'Nenhuma venda encontrada nesse período.' : 'Nenhuma venda registrada.'}
          </p>
        )}
      </section>

      {(isCreating || editingSale) && (
        <SaleFormModal
          defaultDate={getToday()}
          initialSale={editingSale ?? undefined}
          onClose={() => {
            setIsCreating(false)
            setEditingSale(null)
          }}
          onSave={handleSave}
          products={products}
        />
      )}
      <FooterNavigation />
    </main>
  )
}

export default SalesPage