package rx

/**
 * Minimal RxJava Observable stub for WASM.
 * This is a simplified synchronous implementation.
 */
class Observable<T> private constructor(
    private val producer: (() -> T)?
) {
    // Cached value for synchronous observables
    private var cachedValue: T? = null
    private var isCached: Boolean = false
    
    /**
     * Map operation
     */
    fun <R> map(mapper: (T) -> R): Observable<R> {
        return if (isCached && cachedValue != null) {
            @Suppress("UNCHECKED_CAST")
            just(mapper(cachedValue as T))
        } else {
            Observable {
                mapper(blockingFirst())
            }
        }
    }
    
    /**
     * FlatMap operation
     */
    fun <R> flatMap(mapper: (T) -> Observable<R>): Observable<R> {
        return if (isCached && cachedValue != null) {
            @Suppress("UNCHECKED_CAST")
            mapper(cachedValue as T)
        } else {
            Observable {
                mapper(blockingFirst()).blockingFirst()
            }
        }
    }
    
    fun doOnNext(action: (T) -> Unit): Observable<T> {
        return if (isCached && cachedValue != null) {
            @Suppress("UNCHECKED_CAST")
            val value = cachedValue as T
            action(value)
            this
        } else {
            Observable {
                val value = blockingFirst()
                action(value)
                value
            }
        }
    }
    
    /**
     * Get the first value (blocking)
     */
    fun blockingFirst(): T {
        if (isCached) {
            @Suppress("UNCHECKED_CAST")
            return cachedValue as T
        }
        return producer?.invoke() ?: throw NoSuchElementException("Observable is empty")
    }
    
    /**
     * Subscribe to the observable
     */
    fun subscribe(
        onNext: (T) -> Unit = {},
        onError: (Throwable) -> Unit = {},
        onComplete: () -> Unit = {}
    ) {
        try {
            val value = blockingFirst()
            onNext(value)
            onComplete()
        } catch (e: Throwable) {
            onError(e)
        }
    }
    
    companion object {
        fun <T> just(value: T): Observable<T> {
            return Observable<T>(null).apply {
                cachedValue = value
                isCached = true
            }
        }
        
        fun <T> empty(): Observable<T> = Observable(null)
        
        fun <T> error(throwable: Throwable): Observable<T> {
            return Observable { throw throwable }
        }
        
        fun <T> defer(supplier: () -> Observable<T>): Observable<T> {
            return Observable {
                supplier().blockingFirst()
            }
        }
        
        /**
         * Create an Observable from a producer
         */
        operator fun <T> invoke(producer: () -> T): Observable<T> {
            return Observable(producer)
        }
        
        /**
         * Create an Observable with an emitter
         */
        fun <T> create(block: (Emitter<T>) -> Unit): Observable<T> {
            return Observable {
                var result: T? = null
                var error: Throwable? = null
                var hasValue = false
                
                val emitter = object : Emitter<T> {
                    override fun onNext(value: T) {
                        if (!hasValue) {
                            result = value
                            hasValue = true
                        }
                    }
                    override fun onError(e: Throwable) {
                        error = e
                    }
                    override fun onCompleted() {
                        // No-op for single value
                    }
                }
                
                block(emitter)
                
                error?.let { throw it }
                if (!hasValue) throw NoSuchElementException("Observable emitted no items")
                @Suppress("UNCHECKED_CAST")
                result as T
            }
        }
    }
    
    interface Emitter<T> {
        fun onNext(value: T)
        fun onError(error: Throwable)
        fun onCompleted()
    }
}

/**
 * Extension to convert Observable to a single value
 */
fun <T> Observable<T>.toSingle(): T = blockingFirst()
