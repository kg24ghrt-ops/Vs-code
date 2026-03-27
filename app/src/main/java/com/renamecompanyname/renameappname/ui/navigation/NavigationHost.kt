package com.renamecompanyname.renameappname.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import com.renamecompanyname.renameappname.ui.navigation.destinations.home.Home
import com.renamecompanyname.renameappname.ui.navigation.destinations.home.homeDestination

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
        homeDestination()
    }
}