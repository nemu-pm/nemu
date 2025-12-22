plugins {
    kotlin("multiplatform") version "2.1.0"
    kotlin("plugin.serialization") version "2.1.0"
}

// =============================================================================
// Extension Configuration (optional - pass -Pextension=all/mangadex)
// =============================================================================

val extensionPath: String? = project.findProperty("extension")?.toString()
val isExtensionBuild = extensionPath != null

// Parse extension path
val extensionParts = extensionPath?.split("/") ?: listOf("all", "mangadex")
val extensionLang = extensionParts.getOrElse(0) { "all" }
val extensionName = extensionParts.getOrElse(1) { "mangadex" }

// Extension source paths
val extensionSourcePath = rootProject.file("../../vendor/keiyoushi/extensions-source/src/$extensionLang/$extensionName/src")
if (isExtensionBuild) {
    require(extensionSourcePath.exists()) { "Extension source not found at: $extensionSourcePath" }
}

// Read extension metadata from build.gradle
val extensionBuildGradle = rootProject.file("../../vendor/keiyoushi/extensions-source/src/$extensionLang/$extensionName/build.gradle")
val extBuildContent = if (extensionBuildGradle.exists()) extensionBuildGradle.readText() else ""

val extClassMatch = Regex("""extClass\s*=\s*['"]\.(\w+)['"]""").find(extBuildContent)?.groupValues?.get(1)
val extClassName = extClassMatch ?: extensionName.replaceFirstChar { it.uppercase() }
val extVersionCode = Regex("""extVersionCode\s*=\s*(\d+)""").find(extBuildContent)?.groupValues?.get(1)?.toIntOrNull() ?: 1
val extName = Regex("""extName\s*=\s*['"]([^'"]+)['"]""").find(extBuildContent)?.groupValues?.get(1) ?: extensionName
val isNsfw = Regex("""isNsfw\s*=\s*true""").containsMatchIn(extBuildContent)
val themePkg = Regex("""themePkg\s*=\s*['"]([^'"]+)['"]""").find(extBuildContent)?.groupValues?.get(1)

// Detect lib/ dependencies from build.gradle (e.g., project(":lib:randomua"))
val libDeps = Regex("""project\s*\(\s*['"]?:lib:(\w+)['"]?\s*\)""")
    .findAll(extBuildContent)
    .map { it.groupValues[1] }
    .toList()

// Multisrc library path (if extension uses a theme like 'gigaviewer')
val multisrcPath = themePkg?.let {
    rootProject.file("../../vendor/keiyoushi/extensions-source/lib-multisrc/$it/src")
}

// Lib paths (utility libraries like randomua, unpacker, cryptoaes, etc.)
val libPaths = libDeps.map { libName ->
    rootProject.file("../../vendor/keiyoushi/extensions-source/lib/$libName/src/main/java")
}

group = "tachiyomi.js"
version = "1.0.0"

// Generated/preprocessed directories for extension builds
val generatedSrcDir = layout.buildDirectory.dir("generated/src/jsMain/kotlin")
val preprocessedSrcDir = layout.buildDirectory.dir("preprocessed/src")

// Imports to add to extension source files
val jsImports = listOf(
    "import java.lang.System",
    "import java.lang.Integer", 
    "import java.lang.Class",
    "import tachiyomi.shim.compat.*"
)

// Code transformations for JS compatibility
val codeTransformations = listOf<Pair<Regex, String>>(
    // [^] in regex is invalid in JS unicode mode - transform to [^\\]
    Regex("\\[\\^]") to "[^\\\\\\\\]"
)

// =============================================================================
// Kotlin Multiplatform Configuration
// =============================================================================

