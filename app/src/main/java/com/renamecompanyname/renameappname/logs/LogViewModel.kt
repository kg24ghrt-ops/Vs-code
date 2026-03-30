package com.renamecompanyname.renameappname.presentation.logs

import androidx.lifecycle.ViewModel
import com.renamecompanyname.renameappname.logging.LogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class LogViewModel @Inject constructor() : ViewModel() {
    val logs = LogRepository.logs

    fun clearLogs() {
        LogRepository.clearLogs()
    }
}