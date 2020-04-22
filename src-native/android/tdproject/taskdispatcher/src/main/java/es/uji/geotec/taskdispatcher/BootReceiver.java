package es.uji.geotec.taskdispatcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import es.uji.geotec.taskdispatcher.common.ReceiverActivationCache;

public class BootReceiver extends BroadcastReceiver {

    private static BootReceiverDelegate delegate;
    private static ReceiverActivationCache activationCache;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || !Intent.ACTION_BOOT_COMPLETED.equalsIgnoreCase(intent.getAction())) {
            return;
        }

        Log.d("BootReceiver", "Native boot completed! Wait for it...");
        if (delegate != null) {
            delegate.onReceive(context, intent);
        } else {
            activationCache = new ReceiverActivationCache(context, intent);
        }
    }

    public static void setBootReceiverDelegate(BootReceiverDelegate bootReceiverDelegate) {
        delegate = bootReceiverDelegate;
        if (activationCache != null) {
            delegate.onReceive(activationCache.getContext(), activationCache.getIntent());
            activationCache = null;
        }
    }

}
