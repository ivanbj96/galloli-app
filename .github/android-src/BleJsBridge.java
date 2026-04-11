package store.ivapps.galloli;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class BleJsBridge {

    private static final UUID SERVICE_UUID  = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_UUID     = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD_UUID     = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private final Context context;
    private final WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bleScanner;
    private BluetoothGatt connectedGatt;
    private boolean isScanning = false;
    private String targetDeviceId = null;

    public BleJsBridge(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
        BluetoothManager bm = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        if (bm != null) {
            bluetoothAdapter = bm.getAdapter();
            if (bluetoothAdapter != null) bleScanner = bluetoothAdapter.getBluetoothLeScanner();
        }
    }

    // ── JS llama esto para escanear y conectar ──────────────────────────────
    @JavascriptInterface
    public void scanAndConnect() {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            sendToJs("BleNative.onError('Bluetooth no habilitado')");
            return;
        }
        if (isScanning) return;
        isScanning = true;
        sendToJs("BleNative.onScanStart()");

        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();

        List<ScanFilter> filters = new ArrayList<>();
        filters.add(new ScanFilter.Builder()
                .setServiceUuid(new ParcelUuid(SERVICE_UUID)).build());

        bleScanner.startScan(filters, settings, scanCallback);

        // Detener escaneo después de 10 s si no encontró nada
        mainHandler.postDelayed(() -> {
            if (isScanning) {
                bleScanner.stopScan(scanCallback);
                isScanning = false;
                sendToJs("BleNative.onScanStop()");
            }
        }, 10000);
    }

    // ── Conectar a un dispositivo guardado por ID (MAC) ─────────────────────
    @JavascriptInterface
    public void connectById(String deviceId) {
        if (bluetoothAdapter == null) return;
        targetDeviceId = deviceId;
        BluetoothDevice device = bluetoothAdapter.getRemoteDevice(deviceId);
        if (device != null) {
            mainHandler.post(() -> device.connectGatt(context, true, gattCallback));
        }
    }

    // ── Desconectar ─────────────────────────────────────────────────────────
    @JavascriptInterface
    public void disconnect() {
        if (connectedGatt != null) {
            connectedGatt.disconnect();
            connectedGatt.close();
            connectedGatt = null;
        }
        targetDeviceId = null;
    }

    // ── Verificar si Bluetooth está habilitado ──────────────────────────────
    @JavascriptInterface
    public boolean isEnabled() {
        return bluetoothAdapter != null && bluetoothAdapter.isEnabled();
    }

    // ── Scan callback ───────────────────────────────────────────────────────
    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String name = device.getName() != null ? device.getName() : "Balanza";
            String id   = device.getAddress();

            // Detener escaneo y conectar
            bleScanner.stopScan(scanCallback);
            isScanning = false;

            sendToJs("BleNative.onDeviceFound('" + id + "','" + escapeName(name) + "')");
            targetDeviceId = id;
            mainHandler.post(() -> device.connectGatt(context, false, gattCallback));
        }

        @Override
        public void onScanFailed(int errorCode) {
            isScanning = false;
            sendToJs("BleNative.onError('Escaneo fallido: " + errorCode + "')");
        }
    };

    // ── GATT callback ───────────────────────────────────────────────────────
    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            if (newState == BluetoothGatt.STATE_CONNECTED) {
                connectedGatt = gatt;
                sendToJs("BleNative.onConnected('" + gatt.getDevice().getAddress() + "','" + escapeName(gatt.getDevice().getName()) + "')");
                gatt.discoverServices();
            } else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
                connectedGatt = null;
                sendToJs("BleNative.onDisconnected()");
                gatt.close();
                // Auto-reconectar si tenemos el ID guardado
                if (targetDeviceId != null) {
                    mainHandler.postDelayed(() -> connectById(targetDeviceId), 3000);
                }
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) return;
            BluetoothGattService service = gatt.getService(SERVICE_UUID);
            if (service == null) return;
            BluetoothGattCharacteristic characteristic = service.getCharacteristic(CHAR_UUID);
            if (characteristic == null) return;

            // Habilitar notificaciones
            gatt.setCharacteristicNotification(characteristic, true);
            BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CCCD_UUID);
            if (descriptor != null) {
                descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                gatt.writeDescriptor(descriptor);
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            byte[] data = characteristic.getValue();
            if (data == null) return;
            // Convertir bytes a string para enviar al JS
            StringBuilder hex = new StringBuilder();
            for (byte b : data) hex.append(String.format("%02x", b));
            String ascii = new String(data).replaceAll("[^\\x20-\\x7E]", "?");
            sendToJs("BleNative.onData('" + hex + "','" + escapeAscii(ascii) + "')");
        }
    };

    // ── Helpers ─────────────────────────────────────────────────────────────
    private void sendToJs(final String js) {
        mainHandler.post(() -> webView.evaluateJavascript(js, null));
    }

    private String escapeName(String name) {
        if (name == null) return "Balanza";
        return name.replace("'", "\\'").replace("\"", "\\\"");
    }

    private String escapeAscii(String s) {
        if (s == null) return "";
        return s.replace("'", "\\'").replace("\\", "\\\\");
    }
}
