export type Product = {
  id: string
  name: string
  price: number
  preparationCost: number
}

const storageKey = 'matheus.product-catalog.v1'
const initialProducts: Product[] = [
  { id: 'brigadeiro-demo', name: 'Brigadeiro', price: 3, preparationCost: 0 },
]

const readProducts = (): Product[] => {
  if (typeof window === 'undefined') return initialProducts

  try {
    const storedProducts = window.localStorage.getItem(storageKey)
    if (!storedProducts) return initialProducts

    const parsedProducts: unknown = JSON.parse(storedProducts)
    if (!Array.isArray(parsedProducts)) return initialProducts

    return (parsedProducts as Product[]).map((product) => ({
      ...product,
      preparationCost: Number.isFinite(product.preparationCost) ? product.preparationCost : 0,
    }))
  } catch {
    return initialProducts
  }
}

const writeProducts = (products: Product[]) => {
  window.localStorage.setItem(storageKey, JSON.stringify(products))
  return products
}

export const productRepository = {
  list: readProducts,
  create(product: Omit<Product, 'id'>) {
    return writeProducts([...readProducts(), { ...product, id: crypto.randomUUID() }])
  },
  update(id: string, updates: Omit<Product, 'id'>) {
    return writeProducts(readProducts().map((product) => (
      product.id === id ? { ...product, ...updates } : product
    )))
  },
  remove(id: string) {
    return writeProducts(readProducts().filter((product) => product.id !== id))
  },
}