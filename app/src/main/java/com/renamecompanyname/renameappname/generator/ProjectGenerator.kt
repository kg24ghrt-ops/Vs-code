package com.renamecompanyname.renameappname.generator

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

class ProjectGenerator(private val context: Context) {

    suspend fun generateFromZip(
        zipUri: Uri,
        projectName: String,
        packageName: String,
        outputDir: File
    ): File? = withContext(Dispatchers.IO) {
        try {
            // 1. Create temp directory for extraction
            val tempDir = File(context.cacheDir, "template_extract_${System.currentTimeMillis()}")
            if (!tempDir.mkdirs()) return@withContext null

            // 2. Extract ZIP from URI
            extractZip(zipUri, tempDir)

            // 3. Replace placeholders
            replacePlaceholders(tempDir, projectName, packageName)

            // 4. Copy to output directory
            outputDir.mkdirs()
            tempDir.copyRecursively(outputDir, overwrite = true)

            // 5. Clean up
            tempDir.deleteRecursively()

            outputDir
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun zipDirectory(sourceDir: File): File? = withContext(Dispatchers.IO) {
        try {
            val zipFile = File(context.cacheDir, "${sourceDir.name}.zip")
            ZipOutputStream(FileOutputStream(zipFile)).use { zipOut ->
                sourceDir.walkTopDown().forEach { file ->
                    val relativePath = file.relativeTo(sourceDir).path
                    if (file.isFile) {
                        zipOut.putNextEntry(ZipEntry(relativePath))
                        file.inputStream().use { it.copyTo(zipOut) }
                        zipOut.closeEntry()
                    }
                }
            }
            zipFile
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun extractZip(zipUri: Uri, targetDir: File) {
        val inputStream = context.contentResolver.openInputStream(zipUri)
            ?: throw IllegalArgumentException("Cannot open input stream for $zipUri")
        ZipInputStream(inputStream).use { zipInput ->
            var entry: ZipEntry? = zipInput.nextEntry
            while (entry != null) {
                val targetFile = File(targetDir, entry.name)
                if (entry.isDirectory) {
                    targetFile.mkdirs()
                } else {
                    targetFile.parentFile?.mkdirs()
                    targetFile.outputStream().use { output ->
                        zipInput.copyTo(output)
                    }
                }
                entry = zipInput.nextEntry
            }
        }
    }

    private fun replacePlaceholders(dir: File, projectName: String, packageName: String) {
        // Walk all files and replace text
        dir.walkTopDown().forEach { file ->
            if (file.isFile && file.extension in listOf("kt", "java", "xml", "gradle", "properties", "pro")) {
                var content = file.readText()
                content = content.replace("{{PACKAGE_NAME}}", packageName)
                content = content.replace("{{APP_NAME}}", projectName)
                content = content.replace("{{PROJECT_NAME_LOWERCASE}}", projectName.lowercase())
                file.writeText(content)
            }
        }

        // Rename directories that contain package placeholder
        renamePlaceholderPaths(dir, "{{PACKAGE_NAME}}", packageName.replace('.', '/'))
    }

    private fun renamePlaceholderPaths(dir: File, placeholder: String, replacement: String) {
        dir.walkTopDown().forEach { file ->
            val newPath = file.path.replace(placeholder, replacement)
            if (newPath != file.path) {
                val newFile = File(newPath)
                newFile.parentFile?.mkdirs()
                file.renameTo(newFile)
            }
        }
    }
}