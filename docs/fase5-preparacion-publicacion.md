# Fase 5: preparación de GitHub Pages y producción

## QA de Fase 4 en staging

El 4 de noviembre de 2026 se probaron dos sesiones autenticadas independientes y una tercera cuenta temporal sin vincular. Se completaron 28 comprobaciones del runner real de privacidad y Storage. Los miembros compartieron recuerdos; cada nota privada permaneció solo con su autor; la copia al álbum requirió la acción explícita, y la cuenta externa no vio recuerdos, notas ni progreso.

Realtime llegó por WebSocket en las operaciones observadas: edición, 809 ms; foto agregada, 2,225 ms al evento y 2,934 ms hasta verla en la otra pantalla; eliminación, 674 ms al evento y 1,088 ms hasta desaparecer. Son medidas de una ejecución, no garantías. El sondeo de respaldo de 30 segundos continúa activo.

Las imágenes de prueba fueron sintéticas. El autor pudo borrar sus fotos; el otro miembro no tuvo botón para borrar las del autor. Tras el borrado, la foto desapareció de ambos lados. El contador permaneció en 2 de 100 experiencias únicas.

Anchos probados: 320, 360, 390, 430 y 1280 px. Sin desbordamiento horizontal; controles interactivos del álbum de al menos 44 px. No hubo errores ni advertencias de consola en los dos navegadores.

Capturas autenticadas, ignoradas por Git, en `output/playwright/`: `memories-auth-320.png`, `memories-auth-360.png`, `memories-auth-390.png`, `memories-auth-430.png` y `memories-auth-1280.png`.

## Migraciones y estado de producción

El ref de staging es `uyhavkmjvfaeoapzoobh`; producción es `etqnmmrhfggcqzqefvjh`. Staging tiene las 11 migraciones locales. Producción tiene las tres primeras y le faltan ocho. El dry-run dirigido explícitamente a producción terminó correctamente y enumeró esas ocho sin aplicar nada.

La inspección read-only encontró 16 tablas públicas en producción, todas con RLS habilitado. `private_notes` limita lectura al propietario. `couple_invites` no tiene políticas directas, por lo que RLS deniega acceso por tabla y el flujo depende de RPC. Las funciones `SECURITY DEFINER` existentes niegan ejecución a `anon`, usan `search_path` vacío y solo `create_profile_for_user` carece de ejecución para `authenticated` (uso de trigger). No se modificaron políticas ni datos.

La producción todavía no tiene el bucket `memory-album-private` ni políticas de Storage asociadas. Las migraciones pendientes crean el bucket privado y políticas de acceso por miembro. La política actual de `date_memories` aún concede INSERT y UPDATE a miembros; la migración del álbum pendiente revoca esas escrituras directas y las reemplaza por RPC protegidas. Por ello, el álbum de Fase 4 no está listo en producción.

Ver el [informe de diferencias y riesgos](auditoria-migraciones-produccion.md). No se aplicaron migraciones en producción.

## Git y GitHub Pages

El repositorio indicado es `https://github.com/dgalvezfonseca/dates.git`, rama predeterminada `main`, visibilidad pública, URL `https://dgalvezfonseca.github.io/dates/`. El remoto tenía un commit inicial con el título `# dates`; se preservó su historial y se integró como base de `main` antes del commit del proyecto. Pages ya tiene configurado GitHub Actions como source.

Vite usa `/dates/` para builds de producción y `/` durante desarrollo local. `npm run build` produce `dist/404.html` para navegación SPA. El workflow [pages.yml](../.github/workflows/pages.yml) se dispara manualmente desde `main`: `publish=false` construye y sube el artefacto sin desplegar; `publish=true` habilita el job de despliegue. No existe activación automática por push.

En GitHub Actions se configuraron como **Variables** del repositorio (no son secretos de servidor):

- `VITE_SUPABASE_URL` con el endpoint público de producción.
- `VITE_SUPABASE_PUBLISHABLE_KEY` con la Publishable Key pública de producción.

No introducir `service_role`, `sb_secret_`, contraseña de base ni token CLI en el cliente o en `VITE_*`. Los nombres existen en Settings → Secrets and variables → Actions; sus valores no se imprimieron.

## Supabase Auth

Al aceptar el dominio propuesto, configurar en **Authentication → URL Configuration**:

- Site URL: `https://dgalvezfonseca.github.io/dates/`
- Redirect URL permitida: `https://dgalvezfonseca.github.io/dates/**`

No se modificó la configuración remota. La app muestra alta, confirmación por correo e inicio de sesión; el alta usa el Site URL predeterminado. No existe aún una pantalla de recuperación de contraseña ni llamada `resetPasswordForEmail`.

## Verificación local

Pasaron `npm run build`, `npm run db:check`, `npm run catalog:check`, `npm run catalog:filters` y `npm run experience:check`. También pasó el build con base path `/dates/`, se comprobaron las rutas de assets y `dist/404.html`, y luego se restauró el build local por defecto.

La comparación de migraciones, el dry-run y las consultas de metadatos en producción fueron de solo lectura. No se aplicaron migraciones. No se publicó Pages ni se ejecutó el workflow remoto.

## Pendientes antes de publicar

1. Validar en QA que la candidata de `20261104061135_date_experience_mode.sql` conserva `public.ai_generations`; documentar que staging puede carecer de esa tabla por la versión anterior.
2. Obtener aprobación separada para aplicar las migraciones pendientes en producción. Primero volver a ejecutar el dry-run y revisar su salida inmediatamente antes de aplicar.
3. Confirmar las dos variables públicas de GitHub Actions y que el source de Pages siga en GitHub Actions.
4. Configurar Site URL y Redirect URL de Supabase Auth sin comodines más amplios que el subpath de Pages.
5. Probar login, confirmación de correo, callback, refresco directo de `/recuerdos` y permisos desde el dominio publicado.
6. Ejecutar revisión de dependencias cuando npm registry sea accesible.
7. Publicar únicamente al correr manualmente el workflow con `publish=true`, después de autorización explícita.
