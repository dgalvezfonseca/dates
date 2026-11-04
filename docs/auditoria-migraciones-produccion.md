# Auditoría de migraciones de producción

Fecha de consulta: 4 de noviembre de 2026. Consultas de producción realizadas con Supabase CLI 3.0.0, `--remote=etqnmmrhfggcqzqefvjh` explícito; las consultas SQL usaron `--read-only`.

## Identidad y diferencias

| Entorno | Ref | Nombre | Migraciones aplicadas |
|---|---|---|---:|
| Staging | `uyhavkmjvfaeoapzoobh` | `100-veces-tu-y-yo-staging` | 11 de 11 |
| Producción | `etqnmmrhfggcqzqefvjh` | `100-veces-tu-y-yo` | 3 de 11 |

Faltan en producción:

1. `202611030004_revoke_public_rls_event_trigger.sql`
2. `202611030005_verify_rls_event_trigger.sql`
3. `20261104001703_phase2_date_planning.sql`
4. `20261104004631_phase2_state_guards.sql`
5. `20261104061135_date_experience_mode.sql`
6. `20261104154304_private_memory_album.sql`
7. `20261104180000_memory_album_realtime.sql`
8. `20261104181500_memory_photo_lock_cleanup.sql`

El dry-run dirigido a producción completó con `dryRun: true`, `upToDate: false` y enumeró esas ocho migraciones; no incluyó seeds ni roles. No se ejecutó `db push` sin `--dry-run` ni otra escritura remota.

## Revisión de operaciones y datos

- 004 revoca ejecución pública de `public.rls_auto_enable()`.
- 005 crea una tabla de prueba con nombre único y después la elimina en el mismo bloque de verificación. No apunta a una tabla con datos de la app; aun así, ejecuta DDL temporal al aplicarse.
- 01703 crea índice parcial, tabla de confirmaciones, políticas y RPC de planificación. Sus `ON DELETE CASCADE` afectan filas relacionadas solo si una sesión/usuario/recomendación se elimina en el futuro; la migración no borra esas filas durante su aplicación. Una RPC borra la confirmación previa del propio usuario al cambiar voto, comportamiento de la app.
- 04631 sustituye la RPC de confirmación bilateral y sus permisos.
- 061135 crea tablas de progreso, confirmaciones y favoritos, políticas/RPC y añade tablas a Realtime. Tiene un bloque que ejecuta `DROP TABLE public.ai_generations` cuando la tabla está vacía y lanza una excepción si encuentra filas. La consulta read-only encontró **0 filas** en producción en este momento. El `DROP` sigue eliminando el objeto de esquema y no se debe aplicar sin una decisión explícita; además, el conteo podría cambiar después de esta auditoría.
- 154304 agrega metadatos de recuerdos, tabla de contribuciones, índices, trigger, RLS, RPC y políticas de Storage. El bucket `memory-album-private` se crea/actualiza con `public=false`, MIME JPEG/PNG/WebP y límite de 3 MB. No contiene un `DROP` de tablas.
- 180000 agrega las tablas del álbum a la publicación Realtime si aún no están incluidas.
- 181500 reemplaza la RPC de registro de fotos con bloqueo de fila y validación de propiedad/límite.

Precondiciones agregadas, consultadas en producción sin devolver datos personales:

- Catálogo: 100 registros.
- Parejas con más de una sesión activa: 0.
- Sesiones con recuerdos duplicados: 0.
- Filas de `memory_photos`: 0; registros con MIME o tamaño fuera de límites: 0.
- Filas de `ai_generations`: 0.

Los conteos son una fotografía puntual. El riesgo de `DROP TABLE` requiere atención incluso con cero filas; las restricciones `ON DELETE CASCADE` y la operación de prueba 005 también se revisaron, pero no borran datos reales durante la aplicación en su camino normal.

## Estado de seguridad observado en producción

- 16 tablas de `public`; RLS habilitado en las 16.
- `private_notes` tiene política de lectura ligada a `auth.uid()` y pertenencia al espacio.
- `couple_invites` no tiene política directa; RLS deja la tabla denegada por defecto y el flujo utiliza RPC.
- Las funciones `SECURITY DEFINER` observadas son propiedad de `postgres`, fijan `search_path` vacío y no conceden `EXECUTE` a `anon`. Los RPC de usuario autenticado se conceden a `authenticated`; `create_profile_for_user` no es ejecutable por ese rol.
- La tabla de recuerdos en producción aún permite INSERT y UPDATE directos a miembros mediante sus grants/políticas actuales. La migración 154304 revoca esa escritura directa para canalizar mutaciones por RPC y comprobar la cita completada bilateralmente. Hasta aplicar y verificar esa migración, producción no cumple todavía el modelo de escritura de la Fase 4.
- No existe el bucket `memory-album-private` en producción y no hay políticas en `storage.objects` para ese álbum. La migración 154304 crea el bucket privado y sus políticas por miembro/autor. No se puede considerar habilitado el álbum de producción antes de aplicarla.
- La tercera cuenta, aislamiento de notas y operaciones de fotos se probaron con usuarios temporales en staging; no se usaron cuentas reales en pruebas de producción.

## Conclusión

El dry-run concuerda con los historiales de migración. No hay discrepancias de versiones aplicadas que bloqueen la planificación; sí hay un riesgo de eliminación de esquema (`ai_generations`) y el estado actual de producción permite escrituras directas en `date_memories`, mientras el bucket del álbum aún no existe. No aplicar estas migraciones como un lote hasta decidir expresamente el tratamiento de `ai_generations` y revisar de nuevo los conteos y el dry-run inmediatamente antes de cualquier autorización.
