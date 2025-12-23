package android.graphics

/**
 * Android Rect shim - represents a rectangle with integer coordinates.
 */
class Rect(
    var left: Int = 0,
    var top: Int = 0,
    var right: Int = 0,
    var bottom: Int = 0
) {
    constructor() : this(0, 0, 0, 0)

    val width: Int get() = right - left
    val height: Int get() = bottom - top

    fun set(left: Int, top: Int, right: Int, bottom: Int) {
        this.left = left
        this.top = top
        this.right = right
        this.bottom = bottom
    }

    fun set(src: Rect) {
        this.left = src.left
        this.top = src.top
        this.right = src.right
        this.bottom = src.bottom
    }

    fun isEmpty(): Boolean = left >= right || top >= bottom

    fun contains(x: Int, y: Int): Boolean {
        return x >= left && x < right && y >= top && y < bottom
    }

    fun intersect(other: Rect): Boolean {
        if (left < other.right && other.left < right && top < other.bottom && other.top < bottom) {
            if (left < other.left) left = other.left
            if (top < other.top) top = other.top
            if (right > other.right) right = other.right
            if (bottom > other.bottom) bottom = other.bottom
            return true
        }
        return false
    }

    override fun equals(other: Any?): Boolean {
        if (other !is Rect) return false
        return left == other.left && top == other.top && right == other.right && bottom == other.bottom
    }

    override fun hashCode(): Int {
        var result = left
        result = 31 * result + top
        result = 31 * result + right
        result = 31 * result + bottom
        return result
    }

    override fun toString(): String = "Rect($left, $top - $right, $bottom)"
}

/**
 * Android RectF shim - represents a rectangle with float coordinates.
 */
class RectF(
    var left: Float = 0f,
    var top: Float = 0f,
    var right: Float = 0f,
    var bottom: Float = 0f
) {
    constructor() : this(0f, 0f, 0f, 0f)
    constructor(rect: Rect) : this(rect.left.toFloat(), rect.top.toFloat(), rect.right.toFloat(), rect.bottom.toFloat())

    val width: Float get() = right - left
    val height: Float get() = bottom - top

    fun set(left: Float, top: Float, right: Float, bottom: Float) {
        this.left = left
        this.top = top
        this.right = right
        this.bottom = bottom
    }

    fun isEmpty(): Boolean = left >= right || top >= bottom
}

