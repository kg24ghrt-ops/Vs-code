@file:Suppress("UnstableApiUsage")

import java.io.File
import java.io.FileInputStream
import java.util.*

plugins {
    id("skydoves.android.application")
    id("skydoves.android.application.compose")
    id("skydoves.android.hilt")
    id("skydoves.spotless")
    id("kotlin-parcelize")
    id("dagger.hilt.android.plugin")
    id("com.google.devtools.ksp")
    id(libs.plugins.google.secrets.get().pluginId)
    id(libs.plugins.baseline.profile.get().pluginId)
}

val keystoreProperties = Properties()
val keystorePropertiesFile = File(rootProject.rootDir, "keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.skydoves.chatgpt"
    compileSdk = Configurations.compileSdk

    defaultConfig {
        applicationId = "com.skydoves.chatgpt"
        minSdk = Configurations.minSdk
        targetSdk = Configurations.targetSdk
        versionCode = Configurations.versionCode
        versionName = Configurations.versionName
    }

    packaging {
        resources {
            excludes.add("/META-INF/{AL2.0,LGPL2.1}")
        }
    }

    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["releaseKeyAlias"] as String?
            keyPassword = keystoreProperties["releaseKeyPassword"] as String?
            storeFile = file(keystoreProperties["releaseStoreFile"] ?: "release/release-key.jks")
            storePassword = keystoreProperties["releaseStorePassword"] as String?
        }
    }

    buildTypes {
        release {
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs["release"]
            }
            isShrinkResources = true
            isMinifyEnabled = true
        }

        create("benchmark") {
            initWith(buildTypes.getByName("release"))
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
            isDebuggable = false
            proguardFiles("benchmark-rules.pro")
        }
    }
}

secrets {
    propertiesFileName = "secrets.properties"
    defaultPropertiesFileName = "secrets.defaults.properties"
}

dependencies {
    // core modules
    implementation(project(":core-designsystem"))
    implementation(project(":core-navigation"))
    implementation(project(":core-data"))

    // feature modules
    implementation(project(":feature-chat"))
    implementation(project(":feature-login"))

    // AndroidX & Jetpack
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Compose Material 3
    implementation("androidx.compose.material3:material3:1.2.0") // Add this
    implementation("androidx.compose.material3:material3-window-size-class:1.2.0") // Optional if you want responsive layout support

    // Compose tooling
    implementation(libs.androidx.compose.ui.tooling)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.constraintlayout)

    // Hilt
    implementation(libs.hilt.android)
    implementation(libs.androidx.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    // Image loading
    implementation(libs.landscapist.glide)

    // Logger
    implementation(libs.stream.log)

    // Crash tracer & restorer
    implementation(libs.snitcher)

    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.analytics)
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.crashlytics)

    // Baseline profile
    baselineProfile(project(":benchmark"))
}

if (file("google-services.json").exists()) {
    apply(plugin = libs.plugins.gms.googleServices.get().pluginId)
    apply(plugin = libs.plugins.firebase.crashlytics.get().pluginId)
}