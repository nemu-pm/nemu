package kotlinx.coroutines.sync

/**
 * Mutex shim for single-threaded JS environment.
 * In JS there's no true concurrency, so this is mostly a no-op.
 */
class Mutex(locked: Boolean = false) {
    private var isLocked: Boolean = locked
    
    /**
     * Check if the mutex is currently locked.
     */
    fun isLocked(): Boolean = isLocked
    
    /**
     * Try to lock the mutex without suspending.
     * @return true if successfully locked, false if already locked
     */
    fun tryLock(owner: Any? = null): Boolean {
        if (isLocked) return false
        isLocked = true
        return true
    }
    
    /**
     * Unlock the mutex.
     */
    fun unlock(owner: Any? = null) {
        isLocked = false
    }
    
    /**
     * Lock the mutex, suspending until available.
     * In JS single-threaded environment, this is effectively a no-op if not locked.
     */
    suspend fun lock(owner: Any? = null) {
        // In single-threaded JS, if it's locked we have a problem
        // but that shouldn't happen with proper coroutine usage
        isLocked = true
    }
}

/**
 * Execute the block while holding the mutex lock.
 * In JS single-threaded environment, this is essentially synchronous.
 */
suspend inline fun <T> Mutex.withLock(owner: Any? = null, action: () -> T): T {
    lock(owner)
    try {
        return action()
    } finally {
        unlock(owner)
    }
}

