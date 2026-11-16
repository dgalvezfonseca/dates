export const categories = [
  { id: 'conexión-y-conversación', label: 'Conexión y conversación', count: 15 },
  { id: 'aventuras-y-diversión', label: 'Aventuras y diversión', count: 20 },
  { id: 'complicidad-y-equipo', label: 'Complicidad y trabajo en equipo', count: 20 },
  { id: 'romance-y-detalles', label: 'Romance y pequeños detalles', count: 15 },
  { id: 'vida-cotidiana', label: 'La vida cotidiana y real', count: 15 },
  { id: 'conversaciones-importantes', label: 'Conversaciones que importan', count: 15 },
]

export function categoryLabel(id: string): string {
  return categories.find((item) => item.id === id)?.label ?? id
}
