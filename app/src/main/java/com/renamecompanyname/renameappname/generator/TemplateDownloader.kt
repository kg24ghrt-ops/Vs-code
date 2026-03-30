package com.renamecompanyname.renameappname.generator

import android.app.DownloadManager
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Environment
import android.os.Handler
import android.os.Looper
import androidx.core.net.toUri
import com.renamecompanyname.renameappname.data.CachedTemplate
import com.renamecompanyname.renameappname.data.TemplateDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Date

class TemplateDownloader(private val context: Context) {

    private val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private val database = TemplateDatabase.getInstance(context)

    /**
     * Downloads template with caching support.
     * Checks cache first, only downloads if ETag changed or no cache exists.
     */
    suspend fun downloadTemplate(url: String): Flow<DownloadEvent> = callbackFlow {
        try {
            // Step 1: Check cache
            val cached = withContext(Dispatchers.IO) {
                database.templateDao().getByUrl(url)
            }

            // Step 2: Check if remote file has changed
            val remoteInfo = withContext(Dispatchers.IO) {
                getRemoteFileInfo(url)
            }

            Timber.d("Cached: ETag=${cached?.etag}, Remote: ETag=${remoteInfo?.etag}")

            // Step 3: If cache exists and ETag matches, use cached version
            if (cached != null && cached.etag == remoteInfo?.etag) {
                Timber.i("Using cached template from: ${cached.cachedFilePath}")
                trySend(DownloadEvent.Progress(100))
                trySend(DownloadEvent.Success(Uri.fromFile(File(cached.cachedFilePath))))
                close()
                return@callbackFlow
            }

            // Step 4: Otherwise download new version
            Timber.i("Downloading fresh template from: $url")
            val downloadId = enqueueDownload(url)
            val observer = DownloadObserver(downloadId, url, remoteInfo) { event ->
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
        } catch (e: Exception) {
            Timber.e(e, "Download failed")
            trySend(DownloadEvent.Failure(e.message ?: "Unknown error"))
            close()
        }
    }

    private suspend fun getRemoteFileInfo(url: String): RemoteFileInfo? = withContext(Dispatchers.IO) {
        try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.requestMethod = "HEAD"
            connection.connect()

            val etag = connection.getHeaderField("ETag")
            val lastModified = connection.getHeaderField("Last-Modified")
            val contentLength = connection.contentLengthLong

            connection.disconnect()

            RemoteFileInfo(etag, lastModified, contentLength)
        } catch (e: Exception) {
            Timber.w(e, "Failed to get remote file info")
            null
        }
    }

    private fun enqueueDownload(url: String): Long {
        val fileName = "template_${System.currentTimeMillis()}.zip"
        val destination = File(context.cacheDir, fileName).absolutePath

        val request = DownloadManager.Request(url.toUri()).apply {
            setTitle("Project Template")
            setDescription("Downloading Android project template")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationUri(Uri.fromFile(File(destination)))
            setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI or DownloadManager.Request.NETWORK_MOBILE)
        }
        return downloadManager.enqueue(request)
    }

    private inner class DownloadObserver(
        private val downloadId: Long,
        private val templateUrl: String,
        private val remoteInfo: RemoteFileInfo?,
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
                    Timber.d("Download progress: $progress% ($bytesDownloaded/$bytesTotal)")

                    when (status) {
                        DownloadManager.STATUS_SUCCESSFUL -> {
                            val uri = cursor.getString(cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI))
                            uri?.let { uriString ->
                                val fileUri = uriString.toUri()
                                val filePath = getFilePathFromUri(fileUri)

                                // Save to cache in a background coroutine
                                if (filePath != null) {
                                    CoroutineScope(Dispatchers.IO).launch {
                                        saveToCache(templateUrl, filePath, remoteInfo)
                                    }
                                }

                                Timber.i("Download completed: $filePath")
                                onEvent(DownloadEvent.Success(fileUri))
                            } ?: onEvent(DownloadEvent.Failure("No URI for downloaded file"))
                        }
                        DownloadManager.STATUS_FAILED -> {
                            val reason = cursor.getString(cursor.getColumnIndex(DownloadManager.COLUMN_REASON))
                            Timber.e("Download failed: $reason")
                            onEvent(DownloadEvent.Failure("Download failed: $reason"))
                        }
                        else -> {
                            onEvent(DownloadEvent.Progress(progress))
                        }
                    }
                }
            }
        }

        private fun getFilePathFromUri(uri: Uri): String? {
            return try {
                // Use content resolver to get the actual file path
                context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val columnIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_FILENAME)
                    if (cursor.moveToFirst() && columnIndex >= 0) {
                        cursor.getString(columnIndex)
                    } else {
                        null
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to get file path from URI")
                null
            }
        }

        private suspend fun saveToCache(url: String, filePath: String, remoteInfo: RemoteFileInfo?) {
            withContext(Dispatchers.IO) {
                val template = CachedTemplate(
                    templateUrl = url,
                    cachedFilePath = filePath,
                    etag = remoteInfo?.etag,
                    lastModified = remoteInfo?.lastModified,
                    lastDownloaded = Date(),
                    fileSize = remoteInfo?.contentLength ?: File(filePath).length()
                )
                database.templateDao().insert(template)
                Timber.d("Saved to cache: $filePath")
            }
        }
    }

    data class RemoteFileInfo(
        val etag: String?,
        val lastModified: String?,
        val contentLength: Long
    )

    sealed class DownloadEvent {
        data class Progress(val progress: Int) : DownloadEvent()
        data class Success(val zipUri: Uri) : DownloadEvent()
        data class Failure(val error: String) : DownloadEvent()
    }
}
//libs.versions.toml