package com.meshnet.ai

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * MeshNetForegroundService - Background service for continuous monitoring
 * 
 * This service keeps the app running in the background to:
 * - Monitor BLE connections
 * - Maintain mesh network heartbeat
 * - Receive emergency alerts
 * - Keep signal monitoring active
 * 
 * Required for Android 8.0+ background execution limitations.
 */
class MeshNetForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "MeshNetForegroundChannel"
        private const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.meshnet.ai.START_FOREGROUND"
        const val ACTION_STOP = "com.meshnet.ai.STOP_FOREGROUND"

        /**
         * Create notification channel for Android 8.0+
         */
        fun createNotificationChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "MeshNet Monitoring",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Background monitoring for MeshNet emergency communications"
                    setShowBadge(false)
                }

                val notificationManager = context.getSystemService(NotificationManager::class.java)
                notificationManager.createNotificationChannel(channel)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null // This is a started service, not bound
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                startForegroundService()
                return START_STICKY
            }
            ACTION_STOP -> {
                stopForegroundService()
                return START_NOT_STICKY
            }
            else -> {
                stopSelf()
                return START_NOT_STICKY
            }
        }
    }

    /**
     * Start the foreground service with notification
     */
    private fun startForegroundService() {
        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)
    }

    /**
     * Stop the foreground service
     */
    private fun stopForegroundService() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /**
     * Create the notification for the foreground service
     */
    private fun createNotification(): Notification {
        // Create intent to open app when notification is tapped
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MeshNet Active")
            .setContentText("Monitoring mesh network for emergency signals")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        // Cleanup resources when service is destroyed
    }
}
