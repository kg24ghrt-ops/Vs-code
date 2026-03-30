package com.renamecompanyname.renameappname.logging

import java.util.Date

data class LogEntry(
    val timestamp: Long = System.currentTimeMillis(),
    val level: String,
    val tag: String?,
    val message: String,
    val throwable: Throwable? = null
)