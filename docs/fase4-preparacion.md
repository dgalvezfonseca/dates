# Fase 4: álbum privado de recuerdos

La interfaz de `/recuerdos` integra recuerdos compartidos, línea del tiempo, fotos y notas privadas. Las migraciones se aplicaron solo a staging `uyhavkmjvfaeoapzoobh`; el `.env.local` de producción y el enlace CLI local no se cambiaron.

## Datos y permisos

- `date_memories` conserva una ficha por sesión completada. La RPC `create_date_memory` exige que la sesión esté `completed`, encuentre exactamente dos miembros y dos confirmaciones y es idempotente por sesión.
- `date_memory_contributions` guarda aportaciones separadas y atribuidas por autor para que una persona no sobrescriba el contenido de la otra. RLS deja leer a los dos miembros y editar o borrar solo al autor.
- Las notas existentes conservan RLS por `user_id`. `session_id` es una relación opcional. `share_private_note_to_memory` crea una copia compartida y no modifica la nota original.
- `memory-album-private` es un bucket privado, con límite de 3 MB y MIME JPEG/PNG/WebP. Los nombres usan `memory UUID / uploader UUID / random UUID`. RLS permite descargas autenticadas a miembros; solo quien subió el archivo puede borrarlo. Cada recuerdo acepta hasta seis imágenes.
- El cliente comprime archivos en memoria a un máximo de 1920 px y 3 MB. Las vistas se cargan con Storage `download()` y URLs Blob efímeras, no con URLs públicas firmadas. Las fotografías no se envían a servicios externos ni se guardan en caché pública.
- La interfaz sincroniza por Realtime, actualiza al recuperar foco y conserva una consulta de respaldo cada 30 segundos. El 4 de noviembre de 2026, dos sesiones autenticadas de navegador en staging recibieron eventos WebSocket reales de cambios de recuerdos, fotos y eliminaciones. En esa ejecución se observaron aproximadamente 0.8 s para recibir una edición de metadatos, 2.2 s para recibir el evento de una foto y 0.7 s para recibir la eliminación; son mediciones puntuales del QA, no garantías de latencia. La foto quedó visible en la otra sesión en aproximadamente 2.9 s.
- La finalización no altera el catálogo. El progreso cuenta IDs de cita únicos de sesiones `completed`; las sesiones repetidas pueden tener recuerdos separados sin aumentar el contador.

## Migraciones

- `20261104154304_private_memory_album.sql`: índice idempotente por sesión, metadatos, contribuciones, asociación opcional de nota, bucket, Storage policies y RPC con `SECURITY DEFINER` acotadas a `authenticated`.
- `20261104180000_memory_album_realtime.sql`: incorpora recuerdos, aportaciones y metadatos de fotos a `supabase_realtime` cuando existe la publicación.
- `20261104181500_memory_photo_lock_cleanup.sql`: mantiene el bloqueo de cuota del registro fotográfico sin variable de salida innecesaria.

## QA visual autenticado

La aceptación visual adicional del 4 de noviembre utilizó dos cuentas temporales independientes de staging y una tercera cuenta para comprobar acceso denegado. Se verificó el álbum, una copia compartida de nota sin mover el original privado, subida y eliminación de imágenes sintéticas, progreso de `2 de 100`, y la sincronización por WebSocket. Las capturas autenticadas (`memories-auth-320.png`, `360`, `390`, `430` y `1280`) se guardan localmente bajo `output/playwright/`, directorio ignorado por Git.

## Repetir pruebas

1. Verifica que `.env.staging.local` contenga URL y Publishable Key de staging y esté ignorado por Git.
2. Autentica el CLI (`npx supabase login`) en el perfil local de Supabase.
3. Ejecuta `npm run staging:memories:check`. El wrapper toma la clave secreta desde Supabase CLI, solo para el proceso; no la escribe en archivos ni salida.
4. Ejecuta `npm run db:check`, `npm run catalog:check`, `npm run catalog:filters`, `npm run experience:check` y `npm run build`.

El runner de staging usa tres usuarios aleatorios y una imagen PNG sintética creada en memoria. Limpia solamente el espacio y los usuarios temporales que él mismo creó. Nunca ejecutar contra producción.

Para repetir el recorrido autenticado, ejecuta Vite con `--mode staging --host 127.0.0.1 --port 5182` y, en otra terminal, `npm run staging:memories:browser-fixture`. El helper imprime un puerto aleatorio y un nonce local; al terminar, envía `POST /cleanup` a ese puerto con `Origin: http://127.0.0.1:5182` y `X-QA-Nonce: <nonce>`. La respuesta HTTP 200 y el resumen `cleanupErrors: 0` confirman que se eliminaron las cuentas, el espacio y las fotos temporales de todos los recuerdos creados. El helper también intenta limpiar al recibir una señal de cierre.
