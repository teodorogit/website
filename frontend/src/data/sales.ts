export type Sale = {
  id: string
  date: string
  time: string
  productId?: string
  productName: string
  price: number
  quantity: number
}

export type DemoSale = Omit<Sale, 'date' | 'productId'> & { weekday: number }

export const demoSales: DemoSale[] = [
  { id: 'mon-1', weekday: 1, time: '09:15', productName: 'Brigadeiro', price: 3, quantity: 1 },
  { id: 'mon-2', weekday: 1, time: '10:42', productName: 'Brownie', price: 8, quantity: 1 },
  { id: 'mon-3', weekday: 1, time: '12:08', productName: 'Brigadeiro', price: 3, quantity: 1 },
  { id: 'tue-1', weekday: 2, time: '09:32', productName: 'Brigadeiro', price: 3, quantity: 1 },
  { id: 'tue-2', weekday: 2, time: '14:20', productName: 'Cookie', price: 6, quantity: 1 },
  { id: 'wed-1', weekday: 3, time: '11:05', productName: 'Brownie', price: 8, quantity: 1 },
  { id: 'wed-2', weekday: 3, time: '15:16', productName: 'Brigadeiro', price: 3, quantity: 1 },
  { id: 'thu-1', weekday: 4, time: '10:10', productName: 'Cookie', price: 6, quantity: 1 },
  { id: 'thu-2', weekday: 4, time: '13:55', productName: 'Brigadeiro', price: 3, quantity: 1 },
  { id: 'fri-1', weekday: 5, time: '09:48', productName: 'Brownie', price: 8, quantity: 1 },
  { id: 'fri-2', weekday: 5, time: '12:35', productName: 'Cookie', price: 6, quantity: 1 },
  { id: 'sat-1', weekday: 6, time: '11:27', productName: 'Brigadeiro', price: 3, quantity: 1 },
  { id: 'sat-2', weekday: 6, time: '16:02', productName: 'Brownie', price: 8, quantity: 1 },
  { id: 'sun-1', weekday: 0, time: '10:18', productName: 'Cookie', price: 6, quantity: 1 },
]