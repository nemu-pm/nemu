import org.jetbrains.kotlin.gradle.ExperimentalWasmDsl

plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
}

// Get extension path from command line: -Pextension=all/mangadex
val extensionPath: String? = project.findProperty("extension")?.toString()

// Default values for when extension is not specified (allows lib to compile independently)
val extensionParts = extensionPath?.split("/") ?: listOf("all", "mangadex")
val extensionLang = extensionParts.getOrElse(0) { "all" }
val extensionName = extensionParts.getOrElse(1) { "mangadex" }

// Path to extension source in vendor
val extensionSourcePath = rootProject.file("../vendor/keiyoushi/extensions-source/src/$extensionLang/$extensionName/src")
// Only validate when actually building an extension
if (extensionPath != null) {
    require(extensionSourcePath.exists()) { "Extension source not found at: $extensionSourcePath" }
}

// Read build.gradle to find extClass
val extensionBuildGradle = rootProject.file("../vendor/keiyoushi/extensions-source/src/$extensionLang/$extensionName/build.gradle")
val extClassMatch = if (extensionBuildGradle.exists()) {
    Regex("""extClass\s*=\s*['"]\.(\w+)['"]""").find(extensionBuildGradle.readText())?.groupValues?.get(1)
} else null
val extClassName = extClassMatch ?: extensionName.replaceFirstChar { it.uppercase() }

group = "keiyoushi.wasm"
version = "1.0.0"

// Generated source directory  
val generatedSrcDir = layout.buildDirectory.dir("generated/src/wasmJsMain/kotlin")
// Preprocessed extension source (adds missing imports)
val preprocessedSrcDir = layout.buildDirectory.dir("preprocessed/src")

// Imports to add to extension source files (JVM auto-imports not available in WASM)
val wasmImports = listOf(
    "import java.lang.System",
    "import java.lang.Integer", 
    "import java.lang.Class",
    "import keiyoushi.wasm.compat.*"  // Extension shims for Locale-aware functions, KClass.java
)

// Code transformations for WASM compatibility
// Now that we use synchronous XHR, we no longer need to inject suspend keywords!
// The only transformation needed is to ensure we have the right imports.
val codeTransformations = listOf<Pair<Regex, String>>(
    // No transformations needed - synchronous XHR pattern means original code works as-is
)

@OptIn(ExperimentalWasmDsl::class)
kotlin {
    wasmJs {
        moduleName = "$extensionLang-$extensionName"
        browser {
            webpackTask {
                mainOutputFileName = "$extensionLang-$extensionName.js"
            }
        }
        binaries.executable()
    }
    
    sourceSets {
        val wasmJsMain by getting {
            // Use preprocessed extension source (NOT original vendor)
            kotlin.srcDir(preprocessedSrcDir)
            // Include generated entry point
            kotlin.srcDir(generatedSrcDir)
            
            dependencies {
                implementation(project(":extension-lib-wasm"))
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
                // Note: No coroutines needed - all HTTP calls are synchronous via XHR in Web Worker
            }
        }
    }
}

// Preprocess extension source: add WASM-required imports and exclude Activity files
val preprocessSource = tasks.register("preprocessSource") {
    inputs.dir(extensionSourcePath)
    outputs.dir(preprocessedSrcDir)
    
    doLast {
        val outDir = preprocessedSrcDir.get().asFile
        outDir.deleteRecursively()
        outDir.mkdirs()
        
        extensionSourcePath.walk().forEach { file ->
            if (file.isFile && file.extension == "kt") {
                // Skip Activity files
                if (file.name.contains("Activity")) {
                    return@forEach
                }
                
                val relativePath = file.relativeTo(extensionSourcePath)
                val outFile = File(outDir, relativePath.path)
                outFile.parentFile.mkdirs()
                
                var content = file.readText()
                
                // Add missing imports after package declaration
                val packageMatch = Regex("""^(package\s+[\w.]+)\s*\n""", RegexOption.MULTILINE).find(content)
                if (packageMatch != null) {
                    val insertPos = packageMatch.range.last + 1
                    val importsToAdd = wasmImports.filter { imp -> 
                        !content.contains(imp) 
                    }.joinToString("\n")
                    
                    if (importsToAdd.isNotEmpty()) {
                        content = content.substring(0, insertPos) + "\n" + importsToAdd + "\n" + content.substring(insertPos)
                    }
                }
                
                // Apply WASM code transformations (currently none needed with sync XHR)
                for ((pattern, replacement) in codeTransformations) {
                    content = pattern.replace(content, replacement)
                }
                
                outFile.writeText(content)
            }
        }
    }
}

