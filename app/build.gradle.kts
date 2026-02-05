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
    implementation("androidx.startup:startup-runtime:1.1.1")
    implementation("androidx.compose.material:material-icons-core:1.6.0")
    implementation("androidx.compose.material:material-icons-extended:1.6.0")
    
    // core modules
    implementation(project(":core-designsystem"))
    implementation(project(":core-navigation"))
    implementation(project(":core-data"))

    // feature modules
    implementation(project(":feature-chat"))
    implementation(project(":feature-login"))

    // AndroidX & Jetpack
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.6.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.6.2")

    // Compose Material 3
    implementation("androidx.compose.material3:material3:1.2.0")
    implementation("androidx.compose.material3:material3-window-size-class:1.2.0")

    // Compose tooling
    implementation("androidx.compose.ui:ui-tooling:1.6.0")
    implementation("androidx.compose.ui:ui-tooling-preview:1.6.0")
    implementation("androidx.constraintlayout:constraintlayout-compose:1.1.1")

    // Hilt
    implementation("com.google.dagger:hilt-android:2.48")
    implementation("androidx.hilt:hilt-navigation-compose:1.1.0-alpha01")
    ksp("com.google.dagger:hilt-compiler:2.48")

    // Image loading
    implementation("com.github.skydoves:landscapist-glide:2.3.2")

    // Logger
    implementation("com.jakewharton.timber:timber:5.0.1")

    // Crash tracer & restorer
    implementation("com.github.skydoves:snitcher:1.0.0")

    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:32.2.0"))
    implementation("com.google.firebase:firebase-analytics-ktx")
    implementation("com.google.firebase:firebase-messaging-ktx")
    implementation("com.google.firebase:firebase-crashlytics-ktx")

    // Baseline profile
    baselineProfile(project(":benchmark"))
}

// Fixed conditional: Removed the trailing period and ensured it's a standalone statement
if (file("google-services.json").exists()) {
    apply(plugin = libs.plugins.gms.googleServices.get().pluginId)
    apply(plugin = libs.plugins.firebase.crashlytics.get().pluginId)
}
