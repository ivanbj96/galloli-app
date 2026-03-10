---
inclusion: always
---

# Despliegue a Cloudflare Pages

## Comando de Despliegue

Para proyectos alojados en Cloudflare Pages, usar SIEMPRE el siguiente comando en una sola línea:

```bash
git add . ; git commit -m "version y descripción del commit" ; wrangler pages deploy . --project-name=galloli --branch=main
```

## Estructura del Comando

1. **git add .** - Agregar todos los cambios
2. **git commit -m "mensaje"** - Hacer commit con mensaje descriptivo
3. **wrangler pages deploy** - Desplegar a Cloudflare Pages
   - `.` - Directorio actual
   - `--project-name=galloli` - Nombre del proyecto
   - `--branch=main` - Branch principal

## Formato del Mensaje de Commit

El mensaje debe incluir:
- Versión (ej: v6.1.1)
- Descripción breve de los cambios

Ejemplo: `"v6.1.1 - Fix: Botones de notificaciones con logs detallados"`

## Notas

- Este comando funciona mejor que scripts .bat separados
- Se ejecuta todo en una sola línea con separadores `;`
- No requiere archivos adicionales de despliegue
