import { SignIn } from '@clerk/react'

const LoginInputs = () => {
  return (
    <SignIn
      appearance={{
        variables: {
          colorPrimary: '#70452e',
          colorBackground: '#ffffff',
        },
        elements: {
          headerTitle: 'Acesse sua conta',
        },
      }}
      forceRedirectUrl="/home"
    />
  )
}

export default LoginInputs
