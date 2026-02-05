package com.skydoves.chatgpt.initializer

import android.content.Context
import androidx.startup.Initializer

class AppInitializer : Initializer<Unit> {

    override fun create(context: Context) {
        // init logic
    }

    override fun dependencies(): List<Class<out Initializer<*>>> = emptyList()
}