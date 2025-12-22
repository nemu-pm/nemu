package uy.kohesive.injekt

import android.content.SharedPreferences
import android.content.BridgedSharedPreferences
import eu.kanade.tachiyomi.network.NetworkHelper
import kotlinx.serialization.json.Json
import kotlin.reflect.KClass

/**
 * Minimal dependency injection stub for WASM.
 * MangaDex uses this primarily for SharedPreferences access.
 */
object Injekt {
    private val registry = mutableMapOf<KClass<*>, Any>()
    
    init {
        // Register default instances
        registry[android.app.Application::class] = ApplicationStub()
        registry[NetworkHelper::class] = NetworkHelper
        registry[Json::class] = Json { 
            ignoreUnknownKeys = true 
            isLenient = true
            explicitNulls = false
        }
    }
    
    fun <T : Any> get(clazz: KClass<T>): T {
        @Suppress("UNCHECKED_CAST")
        return registry[clazz] as? T 
            ?: throw IllegalStateException("No instance registered for $clazz")
    }
    
    fun <T : Any> register(clazz: KClass<T>, instance: T) {
        registry[clazz] = instance
    }
}

inline fun <reified T : Any> injectLazy(): Lazy<T> = lazy { Injekt.get(T::class) }

object api {
    inline fun <reified T : Any> get(): T = Injekt.get(T::class)
}

class ApplicationStub : android.app.Application() {
    override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
        return BridgedSharedPreferences.getInstance(name)
    }
}
