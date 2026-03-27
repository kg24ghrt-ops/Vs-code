plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
    id("kotlin-kapt") // needed for hilt, TODO: migrate to catalog file for type safety
    alias(libs.plugins.hilt.android)
    // REMOVED: alias(libs.plugins.mongodb.realm.kotlin)   // MongoDB cloud dependency
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
        versionCode = 1
        versionName = "0.0.0"

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
                "proguard-rules.pro",
            )
        }
    }

    // Modern Java version: Use Java 17
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"  // Must match compileOptions
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
    // ==================== Core ====================
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)

    // ==================== Dependency Injection ====================
    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    kapt(libs.hilt.android.compiler)

    // ==================== Testing ====================
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.ui.test.junit4)

    // ==================== Compose & UI ====================
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
    implementation(libs.compose.shimmer)

    // ==================== Networking ====================
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.client.auth)
    implementation(libs.ktor.client.logging)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.ktor.client.android)

    // ==================== Database ====================
    // REMOVED: implementation(libs.mongodb.realm.kotlin.library.base)   // MongoDB local-only SDK

    // ==================== CoRoutines ====================
    implementation(libs.kotlinx.coroutines)

    // ==================== Navigation (Compose) ====================
    implementation(libs.androidx.navigation.compose)

    // ==================== Serialization ====================
    implementation(libs.kotlinx.serialization.json)

    // ==================== In-App Updates ====================
    implementation(libs.app.update)
    implementation(libs.app.update.ktx)

    // ==================== In-App Reviews ====================
    implementation(libs.review)
    implementation(libs.review.ktx)

    // ==================== Image Loading ====================
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
}

kapt {
    correctErrorTypes = true
}

ktlint {
    android.set(true)
    outputColorName.set("RED")
}