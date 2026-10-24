import './App.css'
import { Show } from '@clerk/react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/login'
import HomePage from './pages/home'
import DashboardPage from './pages/dashboard'
import SettingsPage from './pages/settings'
import ProductsPage from './pages/products'
import SalesPage from './pages/sales'

function App() {
  return (
    <>
      <Show when="signed-in">
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/login" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Show>
      <Show when="signed-out">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Show>
    </>
  )
}

export default App
