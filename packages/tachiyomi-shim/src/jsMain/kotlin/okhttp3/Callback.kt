package okhttp3

import java.io.IOException

/**
 * Callback interface for async HTTP requests.
 */
interface Callback {
    /**
     * Called when the request could not be executed due to cancellation, connectivity problems, or timeout.
     */
    fun onFailure(call: Call, e: IOException)
    
    /**
     * Called when the HTTP response was successfully returned by the remote server.
     */
    fun onResponse(call: Call, response: Response)
}