kotlin {
    js(IR) {
        // Module name depends on build mode
        if (isExtensionBuild) {
            moduleName = "$extensionLang-$extensionName"
        }
        
        browser {
            if (isExtensionBuild) {
                webpackTask {
                    mainOutputFileName = "extension.js"
                }
            }
            testTask {
                enabled = false
            }
        }
        
        // Library for shim-only builds, executable for extension builds
        if (isExtensionBuild) {
            binaries.executable()
        } else {
            binaries.library()
        }
    }
    
    sourceSets {
        val jsMain by getting {
            // Always include shim source
            // (default src/jsMain/kotlin is included automatically)
            
            // For extension builds, add preprocessed extension source and generated entry point
            if (isExtensionBuild) {
                kotlin.srcDir(preprocessedSrcDir)
                kotlin.srcDir(generatedSrcDir)
            }
            
            dependencies {
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
                implementation("com.fleeksoft.ksoup:ksoup:0.2.4")
            }
        }
    }
}

// =============================================================================
// Extension Build Tasks (only when -Pextension is passed)
// =============================================================================

if (isExtensionBuild) {
    // Preprocess extension source: add imports and exclude Activity files
    val preprocessSource = tasks.register("preprocessSource") {
        // Force rerun when extension changes
        inputs.property("extensionLang", extensionLang)
        inputs.property("extensionName", extensionName)
        inputs.dir(extensionSourcePath)
        multisrcPath?.let { inputs.dir(it) }
        libPaths.filter { it.exists() }.forEach { inputs.dir(it) }
        outputs.dir(preprocessedSrcDir)
        
        doLast {
            val outDir = preprocessedSrcDir.get().asFile
            outDir.deleteRecursively()
            outDir.mkdirs()
            
            // Log detected dependencies
            if (themePkg != null) {
                println("  themePkg: $themePkg -> ${multisrcPath?.path}")
            }
            if (libDeps.isNotEmpty()) {
                println("  lib deps: ${libDeps.joinToString(", ")}")
            }
            
            // Helper function to process source files
            fun processSourceDir(sourceDir: File) {
                if (!sourceDir.exists()) {
                    println("  WARNING: Source dir not found: $sourceDir")
                    return
                }
                sourceDir.walk().forEach { file ->
                if (file.isFile && file.extension == "kt") {
                    // Skip Activity files
                    if (file.name.contains("Activity")) {
                        return@forEach
                    }
                    
                        val relativePath = file.relativeTo(sourceDir)
                    val outFile = File(outDir, relativePath.path)
                    outFile.parentFile.mkdirs()
                    
                    var content = file.readText()
                    
                    // Add missing imports after package declaration
                    val packageMatch = Regex("""^(package\s+[\w.]+)\s*\n""", RegexOption.MULTILINE).find(content)
                    if (packageMatch != null) {
                        val insertPos = packageMatch.range.last + 1
                        val importsToAdd = jsImports.filter { imp -> 
                            !content.contains(imp) 
                        }.joinToString("\n")
                        
                        if (importsToAdd.isNotEmpty()) {
                            content = content.substring(0, insertPos) + "\n" + importsToAdd + "\n" + content.substring(insertPos)
                        }
                    }
                    
                    // Apply code transformations
                    for ((pattern, replacement) in codeTransformations) {
                        content = pattern.replace(content, replacement)
                    }
                    
                    outFile.writeText(content)
                }
            }
            }
            
            // Process libs first (lowest priority - can be overridden)
            libPaths.forEach { libPath -> processSourceDir(libPath) }
            
            // Process multisrc second (if present)
            multisrcPath?.let { processSourceDir(it) }
            
            // Then process extension source (highest priority - may override)
            processSourceDir(extensionSourcePath)
        }
    }

    // Generate Main.kt entry point
    val generateMain = tasks.register("generateMain") {
        val outputDir = generatedSrcDir.get().asFile
        val outputFile = File(outputDir, "Main.kt")
        
        // Force regeneration when extension changes (invalidate cache)
        inputs.property("extensionLang", extensionLang)
        inputs.property("extensionName", extensionName)
        inputs.property("extClassName", extClassName)
        outputs.file(outputFile)
        
        doLast {
            // Clean generated directory to avoid stale files from previous extension builds
            outputDir.deleteRecursively()
            outputDir.mkdirs()
            val packageName = "eu.kanade.tachiyomi.extension.$extensionLang.$extensionName"
            
            outputFile.writeText("""
                |@file:OptIn(ExperimentalJsExport::class)
                |
                |package tachiyomi.generated
                |
                |import $packageName.$extClassName
                |import eu.kanade.tachiyomi.source.Source
                |import eu.kanade.tachiyomi.source.SourceFactory
                |import eu.kanade.tachiyomi.source.CatalogueSource
                |import eu.kanade.tachiyomi.source.online.HttpSource
                |import eu.kanade.tachiyomi.source.model.SManga
                |import eu.kanade.tachiyomi.source.model.SChapter
                |import eu.kanade.tachiyomi.source.model.Filter
                |import eu.kanade.tachiyomi.source.model.FilterList
                |import kotlinx.serialization.json.Json
                |import kotlinx.serialization.json.JsonElement
                |import kotlinx.serialization.json.JsonObject
                |import kotlinx.serialization.json.JsonArray
                |import kotlinx.serialization.json.JsonPrimitive
                |import kotlinx.serialization.json.jsonArray
                |import kotlinx.serialization.json.jsonObject
                |import kotlinx.serialization.json.jsonPrimitive
                |import kotlinx.serialization.json.intOrNull
                |import kotlinx.serialization.json.booleanOrNull
                |import kotlinx.serialization.json.contentOrNull
                |import kotlinx.serialization.json.encodeToJsonElement
                |import kotlinx.serialization.json.buildJsonObject
                |import kotlinx.serialization.json.buildJsonArray
                |import kotlinx.serialization.json.put
                |import kotlinx.serialization.json.putJsonArray
                |import kotlinx.serialization.json.putJsonObject
                |import kotlinx.serialization.json.add
                |import kotlinx.serialization.encodeToString
                |import kotlinx.serialization.Serializable
                |import kotlin.js.JsExport
                |
                |private val json = Json { 
                |    prettyPrint = false
                |    ignoreUnknownKeys = true
                |}
                |
                |// Log buffer for capturing println output
                |private val logBuffer = mutableListOf<String>()
                |
                |private fun log(msg: String) {
                |    logBuffer.add(msg)
                |    println(msg)
                |}
                |
                |@JsExport
                |fun getLogs(): String {
                |    val logs = logBuffer.toList()
                |    logBuffer.clear()
                |    return json.encodeToString(logs)
                |}
                |
                |// Result wrapper - all exports return this format
                |private inline fun <reified T> success(data: T): String {
                |    return buildJsonObject {
                |        put("ok", true)
                |        put("data", json.encodeToJsonElement(data))
                |    }.toString()
                |}
                |
                |private fun successJson(data: JsonElement): String {
                |    return buildJsonObject {
                |        put("ok", true)
                |        put("data", data)
                |    }.toString()
                |}
                |
                |private fun error(e: Throwable): String {
                |    val stackTrace = e.stackTraceToString()
                |    return buildJsonObject {
                |        put("ok", false)
                |        putJsonObject("error") {
                |            put("type", e::class.simpleName ?: "Unknown")
                |            put("message", e.message ?: "No message")
                |            put("stack", stackTrace)
                |            putJsonArray("logs") { logBuffer.forEach { add(it) } }
                |        }
                |    }.toString().also { logBuffer.clear() }
                |}
                |
                |private val instance = $extClassName()
                |private val sources: List<Source> = when (instance) {
                |    is SourceFactory -> instance.createSources()
                |    is Source -> listOf(instance)
                |    else -> emptyList()
                |}
                |
                |// Source lookup by ID (String representation of Long)
                |private val sourcesById: Map<String, Source> = sources.associateBy { it.id.toString() }
                |
                |// Cached filters per source (for state management)
                |private val filterCache = mutableMapOf<String, FilterList>()
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
                |// ============================================================================
                |// Manifest: Returns all sources metadata (call once on load)
                |// ============================================================================
                |
                |@JsExport
                |fun getManifest(): String = try {
                |    val sourcesJson = buildJsonArray {
                |        for (src in sources) {
                |            add(buildJsonObject {
                |                put("id", src.id.toString())
                |                put("name", src.name)
                |                put("lang", src.lang)
                |                if (src is HttpSource) {
                |                    put("baseUrl", src.baseUrl)
                |                }
                |                if (src is CatalogueSource) {
                |                    put("supportsLatest", src.supportsLatest)
                |                }
                |            })
                |        }
                |    }
                |    successJson(sourcesJson)
                |} catch (e: Throwable) { error(e) }
                |
                |// ============================================================================
                |// Filter Schema: Serialize filters for UI rendering
                |// ============================================================================
                |
                |private fun serializeFilter(filter: Filter<*>): JsonObject = buildJsonObject {
                |    put("name", filter.name)
                |    when (filter) {
                |        is Filter.Header -> put("type", "header")
                |        is Filter.Separator -> put("type", "separator")
                |        is Filter.CheckBox -> {
                |            put("type", "checkbox")
                |            put("state", filter.state)
                |        }
                |        is Filter.TriState -> {
                |            put("type", "tristate")
                |            put("state", filter.state)
                |        }
                |        is Filter.Text -> {
                |            put("type", "text")
                |            put("state", filter.state)
                |        }
                |        is Filter.Select<*> -> {
                |            put("type", "select")
                |            put("state", filter.state)
                |            putJsonArray("values") {
                |                filter.values.forEach { add(it.toString()) }
                |            }
                |        }
                |        is Filter.Sort -> {
                |            put("type", "sort")
                |            putJsonArray("values") {
                |                filter.values.forEach { add(it) }
                |            }
                |            if (filter.state != null) {
                |                putJsonObject("state") {
                |                    put("index", filter.state!!.index)
                |                    put("ascending", filter.state!!.ascending)
                |                }
                |            }
                |        }
                |        is Filter.Group<*> -> {
                |            put("type", "group")
                |            putJsonArray("filters") {
                |                @Suppress("UNCHECKED_CAST")
                |                (filter.state as? List<Filter<*>>)?.forEach { 
                |                    add(serializeFilter(it))
                |                }
                |            }
                |        }
                |    }
                |}
                |
                |@JsExport
                |fun getFilterList(sourceId: String): String = try {
                |    val src = sourcesById[sourceId] as? CatalogueSource
                |        ?: throw Exception("Source not found: ${"$"}sourceId")
                |    val filters = src.getFilterList()
                |    filterCache[sourceId] = filters
                |    val filtersJson = buildJsonArray {
                |        filters.forEach { add(serializeFilter(it)) }
                |    }
                |    successJson(filtersJson)
                |} catch (e: Throwable) { error(e) }
                |
                |/**
                | * Reset filters to source default state.
                | * Call this before starting a new search to clear previous filter state.
                | */
                |@JsExport
                |fun resetFilters(sourceId: String): String = try {
                |    val src = sourcesById[sourceId] as? CatalogueSource
                |        ?: throw Exception("Source not found: ${"$"}sourceId")
                |    filterCache[sourceId] = src.getFilterList()
                |    successJson(buildJsonObject { put("ok", true) })
                |} catch (e: Throwable) { error(e) }
                |
                |/**
                | * Apply filter state from UI.
                | * @param sourceId Source identifier
                | * @param filterStateJson JSON array of filter state updates:
                | *   [{ "index": 0, "state": true }, { "index": 2, "state": 1 }, ...]
                | *   For Group filters: { "index": 3, "filters": [{ "index": 0, "state": true }] }
                | *   For Sort filters: { "index": 5, "state": { "index": 1, "ascending": false } }
                | */
                |@JsExport
                |fun applyFilterState(sourceId: String, filterStateJson: String): String = try {
                |    val filters = filterCache[sourceId]
                |        ?: throw Exception("Filters not loaded for source: ${"$"}sourceId. Call getFilterList first.")
                |    val stateUpdates = Json.parseToJsonElement(filterStateJson).jsonArray
                |    
                |    for (update in stateUpdates) {
                |        val obj = update.jsonObject
                |        val index = obj["index"]?.jsonPrimitive?.intOrNull ?: continue
                |        applyStateToFilter(filters.getOrNull(index) ?: continue, obj)
                |    }
                |    
                |    successJson(buildJsonObject { put("ok", true) })
                |} catch (e: Throwable) { error(e) }
                |
                |private fun applyStateToFilter(filter: Filter<*>, state: JsonObject) {
                |    when (filter) {
                |        is Filter.CheckBox -> {
                |            state["state"]?.jsonPrimitive?.booleanOrNull?.let { filter.state = it }
                |        }
                |        is Filter.TriState -> {
                |            state["state"]?.jsonPrimitive?.intOrNull?.let { filter.state = it }
                |        }
                |        is Filter.Text -> {
                |            state["state"]?.jsonPrimitive?.contentOrNull?.let { filter.state = it }
                |        }
                |        is Filter.Select<*> -> {
                |            state["state"]?.jsonPrimitive?.intOrNull?.let { filter.state = it }
                |        }
                |        is Filter.Sort -> {
                |            state["state"]?.jsonObject?.let { sortState ->
                |                val idx = sortState["index"]?.jsonPrimitive?.intOrNull ?: 0
                |                val asc = sortState["ascending"]?.jsonPrimitive?.booleanOrNull ?: false
                |                filter.state = Filter.Sort.Selection(idx, asc)
                |            }
                |        }
                |        is Filter.Group<*> -> {
                |            val groupFilters = state["filters"]?.jsonArray ?: return
                |            @Suppress("UNCHECKED_CAST")
                |            val childFilters = filter.state as? List<Filter<*>> ?: return
                |            for (childUpdate in groupFilters) {
                |                val childObj = childUpdate.jsonObject
                |                val childIndex = childObj["index"]?.jsonPrimitive?.intOrNull ?: continue
                |                applyStateToFilter(childFilters.getOrNull(childIndex) ?: continue, childObj)
                |            }
                |        }
                |        else -> { /* Header, Separator - no state to apply */ }
                |    }
                |}
                |
                |// ============================================================================
                |// Data Methods (use sourceId instead of index)
                |// ============================================================================
                |
                |@JsExport
                |fun getPopularManga(sourceId: String, page: Int): String = try {
                |    val src = sourcesById[sourceId] as? CatalogueSource
                |        ?: throw Exception("Source not found: ${"$"}sourceId")
                |    val result = src.getPopularManga(page)
                |    success(MangasPageDto(
                |        mangas = result.mangas.map { it.toDto() },
                |        hasNextPage = result.hasNextPage
                |    ))
                |} catch (e: Throwable) { error(e) }
                |
                |@JsExport
                |fun getLatestUpdates(sourceId: String, page: Int): String = try {
                |    val src = sourcesById[sourceId] as? CatalogueSource
                |        ?: throw Exception("Source not found: ${"$"}sourceId")
                |    val result = src.getLatestUpdates(page)
                |    success(MangasPageDto(
                |        mangas = result.mangas.map { it.toDto() },
                |        hasNextPage = result.hasNextPage
                |    ))
                |} catch (e: Throwable) { error(e) }
                |
                |@JsExport
                |fun searchManga(sourceId: String, page: Int, query: String): String = try {
                |    val src = sourcesById[sourceId] as? CatalogueSource
                |        ?: throw Exception("Source not found: ${"$"}sourceId")
                |    val filters = filterCache[sourceId] ?: FilterList()
                |    val result = src.getSearchManga(page, query, filters)
                |    success(MangasPageDto(
                |        mangas = result.mangas.map { it.toDto() },
                |        hasNextPage = result.hasNextPage
                |    ))
                |} catch (e: Throwable) { error(e) }
                |
                |@JsExport
                |fun getMangaDetails(sourceId: String, mangaUrl: String): String = try {
                |    val src = sourcesById[sourceId] as? CatalogueSource
                |        ?: throw Exception("Source not found: ${"$"}sourceId")
                |    val manga = SManga.create().apply { url = mangaUrl }
                |    val result = src.getMangaDetails(manga)
                |    // Copy URL from input manga - getMangaDetails doesn't always set it
                |    if (result.url.isEmpty()) result.url = mangaUrl
                |    success(result.toDto())
                |} catch (e: Throwable) { error(e) }
                |
                |@JsExport
                |fun getChapterList(sourceId: String, mangaUrl: String): String = try {
                |    val src = sourcesById[sourceId] as? CatalogueSource
                |        ?: throw Exception("Source not found: ${"$"}sourceId")
                |    val manga = SManga.create().apply { url = mangaUrl }
                |    val result = src.getChapterList(manga)
                |    success(result.map { it.toDto() })
                |} catch (e: Throwable) { error(e) }
                |
                |@JsExport
                |fun getPageList(sourceId: String, chapterUrl: String): String = try {
                |    val src = sourcesById[sourceId] as? HttpSource
                |        ?: throw Exception("Source not found: ${"$"}sourceId")
                |    val chapter = SChapter.create().apply { url = chapterUrl }
                |    val result = src.getPageList(chapter)
                |    success(result.map { it.toDto() })
                |} catch (e: Throwable) { error(e) }
                |
                |/**
                | * Fetch an image through the source's OkHttp client (with interceptors).
                | * This is required for sources that use image descrambling/processing.
                | * Returns base64-encoded image bytes.
                | */
                |@JsExport
                |fun fetchImage(sourceId: String, pageUrl: String, pageImageUrl: String): String = try {
                |    val src = sourcesById[sourceId] as? HttpSource
                |        ?: throw Exception("Source not found: ${"$"}sourceId")
                |    val page = eu.kanade.tachiyomi.source.model.Page(0, pageUrl, pageImageUrl)
                |    val request = src.imageRequest(page)
                |    
                |    // Execute through client WITH interceptors (needed for image descrambling)
                |    val response = src.client.newCall(request).execute()
                |    val bytes = response.body.bytes()
                |    response.close()
                |    
                |    // Return base64-encoded image
                |    val base64 = java.util.Base64.getEncoder().encodeToString(bytes)
                |    success(base64)
                |} catch (e: Throwable) { error(e) }
                |
                |// ============================================================================
                |// Legacy index-based API (deprecated)
                |// ============================================================================
                |
                |@JsExport
                |fun getSourceCount(): Int = sources.size
                |
                |@JsExport
                |fun getSourceInfo(index: Int): String {
                |    val src = sources.getOrNull(index) ?: return success(emptyMap<String, String>())
                |    val httpSrc = src as? HttpSource
                |    return success(mapOf(
                |        "id" to src.id.toString(),
                |        "name" to src.name,
                |        "lang" to src.lang,
                |        "baseUrl" to (httpSrc?.baseUrl ?: "")
                |    ))
                |}
            """.trimMargin())
        }
    }

    tasks.named("compileKotlinJs") {
        dependsOn(generateMain)
        dependsOn(preprocessSource)
    }

    // Output to dev/extensions/ at project root
    val outputDir = rootProject.file("../../dev/extensions/$extensionLang-$extensionName")

    // Find extension icon (prefer xxhdpi, fallback to hdpi, then any available)
    val extensionResPath = rootProject.file("../../vendor/keiyoushi/extensions-source/src/$extensionLang/$extensionName/res")
    val iconDensities = listOf("xxhdpi", "hdpi", "xhdpi", "xxxhdpi", "mdpi")
    val iconFile = iconDensities.map { File(extensionResPath, "mipmap-$it/ic_launcher.png") }
        .firstOrNull { it.exists() }
    
    tasks.register<Copy>("devBuild") {
        dependsOn("compileProductionExecutableKotlinJs")
        from(layout.buildDirectory.dir("compileSync/js/main/productionExecutable/kotlin"))
        into(outputDir)
        include("*.js", "*.js.map")
        
        rename { fileName ->
            when {
                fileName.endsWith(".js.map") -> "extension.js.map"
                fileName.endsWith(".js") -> "extension.js"
                else -> fileName
            }
        }
        
        doLast {
            // Copy icon if available
            val hasIcon = iconFile?.exists() == true
            if (hasIcon) {
                iconFile!!.copyTo(File(outputDir, "icon.png"), overwrite = true)
            }
            
            // Generate manifest.json
            val manifestFile = File(outputDir, "manifest.json")
            val iconPath = if (hasIcon) "icon.png" else null
            val manifestContent = buildString {
                appendLine("{")
                appendLine("  \"name\": \"$extName\",")
                appendLine("  \"pkg\": \"eu.kanade.tachiyomi.extension.$extensionLang.$extensionName\",")
                appendLine("  \"lang\": \"$extensionLang\",")
                appendLine("  \"version\": $extVersionCode,")
                appendLine("  \"nsfw\": $isNsfw,")
                if (iconPath != null) {
                    appendLine("  \"icon\": \"$iconPath\",")
                }
                appendLine("  \"jsPath\": \"extension.js\"")
                append("}")
            }
            manifestFile.writeText(manifestContent)
            
            println("\n✓ Built to: dev/extensions/$extensionLang-$extensionName/")
            println("  - extension.js")
            println("  - manifest.json")
            if (hasIcon) println("  - icon.png")
            println("\n  Test: bun scripts/test-tachiyomi-source.ts $extensionLang-$extensionName\n")
        }
    }
}

