import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Product } from '../../data/product-repository'
import type { Sale } from '../../data/sales'

type SaleFormModalProps = {
  products: Product[]
  defaultDate: string
  initialSale?: Sale
  onClose: () => void
  onSave: (sale: Omit<Sale, 'id' | 'time'>) => void
}

const SaleFormModal = ({ products, defaultDate, initialSale, onClose, onSave }: SaleFormModalProps) => {
  const matchingProduct = products.find((product) => product.id === initialSale?.productId)
    ?? products.find((product) => product.name === initialSale?.productName)
  const fallbackProductId = initialSale?.productId ?? `legacy-${initialSale?.id ?? 'sale'}`
  const [productId, setProductId] = useState(matchingProduct?.id ?? (initialSale ? fallbackProductId : products[0]?.id ?? ''))
  const [quantity, setQuantity] = useState(String(initialSale?.quantity ?? 1))
  const [date, setDate] = useState(initialSale?.date ?? defaultDate)
  const selectedProduct = products.find((product) => product.id === productId)
  const isKeepingHistoricalProduct = Boolean(initialSale && productId === fallbackProductId)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedQuantity = Number(quantity)
    if (!date || !Number.isInteger(parsedQuantity) || parsedQuantity < 1) return
    if (!selectedProduct && !isKeepingHistoricalProduct) return

    onSave({
      date,
      productId: selectedProduct?.id ?? initialSale?.productId,
      productName: selectedProduct?.name ?? initialSale!.productName,
      price: selectedProduct?.price ?? initialSale!.price,
      quantity: parsedQuantity,
    })
  }

  return (
    <div className="sale-modal-backdrop">
      <section aria-labelledby="sale-modal-title" aria-modal="true" className="sale-modal" role="dialog">
        <header className="sale-modal-header">
          <h2 id="sale-modal-title">{initialSale ? 'Editar venda' : 'Registrar nova venda'}</h2>
          <button aria-label="Fechar" className="sale-modal-close" onClick={onClose} type="button">×</button>
        </header>
        {products.length === 0 && !initialSale ? (
          <div className="sale-modal-empty">
            <p>Cadastre um produto antes de registrar uma venda.</p>
            <Link className="button-primary" to="/products">Ir para produtos</Link>
          </div>
        ) : (
          <form className="sale-form" onSubmit={handleSubmit}>
            <label htmlFor="sale-product">Produto</label>
            <select id="sale-product" onChange={(event) => setProductId(event.target.value)} required value={productId}>
              {!initialSale && <option value="">Selecione um produto</option>}
              {isKeepingHistoricalProduct && !selectedProduct && (
                <option value={fallbackProductId}>{initialSale?.productName} (fora do catálogo)</option>
              )}
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name} · R$ {product.price.toFixed(2)}</option>
              ))}
            </select>

            <div className="sale-form-fields">
              <div>
                <label htmlFor="sale-quantity">Quantidade</label>
                <input
                  id="sale-quantity"
                  min="1"
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={quantity}
                />
              </div>
              <div>
                <label htmlFor="sale-date">Data</label>
                <input id="sale-date" onChange={(event) => setDate(event.target.value)} required type="date" value={date} />
              </div>
            </div>

            {!initialSale && (
              <p className="sale-form-alert" role="note">
                Para editar ou excluir esta venda depois, acesse a tela Vendas.
              </p>
            )}

            <footer className="sale-form-actions">
              <button className="button-secondary" onClick={onClose} type="button">Cancelar</button>
              <button className="button-primary" disabled={!selectedProduct && !isKeepingHistoricalProduct} type="submit">
                Salvar
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  )
}

export default SaleFormModal