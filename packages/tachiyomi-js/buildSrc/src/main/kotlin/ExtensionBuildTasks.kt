import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.ListProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.*
import org.gradle.process.ExecOperations
import java.io.ByteArrayOutputStream
import java.io.File
import javax.inject.Inject

/**
 * Bundles Kotlin/JS output using Bun's bundler (faster than webpack).
 * Configuration-cache compatible via @Inject ExecOperations.
 */
abstract class EsbuildBundleTask @Inject constructor(
    private val execOps: ExecOperations
) : DefaultTask() {
    
    @get:InputFile
    abstract val inputFile: RegularFileProperty
    
    @get:OutputFile
    abstract val outputFile: RegularFileProperty
    
    @TaskAction
    fun bundle() {
        val input = inputFile.get().asFile
        val output = outputFile.get().asFile
        
        output.parentFile.mkdirs()
        
        val result = execOps.exec {
            commandLine(
                "bun", "build",
                input.absolutePath,
                "--outfile", output.absolutePath,
                "--minify",
                "--target", "node",
                "--format", "cjs"
            )
            isIgnoreExitValue = true
        }
        
        if (result.exitValue != 0) {
            throw RuntimeException("Bun bundling failed with exit code ${result.exitValue}")
        }
    }
}

/**
 * Generates the extension manifest and copies assets.
 * Configuration-cache compatible.
 */
abstract class DevBuildTask @Inject constructor(
    private val execOps: ExecOperations
) : DefaultTask() {
    
    @get:Input
    abstract val extensionLang: Property<String>
    
    @get:Input
    abstract val extensionName: Property<String>
    
    @get:Input
    abstract val extName: Property<String>
    
    @get:Input
    abstract val extVersionCode: Property<Int>
    
    @get:Input
    abstract val nsfw: Property<Boolean>
    
    @get:InputDirectory
    abstract val preprocessedDir: DirectoryProperty
    
    @get:InputFile
    @get:Optional
    abstract val iconFile: RegularFileProperty
    
    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty
    
    @get:Input
    abstract val projectRootPath: Property<String>
    
    @TaskAction
    fun build() {
        val lang = extensionLang.get()
        val name = extensionName.get()
        val outDir = outputDir.get().asFile
        val ppDir = preprocessedDir.get().asFile
        val rootPath = projectRootPath.get()
        
        outDir.mkdirs()
        
        // Copy icon if available
        val icon = iconFile.orNull?.asFile
        val hasIcon = icon?.exists() == true
        if (hasIcon) {
            icon!!.copyTo(File(outDir, "icon.png"), overwrite = true)
        }
        
        // Detect WebView and Cloudflare usage
        var usesWebView = false
        var usesCloudflare = false
        ppDir.walk().filter { it.extension == "kt" }.forEach { file ->
            val content = file.readText()
            if (content.contains("WebView") || content.contains("evaluateJavascript") || content.contains("localStorage")) {
                usesWebView = true
            }
            if (content.contains("cloudflareClient")) {
                usesCloudflare = true
            }
        }
        
        if (usesWebView) println("  ⚠️  Uses WebView (may require auth)")
        if (usesCloudflare) println("  ⚠️  Uses Cloudflare client (may have challenges)")
        
        // Extract sources from compiled JS
        val extractScript = """const ext = require('./extension.js').tachiyomi.generated; const r = JSON.parse(ext.getManifest()); if (r.ok) console.log(JSON.stringify(r.data));"""
        val sourcesOutput = ByteArrayOutputStream()
        execOps.exec {
            workingDir(outDir)
            commandLine("bun", "-e", extractScript)
            standardOutput = sourcesOutput
            isIgnoreExitValue = true
        }
        val sourcesJson = sourcesOutput.toString().trim().let {
            if (it.isNotEmpty() && it.startsWith("[")) it else "[]"
        }
        
        // Get extension authors
        val authorsOutput = ByteArrayOutputStream()
        execOps.exec {
            workingDir(File(rootPath))
            commandLine("bun", "dev/get-tachiyomi-extension-authors.ts", "$lang/$name")
            standardOutput = authorsOutput
            isIgnoreExitValue = true
        }
        val authorsJson = authorsOutput.toString().trim().let {
            if (it.isNotEmpty() && it.startsWith("[")) it else "[]"
        }
        
        // Generate manifest.json
        val manifestFile = File(outDir, "manifest.json")
        val manifestContent = buildString {
            appendLine("{")
            appendLine("  \"name\": \"${extName.get()}\",")
            appendLine("  \"pkg\": \"eu.kanade.tachiyomi.extension.$lang.$name\",")
            appendLine("  \"lang\": \"$lang\",")
            appendLine("  \"version\": ${extVersionCode.get()},")
            appendLine("  \"nsfw\": ${nsfw.get()},")
            appendLine("  \"hasWebView\": $usesWebView,")
            appendLine("  \"hasCloudflare\": $usesCloudflare,")
            if (hasIcon) {
                appendLine("  \"icon\": \"icon.png\",")
            }
            appendLine("  \"jsPath\": \"extension.js\",")
            appendLine("  \"authors\": $authorsJson,")
            appendLine("  \"sources\": $sourcesJson")
            append("}")
        }
        manifestFile.writeText(manifestContent)
        
        val sourceCount = sourcesJson.count { it == '{' }
        println("\n✓ Built to: dev/tachiyomi-extensions/$lang-$name/")
        println("  - extension.js")
        println("  - manifest.json ($sourceCount sources)")
        if (hasIcon) println("  - icon.png")
        println("\n  Test: bun scripts/test-tachiyomi-source.ts $lang-$name\n")
    }
}

