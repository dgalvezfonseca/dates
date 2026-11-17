# Publicación en producción — estado y operaciones pendientes

Fecha: 17 de noviembre de 2026. Rama: `feat/home-diario`.

## Migraciones aplicadas (17 nov 2026, con autorización)

Tras repetir el dry-run (mismo destino y misma lista), se ejecutó `npx supabase db push --remote=etqnmmrhfggcqzqefvjh`. Las ocho migraciones se aplicaron sin errores. Verificación de solo lectura posterior:

- Historial: 11/11 versiones registradas.
- 21 tablas públicas, todas con RLS; `ai_generations` se conserva.
- 17 RPC del frontend presentes; ninguna función `SECURITY DEFINER` ejecutable por `anon`.
- Bucket `memory-album-private`: privado, 3 MB, JPEG/PNG/WebP; políticas `memory_album_select_member`, `memory_album_insert_owner`, `memory_album_delete_owner`.
- `authenticated` solo tiene SELECT en `date_sessions`, `date_responses`, `date_votes`, `date_confirmations`, `date_memories` y `memory_photos` (las escrituras pasan por RPC); `date_memory_contributions` admite escritura del autor bajo RLS.
- Realtime: `date_experience_progress`, `date_experience_confirmations`, `date_memories`, `date_memory_contributions`, `memory_photos`.
- Datos previos intactos: 4 usuarios Auth, 2 círculos, 2 integrantes, 100 citas.

Las secciones siguientes describen el estado previo al despliegue y las operaciones aún pendientes (pasos 1 y 3–6).

## Estado verificado (solo lectura)

- Proyectos Supabase: producción `etqnmmrhfggcqzqefvjh` (`100-veces-tu-y-yo`, us-east-2) y staging `uyhavkmjvfaeoapzoobh`; ambos `ACTIVE_HEALTHY`, PostgreSQL 17.11. No existe un proyecto QA.
- Migraciones: staging 11/11; producción 3/11. `db push --dry-run` dirigido a producción enumera exactamente 004, 005, 01703, 04631, 061135, 154304, 180000 y 181500, sin seeds ni roles.
- Datos de producción (solo conteos): 4 usuarios Auth, 4 perfiles, 2 círculos con 1 integrante cada uno, catálogo de 100 citas; 0 sesiones, respuestas, recuerdos, fotos, notas y objetos de Storage. 16 tablas públicas, todas con RLS. No existe `rls_auto_enable()`.
- Respaldo administrado: plan Free, sin backups listados ni PITR. `supabase db dump` requiere Docker, que no está instalado.
- Auth de producción: `site_url` = `http://localhost:3000` y ninguna Redirect URL. Con esa configuración, el enlace de confirmación de registro apunta a localhost.

## Por qué las ocho migraciones son reversibles

Las migraciones pendientes no reemplazan funciones existentes, no hacen `DROP`, `DELETE` ni `TRUNCATE` fuera de cuerpos de función y no alteran `profiles`, `couples`, `couple_members`, `couple_invites`, `date_catalog` ni `auth.*`. Las columnas y restricciones nuevas recaen sobre tablas con 0 filas. Cada archivo se aplica en su propia transacción; el intento anterior que falló en 004 no dejó cambios.

Respaldo preparado fuera del repositorio (contiene metadatos de producción, sin filas ni datos personales):

- `..\dates-backups\prod-etqnmmrhfggcqzqefvjh-20261117\metadata-snapshot.json`: privilegios de tablas para `anon`/`authenticated`, políticas, publicación Realtime, buckets, funciones e índices anteriores al despliegue.
- `..\dates-backups\prod-etqnmmrhfggcqzqefvjh-20261117\rollback-004-181500.sql`: reversión que elimina solo los objetos creados por las ocho migraciones y restaura los permisos revocados. No se ha ejecutado ni probado en una réplica.

Riesgo residual: 004/005 no se ejecutaron en una réplica de producción. En producción, 004 termina sin cambios porque la función y el trigger no existen, y 005 solo consulta catálogos (la misma aserción pasó en modo lectura: 0 tablas sin RLS).

## Operaciones que requieren autorización explícita, en orden

1. **Subir la rama y abrir el PR** `feat/home-diario` → `main` (sin force push). La fusión la hace el propietario.
2. **Aplicar migraciones en producción**: repetir `npx supabase db push --dry-run --remote=etqnmmrhfggcqzqefvjh`, comprobar que la lista sea idéntica y después ejecutar `npx supabase db push --remote=etqnmmrhfggcqzqefvjh`. Verificar con `migration list` (11/11), RLS en todas las tablas, bucket `memory-album-private` privado y privilegios de `date_memories` sin INSERT/UPDATE directos.
3. **Configurar Auth** en Dashboard → Authentication → URL Configuration: Site URL `https://dgalvezfonseca.github.io/dates/` y Redirect URL `https://dgalvezfonseca.github.io/dates/**`. No usar `supabase config push`: el `config.toml` local declara valores de localhost y los subiría.
4. **Confirmar las variables** de GitHub Actions `VITE_SUPABASE_URL` (debe ser `https://etqnmmrhfggcqzqefvjh.supabase.co`) y `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). El workflow ahora rechaza otros valores y escanea `dist` antes de subir el artefacto.
5. **Publicar**: ejecutar el workflow “GitHub Pages” desde `main` con `publish=true`.
6. **Verificar después de publicar**: HTTP y assets bajo `/dates/`, fuentes, recarga directa de rutas internas, registro con confirmación por correo, login, vinculación entre dos cuentas autorizadas, cuestionario y recomendaciones contra producción, y acceso desde celulares reales.

La recuperación de contraseña no está implementada; no anunciarla.
