const storageKey = 'matheus.sales-goal.v1'

const readSalesGoal = (): number | null => {
  if (typeof window === 'undefined') return null

  try {
    const storedGoal = Number(window.localStorage.getItem(storageKey))
    return Number.isFinite(storedGoal) && storedGoal > 0 ? storedGoal : null
  } catch {
    return null
  }
}

export const salesGoalRepository = {
  get: readSalesGoal,
  save(goal: number) {
    window.localStorage.setItem(storageKey, String(goal))
    return goal
  },
}