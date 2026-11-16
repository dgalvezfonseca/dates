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

El dry-run dirigido a producción completó con `dryRun: true`, `upToDate: false` y enumeró esas ocho migraciones; no incluyó seeds ni roles. En una ejecución posterior autorizada, `db push` intentó únicamente la primera migración pendiente y falló en 004 con SQLSTATE `42883`; una consulta read-only posterior confirmó que producción conserva solo 001–003. No se registró ni aplicó ninguna de las ocho migraciones.

## Revisión de operaciones y datos

- 004 revoca ejecución pública de `public.rls_auto_enable()`.
- 005 crea una tabla de prueba con nombre único y después la elimina en el mismo bloque de verificación. No apunta a una tabla con datos de la app; aun así, ejecuta DDL temporal al aplicarse.
- 01703 crea índice parcial, tabla de confirmaciones, políticas y RPC de planificación. Sus `ON DELETE CASCADE` afectan filas relacionadas solo si una sesión/usuario/recomendación se elimina en el futuro; la migración no borra esas filas durante su aplicación. Una RPC borra la confirmación previa del propio usuario al cambiar voto, comportamiento de la app.
- 04631 sustituye la RPC de confirmación bilateral y sus permisos.
- 061135 crea tablas de progreso, confirmaciones y favoritos, políticas/RPC y añade tablas a Realtime. La candidata local conserva `public.ai_generations` para no eliminar datos ni objetos durante el despliegue. La versión que ya se aplicó en staging sí pudo haber eliminado esa tabla, así que se espera una diferencia de esquema hasta resolverla en una migración futura con autorización explícita.
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

El dry-run concuerda con los historiales de migración. La candidata local conserva `ai_generations` para evitar eliminar datos; staging puede carecer de esa tabla por la versión anterior. Producción todavía permite escrituras directas en `date_memories`, y el bucket del álbum aún no existe. No aplicar estas migraciones como un lote hasta validar la diferencia en QA y revisar de nuevo los conteos y el dry-run inmediatamente antes de cualquier autorización.

## Auditoría remota y corrección local de 004–005

Fecha: 4 de noviembre de 2026. Proyectos consultados mediante Supabase CLI 3.0.0, refs explícitos y consultas `--read-only`. No se ejecutó ninguna migración, no se cambió el historial remoto y no se modificó ningún objeto de staging o producción.

### Causa y diferencias confirmadas

- Staging tiene `public.rls_auto_enable()` y el event trigger `ensure_rls`; producción carece de ambos. Producción conserva únicamente los triggers administrados `issue_*` y `pgrst_*` que también aparecen en staging.
- La fuente `pg_proc.prosrc` local coincide con staging (SHA-256 `325ae266d9b166715ef5230ceaf7ff9d523e483cf5610dfb9779ab3f183f4af9`). La definición es `SECURITY DEFINER`, propietaria de `postgres`, `search_path=pg_catalog`. `ensure_rls` está habilitado (`ddl_command_end`) para `CREATE TABLE`, `CREATE TABLE AS`, `SELECT INTO`; `pg_depend` confirma que usa esa función.
- ACL de staging: `{postgres=X/postgres,service_role=X/postgres}`; `anon` y `authenticated` no tienen EXECUTE. Los ACL por defecto de funciones en `public` son iguales en ambos proyectos.
- La causa de `42883` es que 004 referencia una función no creada por 001–003 y presente solo por configuración externa en staging.
- El rol de consulta CLI es `supabase_read_only_user`. En producción, el rol `postgres` tiene `rolsuper=false`, mientras `supabase_admin` tiene `rolsuper=true`. PostgreSQL 17 exige superusuario para `CREATE EVENT TRIGGER`; por eso no se debe intentar provisionar ese trigger en una migración normal ejecutada como `postgres`.

### Corrección local preparada

Se modificaron localmente:

- `supabase/migrations/202611030004_revoke_public_rls_event_trigger.sql`: si función y trigger están ausentes, no hace cambios; si aparece solo uno o tienen definición, propietario, seguridad, `search_path`, estado o tags inesperados, aborta. Si coinciden exactamente con staging, revoca EXECUTE a `PUBLIC`, `anon` y `authenticated` y verifica que ambos roles no puedan ejecutar. No crea funciones/triggers, no agrega grants y no usa `CASCADE`.
- `supabase/migrations/202611030005_verify_rls_event_trigger.sql`: deja de crear/eliminar una tabla temporal y verifica directamente que todas las tablas/particiones de `public` tengan RLS habilitado. Eso permite ejecutar el control en producción sin depender del event trigger superuser-only.
- `scripts/check-rls.mjs`: comprueba la rama opcional y fail-closed de 004, que 005 no haga DDL y que cada tabla nueva definida por las migraciones de planificación, modo cita y álbum habilite RLS explícitamente.

