import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ClerkProvider } from '@clerk/react'
import { BrowserRouter } from 'react-router-dom'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      localization={{
    signIn: {
      start: {
        title: "Welcome back!",
        subtitle: "Please sign in to your account",
        
      },

    },
  }}>
      <App />
    
    </ClerkProvider>
    </BrowserRouter>
  </StrictMode>,
)
