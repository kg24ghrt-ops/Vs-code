plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
    id("kotlin-kapt") // needed for Hilt
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.ktlint)
}

android {
    namespace = "com.renamecompanyname.renameappname"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.renamecompanyname.renameappname"
        minSdk = 24
        targetSdk = 35
        versionCode = 2
        versionName = "0.0.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Core
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)

    // Dependency Injection
    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    kapt(libs.hilt.android.compiler)

    // Testing
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.ui.test.junit4)

    // Compose & UI
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
    implementation(libs.compose.shimmer)

    // Networking
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.client.auth)
    implementation(libs.ktor.client.logging)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.ktor.client.android)

    // Room (upgraded to 2.7.0-alpha10 for Kotlin 2.0+ support)
    implementation("androidx.room:room-runtime:2.7.0-alpha12")
    implementation("androidx.room:room-ktx:2.7.0-alpha12")
    kapt("androidx.room:room-compiler:2.7.0-alpha12")

    // Coroutines
    implementation(libs.kotlinx.coroutines)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // Serialization
    implementation(libs.kotlinx.serialization.json)

    // In-App Updates & Reviews
    implementation(libs.app.update)
    implementation(libs.app.update.ktx)
    implementation(libs.review)
    implementation(libs.review.ktx)

    // Image Loading
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    // Logging
    implementation("com.jakewharton.timber:timber:5.0.1")
}

// KAPT configuration to prevent duplicate stubs and enable K2 backend
kapt {
    correctErrorTypes = true
    useBuildCache = false

    // 🔥 ADD THESE
    includeCompileClasspath = false
   // incremental = false
}

ktlint {
    android.set(true)
    outputColorName.set("RED")
}