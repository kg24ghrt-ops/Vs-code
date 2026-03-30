package com.renamecompanyname.renameappname.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.renamecompanyname.renameappname.ui.logs.LogScreen
import com.renamecompanyname.renameappname.ui.navigation.destinations.home.Home
import com.renamecompanyname.renameappname.ui.navigation.destinations.home.homeDestination
import kotlinx.serialization.Serializable

@Serializable
object Logs

@Composable
fun NavigationHost(
    modifier: Modifier,
    navController: NavHostController,
) {
    NavHost(
        modifier = modifier,
        navController = navController,
        startDestination = Home,
    ) {
        homeDestination(onNavigateToLogs = { navController.navigate(Logs) })
        composable<Logs> {
            LogScreen(onBack = { navController.popBackStack() })
        }
    }
}