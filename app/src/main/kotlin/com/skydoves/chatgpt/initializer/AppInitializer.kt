package com.skydoves.chatgpt.initializer

import android.content.Context
import androidx.startup.Initializer
import timber.log.Timber
import com.skydoves.chatgpt.BuildConfig

class AppInitializer : Initializer<Unit> {

    override fun create(context: Context): Unit {
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        return Unit
    }

    override fun dependencies(): List<Class<out Initializer<*>>> {
        return emptyList()
    }
}