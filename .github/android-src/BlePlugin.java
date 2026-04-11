package store.ivapps.galloli;

import android.Manifest;
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
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@CapacitorPlugin(
    name = "BlePlugin",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN }, alias = "bleScan"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bleConnect"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location")
    }
)
public class BlePlugin extends Plugin {

    private static final UUID SERVICE_UUID = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_UUID    = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD_UUID    = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bleScanner;
    private BluetoothGatt connectedGatt;
    private boolean isScanning = false;
    private String targetDeviceId = null;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        if (bm != null) {
            bluetoothAdapter = bm.getAdapter();
            if (bluetoothAdapter != null) {
                bleScanner = bluetoothAdapter.getBluetoothLeScanner();
            }
        }
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        boolean enabled = bluetoothAdapter != null && bluetoothAdapter.isEnabled();
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void scanAndConnect(PluginCall call) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth no habilitado");
            return;
        }
        if (isScanning) {
            call.reject("Ya escaneando");
            return;
        }

        isScanning = true;
        notifyListeners("scanStart", new JSObject());

        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build();

        // Escanear sin filtro para encontrar cualquier dispositivo BLE
        bleScanner.startScan(null, settings, new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                BluetoothDevice device = result.getDevice();
                String name = device.getName();
                if (name == null || name.isEmpty()) return; // ignorar sin nombre

                String id = device.getAddress();
                bleScanner.stopScan(this);
                isScanning = false;

                JSObject found = new JSObject();
                found.put("deviceId", id);
                found.put("name", name);
                notifyListeners("deviceFound", found);

                targetDeviceId = id;
                mainHandler.post(() -> connectToDevice(device));
            }

            @Override
            public void onScanFailed(int errorCode) {
                isScanning = false;
                JSObject err = new JSObject();
                err.put("message", "Escaneo fallido: " + errorCode);
                notifyListeners("error", err);
            }
        });

        // Timeout 10s
        mainHandler.postDelayed(() -> {
            if (isScanning) {
                isScanning = false;
                JSObject stop = new JSObject();
                notifyListeners("scanStop", stop);
            }
        }, 10000);

        call.resolve();
    }

    @PluginMethod
    public void connectById(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null || bluetoothAdapter == null) {
            call.reject("deviceId requerido");
            return;
        }
        targetDeviceId = deviceId;
        BluetoothDevice device = bluetoothAdapter.getRemoteDevice(deviceId);
        mainHandler.post(() -> connectToDevice(device));
        call.resolve();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        targetDeviceId = null;
        if (connectedGatt != null) {
            connectedGatt.disconnect();
            connectedGatt.close();
            connectedGatt = null;
        }
        call.resolve();
    }

    private void connectToDevice(BluetoothDevice device) {
        if (connectedGatt != null) {
            connectedGatt.close();
        }
        connectedGatt = device.connectGatt(getContext(), false, new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                if (newState == BluetoothGatt.STATE_CONNECTED) {
                    connectedGatt = gatt;
                    JSObject data = new JSObject();
                    data.put("deviceId", gatt.getDevice().getAddress());
                    String n = gatt.getDevice().getName();
                    data.put("name", n != null ? n : "Balanza");
                    notifyListeners("connected", data);
                    gatt.discoverServices();
                } else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
                    connectedGatt = null;
                    notifyListeners("disconnected", new JSObject());
                    gatt.close();
                    // Auto-reconectar si tenemos el ID guardado
                    if (targetDeviceId != null) {
                        String savedId = targetDeviceId;
                        mainHandler.postDelayed(() -> {
                            BluetoothDevice d = bluetoothAdapter.getRemoteDevice(savedId);
                            connectToDevice(d);
                        }, 3000);
                    }
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                if (status != BluetoothGatt.GATT_SUCCESS) return;
                BluetoothGattService service = gatt.getService(SERVICE_UUID);
                if (service == null) return;
                BluetoothGattCharacteristic ch = service.getCharacteristic(CHAR_UUID);
                if (ch == null) return;
                gatt.setCharacteristicNotification(ch, true);
                BluetoothGattDescriptor desc = ch.getDescriptor(CCCD_UUID);
                if (desc != null) {
                    desc.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    gatt.writeDescriptor(desc);
                }
            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic ch) {
                byte[] data = ch.getValue();
                if (data == null) return;
                StringBuilder hex = new StringBuilder();
                for (byte b : data) hex.append(String.format("%02x", b));
                String ascii = new String(data).replaceAll("[^\\x20-\\x7E]", "?");
                JSObject payload = new JSObject();
                payload.put("hex", hex.toString());
                payload.put("ascii", ascii);
                notifyListeners("data", payload);
            }
        });
    }
}
