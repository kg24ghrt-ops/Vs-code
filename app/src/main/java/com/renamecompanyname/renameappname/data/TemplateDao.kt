package com.renamecompanyname.renameappname.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TemplateDao {
    @Query("SELECT * FROM cached_templates WHERE templateUrl = :url")
    suspend fun getByUrl(url: String): CachedTemplate?

    @Query("SELECT * FROM cached_templates WHERE templateUrl = :url")
    fun getByUrlFlow(url: String): Flow<CachedTemplate?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(template: CachedTemplate)

    @Query("DELETE FROM cached_templates WHERE templateUrl = :url")
    suspend fun deleteByUrl(url: String)

    @Query("DELETE FROM cached_templates WHERE lastDownloaded < :cutoffDate")
    suspend fun deleteOlderThan(cutoffDate: Date)

    @Query("SELECT COUNT(*) FROM cached_templates")
    suspend fun getCount(): Int
}