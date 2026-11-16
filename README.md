# dates — 100 citas tú y yo

Aplicación privada para dos personas. **Sin prisas, a nuestra manera.** Este repositorio es independiente y no reutiliza archivos de Webmo.

## Estado de la entrega

Aplicación React + TypeScript + Vite con Supabase Auth, vinculación segura de dos cuentas, catálogo de 100 experiencias, test privado, recomendaciones deterministas, votación y confirmación bilateral. El modo cita añade pasos y retos curados, preguntas por niveles, turnos compartidos, favoritos individuales y cierre bilateral. No depende de modelos generativos ni de claves de proveedores de IA.

Staging: `uyhavkmjvfaeoapzoobh`. Producción: `etqnmmrhfggcqzqefvjh`. El álbum y las notas privadas están probados en staging con bucket privado y acceso por miembro. Las migraciones de Fase 2–4 aún no están aplicadas en producción.

## Requisitos y ejecución

- Node.js 20.19+ (el entorno de implementación tiene Node 24).
- Un proyecto Supabase.

```powershell
Copy-Item .env.example .env.local
# Completa VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local
npm install
npm run dev
```

Para desarrollo de Fase 3 usa el archivo local ignorado `.env.staging.local` y arranca con `npm run dev -- --mode staging --host 127.0.0.1 --port 5182 --strictPort`. No uses el modo por defecto para probar el modo cita: `.env.local` conserva el entorno habitual. En Authentication, configura los redirects locales en el proyecto de pruebas que corresponda.

No coloques claves `service_role` o secretas en variables `VITE_`. El cliente solo recibe la clave publicable; las tablas y funciones limitan el acceso mediante RLS y RPC que comprueban `auth.uid()`.

## Supabase CLI y conexión real

El CLI de Supabase 3 está como dependencia de desarrollo. El proyecto local está enlazado a producción. Usa siempre el ref explícito y vuelve a inspeccionar el destino antes de operar:

```powershell
npx supabase migration list --remote=uyhavkmjvfaeoapzoobh # staging
npx supabase migration list --remote=etqnmmrhfggcqzqefvjh # producción
npx supabase db push --dry-run --remote=etqnmmrhfggcqzqefvjh
```

El dry-run no aplica cambios. No ejecutes `db reset` sobre proyectos remotos ni `db push` a producción sin autorización explícita.

Los tipos de `public` se generaron desde el esquema remoto y el cliente los usa en `src/lib/supabase.ts`. Regénéralos tras cambios de esquema con `npx supabase gen types typescript --remote=<project-ref> --schema public`; guarda la salida en `src/lib/database.types.ts`. La app recibe URL/Publishable Key en `.env.local`; el token del CLI se autentica por separado y no se guarda en ese archivo.

## Catálogo

Consulta [docs/catalog-import.md](docs/catalog-import.md). La fuente está en `catalog/dates.json`; la migración 003 la carga en `date_catalog` mediante IDs estables y posiciones del 1 al 100. Ejecuta:

```powershell
npm run catalog:check
npm run catalog:filters
npm run experience:check
npm run db:check
```

El validador verifica 100 experiencias únicas, la distribución requerida, campos completos y entre 4 y 8 dinámicas cada una. No se habilitó escritura de catálogo desde el cliente.

`npm run db:check` verifica estáticamente RLS, el modo cita, la seguridad del álbum y que la migración de catálogo contenga los 100 registros. Para probar recuerdos y Storage en staging, autentica Supabase CLI y ejecuta `npm run staging:memories:check`. El runner usa exclusivamente `.env.staging.local` y el ref staging, crea tres cuentas aleatorias en memoria, carga imágenes sintéticas, verifica políticas y elimina las cuentas, el espacio y los archivos temporales incluso si falla. No uses este runner contra producción.

### Álbum privado

Las migraciones `20261104154304_private_memory_album.sql`, `20261104180000_memory_album_realtime.sql` y `20261104181500_memory_photo_lock_cleanup.sql` crean el bucket privado `memory-album-private` (JPEG/PNG/WebP, máximo 3 MB por imagen), las aportaciones separadas por autor, la publicación Realtime y las RPC que exigen que la experiencia esté completada por ambos. La pantalla escucha cambios, vuelve a consultar al recuperar foco y usa una consulta de respaldo cada 30 segundos. Cada recuerdo admite hasta seis imágenes. El cliente comprime imágenes antes de subirlas, descarga mediante sesión autenticada y usa URLs Blob solo en memoria; nunca genera URLs públicas. Las aportaciones privadas solo se copian al álbum mediante la acción explícita “Compartir copia”. La aceptación visual en dos sesiones y la preparación de publicación están en [docs/fase5-preparacion-publicacion.md](docs/fase5-preparacion-publicacion.md).

## Publicación web

El repositorio es [dgalvezfonseca/dates](https://github.com/dgalvezfonseca/dates) y la URL prevista es <https://dgalvezfonseca.github.io/dates/>. El workflow `.github/workflows/pages.yml` fija `/dates/` para Pages; Vite genera `dist/404.html` para el fallback SPA. En desarrollo local, Vite usa `/` salvo que `VITE_BASE_PATH` lo cambie. El workflow se dispara manualmente y siempre construye `main`. `publish=false` genera el artefacto sin desplegar; el job de publicación exige `publish=true`.

En **Settings → Secrets and variables → Actions → Variables** ya están `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, tomadas del `.env.local` cuyo endpoint coincide con producción; sus valores no se imprimen en logs. No añadir secretos de servidor, `service_role` ni tokens de CLI. **Settings → Pages** ya usa GitHub Actions. En producción, configurar **Supabase → Authentication → URL Configuration** con Site URL `https://dgalvezfonseca.github.io/dates/` y Redirect URL `https://dgalvezfonseca.github.io/dates/**`; todavía no se han cambiado esas URLs ni se ha publicado.

Consulta el [informe de migraciones](docs/auditoria-migraciones-produccion.md) y la [preparación de publicación](docs/fase5-preparacion-publicacion.md) antes de ejecutar cualquier despliegue.

## Fase 4

El álbum compartido, las fotografías privadas, las notas personales, las copias compartidas explícitas, la línea del tiempo y el progreso por experiencias únicas están implementados. El modo cita no almacena respuestas de conversación. Las verificaciones de privacidad, límites y operaciones de Storage se describen en [docs/fase4-preparacion.md](docs/fase4-preparacion.md).