/**
 * Code transformations for JS compatibility.
 * Defined here to avoid serialization issues with complex regex patterns.
 */
object CodeTransformations {
    val transforms: List<Pair<Regex, String>> = listOf(
        // In JS Unicode mode, [^] (negated character class with just ]) needs the ] escaped
        // Match [^] and replace with [^\\] so it becomes [^\]] in the regex
        // Input: "[^]+" -> Output: "[^\\]+" (Kotlin string) -> [^\]]+ (regex pattern)
        Regex("""\[\^]""") to """[^\\\\]""",
        // Replace okhttp3.ResponseBody.Companion.asResponseBody import with okio.asResponseBody
        Regex("""import okhttp3\.ResponseBody\.Companion\.asResponseBody""") to "import okio.asResponseBody",
        // CSS attribute selectors with escaped = cause ksoup regex issues
        // Match: [attr*=value\\=] -> [attr*=\"value=\"] (escaped quotes for Kotlin string)
        // Note: In replacement string, need \\\\ for literal backslash (Kotlin string + regex replacement)
        Regex("""(\[[\w-]+\*=)([^\]"]*?)\\\\=]""") to "\$1\\\\\"\$2=\\\\\"]",
        // Regex with unescaped ] after escaped [ causes "Lone quantifier brackets" error
        // Match: (\\[.*?])".toRegex -> (\\[.*?\\])".toRegex
        // Need \\\\] in raw string to produce \\] in output (which is \] in the Kotlin string's regex)
        Regex("""(\\\\\[.*?)\](\)"\.toRegex)""") to """$1\\\\]$2""",
        // Fix JS name clashes: property and function have same name
        Regex("""fun useLoadMoreRequest\(\)""") to "fun shouldUseLoadMore()",
        Regex("""\buseLoadMoreRequest\(\)""") to "shouldUseLoadMore()",
        Regex("""fun fetchGenres\(\)""") to "fun doFetchGenres()",
        Regex("""(?<!\.)fetchGenres\(\)""") to "doFetchGenres()"
    )
}

/**
 * Preprocesses extension source files: adds imports, applies transformations.
 * Configuration-cache compatible.
 */
abstract class PreprocessSourceTask : DefaultTask() {
    
    @get:Input
    abstract val extensionLang: Property<String>
    
    @get:Input
    abstract val extensionName: Property<String>
    
