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
            val tempDir = File(context.cacheDir, "template_extract_${System.currentTimeMillis()}")
            if (!tempDir.mkdirs()) return@withContext null

            extractZip(zipUri, tempDir)

            replacePlaceholders(tempDir, projectName, packageName)

            outputDir.mkdirs()
            tempDir.copyRecursively(outputDir, overwrite = true)

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
        val originalPackage = detectOriginalPackageName(dir)
        val originalAppName = detectOriginalAppName(dir)

        // Replace text in files
        dir.walkTopDown().forEach { file ->
            if (file.isFile && file.extension in listOf("kt", "java", "xml", "gradle", "properties", "pro", "kts")) {
                var content = file.readText()
                content = content.replace(originalPackage, packageName)
                content = content.replace(originalAppName, projectName)
                file.writeText(content)
            }
        }

        // Rename directories that contain the original package name
        renamePlaceholderPaths(dir, originalPackage.replace('.', '/'), packageName.replace('.', '/'))
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

    private fun detectOriginalPackageName(projectDir: File): String {
        // Try AndroidManifest.xml first
        val manifestFile = File(projectDir, "app/src/main/AndroidManifest.xml")
        if (manifestFile.exists()) {
            val content = manifestFile.readText()
            val packageRegex = Regex("package=\"([a-zA-Z][a-zA-Z0-9_]*\\.[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)*)\"")
            val match = packageRegex.find(content)
            if (match != null) {
                return match.groupValues[1]
            }
        }

        // Fallback: search for a common package pattern in Kotlin files
        val kotlinFiles = projectDir.walkTopDown().filter { it.extension == "kt" }.take(5).toList()
        for (file in kotlinFiles) {
            val content = file.readText()
            val packageRegex = Regex("package ([a-zA-Z][a-zA-Z0-9_]*\\.[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)*)")
            val match = packageRegex.find(content)
            if (match != null) {
                return match.groupValues[1]
            }
        }

        // Hardcoded fallback for the original template
        return "com.renamecompanyname.renameappname"
    }

    private fun detectOriginalAppName(projectDir: File): String {
        val stringsFile = File(projectDir, "app/src/main/res/values/strings.xml")
        if (stringsFile.exists()) {
            val content = stringsFile.readText()
            val nameRegex = Regex("<string name=\"app_name\">(.*?)</string>")
            val match = nameRegex.find(content)
            if (match != null) {
                return match.groupValues[1]
            }
        }
        // Fallback
        return "RenameAppName"
    }
}