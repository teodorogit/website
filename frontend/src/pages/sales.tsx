import { useEffect, useState } from 'react'
import HeaderComponent from '../components/common/header/login-button'
import FooterNavigation from '../components/common/footer'
import SaleFormModal from '../components/sales/sale-form-modal'
import { productRepository, type Product } from '../data/product-repository'
import { salesRepository } from '../data/sales-repository'
import type { Sale } from '../data/sales'
import { errorMessage, useApi } from '../data/api-client'

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
  return new Date(year!, month! - 1, day!).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

const SalesPage = () => {
  const api = useApi()
  const [sales, setSales] = useState<Sale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [revision, setRevision] = useState(0)
  const [isLoadingSales, setIsLoadingSales] = useState(true)
  const [productsStatus, setProductsStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')

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
    salesRepository.list(api, {
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      limit: 100,
    })
      .then((page) => {
        if (!active) return
        setSales(page.items)
        setNextCursor(page.nextCursor)
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (active) setIsLoadingSales(false)
      })
    return () => { active = false }
  }, [api, startDate, endDate, revision])

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    setError('')
    try {
      const page = await salesRepository.list(api, {
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        limit: 100,
        cursor: nextCursor,
      })
      setSales((currentSales) => [...currentSales, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleSave = async (sale: Omit<Sale, 'id' | 'time'>) => {
    if (editingSale) {
      await salesRepository.update(api, editingSale.id, sale)
    } else {
      await salesRepository.create(api, sale)
    }
    setIsLoadingSales(true)
    setError('')
    setEditingSale(null)
    setIsCreating(false)
    setRevision((currentRevision) => currentRevision + 1)
  }

  const handleDelete = async (sale: Sale) => {
    if (!window.confirm(`Excluir a venda de ${sale.productName}?`)) return
    setError('')
    try {
      await salesRepository.remove(api, sale.id)
      setIsLoadingSales(true)
      setRevision((currentRevision) => currentRevision + 1)
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    }
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
          <button
            className="button-primary"
            disabled={productsStatus === 'loading'}
            onClick={() => setIsCreating(true)}
            type="button"
          >
            Registrar venda
          </button>
        </div>

        {error && <p className="api-error" role="alert">{error}</p>}

        <div aria-label="Filtrar vendas por data" className="sales-date-filters">
          <label>
            De
            <input aria-label="Data inicial" onChange={(event) => {
              setIsLoadingSales(true)
              setError('')
              setStartDate(event.target.value)
            }} type="date" value={startDate} />
          </label>
          <label>
            Até
            <input aria-label="Data final" onChange={(event) => {
              setIsLoadingSales(true)
              setError('')
              setEndDate(event.target.value)
            }} type="date" value={endDate} />
          </label>
          {(startDate || endDate) && (
            <button onClick={() => {
              setIsLoadingSales(true)
              setError('')
              setStartDate('')
              setEndDate('')
            }} type="button">Limpar filtros</button>
          )}
        </div>

        {isLoadingSales ? (
          <p>Carregando vendas...</p>
        ) : sales.length > 0 ? (
          <>
            <div className="sales-record-list">
              {sales.map((sale) => (
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
                    <button className="sales-record-delete" onClick={() => void handleDelete(sale)} type="button">Excluir</button>
                  </div>
                </article>
              ))}
            </div>
            {nextCursor && (
              <button className="button-secondary" disabled={isLoadingMore} onClick={() => void loadMore()} type="button">
                {isLoadingMore ? 'Carregando...' : 'Carregar mais vendas'}
              </button>
            )}
          </>
        ) : (
          <p className="empty-sales-records">
            {startDate || endDate ? 'Nenhuma venda encontrada nesse período.' : 'Nenhuma venda registrada.'}
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
          productsStatus={productsStatus}
        />
      )}
      <FooterNavigation />
    </main>
  )
}

export default SalesPage
