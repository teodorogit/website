import type { ApiClient } from './api-client'
import type { Sale } from './sales'

type SaleResponse = {
  id: string
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  date: string
  time: string
}

export type SalePage = {
  items: Sale[]
  nextCursor: string | null
}

export type SaleFilters = {
  date?: string
  startDate?: string
  endDate?: string
  limit?: number
  cursor?: string
}

function mapSale(sale: SaleResponse): Sale {
  return {
    id: sale.id,
    productId: sale.productId,
    productName: sale.productName,
    price: sale.unitPrice,
    quantity: sale.quantity,
    date: sale.date,
    time: sale.time,
  }
}

function toQuery(filters: SaleFilters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const salesRepository = {
  async list(api: ApiClient, filters: SaleFilters = {}): Promise<SalePage> {
    const page = await api.get<{ items: SaleResponse[]; nextCursor: string | null }>(`/sales${toQuery(filters)}`)
    return { items: page.items.map(mapSale), nextCursor: page.nextCursor }
  },
  async create(api: ApiClient, sale: Pick<Sale, 'productId' | 'quantity' | 'date'>): Promise<Sale> {
    if (!sale.productId) throw new Error('Selecione um produto para registrar a venda.')
    return mapSale(await api.post<SaleResponse>('/sales', {
      productId: sale.productId,
      quantity: sale.quantity,
      date: sale.date,
    }))
  },
  async update(api: ApiClient, id: string, sale: Pick<Sale, 'productId' | 'quantity' | 'date'>): Promise<Sale> {
    return mapSale(await api.patch<SaleResponse>(`/sales/${encodeURIComponent(id)}`, {
      ...(sale.productId && { productId: sale.productId }),
      quantity: sale.quantity,
      date: sale.date,
    }))
  },
  remove(api: ApiClient, id: string): Promise<void> {
    return api.delete(`/sales/${encodeURIComponent(id)}`)
  },
}