    @get:Input
    @get:Optional
    abstract val themePkg: Property<String>
    
    @get:Input
    abstract val libDeps: ListProperty<String>
    
    @get:InputDirectory
    abstract val extensionSourcePath: DirectoryProperty
    
    @get:InputDirectory
    @get:Optional
    abstract val multisrcPath: DirectoryProperty
    
    @get:Input
    abstract val libPaths: ListProperty<String>
    
    @get:Input
    abstract val jsImports: ListProperty<String>
    
    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty
    
    @TaskAction
    fun preprocess() {
        val outDir = outputDir.get().asFile
        outDir.deleteRecursively()
        outDir.mkdirs()
        
        val theme = themePkg.orNull
        val libs = libDeps.get()
        val multisrc = multisrcPath.orNull?.asFile
        
        if (theme != null) {
            println("  themePkg: $theme -> ${multisrc?.path}")
        }
        if (libs.isNotEmpty()) {
            println("  lib deps: ${libs.joinToString(", ")}")
        }
        
        val shimmedFiles = setOf(
            "eu/kanade/tachiyomi/lib/i18n/Intl.kt",
            "eu/kanade/tachiyomi/lib/i18n/Intl.kt".replace("/", File.separator)
        )
        
        val imports = jsImports.get()
        
        fun processSourceDir(sourceDir: File) {
            if (!sourceDir.exists()) {
                println("  WARNING: Source dir not found: $sourceDir")
                return
            }
            sourceDir.walk().forEach { file ->
                if (file.isFile && file.extension == "kt") {
                    if (file.name.contains("Activity")) return@forEach
                    
                    val relativePath = file.relativeTo(sourceDir)
                    if (relativePath.path in shimmedFiles || 
                        relativePath.path.replace(File.separator, "/") in shimmedFiles) {
                        println("  Skipping shimmed file: ${relativePath.path}")
                        return@forEach
                    }
                    
                    val outFile = File(outDir, relativePath.path)
                    outFile.parentFile.mkdirs()
                    
                    var content = file.readText()
                    
                    // Add imports after package declaration
                    val packageMatch = Regex("""^(package\s+[\w.]+)\s*\n""", RegexOption.MULTILINE).find(content)
                    if (packageMatch != null) {
                        val insertPos = packageMatch.range.last + 1
                        val importsToAdd = imports.filter { imp -> !content.contains(imp) }.joinToString("\n")
                        if (importsToAdd.isNotEmpty()) {
                            content = content.substring(0, insertPos) + "\n" + importsToAdd + "\n" + content.substring(insertPos)
                        }
                    }
                    
                    // Apply transformations
                    for ((pattern, replacement) in CodeTransformations.transforms) {
                        content = pattern.replace(content, replacement)
                    }
                    
                    outFile.writeText(content)
                }
            }
        }
        
        // Process in order: libs, multisrc, extension
        libPaths.get().map { File(it) }.forEach { processSourceDir(it) }
        multisrc?.let { processSourceDir(it) }
        processSourceDir(extensionSourcePath.get().asFile)
    }
}

/**
 * Generates Main.kt entry point.
 * Configuration-cache compatible.
 */
abstract class GenerateMainTask : DefaultTask() {
    
    @get:Input
    abstract val extensionLang: Property<String>
    
    @get:Input
    abstract val extensionName: Property<String>
    
    @get:Input
    abstract val extClassName: Property<String>
    
    @get:Input
    abstract val mainKtTemplate: Property<String>
    
    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty
    
    @TaskAction
    fun generate() {
        val outDir = outputDir.get().asFile
        outDir.deleteRecursively()
        outDir.mkdirs()
        
        val outputFile = File(outDir, "Main.kt")
        val template = mainKtTemplate.get()
            .replace("{{PACKAGE_NAME}}", "eu.kanade.tachiyomi.extension.${extensionLang.get()}.${extensionName.get()}")
            .replace("{{EXT_CLASS_NAME}}", extClassName.get())
        
        outputFile.writeText(template)
    }
}

