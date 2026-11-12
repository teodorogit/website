import { Card } from '@heroui/react'
import type { Sale } from '../../data/sales'

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

type SaleCardProps = {
  sale: Sale
}

const SaleCard = ({ sale }: SaleCardProps) => (
  <Card className="sale-card">
    <Card.Content className="sale-card-content">
      <div className="sale-product-mark" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <span key={index} />)}
      </div>
      <div className="sale-details">
        <Card.Title>{sale.productName} · {sale.quantity} un.</Card.Title>
        <span className="sale-time">Venda às {sale.time}</span>
      </div>
      <strong className="sale-price">{currencyFormatter.format(sale.price * sale.quantity)}</strong>
    </Card.Content>
  </Card>
)

export default SaleCard