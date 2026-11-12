import { useAuth } from '@clerk/react'
import { useMemo } from 'react'

type ApiErrorResponse = {
  error?: {
    message?: string
    details?: { field: string; message: string }[]
  }
}

type RequestOptions = {
  signal?: AbortSignal
}

export type ApiClient = {
  isReady: boolean
  get: <T>(path: string, options?: RequestOptions) => Promise<T>
  post: <T>(path: string, body: unknown, options?: RequestOptions) => Promise<T>
  put: <T>(path: string, body: unknown, options?: RequestOptions) => Promise<T>
  patch: <T>(path: string, body: unknown, options?: RequestOptions) => Promise<T>
  delete: (path: string, options?: RequestOptions) => Promise<void>
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api').replace(/\/+$/, '')

export function createApiClient(
  getToken: () => Promise<string | null>,
  isReady = true,
): ApiClient {
  const request = async <T>(
    path: string,
    method: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> => {
    const token = await getToken()
    if (!token) throw new Error('Sua sessão expirou. Entre novamente para continuar.')

    const headers = new Headers({ Authorization: `Bearer ${token}` })
    if (body !== undefined) headers.set('Content-Type', 'application/json')

    const response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
      ...(options?.signal && { signal: options.signal }),
    })

    if (response.status === 204) {
      if (!response.ok) throw new Error(`A solicitação falhou (${response.status}).`)
      return undefined as T
    }

    const text = await response.text()
    let result: unknown
    if (text) {
      try {
        result = JSON.parse(text)
      } catch {
        throw new Error(response.ok
          ? 'O backend retornou uma resposta inválida.'
          : `Não foi possível concluir a solicitação (${response.status}).`)
      }
    }

    if (!response.ok) {
      const error = result as ApiErrorResponse | undefined
      const message = error?.error?.message
      const details = error?.error?.details
      const detailMessage = details?.map((detail) => `${detail.field}: ${detail.message}`).join(' ')
      throw new Error([message, detailMessage].filter(Boolean).join(' ') || `Não foi possível concluir a solicitação (${response.status}).`)
    }

    if (result === undefined) throw new Error('O backend retornou uma resposta vazia.')
    return result as T
  }

  return {
    isReady,
    get: (path, options) => request(path, 'GET', undefined, options),
    post: (path, body, options) => request(path, 'POST', body, options),
    put: (path, body, options) => request(path, 'PUT', body, options),
    patch: (path, body, options) => request(path, 'PATCH', body, options),
    delete: async (path, options) => { await request<void>(path, 'DELETE', undefined, options) },
  }
}

export function useApi(): ApiClient {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const isReady = isLoaded && isSignedIn === true
  return useMemo(() => createApiClient(() => getToken(), isReady), [getToken, isReady])
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}
