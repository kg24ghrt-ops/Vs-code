package com.renamecompanyname.renameappname.presentation.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun onEvent(event: UiEvent) {
        when (event) {
            is UiEvent.UpdateProjectName -> _uiState.update { it.copy(projectName = event.value) }
            is UiEvent.UpdatePackageName -> _uiState.update { it.copy(packageName = event.value) }
            is UiEvent.GenerateProject -> generateProject()
        }
    }

    private fun generateProject() {
        val current = _uiState.value
        if (current.projectName.isBlank() || current.packageName.isBlank()) {
            _uiState.update { it.copy(error = "Project name and package name cannot be empty") }
            return
        }
        _uiState.update { it.copy(isGenerating = true, error = null) }

        viewModelScope.launch {
            try {
                // Simulate generation delay – replace with actual generation logic
                kotlinx.coroutines.delay(1500)
                _uiState.update { it.copy(isGenerating = false) }
                // Optionally, you could emit a success event or navigate to a result screen
            } catch (e: Exception) {
                _uiState.update { it.copy(isGenerating = false, error = e.message ?: "Generation failed") }
            }
        }
    }

    data class UiState(
        val projectName: String = "",
        val packageName: String = "com.example.myapp",
        val isGenerating: Boolean = false,
        val error: String? = null
    )

    sealed class UiEvent {
        data class UpdateProjectName(val value: String) : UiEvent()
        data class UpdatePackageName(val value: String) : UiEvent()
        object GenerateProject : UiEvent()
    }
}