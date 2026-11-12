import { Card } from '@heroui/react'
import { useEffect, useState, type FormEvent } from 'react'
import HeaderComponent from '../components/common/header/login-button'
import FooterNavigation from '../components/common/footer'
import { productRepository, type Product } from '../data/product-repository'
import { errorMessage, useApi } from '../data/api-client'

const productNameLimit = 32
const priceInputLimit = 9

const normalizeAmountInput = (value: string) => {
  const normalized = value.replace(/[^\d.,]/g, '').replace(',', '.')
  const [whole = '', ...fractionParts] = normalized.split('.')
  const nextValue = fractionParts.length
    ? `${whole}.${fractionParts.join('').slice(0, 2)}`
    : whole
  return nextValue.slice(0, priceInputLimit)
}

const ProductsPage = () => {
  const api = useApi()
  const [products, setProducts] = useState<Product[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [preparationCost, setPreparationCost] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!api.isReady) return
    let active = true
    productRepository.list(api)
      .then((loadedProducts) => {
        if (active) setProducts(loadedProducts)
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => { active = false }
  }, [api])

  const resetForm = () => {
    setName('')
    setPrice('')
    setPreparationCost('')
    setEditingId(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedPrice = Number(price)
    const parsedPreparationCost = Number(preparationCost)
    if (!name.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0
      || !Number.isFinite(parsedPreparationCost) || parsedPreparationCost < 0) return

    const product = {
      name: name.trim(),
      price: parsedPrice,
      preparationCost: parsedPreparationCost,
    }
    setIsSaving(true)
    setError('')
    try {
      const savedProduct = editingId
        ? await productRepository.update(api, editingId, product)
        : await productRepository.create(api, product)
      setProducts((currentProducts) => {
        const updatedProducts = editingId
          ? currentProducts.map((currentProduct) => currentProduct.id === savedProduct.id ? savedProduct : currentProduct)
          : [...currentProducts, savedProduct]
        return updatedProducts.sort((first, second) => first.name.localeCompare(second.name))
      })
      resetForm()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setIsSaving(false)
    }
  }

  const startEditing = (product: Product) => {
    setEditingId(product.id)
    setName(product.name)
    setPrice(product.price.toFixed(2))
    setPreparationCost(product.preparationCost.toFixed(2))
  }

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Excluir o produto ${product.name}?`)) return
    setError('')
    try {
      await productRepository.remove(api, product.id)
      setProducts((currentProducts) => currentProducts.filter((currentProduct) => currentProduct.id !== product.id))
      if (editingId === product.id) resetForm()
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    }
  }

  const handlePriceChange = (value: string) => {
    setPrice(normalizeAmountInput(value))
  }

  const handlePreparationCostChange = (value: string) => {
    setPreparationCost(normalizeAmountInput(value))
  }

  return (
    <main className="app-page products-page">
      <HeaderComponent title="Produtos" />
      <section className="products-content">
        <div className="products-intro">
          <p className="eyebrow">CATÁLOGO</p>
          <h2>Produtos</h2>
        </div>
        {error && <p className="api-error" role="alert">{error}</p>}
        <div className="products-layout">
          <form className="product-form" onSubmit={handleSubmit}>
            <h3>{editingId ? 'Editar produto' : 'Cadastrar produto'}</h3>
            <label htmlFor="product-name">Nome do produto</label>
            <input
              autoComplete="off"
              id="product-name"
              maxLength={productNameLimit}
              onChange={(event) => setName(event.target.value.slice(0, productNameLimit))}
              required
              value={name}
            />
            <span className="input-counter">{name.length}/{productNameLimit}</span>

            <label htmlFor="product-price">Valor</label>
            <div className="price-input-wrap">
              <span aria-hidden="true">$</span>
              <input
                id="product-price"
                inputMode="decimal"
                maxLength={priceInputLimit}
                onChange={(event) => handlePriceChange(event.target.value)}
                placeholder="0,00"
                required
                value={price}
              />
            </div>

            <label htmlFor="product-preparation-cost">Custo de preparação</label>
            <div className="price-input-wrap">
              <span aria-hidden="true">$</span>
              <input
                id="product-preparation-cost"
                inputMode="decimal"
                maxLength={priceInputLimit}
                onChange={(event) => handlePreparationCostChange(event.target.value)}
                placeholder="0,00"
                required
                value={preparationCost}
              />
            </div>
            <div className="product-form-actions">
              {editingId && (
                <button className="button-secondary" onClick={resetForm} type="button">
                  Cancelar
                </button>
              )}
              <button className="button-primary" disabled={isSaving} type="submit">
                {isSaving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Salvar produto'}
              </button>
            </div>
          </form>

          <section aria-labelledby="product-list-heading" className="product-list-section">
            <div className="product-list-heading">
              <h3 id="product-list-heading">Produtos cadastrados</h3>
              <span>{products.length}</span>
            </div>
            {isLoading ? (
              <p>Carregando produtos...</p>
            ) : products.length ? (
              <div className="product-list">
                {products.map((product) => (
                  <Card className="product-card" key={product.id}>
                    <Card.Content className="product-card-content">
                      <div>
                        <Card.Title>{product.name}</Card.Title>
                        <span className="product-card-price">${product.price.toFixed(2)}</span>
                      </div>
                      <div className="product-actions">
                        <button onClick={() => startEditing(product)} type="button">Editar</button>
                        <button onClick={() => void handleDelete(product)} type="button">Excluir</button>
                      </div>
                    </Card.Content>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="empty-products">Nenhum produto cadastrado.</p>
            )}
          </section>
        </div>
      </section>
      <FooterNavigation />
    </main>
  )
}

export default ProductsPage