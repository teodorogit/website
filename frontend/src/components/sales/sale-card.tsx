import { Card } from '@heroui/react'
import type { Sale } from '../../data/sales'

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
      <strong className="sale-price">${(sale.price * sale.quantity).toFixed(2)}</strong>
    </Card.Content>
  </Card>
)

export default SaleCard