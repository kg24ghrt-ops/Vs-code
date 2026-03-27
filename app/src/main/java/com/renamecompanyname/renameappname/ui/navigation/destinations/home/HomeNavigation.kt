package com.renamecompanyname.renameappname.ui.navigation.destinations.home

import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.renamecompanyname.renameappname.presentation.home.HomeViewModel
import com.renamecompanyname.renameappname.ui.home.HomeScreen
import kotlinx.serialization.Serializable

@Serializable
object Home

fun NavController.navigateToHome() {
    navigate(route = Home)
}

fun NavGraphBuilder.homeDestination() {
    composable<Home> {
        val viewModel: HomeViewModel = hiltViewModel()
        val uiState by viewModel.uiState.collectAsState()
        HomeScreen(
            uiState = uiState,
            onEvent = viewModel::onEvent
        )
    }
}