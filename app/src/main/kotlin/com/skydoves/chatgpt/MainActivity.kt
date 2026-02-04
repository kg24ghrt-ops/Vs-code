package com.skydoves.chatgpt

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import com.skydoves.chatgpt.core.designsystem.composition.LocalOnFinishDispatcher
import com.skydoves.chatgpt.core.designsystem.theme.ChatGPTComposeTheme
import com.skydoves.chatgpt.core.navigation.AppComposeNavigator
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import com.skydoves.chatgpt.ui.test.SpecialTestScreen

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

  @Inject
  internal lateinit var appComposeNavigator: AppComposeNavigator

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    setContent {
      CompositionLocalProvider(
        LocalOnFinishDispatcher provides { finish() }
      ) {
        ChatGPTComposeTheme {
          // 🔹 Replace the full app UI with our test screen
          SpecialTestScreen()
        }
      }
    }
  }
}