La instancia staging conserva `ensure_rls` y su comportamiento adicional; la corrección no lo elimina ni lo reemplaza. Producción queda protegida por la comprobación de tablas existentes y por las migraciones explícitas `ENABLE ROW LEVEL SECURITY`. La diferencia restante es que staging habilita RLS automáticamente también para DDL futuro ad hoc; producción no. Por eso toda tabla nueva debe incluir RLS en su migración. El chequeo estático ahora cubre las tablas creadas en las migraciones revisadas.

### Verificaciones ejecutadas

- Consultas de función, trigger, ACL, dependencias, privilegios por defecto y roles: read-only. Producción: función ausente y ningún `ensure_rls`; staging: definición y trigger coinciden con los valores esperados.
- La consulta SELECT equivalente a la nueva aserción de 005 pasó en ambos proyectos: producción, 16 tablas públicas / 0 sin RLS; staging, 20 / 0.
- `npm run db:check`: pasó. `git diff --check`: pasó.
- El intento de login navegador de Supabase CLI no pudo iniciar: PTY `setRawMode errno 1`; sin TTY la CLI exige token. `supabase db dump --dry-run` respondió `AccessTokenRequiredError`; no se obtuvo dump de esquema.

Estas verificaciones **no son aplicación de migraciones**. La CLI no permitió ejecutar el bloque `DO` con `--read-only`; sí se ejecutó en ambos proyectos el SELECT idéntico que usa 005 para determinar las tablas no protegidas. No se probó en remoto la rama que lanza excepción de 004, ni aplicación idempotente completa.

### Prueba aislada remota

No es seguro simular la producción borrando o deshabilitando por un momento la función/trigger existente en staging: eso alteraría objetos actuales y podría bloquear DDL concurrente. Las ramas ya fueron rechazadas por el plan de la organización en el intento anterior. Supabase permite bases adicionales técnicamente, pero no las integra con Auth, Storage ni PostgREST del proyecto; no sirven como réplica completa del esquema administrado. Una prueba fiel requiere una branch aislada compatible con el plan o un proyecto de QA separado, creado desde esquema de producción sin datos personales. Eso requiere autorización de recurso y acceso de lectura para exportar el esquema; no se creó nada.

### Riesgos de la candidata

- Se editaron 004 y 005 aunque esas versiones ya figuran aplicadas en staging. Supabase compara versiones, no el contenido: staging no volverá a ejecutar estos archivos. En producción, que registra solo 001–003, se ejecutaría el contenido local corregido. La diferencia queda documentada y no se usó `migration repair`.
- El cuerpo heredado de `rls_auto_enable()` captura `WHEN OTHERS` y solo escribe `RAISE LOG`; un error interno podría no abortar DDL. El control 005 reducido comprueba tablas existentes, no el auto-enable futuro. No se cambió el objeto de staging.
- La candidata local de 061135 ya no elimina `public.ai_generations`. Staging pudo ejecutar la versión anterior que sí la elimina; confirmar la diferencia en QA y documentarla. No añadir una migración de limpieza para igualar esquemas sin revisar datos y obtener autorización.
- El estado actual de producción satisface la nueva aserción 005, pero no se ejecutó 004/005 contra una base clonada; faltan pruebas positivas y negativas de aplicación real.

### Despliegue y recuperación

No ejecutar `db push` todavía. Primero validar la candidata en branch/proyecto de QA aislado y volver a ejecutar el dry-run de las ocho migraciones. La candidata conserva `ai_generations`, pero 004/005 tienen contenido local distinto al que ya quedó registrado en staging y ambas diferencias deben verificarse por separado. 004/005 no tienen DDL persistente en la ruta sin función de producción; si una verificación falla, cada migración debe abortar y no cambiar objetos. Si se aplican correctamente, 005 solo consulta catálogos y no requiere reversión de datos.

**Estado: BLOQUEADO para aceptación completa / no apto para despliegue.** La candidata local es coherente con el estado remoto observado y sus comprobaciones estáticas pasaron, pero no se verificó la aplicación real en una réplica aislada ni el rechazo de objetos incompatibles.

## Validación final propuesta en proyecto QA

Fecha: 4 de noviembre de 2026. No se ejecutó ninguna escritura remota.

### Disponibilidad y límites

- El último inventario Supabase completado con acceso autorizado contenía únicamente staging (`uyhavkmjvfaeoapzoobh`) y producción (`etqnmmrhfggcqzqefvjh`); no había un proyecto QA vacío. No se creó una branch ni un proyecto nuevo.
- En esta sesión, la CLI aislada en `.supabase-home` no tenía token: `projects list` y `db query --remote` terminaron con `AccessTokenRequiredError` antes de consultar el API o la base. Por ello no se pudo refrescar el inventario. No se solicitó ni se imprimió ningún secreto y no se cambió la configuración de staging o producción.
- La comprobación estática local sí se ejecutó: `npm run db:check` pasó. El validador revisa RLS explícito para tablas definidas en las migraciones de planificación, modo cita y álbum. `git diff --check` pasó; Git solo mostró avisos de conversión LF/CRLF.

