# Importación del catálogo definitivo

`catalog/dates.json` es la fuente del catálogo. Contiene los 100 títulos definitivos proporcionados, con descripciones originales y sin datos de precios, establecimientos, disponibilidad u horarios reales. La migración `202611030003_seed_date_catalog.sql` lo carga en la tabla privada de solo lectura del cliente; las posiciones siguen el orden del archivo.

Añade exactamente 100 objetos JSON. Categorías e identificadores estables:

| Categoría (`category`) | Cantidad |
| --- | ---: |
| `conexión-y-conversación` | 15 |
| `aventuras-y-diversión` | 20 |
| `complicidad-y-equipo` | 20 |
| `romance-y-detalles` | 15 |
| `vida-cotidiana` | 15 |
| `conversaciones-importantes` | 15 |

Cada objeto contiene `id` (slug estable numerado), `title`, `category`, `description`, `objective`, `durationMinutes` (entero positivo), `energy` (`baja`, `media` o `alta`), `setting` (`interior`, `exterior` o `indistinto`), `materials` (arreglo), `preparation`, `steps` (3 a 6 pasos), `prompts` (4 a 8 textos), `lowEnergyAlternative`, `accessibility`, `consent` (arreglos no vacíos) y `enjoymentTips`. El proceso de carga asigna `sort_order` consecutivos del 1 al 100 según el orden del archivo.

Valida con `npm run catalog:check`. Antes de aplicar la carga remota, usa `supabase migration list --remote` y `supabase db push --dry-run --remote` para confirmar el proyecto y la migración pendiente. La migración 003 actualiza solo filas de catálogo con el mismo ID; no borra otras filas ni tablas.
