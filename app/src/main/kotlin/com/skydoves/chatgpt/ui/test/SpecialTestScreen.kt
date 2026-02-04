// package: use your app package, e.g. com.skydoves.chatgpt.ui.test
package com.skydoves.chatgpt.ui.test

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.icons.Icons
import androidx.compose.material3.icons.filled.PlayArrow
import androidx.compose.material3.icons.filled.Save
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.skydoves.chatgpt.core.designsystem.theme.ChatGPTComposeTheme
import kotlinx.coroutines.launch

@Composable
fun SpecialTestScreen(
  modifier: Modifier = Modifier,
  onRun: (String, String) -> String = { input, mode -> com.skydoves.chatgpt.ui.test.SpecialCalculator.calculate(input, mode) }
) {
  ChatGPTComposeTheme {
    Surface(modifier = modifier.fillMaxSize()) {
      val scope = rememberCoroutineScope()
      var input by remember { mutableStateOf("") }
      var mode by remember { mutableStateOf("Interpret") }
      val modes = listOf("Interpret", "Validate", "Batch")
      var result by remember { mutableStateOf<String?>(null) }
      var history by remember { mutableStateOf(listOf<String>()) }
      var showRaw by remember { mutableStateOf(false) }

      Column(
        modifier = Modifier
          .fillMaxSize()
          .padding(16.dp)
      ) {
        Text(
          text = "Special Definitions Tester",
          style = MaterialTheme.typography.headlineSmall,
          modifier = Modifier.fillMaxWidth(),
          textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(12.dp))

        Card(
          modifier = Modifier
            .fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(12.dp)),
          shape = RoundedCornerShape(12.dp),
        ) {
          Column(modifier = Modifier.padding(12.dp)) {
            OutlinedTextField(
              value = input,
              onValueChange = { input = it },
              label = { Text("Enter number or token (e.g. 12,d,a,rr)") },
              singleLine = true,
              modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(10.dp))

            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.SpaceBetween,
              modifier = Modifier.fillMaxWidth()
            ) {
              // mode chips
              Row {
                modes.forEach { m ->
                  val selected = m == mode
                  AssistChip(
                    onClick = { mode = m },
                    label = { Text(m) },
                    modifier = Modifier.padding(end = 8.dp),
                    colors = AssistChipDefaults.assistChipColors(
                      containerColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                      labelColor = if (selected) Color.White else MaterialTheme.colorScheme.onSurface
                    )
                  )
                }
              }

              Row {
                IconButton(onClick = { showRaw = !showRaw }) {
                  Text(if (showRaw) "Raw ON" else "Raw OFF")
                }
              }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
              Button(
                onClick = {
                  // run
                  scope.launch {
                    val out = onRun(input.trim(), mode)
                    result = out
                    history = listOf("${input.trim()} [$mode] → ${out.take(400)}") + history
                  }
                },
                modifier = Modifier.padding(end = 8.dp),
                icon = { Icon(Icons.Default.PlayArrow, contentDescription = null) }
              ) { Text("Run") }

              FilledTonalButton(onClick = {
                // quick sample inputs
                input = when (input) {
                  "" -> "12,d,a"
                  else -> ""
                }
              }) { Text("Preset") }

              Spacer(modifier = Modifier.width(8.dp))

              IconButton(onClick = { /* save stub - disabled until you confirm DB hookup */ }) {
                Icon(Icons.Default.Save, contentDescription = "Save (disabled)")
              }
            }
          }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // result card
        result?.let { res ->
          Card(
            modifier = Modifier
              .fillMaxWidth()
              .heightIn(min = 80.dp)
              .padding(bottom = 8.dp),
            shape = RoundedCornerShape(10.dp)
          ) {
            Column(modifier = Modifier.padding(12.dp)) {
              Text("Result", style = MaterialTheme.typography.titleMedium)
              Spacer(modifier = Modifier.height(8.dp))
              Text(if (showRaw) res else res.split("\n").joinToString("\n") { it }, style = MaterialTheme.typography.bodyMedium)
            }
          }
        }

        // history + quick help
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
          Text("History", style = MaterialTheme.typography.titleMedium)
          Text("Tip: use comma to separate values", style = MaterialTheme.typography.bodySmall)
        }

        Spacer(modifier = Modifier.height(6.dp))

        LazyColumn(modifier = Modifier.weight(1f)) {
          items(history) { item ->
            Card(modifier = Modifier
              .fillMaxWidth()
              .padding(vertical = 4.dp),
              shape = RoundedCornerShape(8.dp)
            ) {
              Text(item, modifier = Modifier.padding(10.dp))
            }
          }
        }

        Spacer(modifier = Modifier.height(6.dp))

        // footer quick-reference for definitions
        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp)) {
          Column(modifier = Modifier.padding(10.dp)) {
            Text("Quick definitions (sample):", style = MaterialTheme.typography.titleSmall)
            Spacer(modifier = Modifier.height(6.dp))
            FlowRowDemo()
          }
        }
      }
    }
  }
}

@Composable
private fun FlowRowDemo() {
  val map = com.skydoves.chatgpt.ui.test.SpecialCalculator.definitions
  Column {
    Row(modifier = Modifier.fillMaxWidth()) {
      map.entries.take(6).forEach { (k, v) ->
        AssistChip(onClick = {}, label = { Text("$k: ${v.short}") }, modifier = Modifier.padding(4.dp))
      }
    }
    Spacer(modifier = Modifier.height(6.dp))
    Row {
      map.entries.drop(6).take(6).forEach { (k, v) ->
        AssistChip(onClick = {}, label = { Text("$k: ${v.short}") }, modifier = Modifier.padding(4.dp))
      }
    }
  }
}

private fun Button(
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
  icon: @Composable (() -> Unit)? = null,
  content: @Composable () -> Unit
) {
  if (icon == null) {
    androidx.compose.material3.Button(onClick = onClick, modifier = modifier) { content() }
  } else {
    androidx.compose.material3.Button(onClick = onClick, modifier = modifier) {
      icon()
      Spacer(modifier = Modifier.width(8.dp))
      content()
    }
  }
}