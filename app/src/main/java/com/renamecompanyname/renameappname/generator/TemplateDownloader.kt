package com.renamecompanyname.renameappname.generator

import android.app.DownloadManager
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import androidx.core.net.toUri
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

class TemplateDownloader(private val context: Context) {

    private val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    fun downloadTemplate(url: String): Flow<DownloadEvent> = callbackFlow {
        val downloadId = enqueueDownload(url)
        val observer = DownloadObserver(downloadId) { event ->
            trySend(event)
            if (event is DownloadEvent.Success || event is DownloadEvent.Failure) {
                close()
            }
        }
        context.contentResolver.registerContentObserver(
            Uri.parse("content://downloads/my_downloads"),
            true,
            observer
        )

        awaitClose {
            context.contentResolver.unregisterContentObserver(observer)
        }
    }

    private fun enqueueDownload(url: String): Long {
        val request = DownloadManager.Request(url.toUri()).apply {
            setTitle("Project Template")
            setDescription("Downloading Android project template")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                "android_template.zip"
            )
            setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI or DownloadManager.Request.NETWORK_MOBILE)
        }
        return downloadManager.enqueue(request)
    }

    private inner class DownloadObserver(
        private val downloadId: Long,
        private val onEvent: (DownloadEvent) -> Unit
    ) : ContentObserver(Handler(Looper.getMainLooper())) {

        override fun onChange(selfChange: Boolean) {
            val query = DownloadManager.Query().setFilterById(downloadId)
            downloadManager.query(query).use { cursor ->
                if (cursor.moveToFirst()) {
                    val status = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_STATUS))
                    val bytesDownloaded = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                    val bytesTotal = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))

                    val progress = if (bytesTotal > 0) (bytesDownloaded * 100 / bytesTotal) else 0

                    when (status) {
                        DownloadManager.STATUS_SUCCESSFUL -> {
                            val uri = cursor.getString(cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI))
                            uri?.let {
                                onEvent(DownloadEvent.Success(it.toUri()))
                            } ?: onEvent(DownloadEvent.Failure("No URI for downloaded file"))
                        }
                        DownloadManager.STATUS_FAILED -> {
                            val reason = cursor.getString(cursor.getColumnIndex(DownloadManager.COLUMN_REASON))
                            onEvent(DownloadEvent.Failure("Download failed: $reason"))
                        }
                        else -> {
                            onEvent(DownloadEvent.Progress(progress))
                        }
                    }
                }
            }
        }
    }

    sealed class DownloadEvent {
        data class Progress(val progress: Int) : DownloadEvent()
        data class Success(val zipUri: Uri) : DownloadEvent()
        data class Failure(val error: String) : DownloadEvent()
    }
}