package com.skydoves.chatgpt.ui.test

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.PlayArrow
import androidx.compose.material.icons.filled.ClearAll
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.skydoves.chatgpt.core.designsystem.theme.ChatGPTComposeTheme
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SpecialTestScreen(
    modifier: Modifier = Modifier,
    onRun: (String, String) -> String = { input, mode ->
        SpecialCalculator.calculate(input, mode)
    }
) {
    ChatGPTComposeTheme {
        val scope = rememberCoroutineScope()
        var input by remember { mutableStateOf("") }
        var mode by remember { mutableStateOf("Interpret") }
        val modes = listOf("Interpret", "Validate", "Batch")
        var result by remember { mutableStateOf<String?>(null) }
        var history by remember { mutableStateOf(listOf<Pair<String, String>>()) } // Input to Result pair
        var showRaw by remember { mutableStateOf(false) }

        Scaffold(
            topBar = {
                CenterAlignedTopAppBar(
                    title = { Text("Definitions Tester", fontWeight = FontWeight.Bold) },
                    actions = {
                        IconButton(onClick = { showRaw = !showRaw }) {
                            Icon(
                                imageVector = Icons.Default.Code,
                                contentDescription = "Toggle Raw View",
                                tint = if (showRaw) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
                            )
                        }
                    }
                )
            }
        ) { innerPadding ->
            Column(
                modifier = modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(horizontal = 16.dp)
            ) {
                // Input Section
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    label = { Text("Number or Token") },
                    placeholder = { Text("e.g. 12, d, a") },
                    trailingIcon = {
                        if (input.isNotEmpty()) {
                            IconButton(onClick = { input = "" }) {
                                Icon(Icons.Default.ClearAll, contentDescription = "Clear")
                            }
                        }
                    },
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Mode Selection
                Text("Select Mode", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    modes.forEach { m ->
                        FilterChip(
                            selected = mode == m,
                            onClick = { mode = m },
                            label = { Text(m) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Button(
                        onClick = {
                            scope.launch {
                                val out = onRun(input.trim(), mode)
                                result = out
                                history = listOf("${input.trim()} [$mode]" to out) + history
                            }
                        },
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(12.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Run Process")
                    }

                    OutlinedButton(
                        onClick = { input = "12,d,a" },
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Preset")
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Result Area
                AnimatedVisibility(visible = result != null, enter = fadeIn(), exit = fadeOut()) {
                    ElevatedCard(
                        colors = CardDefaults.elevatedCardColors(
                            containerColor = MaterialTheme.colorScheme.secondaryContainer
                        ),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Latest Result", style = MaterialTheme.typography.titleSmall)
                            }
                            Divider(Modifier.padding(vertical = 8.dp), alpha = 0.2f)
                            Text(
                                text = result ?: "",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                        }
                    }
                }

                // History Section
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.History, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.outline)
                    Spacer(Modifier.width(8.dp))
                    Text("History", style = MaterialTheme.typography.titleMedium)
                }
                
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    items(history) { (title, res) ->
                        OutlinedCard(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            onClick = { input = title.split(" [")[0]; result = res }
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(title, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                                Text(res.take(60) + if (res.length > 60) "..." else "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
                            }
                        }
                    }
                }

                // Footer Definitions
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Quick Reference", style = MaterialTheme.typography.labelLarge)
                        Spacer(modifier = Modifier.height(8.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            SpecialCalculator.definitions.entries.take(8).forEach { (k, v) ->
                                SuggestionChip(
                                    onClick = { input += (if (input.isEmpty()) "" else ",") + k },
                                    label = { Text("$k: ${v.short}") }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
