package com.renamecompanyname.renameappname.presentation.home

import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.renamecompanyname.renameappname.data.TemplateDatabase
import com.renamecompanyname.renameappname.generator.ProjectGenerator
import com.renamecompanyname.renameappname.generator.TemplateDownloader
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import java.util.Date
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val application: Application
) : ViewModel() {

    private val prefs: SharedPreferences = application.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
    private val defaultTemplateUrl = "https://github.com/PimDhaen/modern-android-template-quick-start/archive/refs/heads/main.zip"

    private val downloader = TemplateDownloader(application)
    private val generator = ProjectGenerator(application)
    private val database = TemplateDatabase.getInstance(application)

    private val _uiState = MutableStateFlow(
        UiState(
            templateUrl = prefs.getString("template_url", defaultTemplateUrl) ?: defaultTemplateUrl
        )
    )
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun onEvent(event: UiEvent) {
        when (event) {
            is UiEvent.UpdateProjectName -> _uiState.update { it.copy(projectName = event.value) }
            is UiEvent.UpdatePackageName -> _uiState.update { it.copy(packageName = event.value) }
            is UiEvent.UpdateTemplateUrl -> {
                _uiState.update { it.copy(templateUrl = event.value) }
                prefs.edit().putString("template_url", event.value).apply()
            }
            is UiEvent.GenerateProject -> generateProject()
            is UiEvent.ShareGenerated -> shareGeneratedProject(event.filePath)
            is UiEvent.ClearShareIntent -> _uiState.update { it.copy(shareIntent = null) }
            is UiEvent.GetCacheStats -> getCacheStats()
            is UiEvent.ClearCache -> clearCache()
            is UiEvent.ClearCacheFlag -> _uiState.update { it.copy(cacheCleared = false) }
        }
    }

    private fun generateProject() {
        val current = _uiState.value
        if (current.projectName.isBlank() || current.packageName.isBlank()) {
            _uiState.update { it.copy(error = "Project name and package name cannot be empty") }
            return
        }
        _uiState.update { it.copy(isGenerating = true, error = null, downloadProgress = 0) }

        viewModelScope.launch {
            downloader.downloadTemplate(current.templateUrl)
                .catch { error ->
                    _uiState.update {
                        it.copy(
                            isGenerating = false,
                            error = "Download failed: ${error.message}"
                        )
                    }
                }
                .collect { event ->
                    when (event) {
                        is TemplateDownloader.DownloadEvent.Progress -> {
                            _uiState.update { it.copy(downloadProgress = event.progress) }
                        }
                        is TemplateDownloader.DownloadEvent.Success -> {
                            val outputDir = File(application.cacheDir, "generated_${System.currentTimeMillis()}")
                            val generatedDir = generator.generateFromZip(
                                zipUri = event.zipUri,
                                projectName = current.projectName,
                                packageName = current.packageName,
                                outputDir = outputDir
                            )
                            if (generatedDir != null) {
                                val zipFile = generator.zipDirectory(generatedDir)
                                if (zipFile != null) {
                                    _uiState.update {
                                        it.copy(
                                            isGenerating = false,
                                            generatedProjectPath = zipFile.absolutePath,
                                            error = null
                                        )
                                    }
                                } else {
                                    _uiState.update {
                                        it.copy(
                                            isGenerating = false,
                                            error = "Failed to create output zip"
                                        )
                                    }
                                }
                            } else {
                                _uiState.update {
                                    it.copy(
                                        isGenerating = false,
                                        error = "Generation failed"
                                    )
                                }
                            }
                        }
                        is TemplateDownloader.DownloadEvent.Failure -> {
                            _uiState.update {
                                it.copy(
                                    isGenerating = false,
                                    error = "Download failed: ${event.error}"
                                )
                            }
                        }
                    }
                }
        }
    }

    private fun shareGeneratedProject(filePath: String) {
        val file = File(filePath)
        if (!file.exists()) return

        val uri = FileProvider.getUriForFile(
            application,
            "${application.packageName}.fileprovider",
            file
        )
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "application/zip"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        _uiState.update { it.copy(shareIntent = shareIntent) }
    }

    private fun getCacheStats() {
        viewModelScope.launch {
            val count = database.templateDao().getCount()
            _uiState.update { it.copy(cacheCount = count) }
        }
    }

    private fun clearCache() {
        viewModelScope.launch {
            // Delete all cached templates
            database.templateDao().deleteAll()
            _uiState.update { it.copy(cacheCount = 0, cacheCleared = true) }
        }
    }

    data class UiState(
        val projectName: String = "",
        val packageName: String = "com.example.myapp",
        val templateUrl: String = "",
        val isGenerating: Boolean = false,
        val downloadProgress: Int = 0,
        val error: String? = null,
        val generatedProjectPath: String? = null,
        val shareIntent: Intent? = null,
        val cacheCount: Int = 0,
        val cacheCleared: Boolean = false
    )

    sealed class UiEvent {
        data class UpdateProjectName(val value: String) : UiEvent()
        data class UpdatePackageName(val value: String) : UiEvent()
        data class UpdateTemplateUrl(val value: String) : UiEvent()
        object GenerateProject : UiEvent()
        data class ShareGenerated(val filePath: String) : UiEvent()
        object ClearShareIntent : UiEvent()
        object GetCacheStats : UiEvent()
        object ClearCache : UiEvent()
        object ClearCacheFlag : UiEvent()
    }
}