// =============================================================================
// Batch Compilation Task (compile multiple extensions)
// Usage: ./gradlew compileExtensions -Pext=all/mangadex,ja/shonenjumpplus
//        ./gradlew compileExtensions -Pext=ja/*  (all Japanese extensions)
// =============================================================================

tasks.register("compileExtensions") {
    group = "build"
    description = "Compile multiple extensions. Use -Pext=lang/name,lang/name or lang/* for all in a language"
    
    doLast {
        val extensionsParam = project.findProperty("ext")?.toString()
        if (extensionsParam.isNullOrBlank()) {
            println("Usage: ./gradlew compileExtensions -Pext=all/mangadex,ja/shonenjumpplus")
            println("       ./gradlew compileExtensions -Pext=ja/*")
            return@doLast
        }
        
        val extensionsRoot = rootProject.file("../../vendor/keiyoushi/extensions-source/src")
        val extensionSpecs = extensionsParam.split(",").map { it.trim() }
        
        // Expand wildcards (e.g., "ja/*" -> all extensions in ja/)
        val allExtensions = mutableListOf<String>()
        for (spec in extensionSpecs) {
            if (spec.endsWith("/*")) {
                val lang = spec.removeSuffix("/*")
                val langDir = File(extensionsRoot, lang)
                if (langDir.exists() && langDir.isDirectory) {
                    langDir.listFiles()?.filter { it.isDirectory }?.forEach { extDir ->
                        allExtensions.add("$lang/${extDir.name}")
                    }
                }
            } else {
                allExtensions.add(spec)
            }
        }
        
        println("Compiling ${allExtensions.size} extensions...")
        
        val results = mutableMapOf<String, Boolean>()
        val startTime = System.currentTimeMillis()
        
        for ((index, ext) in allExtensions.withIndex()) {
            print("[${index + 1}/${allExtensions.size}] $ext... ")
            System.out.flush()
            
            val result = providers.exec {
                commandLine("./gradlew", "devBuild", "-Pextension=$ext", "--quiet")
                isIgnoreExitValue = true
            }.result.get()
            
            val success = result.exitValue == 0
            results[ext] = success
            println(if (success) "✓" else "✗")
        }
        
        val elapsed = (System.currentTimeMillis() - startTime) / 1000.0
        val successful = results.count { it.value }
        val failed = results.count { !it.value }
        
        println("\n" + "=".repeat(60))
        println("Results: $successful succeeded, $failed failed (${elapsed}s)")
        
        if (failed > 0) {
            println("\nFailed extensions:")
            results.filter { !it.value }.keys.forEach { println("  - $it") }
        }
    }
}

// List available extensions
tasks.register("listExtensions") {
    group = "help"
    description = "List all available extensions"
    
    doLast {
        val extensionsRoot = rootProject.file("../../vendor/keiyoushi/extensions-source/src")
        val langs = extensionsRoot.listFiles()?.filter { it.isDirectory }?.sortedBy { it.name } ?: emptyList()
        
        var total = 0
        for (lang in langs) {
            val extensions = lang.listFiles()?.filter { it.isDirectory }?.sortedBy { it.name } ?: emptyList()
            if (extensions.isNotEmpty()) {
                println("\n${lang.name}/ (${extensions.size} extensions)")
                extensions.forEach { ext ->
                    println("  ${ext.name}")
                    total++
                }
            }
        }
        println("\nTotal: $total extensions")
    }
}
