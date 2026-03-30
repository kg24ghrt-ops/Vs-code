package com.renamecompanyname.renameappname

import android.app.Application
import com.renamecompanyname.renameappname.logging.InAppLoggingTree
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber
import com.renamecompanyname.renameappname.BuildConfig

@HiltAndroidApp
class Application : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        Timber.plant(InAppLoggingTree())
    }
}