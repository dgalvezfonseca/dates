# Pruebas Auth/RLS en staging

El proyecto de prueba es `100-veces-tu-y-yo-staging` (`uyhavkmjvfaeoapzoobh`). Su URL y Publishable Key viven en `.env.staging.local`, ignorado por Git. `.env.local` se reserva para producción.

Después de revocar las claves legacy de staging en Supabase Dashboard y confirmar el acceso `api_gateway_keys_secret_read` para la sesión CLI:

```powershell
.\scripts\run-staging-auth-rls.ps1
```

El runner obtiene en memoria la nueva API key `sb_secret_` de staging, genera tres identidades `example.invalid` con contraseñas aleatorias en memoria, confirma el signup mediante `generateLink`/`verifyOtp` sin enviar correos, inicia sesión con cada cuenta y ejecuta las pruebas usando los JWT de usuario. Al terminar elimina la pareja, la invitación, notas, favoritos y usuarios temporales. No escribe claves ni contraseñas a archivos. El secreto de administración se usa únicamente en Node, nunca en React ni en SQL de RLS.

El runner se niega a ejecutarse si la URL no coincide exactamente con el ref staging. No uses `db reset`, y no cambies `.env.local` para apuntar a staging.
