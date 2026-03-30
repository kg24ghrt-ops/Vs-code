package com.renamecompanyname.renameappname.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.Date

@Entity(tableName = "cached_templates")
data class CachedTemplate(
    @PrimaryKey
    val templateUrl: String,
    val cachedFilePath: String,
    val etag: String? = null,
    val lastModified: String? = null,
    val lastDownloaded: Date = Date(),
    val fileSize: Long = 0
)