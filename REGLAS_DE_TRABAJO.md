# Reglas de trabajo

## División de responsabilidades

- Nicolás es el único con acceso directo a Supabase (dashboard, SQL Editor, Secrets). Corre él todas las queries y configuraciones.
- Martino trabaja en el código del repo (diseño, frontend, GitHub) sin acceso a Supabase.
- Si en algún momento Claude Code necesita algo de la base — confirmar una columna, correr una query de diagnóstico, aplicar un ALTER TABLE — NO intentes conseguir acceso. Escribí la query exacta y devolvésela para que se la pasen a Nicolás, y esperá su resultado antes de seguir.

## Reglas de verificación

1. Ningún "listo"/"completado" se acepta sin evidencia verificable: git status limpio, hash de origin/main confirmado con git log, y cuando aplique, el código funcionando en producción (curl o similar).
2. Ningún secreto se pega en el chat de Claude Code ni se commitea — va directo a un archivo local gitignored (`.env.*`) o a Supabase Secrets.
3. Antes de cualquier ALTER TABLE u otro cambio estructural, proponer el cambio y esperar confirmación explícita — la ejecución siempre la hace Nicolás a mano.
4. No asumir nombres de tablas, columnas o valores — confirmarlos contra `information_schema` o el dato real antes de escribir código que dependa de ellos.
5. Cambios puramente visuales/CSS: probarlos en un archivo aislado antes de aplicarlos al sitio real, y que alguien lo confirme viéndolo en su propio navegador antes de darlo por cerrado.
