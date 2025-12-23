plugins {
    kotlin("multiplatform") version "2.1.0"
    kotlin("plugin.serialization") version "2.1.0"
}

group = "tachiyomi.shim"
version = "1.0.0"

kotlin {
    js(IR) {
        moduleName = "tachiyomi-shim"
        browser {
            testTask {
                enabled = false
            }
        }
        // Produce a library (.klib) that can be consumed by other Kotlin/JS projects
        binaries.library()
    }
    
    sourceSets {
        val jsMain by getting {
            dependencies {
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-protobuf:1.7.3")
                implementation("com.fleeksoft.ksoup:ksoup:0.2.4")
            }
        }
    }
}

// Pre-compile task for CI warmup
tasks.register("compileShim") {
    group = "build"
    description = "Compile the shim library for caching"
    dependsOn("compileKotlinJs")
}

