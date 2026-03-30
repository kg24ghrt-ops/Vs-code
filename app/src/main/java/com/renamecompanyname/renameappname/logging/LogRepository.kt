package com.renamecompanyname.renameappname.logging

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

object LogRepository {
    private val _logs = MutableStateFlow<List<LogEntry>>(emptyList())
    val logs: StateFlow<List<LogEntry>> = _logs.asStateFlow()

    fun addLog(entry: LogEntry) {
        _logs.update { list -> (list + entry).takeLast(1000) } // keep last 1000
    }

    fun clearLogs() {
        _logs.update { emptyList() }
    }
}