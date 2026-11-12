# Frontend

The frontend reads and writes products, sales, sales goals, dashboard summaries, and chat responses through the authenticated backend API. It does not seed demo data or use browser storage as a fallback.

## Local development

1. Copy `.env.example` to `.env.local` and set `VITE_CLERK_PUBLISHABLE_KEY` for your Clerk instance.
2. Start the backend and PostgreSQL using the instructions in [`../BACKEND_SCOPE.md`](../BACKEND_SCOPE.md).
3. Install dependencies and start Vite:

   ```powershell
   npm install
   npm run dev
   ```

`VITE_API_URL` defaults to `http://localhost:3001/api`. Set it to the API's base URL when the backend runs elsewhere. Authenticated requests include the Clerk session token; the backend must be configured with the matching Clerk issuer and keys.
