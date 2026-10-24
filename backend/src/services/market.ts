type DemoSale = {
  productName: string
  price: number
}

const demoSales: DemoSale[] = [
  { productName: 'Brigadeiro', price: 3 },
  { productName: 'Brownie', price: 8 },
  { productName: 'Brigadeiro', price: 3 },
  { productName: 'Brigadeiro', price: 3 },
  { productName: 'Cookie', price: 6 },
  { productName: 'Brownie', price: 8 },
  { productName: 'Brigadeiro', price: 3 },
  { productName: 'Cookie', price: 6 },
  { productName: 'Brigadeiro', price: 3 },
  { productName: 'Brownie', price: 8 },
  { productName: 'Cookie', price: 6 },
  { productName: 'Brigadeiro', price: 3 },
  { productName: 'Brownie', price: 8 },
  { productName: 'Cookie', price: 6 },
]

export const getMarketContext = (): string => {
  const salesByProduct = new Map<string, { quantity: number; revenue: number }>()

  for (const sale of demoSales) {
    const current = salesByProduct.get(sale.productName) ?? { quantity: 0, revenue: 0 }
    current.quantity += 1
    current.revenue += sale.price
    salesByProduct.set(sale.productName, current)
  }

  const revenue = demoSales.reduce((total, sale) => total + sale.price, 0)
  const productSummary = Array.from(salesByProduct, ([name, sales]) => (
    `${name}: ${sales.quantity} unidades, R$ ${sales.revenue.toFixed(2)}`
  )).join('; ')

  return [
    'Resumo de vendas de demonstração da semana (dados fictícios, não representam vendas reais):',
    `Vendas: ${demoSales.length} unidades; faturamento: R$ ${revenue.toFixed(2)}.`,
    `Por produto: ${productSummary}.`,
  ].join('\n')
}
