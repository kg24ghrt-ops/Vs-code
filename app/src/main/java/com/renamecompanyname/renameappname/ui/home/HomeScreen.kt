package com.renamecompanyname.renameappname.ui.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.renamecompanyname.renameappname.presentation.home.HomeViewModel

@Composable
fun HomeScreen(
    uiState: HomeViewModel.UiState,
    onEvent: (HomeViewModel.UiEvent) -> Unit,
    onNavigateToLogs: () -> Unit
) {
    // Fetch cache stats when screen loads
    LaunchedEffect(Unit) {
        onEvent(HomeViewModel.UiEvent.GetCacheStats)
    }
    
    // Clear any temporary cache-cleared flag after a short delay
    LaunchedEffect(uiState.cacheCleared) {
        if (uiState.cacheCleared) {
            kotlinx.coroutines.delay(3000)
            onEvent(HomeViewModel.UiEvent.ClearCacheFlag)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Top,
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
        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = uiState.templateUrl,
            onValueChange = { onEvent(HomeViewModel.UiEvent.UpdateTemplateUrl(it)) },
            label = { Text("Template URL (GitHub ZIP)") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(24.dp))

        // Cache stats card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Template Cache",
                        style = MaterialTheme.typography.titleSmall
                    )
                    Text(
                        text = "${uiState.cacheCount} template(s) stored",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    if (uiState.cacheCleared) {
                        Text(
                            text = "Cache cleared!",
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
                Button(
                    onClick = { onEvent(HomeViewModel.UiEvent.ClearCache) },
                    enabled = uiState.cacheCount > 0 && !uiState.isGenerating
                ) {
                    Text("Clear Cache")
                }
            }
        }
        Spacer(modifier = Modifier.height(16.dp))

        // Error display
        if (uiState.error != null) {
            Text(
                text = uiState.error,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }

        // Download progress
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

        // Logs button
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = onNavigateToLogs,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.secondary
            )
        ) {
            Text("View Developer Logs")
        }
    }
}