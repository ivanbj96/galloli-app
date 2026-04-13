// android/app/src/main/java/store/ivapps/galloli/MainActivity.java
package store.ivapps.galloli;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // CRÍTICO: registerPlugin ANTES de super.onCreate()
        registerPlugin(BleForegroundPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
