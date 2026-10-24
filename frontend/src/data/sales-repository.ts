import { demoSales, type Sale } from './sales'

const storageKey = 'matheus.sales-history.v1'

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDemoSales = (): Sale[] => {
  const today = new Date()
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))

  return demoSales.map(({ weekday, ...sale }) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + ((weekday + 6) % 7))
    return { ...sale, date: toLocalDateString(date) }
  })
}

const isSale = (value: unknown): value is Sale => {
  if (!value || typeof value !== 'object') return false
  const sale = value as Partial<Sale>
  return typeof sale.id === 'string'
    && typeof sale.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(sale.date)
    && typeof sale.time === 'string'
    && typeof sale.productName === 'string'
    && typeof sale.price === 'number'
    && typeof sale.quantity === 'number'
}

const readSales = (): Sale[] => {
  if (typeof window === 'undefined') return getDemoSales()

  try {
    const storedSales = window.localStorage.getItem(storageKey)
    if (!storedSales) return getDemoSales()

    const parsedSales: unknown = JSON.parse(storedSales)
    return Array.isArray(parsedSales) ? parsedSales.filter(isSale) : getDemoSales()
  } catch {
    return getDemoSales()
  }
}

const writeSales = (sales: Sale[]) => {
  window.localStorage.setItem(storageKey, JSON.stringify(sales))
  return sales
}

export const salesRepository = {
  list: readSales,
  create(sale: Omit<Sale, 'id' | 'time'>) {
    const newSale: Sale = {
      ...sale,
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }
    return writeSales([...readSales(), newSale])
  },
  update(id: string, updates: Omit<Sale, 'id' | 'time'>) {
    return writeSales(readSales().map((sale) => (
      sale.id === id ? { ...sale, ...updates } : sale
    )))
  },
  remove(id: string) {
    return writeSales(readSales().filter((sale) => sale.id !== id))
  },
}