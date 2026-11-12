import type { ApiClient } from './api-client'

export type SalesGoal = {
  amount: number | null
  updatedAt: string | null
}

export const salesGoalRepository = {
  get(api: ApiClient): Promise<SalesGoal> {
    return api.get('/sales-goal')
  },
  save(api: ApiClient, amount: number): Promise<SalesGoal> {
    return api.put('/sales-goal', { amount })
  },
}