@file:OptIn(org.jetbrains.kotlin.gradle.ExperimentalWasmDsl::class)

plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
}

kotlin {
    wasmJs {
        browser {
            testTask {
                enabled = false
            }
        }
        binaries.library()
    }

    sourceSets {
        val wasmJsMain by getting {
            dependencies {
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
                // Note: No coroutines needed - all HTTP calls are synchronous via XHR in Web Worker
            }
        }
    }
}
