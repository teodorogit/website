import { useClerk } from '@clerk/react'
import { NavLink, useNavigate } from 'react-router-dom'

const FooterNavigation = () => {
  const { signOut } = useClerk()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <footer className="bottom-navigation">
      <nav aria-label="Navegação inferior">
        <NavLink aria-label="Home" className={({ isActive }) => `bottom-navigation-link${isActive ? ' is-active' : ''}`} to="/home">
          <span aria-hidden="true" className="material-icons">home</span>
          <span className="bottom-navigation-label">Home</span>
        </NavLink>
        <NavLink aria-label="Dashboard" className={({ isActive }) => `bottom-navigation-link${isActive ? ' is-active' : ''}`} to="/dashboard">
          <span aria-hidden="true" className="material-icons">analytics</span>
          <span className="bottom-navigation-label">Dashboard</span>
        </NavLink>
        <NavLink aria-label="Vendas" className={({ isActive }) => `bottom-navigation-link${isActive ? ' is-active' : ''}`} to="/sales">
          <span aria-hidden="true" className="material-icons">receipt_long</span>
          <span className="bottom-navigation-label">Vendas</span>
        </NavLink>
        <NavLink aria-label="Produtos" className={({ isActive }) => `bottom-navigation-link${isActive ? ' is-active' : ''}`} to="/products">
          <span aria-hidden="true" className="material-icons">storefront</span>
          <span className="bottom-navigation-label">Produtos</span>
        </NavLink>
        <button aria-label="Sair da aplicação" className="bottom-navigation-link" onClick={handleSignOut} type="button">
          <span aria-hidden="true" className="material-icons">logout</span>
          <span className="bottom-navigation-label">Sair</span>
        </button>
      </nav>
    </footer>
  )
}

export default FooterNavigation