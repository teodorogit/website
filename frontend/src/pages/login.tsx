import loginImage from '../assets/login-img.png'
import LoginInputs from '../components/login-page/login-component/login-component'

const LoginPage = () => {
  return (
    <main className="login-page">
      <section className="login-brand-panel" aria-label="Matheus">
        <img className="login-brand-image" src={loginImage} alt="Ilustração de login" />
        <p className="login-copyright">All rights reserved @Matheus</p>
      </section>
      <section className="login-form-panel" aria-label="Entrar na conta">
        <LoginInputs />
      </section>
    </main>
  )
}

export default LoginPage
