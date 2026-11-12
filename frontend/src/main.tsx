import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ClerkProvider } from '@clerk/react'
import { ptBR } from '@clerk/localizations'
import { BrowserRouter } from 'react-router-dom'

const clerkLocalization = {
  ...ptBR,
  signIn: {
    ...ptBR.signIn,
    start: {
      ...ptBR.signIn?.start,
      subtitle: 'para continuar na Teodoro brigaderia',
    },
  },
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ClerkProvider
        publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
        localization={clerkLocalization}
      >
        <App />
      </ClerkProvider>
    </BrowserRouter>
  </StrictMode>,
)
