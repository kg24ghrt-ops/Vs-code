package com.renamecompanyname.renameappname.presentation.home

import androidx.lifecycle.viewModelScope
import com.renamecompanyname.renameappname.presentation.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    // Later we will inject a ProjectGenerator service
) : BaseViewModel<HomeViewModel.UiState, HomeViewModel.UiEvent>() {

    override fun initialState(): UiState = UiState(
        projectName = "",
        packageName = "com.example.myapp",
        isGenerating = false,
        error = null
    )

    override fun onEvent(event: UiEvent) {
        when (event) {
            is UiEvent.UpdateProjectName -> updateState { copy(projectName = event.value) }
            is UiEvent.UpdatePackageName -> updateState { copy(packageName = event.value) }
            is UiEvent.GenerateProject -> generateProject()
        }
    }

    private fun generateProject() {
        val currentState = uiState.value
        if (currentState.projectName.isBlank() || currentState.packageName.isBlank()) {
            updateState { copy(error = "Project name and package name cannot be empty") }
            return
        }
        // Clear previous error and set loading
        updateState { copy(isGenerating = true, error = null) }

        viewModelScope.launch {
            try {
                // TODO: Call generator service
                // val outputPath = ProjectGenerator.generate(
                //     projectName = currentState.projectName,
                //     packageName = currentState.packageName
                // )
                // Simulate success after delay
                kotlinx.coroutines.delay(1500)
                updateState { copy(isGenerating = false) }
                // Optionally emit an event to show success message or navigate
                // sendEvent(UiEvent.ProjectGenerated(outputPath))
            } catch (e: Exception) {
                updateState { copy(isGenerating = false, error = e.message ?: "Generation failed") }
            }
        }
    }

    // Helper to update UI state safely
    private fun updateState(update: UiState.() -> UiState) {
        _uiState.update { update(it) }
    }

    data class UiState(
        val projectName: String,
        val packageName: String,
        val isGenerating: Boolean,
        val error: String?
    ) : BaseUiState

    sealed class UiEvent : BaseUiEvent {
        data class UpdateProjectName(val value: String) : UiEvent()
        data class UpdatePackageName(val value: String) : UiEvent()
        object GenerateProject : UiEvent()
    }
}