import { Card } from '@heroui/react'
import { useState, type FormEvent } from 'react'
import HeaderComponent from '../components/common/header/login-button'
import FooterNavigation from '../components/common/footer'
import { productRepository, type Product } from '../data/product-repository'

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
  const [products, setProducts] = useState<Product[]>(() => productRepository.list())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [preparationCost, setPreparationCost] = useState('')

  const resetForm = () => {
    setName('')
    setPrice('')
    setPreparationCost('')
    setEditingId(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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
    const updatedProducts = editingId
      ? productRepository.update(editingId, product)
      : productRepository.create(product)
    setProducts(updatedProducts)
    resetForm()
  }

  const startEditing = (product: Product) => {
    setEditingId(product.id)
    setName(product.name)
    setPrice(product.price.toFixed(2))
    setPreparationCost(product.preparationCost.toFixed(2))
  }

  const handleDelete = (id: string) => {
    setProducts(productRepository.remove(id))
    if (editingId === id) resetForm()
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
              <button className="button-primary" type="submit">
                {editingId ? 'Salvar alterações' : 'Salvar produto'}
              </button>
            </div>
          </form>

          <section aria-labelledby="product-list-heading" className="product-list-section">
            <div className="product-list-heading">
              <h3 id="product-list-heading">Produtos cadastrados</h3>
              <span>{products.length}</span>
            </div>
            {products.length ? (
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
                        <button onClick={() => handleDelete(product.id)} type="button">Excluir</button>
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