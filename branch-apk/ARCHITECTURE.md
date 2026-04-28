# Arquitectura del flujo "venta automática"

```
                ┌─────────────────────┐
                │  Foreground Service │  (notificación persistente)
                │  GeofenceBleService │  Sobrevive a Doze, app cerrada,
                │  (Kotlin)           │  reinicio del teléfono.
                └──────────┬──────────┘
                           │ mantiene activos
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │   GPS    │ │   BLE    │ │ WebView  │
        │ watcher  │ │ scale    │ │ Galloli  │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             ▼            ▼            ▼
       geofence       ble-scale    auto-sale-engine
        manager        wrapper        (orquestador)
             │            │            │
             └────► onEnter, onWeight ◄┘
                          │
                          ▼
            ┌─────────────────────────────┐
            │   ¿modo === 'auto'?         │
            │     sí → commitSale()       │
            │     no → promptConfirm()    │
            └──────────────┬──────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ window.galloli   │  ← tu modules.js existente
                  │ .registerSale()  │     guarda en IndexedDB y
                  └──────────────────┘     marca para sync.

         ─────────── canal lateral ───────────
                  ▼
        FCM (data-only) ◄── Cloudflare Worker ◄── Panel admin
        comandos: pause/resume/reload/set-radius
```

## Garantías

| Escenario | Comportamiento |
|---|---|
| App minimizada | ✅ Funciona — el FG service mantiene BLE+GPS |
| App cerrada (swipe en recents) | ✅ Funciona — FG service es independiente del Activity |
| Pantalla bloqueada | ✅ Funciona — wakelock parcial activo |
| Doze mode (>30 min sin uso) | ✅ Funciona — FG service exento de Doze |
| Reinicio del teléfono | ✅ Reanuda — `BootReceiver` arranca el FG service |
| Permisos revocados por SO | ⚠️ Health check en próximo abrir muestra banner |
| TWA pública en Play Store | ✅ Sin cambios — `platform-guard` desactiva todo |

## Salvaguardas anti-error

- `minWeightKg = 0.5` → ignora residuos.
- 3 lecturas estables (spread <30g) en 2s → ignora vibraciones.
- 1 venta máx por cliente cada 60s → evita doble cobro si pisa la balanza dos veces.
- Solo dispara dentro de geofence activo → nunca factura "al aire".
- `sriEnabled = false` por defecto → no se emite XML al SRI hasta que tú lo actives explícitamente.
