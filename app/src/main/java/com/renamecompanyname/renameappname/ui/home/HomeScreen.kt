package com.renamecompanyname.renameappname.ui.home

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.renamecompanyname.renameappname.presentation.home.HomeViewModel

@Composable
fun HomeScreen(
    uiState: HomeViewModel.UiState,
    onEvent: (HomeViewModel.UiEvent) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Android Project Generator",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = uiState.projectName,
            onValueChange = { onEvent(HomeViewModel.UiEvent.UpdateProjectName(it)) },
            label = { Text("Project Name") },
            isError = uiState.error != null && uiState.projectName.isBlank(),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = uiState.packageName,
            onValueChange = { onEvent(HomeViewModel.UiEvent.UpdatePackageName(it)) },
            label = { Text("Package Name (e.g., com.example.myapp)") },
            isError = uiState.error != null && uiState.packageName.isBlank(),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(24.dp))

        // Show error if any
        if (uiState.error != null) {
            Text(
                text = uiState.error,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }

        // Show download progress if >0 and <100
        if (uiState.downloadProgress > 0 && uiState.downloadProgress < 100) {
            LinearProgressIndicator(
                progress = uiState.downloadProgress / 100f,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text("Downloading: ${uiState.downloadProgress}%")
            Spacer(modifier = Modifier.height(16.dp))
        }

        // Generate button
        Button(
            onClick = { onEvent(HomeViewModel.UiEvent.GenerateProject) },
            enabled = !uiState.isGenerating,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (uiState.isGenerating) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Generating...")
            } else {
                Text("Generate Project")
            }
        }

        // Share button after generation
        uiState.generatedProjectPath?.let { path ->
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = { onEvent(HomeViewModel.UiEvent.ShareGenerated(path)) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Share Generated Project")
            }
        }
    }
}