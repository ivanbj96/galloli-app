---
inclusion: always
---

# Regla: No Crear Archivos de Resumen Innecesarios

## Prohibido

❌ **NO crear archivos markdown de resumen** después de cada actualización de código
❌ **NO crear archivos como:**
- `CHANGES.md`
- `SUMMARY.md`
- `UPDATE.md`
- `CHANGELOG.md` (a menos que sea explícitamente solicitado)
- `README.md` (a menos que sea explícitamente solicitado)
- Cualquier archivo `.md` que documente cambios recientes

## Permitido

✅ **SÍ crear archivos de especificación** cuando se solicite explícitamente:
- `.kiro/specs/*/requirements.md` (solo cuando se inicia una nueva feature)
- `.kiro/specs/*/design.md` (solo cuando se aprueba requirements.md)
- `.kiro/specs/*/tasks.md` (solo cuando se aprueba design.md)

✅ **SÍ crear archivos de steering** cuando se solicite explícitamente

## Comportamiento Correcto

Cuando completes una actualización de código:

1. **Hacer los cambios** en los archivos necesarios
2. **Desplegar** usando el comando de Cloudflare Pages
3. **Informar brevemente** al usuario en el chat sobre lo que se hizo
4. **NO crear ningún archivo markdown** de resumen

## Ejemplo de Respuesta Correcta

```
✅ Correcto:
"Listo, desplegado v6.4.5 con las mejoras al historial de pagos."

❌ Incorrecto:
"Listo, he creado CHANGES.md con el resumen de los cambios..."
```

## Resumen en Chat, No en Archivos

- Usa el chat para resumir cambios
- Mantén los resúmenes breves (2-3 oraciones)
- Solo menciona lo más importante
- No crees archivos para documentar esto

## Excepción

Solo crea archivos markdown cuando:
1. El usuario lo solicite explícitamente
2. Sea parte de una especificación formal (specs)
3. Sea documentación técnica necesaria para el proyecto
