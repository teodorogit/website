import type { ApiClient } from './api-client'

export type Product = {
  id: string
  name: string
  price: number
  preparationCost: number
  createdAt: string
  updatedAt: string
}

export const productRepository = {
  async list(api: ApiClient): Promise<Product[]> {
    const response = await api.get<{ items: Product[] }>('/products')
    return response.items
  },
  create(api: ApiClient, product: Pick<Product, 'name' | 'price' | 'preparationCost'>): Promise<Product> {
    return api.post('/products', product)
  },
  update(api: ApiClient, id: string, updates: Pick<Product, 'name' | 'price' | 'preparationCost'>): Promise<Product> {
    return api.patch(`/products/${encodeURIComponent(id)}`, updates)
  },
  remove(api: ApiClient, id: string): Promise<void> {
    return api.delete(`/products/${encodeURIComponent(id)}`)
  },
}