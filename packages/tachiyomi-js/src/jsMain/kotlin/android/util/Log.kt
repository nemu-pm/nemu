package android.util

object Log {
    const val VERBOSE = 2
    const val DEBUG = 3
    const val INFO = 4
    const val WARN = 5
    const val ERROR = 6
    const val ASSERT = 7
    
    fun v(tag: String, msg: String): Int {
        println("V/$tag: $msg")
        return 0
    }
    
    fun v(tag: String, msg: String, tr: Throwable): Int {
        println("V/$tag: $msg")
        tr.printStackTrace()
        return 0
    }
    
    fun d(tag: String, msg: String): Int {
        println("D/$tag: $msg")
        return 0
    }
    
    fun d(tag: String, msg: String, tr: Throwable): Int {
        println("D/$tag: $msg")
        tr.printStackTrace()
        return 0
    }
    
    fun i(tag: String, msg: String): Int {
        println("I/$tag: $msg")
        return 0
    }
    
    fun i(tag: String, msg: String, tr: Throwable): Int {
        println("I/$tag: $msg")
        tr.printStackTrace()
        return 0
    }
    
    fun w(tag: String, msg: String): Int {
        println("W/$tag: $msg")
        return 0
    }
    
    fun w(tag: String, msg: String, tr: Throwable): Int {
        println("W/$tag: $msg")
        tr.printStackTrace()
        return 0
    }
    
    fun w(tag: String, tr: Throwable): Int {
        println("W/$tag:")
        tr.printStackTrace()
        return 0
    }
    
    fun e(tag: String, msg: String): Int {
        println("E/$tag: $msg")
        return 0
    }
    
    fun e(tag: String, msg: String, tr: Throwable): Int {
        println("E/$tag: $msg")
        tr.printStackTrace()
        return 0
    }
    
    fun wtf(tag: String, msg: String): Int {
        println("WTF/$tag: $msg")
        return 0
    }
    
    fun wtf(tag: String, msg: String, tr: Throwable): Int {
        println("WTF/$tag: $msg")
        tr.printStackTrace()
        return 0
    }
    
    fun wtf(tag: String, tr: Throwable): Int {
        println("WTF/$tag:")
        tr.printStackTrace()
        return 0
    }
}