### Conclusiones sobre 004–005 y las migraciones siguientes

- 004 no crea ni requiere `ensure_rls` para el estado de producción: si la función y el event trigger están ausentes, termina sin cambios. Si encuentra solo uno o definiciones inesperadas, aborta; si encuentra el par verificado de staging, revoca `EXECUTE` a `PUBLIC`, `anon` y `authenticated` y verifica el resultado. No usa `CASCADE`.
- 005 ya no crea ni elimina una tabla de prueba. Comprueba que todas las tablas y tablas particionadas existentes en `public` tengan RLS.
- La inspección estática encuentra `ENABLE ROW LEVEL SECURITY` explícito en las tablas creadas por 01703, 061135 y 154304. 180000 y 181500 no crean tablas. Esta comprobación no sustituye la inspección real de políticas y privilegios una vez aplicadas.
- Staging registra 004 y 005 como aplicadas, pero los archivos locales se corrigieron después. El historial remoto guarda versiones, no un checksum del SQL; una lista de migraciones coincidente no prueba que el contenido desplegado sea igual al repositorio. No ejecutar `migration repair` ni reescribir el historial para ocultar esa diferencia.

### `ai_generations`

- En el último sondeo de solo lectura documentado arriba, producción tenía cero filas. El SQL inicial crea la tabla, la aplicación no tiene referencias activas fuera de las migraciones y la candidata de 061135 la conserva. La versión aplicada en staging pudo eliminarla, por lo que QA debe comprobar y registrar esa diferencia.
- Los intentos documentados de buscar dependencias textuales en funciones, vistas y vistas materializadas no alcanzaron la base por falta de token. Como la candidata preserva el objeto y sus datos, esa limitación ya no bloquea esta migración; cualquier futura limpieza debe revisar dependencias y contar con autorización explícita.

### Plan de ejecución al disponer de QA autorizado y vacío

1. Confirmar por `projects list` el nombre y ref del nuevo proyecto, que sea distinto de producción y staging, y que su estado sea vacío. Verificar versión PostgreSQL 17.11 como en los dos proyectos actuales. Si crear el proyecto implica pago, detenerse y obtener autorización antes de crearlo.
2. Preparar una carpeta temporal fuera del árbol publicado con `supabase/config.toml` y solo las migraciones 001–003. Ejecutar `supabase db push --dry-run --remote=<QA_REF> --workdir=<QA_DIR>`, revisar destino y contenido, y después aplicar solo ese tramo. Comprobar las 16 tablas iniciales, RLS, catálogo de 100 filas y ausencia de `public.rls_auto_enable()` y `ensure_rls`.
3. Añadir a esa carpeta únicamente 004 y 005. Ejecutar dry-run explícito para QA; aplicar en ese orden solo si el destino y la lista son correctos. Comprobar el historial 001–005, objetos, privilegios de función, RLS y políticas. Repetir el SQL de 004/005 en QA fuera del ledger para comprobar no-op/idempotencia; nunca falsear el historial.
4. Probar rechazo incompatible en QA: crear dentro de una transacción un `public.rls_auto_enable()` homónimo con definición no esperada, ejecutar la lógica de 004 y confirmar el error; revertir la transacción. La rama positiva del event trigger heredado requiere privilegios para crear event triggers (superusuario); si QA no los ofrece, documentar esa rama como no reproducible, sin crear permisos u objetos en staging/producción.
5. Solo después de pasar 004–005, añadir las seis migraciones restantes al directorio temporal, realizar dry-run y aplicar por orden. Confirmar que 061135 conserva `ai_generations` y anotar que staging puede no tener la tabla por la versión anterior; no ejecutar una limpieza para igualar esquemas sin autorización expresa.
6. Al final comparar el historial remoto QA con las 11 versiones locales; verificar todas las tablas `public.relkind IN ('r','p')` con RLS, las políticas esperadas y los objetos de Storage. No usar `db reset`, `migration repair` ni `CASCADE`.

**Resultado de esta solicitud: BLOQUEADO para prueba real.** No existe un QA confirmado en el inventario previo y la CLI no pudo refrescarlo sin autenticación. `npm run db:check` es únicamente validación estática; no se afirma que 004/005 hayan pasado en PostgreSQL ni que las once migraciones estén aprobadas. **Recomendación: no aplicar las ocho migraciones en producción todavía**, debido a la falta de prueba QA real y a la diferencia de contenido 004/005 registrada en staging.
