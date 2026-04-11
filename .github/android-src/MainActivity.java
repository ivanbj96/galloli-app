package store.ivapps.galloli;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // CRÍTICO: registerPlugin ANTES de super.onCreate()
        registerPlugin(BlePlugin.class);
        registerPlugin(PushPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
