package com.renamecompanyname.renameappname.presentation.home

import android.app.Application
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.renamecompanyname.renameappname.generator.ProjectGenerator
import com.renamecompanyname.renameappname.generator.TemplateDownloader
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val application: Application
) : ViewModel() {

    private val templateUrl = "https://github.com/PimDhaen/modern-android-template-quick-start/archive/refs/heads/main.zip"
    private val downloader = TemplateDownloader(application)
    private val generator = ProjectGenerator(application)

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun onEvent(event: UiEvent) {
        when (event) {
            is UiEvent.UpdateProjectName -> _uiState.update { it.copy(projectName = event.value) }
            is UiEvent.UpdatePackageName -> _uiState.update { it.copy(packageName = event.value) }
            is UiEvent.GenerateProject -> generateProject()
            is UiEvent.ShareGenerated -> shareGeneratedProject(event.filePath)
            is UiEvent.ClearShareIntent -> _uiState.update { it.copy(shareIntent = null) }
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
            downloader.downloadTemplate(templateUrl)
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

    data class UiState(
        val projectName: String = "",
        val packageName: String = "com.example.myapp",
        val isGenerating: Boolean = false,
        val downloadProgress: Int = 0,
        val error: String? = null,
        val generatedProjectPath: String? = null,
        val shareIntent: Intent? = null
    )

    sealed class UiEvent {
        data class UpdateProjectName(val value: String) : UiEvent()
        data class UpdatePackageName(val value: String) : UiEvent()
        object GenerateProject : UiEvent()
        data class ShareGenerated(val filePath: String) : UiEvent()
        object ClearShareIntent : UiEvent()
    }
}