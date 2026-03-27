package com.renamecompanyname.renameappname.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.navigation
import com.renamecompanyname.renameappname.ui.navigation.NestedGraphs.ProfileGraph
import com.renamecompanyname.renameappname.ui.navigation.destinations.home.Home
import com.renamecompanyname.renameappname.ui.navigation.destinations.home.homeDestination
import com.renamecompanyname.renameappname.ui.navigation.destinations.home.navigateToHome
import com.renamecompanyname.renameappname.ui.navigation.destinations.profile.Profile
import com.renamecompanyname.renameappname.ui.navigation.destinations.profile.editProfileDestination
import com.renamecompanyname.renameappname.ui.navigation.destinations.profile.navigateToEditProfile
import com.renamecompanyname.renameappname.ui.navigation.destinations.profile.navigateToProfile
import com.renamecompanyname.renameappname.ui.navigation.destinations.profile.profileDestination
import kotlinx.serialization.Serializable

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

        // Keep profile navigation if you still need it; remove if not.
        navigation<ProfileGraph>(startDestination = Profile(id = "")) {
            profileDestination(
                onNavigateToHome = { navController.navigateToHome() },
                onNavigateToEditProfile = { navController.navigateToEditProfile(it) },
            )
            editProfileDestination(
                onNavigateToProfile = { navController.navigateToProfile(it) },
            )
        }
    }
}

internal sealed class NestedGraphs {
    @Serializable
    internal data class ProfileGraph(val id: String = "")
}