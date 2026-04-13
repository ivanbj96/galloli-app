// Punto de entrada para el bundle de BleClient
// Este archivo se bundlea con esbuild en el CI → www/js/ble-bundle.js
// Expone window.BleClient globalmente para que bluetooth-scale.js lo use
import { BleClient } from '@capacitor-community/bluetooth-le';
window.BleClient = BleClient;
