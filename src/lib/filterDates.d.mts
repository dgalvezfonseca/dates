export type DateFilters = { query: string; category: string; energy: string; setting: string; duration: string }
export type CatalogDate = { id: string; title: string; category: string; description: string; duration_minutes: number; energy: string; setting: string }
export function filterDates<T extends CatalogDate>(dates: T[], filters: DateFilters): T[]
