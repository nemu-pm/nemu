package kotlinx.coroutines

import kotlin.coroutines.Continuation
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

/**
 * Runs a new coroutine and blocks the current thread until its completion.
 * 
 * In JS single-threaded environment, this executes the suspend function
 * synchronously if possible, otherwise uses Promise-based execution.
 */
fun <T> runBlocking(
    context: CoroutineContext = EmptyCoroutineContext,
    block: suspend CoroutineScope.() -> T
): T {
    var result: T? = null
    var exception: Throwable? = null
    var completed = false
    
    val scope = object : CoroutineScope {
        override val coroutineContext: CoroutineContext = context
    }
    
    val continuation = object : Continuation<T> {
        override val context: CoroutineContext = context
        
        override fun resumeWith(res: Result<T>) {
            res.fold(
                onSuccess = { result = it; completed = true },
                onFailure = { exception = it; completed = true }
            )
        }
    }
    
    // Start the coroutine
    val suspendBlock: suspend () -> T = { block(scope) }
    suspendBlock.startCoroutine(continuation)
    
    // In JS, if it completes synchronously, we're good
    // If not, this is a limitation of the shim
    if (!completed) {
        throw IllegalStateException("runBlocking cannot wait for async operations in JS environment")
    }
    
    exception?.let { throw it }
    @Suppress("UNCHECKED_CAST")
    return result as T
}

/**
 * Coroutine scope interface.
 */
interface CoroutineScope {
    val coroutineContext: CoroutineContext
}

/**
 * Create a CoroutineScope with a specific context.
 */
@Suppress("FunctionName")
fun CoroutineScope(context: CoroutineContext): CoroutineScope {
    return object : CoroutineScope {
        override val coroutineContext: CoroutineContext = context
    }
}

/**
 * Coroutine dispatchers - in JS everything runs on main thread.
 */
object Dispatchers {
    val Default: CoroutineContext = EmptyCoroutineContext
    val Main: CoroutineContext = EmptyCoroutineContext
    val IO: CoroutineContext = EmptyCoroutineContext
    val Unconfined: CoroutineContext = EmptyCoroutineContext
}

/**
 * Job interface for tracking coroutine lifecycle.
 */
interface Job : CoroutineContext.Element {
    override val key: CoroutineContext.Key<*> get() = Job
    
    val isActive: Boolean
    val isCompleted: Boolean
    val isCancelled: Boolean
    
    fun cancel()
    
    companion object Key : CoroutineContext.Key<Job>
}

/**
 * Simple Job implementation.
 */
private class JobImpl : Job {
    override var isActive: Boolean = true
    override var isCompleted: Boolean = false
    override var isCancelled: Boolean = false
    
    override fun cancel() {
        isActive = false
        isCancelled = true
        isCompleted = true
    }
}

/**
 * Launch a new coroutine without blocking.
 * In JS, executes the suspend function asynchronously.
 */
fun CoroutineScope.launch(
    context: CoroutineContext = EmptyCoroutineContext,
    block: suspend CoroutineScope.() -> Unit
): Job {
    val job = JobImpl()
    val newContext = coroutineContext + context
    
    val scope = object : CoroutineScope {
        override val coroutineContext: CoroutineContext = newContext
    }
    
    val continuation = object : Continuation<Unit> {
        override val context: CoroutineContext = newContext
        
        override fun resumeWith(result: Result<Unit>) {
            job.isActive = false
            job.isCompleted = true
            result.exceptionOrNull()?.let { 
                console.error("Coroutine exception: $it")
            }
        }
    }
    
    // Start the coroutine - in JS this runs synchronously if no suspensions
    val suspendBlock: suspend () -> Unit = { block(scope) }
    suspendBlock.startCoroutine(continuation)
    
    return job
}