// Generate Main.kt entry point
val generateMain = tasks.register("generateMain") {
    val outputDir = generatedSrcDir.get().asFile
    val outputFile = File(outputDir, "Main.kt")
    
    outputs.file(outputFile)
    
    doLast {
        outputDir.mkdirs()
        
        // Determine package based on extension path
        val packageName = "eu.kanade.tachiyomi.extension.$extensionLang.$extensionName"
        
        // All entry points are now synchronous - sync XHR works in Web Workers
        outputFile.writeText("""
            |@file:OptIn(ExperimentalJsExport::class)
            |
            |package keiyoushi.wasm.generated
            |
            |import $packageName.$extClassName
            |import eu.kanade.tachiyomi.source.Source
            |import eu.kanade.tachiyomi.source.SourceFactory
            |import eu.kanade.tachiyomi.source.CatalogueSource
            |import eu.kanade.tachiyomi.source.online.HttpSource
            |import eu.kanade.tachiyomi.source.model.SManga
            |import eu.kanade.tachiyomi.source.model.SChapter
            |import eu.kanade.tachiyomi.source.model.FilterList
            |import kotlinx.serialization.json.Json
            |import kotlinx.serialization.encodeToString
            |import kotlinx.serialization.Serializable
            |import kotlin.js.JsExport
            |
            |private val json = Json { 
            |    prettyPrint = true
            |    ignoreUnknownKeys = true
            |}
            |private val instance = $extClassName()
            |private val sources: List<Source> = when (instance) {
            |    is SourceFactory -> instance.createSources()
            |    is Source -> listOf(instance)
            |    else -> emptyList()
            |}
            |
            |// DTO classes for JSON serialization
            |@Serializable
            |data class MangaDto(
            |    val url: String,
            |    val title: String,
            |    val artist: String?,
            |    val author: String?,
            |    val description: String?,
            |    val genre: List<String>,
            |    val status: Int,
            |    val thumbnailUrl: String?,
            |    val initialized: Boolean
            |)
            |
            |@Serializable
            |data class ChapterDto(
            |    val url: String,
            |    val name: String,
            |    val dateUpload: Long,
            |    val chapterNumber: Float,
            |    val scanlator: String?
            |)
            |
            |@Serializable
            |data class PageDto(
            |    val index: Int,
            |    val url: String,
            |    val imageUrl: String?
            |)
            |
            |@Serializable
            |data class MangasPageDto(
            |    val mangas: List<MangaDto>,
            |    val hasNextPage: Boolean
            |)
            |
            |private fun SManga.toDto() = MangaDto(
            |    url = url,
            |    title = title,
            |    artist = artist,
            |    author = author,
            |    description = description,
            |    genre = genre?.split(", ")?.filter { it.isNotBlank() } ?: emptyList(),
            |    status = status,
            |    thumbnailUrl = thumbnail_url,
            |    initialized = initialized
            |)
            |
            |private fun SChapter.toDto() = ChapterDto(
            |    url = url,
            |    name = name,
            |    dateUpload = date_upload,
            |    chapterNumber = chapter_number,
            |    scanlator = scanlator
            |)
            |
            |private fun eu.kanade.tachiyomi.source.model.Page.toDto() = PageDto(
            |    index = index,
            |    url = url,
            |    imageUrl = imageUrl
            |)
            |
            |@JsExport
            |fun getSourceCount(): Int = sources.size
            |
            |@JsExport
            |fun getSourceInfo(index: Int): String {
            |    val src = sources.getOrNull(index) ?: return "{}"
            |    val httpSrc = src as? HttpSource
            |    return json.encodeToString(mapOf(
            |        "id" to src.id.toString(),
            |        "name" to src.name,
            |        "lang" to src.lang,
            |        "baseUrl" to (httpSrc?.baseUrl ?: "")
            |    ))
            |}
            |
            |@JsExport
            |fun getSourceName(index: Int): String = sources.getOrNull(index)?.name ?: ""
            |
            |@JsExport
            |fun getSourceLang(index: Int): String = sources.getOrNull(index)?.lang ?: ""
            |
            |@JsExport
            |fun getSourceId(index: Int): String = sources.getOrNull(index)?.id?.toString() ?: ""
            |
            |@JsExport
            |fun getSourceBaseUrl(index: Int): String = (sources.getOrNull(index) as? HttpSource)?.baseUrl ?: ""
            |
            |// These methods are now synchronous since sync XHR works in Web Workers
            |// They return plain JSON strings that can be serialized via postMessage
            |
            |@JsExport
            |fun getPopularManga(index: Int, page: Int): String {
            |    val src = sources.getOrNull(index) as? CatalogueSource
            |        ?: throw Exception("Source not found or not a CatalogueSource")
            |    val result = src.getPopularManga(page)
            |    return json.encodeToString(MangasPageDto(
            |        mangas = result.mangas.map { it.toDto() },
            |        hasNextPage = result.hasNextPage
            |    ))
            |}
            |
            |@JsExport
            |fun getLatestUpdates(index: Int, page: Int): String {
            |    val src = sources.getOrNull(index) as? CatalogueSource
            |        ?: throw Exception("Source not found or not a CatalogueSource")
            |    val result = src.getLatestUpdates(page)
            |    return json.encodeToString(MangasPageDto(
            |        mangas = result.mangas.map { it.toDto() },
            |        hasNextPage = result.hasNextPage
            |    ))
            |}
            |
            |@JsExport
            |fun searchManga(index: Int, page: Int, query: String): String {
            |    val src = sources.getOrNull(index) as? CatalogueSource
            |        ?: throw Exception("Source not found or not a CatalogueSource")
            |    val result = src.getSearchManga(page, query, FilterList())
            |    return json.encodeToString(MangasPageDto(
            |        mangas = result.mangas.map { it.toDto() },
            |        hasNextPage = result.hasNextPage
            |    ))
            |}
            |
            |@JsExport
            |fun getMangaDetails(index: Int, mangaUrl: String): String {
            |    val src = sources.getOrNull(index) as? CatalogueSource
            |        ?: throw Exception("Source not found or not a CatalogueSource")
            |    val manga = SManga.create().apply { url = mangaUrl }
            |    val result = src.getMangaDetails(manga)
            |    return json.encodeToString(result.toDto())
            |}
            |
            |@JsExport
            |fun getChapterList(index: Int, mangaUrl: String): String {
            |    val src = sources.getOrNull(index) as? CatalogueSource
            |        ?: throw Exception("Source not found or not a CatalogueSource")
            |    val manga = SManga.create().apply { url = mangaUrl }
            |    val result = src.getChapterList(manga)
            |    return json.encodeToString(result.map { it.toDto() })
            |}
            |
            |@JsExport
            |fun getPageList(index: Int, chapterUrl: String): String {
            |    val src = sources.getOrNull(index) as? HttpSource
            |        ?: throw Exception("Source not found or not an HttpSource")
            |    val chapter = SChapter.create().apply { url = chapterUrl }
            |    val result = src.getPageList(chapter)
            |    return json.encodeToString(result.map { it.toDto() })
            |}
            |
            |@JsExport
            |fun getImageUrl(index: Int, pageUrl: String): String {
            |    val src = sources.getOrNull(index) as? HttpSource
            |        ?: throw Exception("Source not found or not an HttpSource")
            |    val page = eu.kanade.tachiyomi.source.model.Page(0, pageUrl, "")
            |    return src.getImageUrl(page)
            |}
        """.trimMargin())
    }
}

tasks.named("compileKotlinWasmJs") {
    dependsOn(generateMain)
    dependsOn(preprocessSource)
}

// Dev build: compile and copy to dev/wasm for local testing
tasks.register<Copy>("devBuild") {
    dependsOn("wasmJsBrowserProductionWebpack")
    from(layout.buildDirectory.dir("compileSync/wasmJs/main/productionExecutable/optimized"))
    into(layout.projectDirectory.dir("dev/wasm/$extensionLang-$extensionName"))
    include("*.wasm", "*.mjs", "*.js")
    
    doLast {
        println("\n✓ Built to: packages/extension-compiler/dev/wasm/$extensionLang-$extensionName/")
        println("  Run: npx serve packages/extension-compiler/dev")
        println("  Open: http://localhost:3000\n")
    }
}
