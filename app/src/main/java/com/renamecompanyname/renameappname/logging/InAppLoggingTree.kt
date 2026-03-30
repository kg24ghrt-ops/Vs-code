package com.renamecompanyname.renameappname.logging

import android.util.Log
import timber.log.Timber

class InAppLoggingTree : Timber.Tree() {
    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        val level = when (priority) {
            Log.VERBOSE -> "VERBOSE"
            Log.DEBUG -> "DEBUG"
            Log.INFO -> "INFO"
            Log.WARN -> "WARN"
            Log.ERROR -> "ERROR"
            else -> "UNKNOWN"
        }
        val entry = LogEntry(
            level = level,
            tag = tag,
            message = message,
            throwable = t
        )
        LogRepository.addLog(entry)
    }
}