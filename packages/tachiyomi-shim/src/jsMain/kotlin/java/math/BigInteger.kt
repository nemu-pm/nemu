package java.math

/**
 * BigInteger implementation in pure Kotlin.
 * Optimized for RSA operations with keys up to 2048 bits.
 */
class BigInteger private constructor(
    private val magnitude: IntArray,  // Little-endian, unsigned 32-bit limbs
    private val signum: Int           // -1, 0, or 1
) : Comparable<BigInteger> {

    constructor(value: String, radix: Int = 10) : this(parseString(value, radix))
    
    private constructor(pair: Pair<IntArray, Int>) : this(pair.first, pair.second)

    fun toLong(): Long {
        if (signum == 0) return 0L
        var result = 0L
        if (magnitude.isNotEmpty()) {
            result = magnitude[0].toLong() and 0xFFFFFFFFL
        }
        if (magnitude.size > 1) {
            result = result or ((magnitude[1].toLong() and 0xFFFFFFFFL) shl 32)
        }
        return if (signum < 0) -result else result
    }

    fun toInt(): Int = toLong().toInt()

    operator fun plus(other: BigInteger): BigInteger {
        if (signum == 0) return other
        if (other.signum == 0) return this
        
        return if (signum == other.signum) {
            BigInteger(addMagnitudes(magnitude, other.magnitude), signum)
        } else {
            val cmp = compareMagnitudes(magnitude, other.magnitude)
            when {
                cmp == 0 -> ZERO
                cmp > 0 -> BigInteger(subtractMagnitudes(magnitude, other.magnitude), signum)
                else -> BigInteger(subtractMagnitudes(other.magnitude, magnitude), other.signum)
            }
        }
    }

    operator fun minus(other: BigInteger): BigInteger = this + other.negate()

    operator fun times(other: BigInteger): BigInteger {
        if (signum == 0 || other.signum == 0) return ZERO
        return BigInteger(
            multiplyMagnitudes(magnitude, other.magnitude),
            if (signum == other.signum) 1 else -1
        )
    }

    operator fun div(other: BigInteger): BigInteger {
        if (other.signum == 0) throw ArithmeticException("Division by zero")
        if (signum == 0) return ZERO
        val (q, _) = divideMagnitudes(magnitude, other.magnitude)
        val sign = if (signum == other.signum) 1 else -1
        return BigInteger(q, if (q.all { it == 0 }) 0 else sign)
    }

    operator fun rem(other: BigInteger): BigInteger {
        if (other.signum == 0) throw ArithmeticException("Division by zero")
        if (signum == 0) return ZERO
        val (_, r) = divideMagnitudes(magnitude, other.magnitude)
        return BigInteger(r, if (r.all { it == 0 }) 0 else signum)
    }

    fun mod(m: BigInteger): BigInteger {
        val r = this % m
        return if (r.signum < 0) r + m else r
    }

    fun modPow(exponent: BigInteger, modulus: BigInteger): BigInteger {
        if (modulus.signum <= 0) throw ArithmeticException("Modulus must be positive")
        if (exponent.signum == 0) return ONE
        
        var base = this.mod(modulus)
        var exp = exponent
        var result = ONE
        
        while (exp.signum > 0) {
            if (exp.isOdd()) {
                result = (result * base).mod(modulus)
            }
            exp = exp.shiftRight(1)
            base = (base * base).mod(modulus)
        }
        return result
    }

    fun modInverse(m: BigInteger): BigInteger? {
        if (m.signum <= 0) return null
        
        var a = this.mod(m)
        var b = m
        var x0 = ZERO
        var x1 = ONE
        
        while (a > ONE) {
            val q = a / b
            var t = b
            b = a % b
            a = t
            t = x0
            x0 = x1 - q * x0
            x1 = t
        }
        
        return if (a == ONE) {
            if (x1.signum < 0) x1 + m else x1
        } else null
    }

    fun bitLength(): Int {
        if (signum == 0) return 0
        val topLimb = magnitude.last()
        val topBits = 32 - topLimb.countLeadingZeroBits()
        return (magnitude.size - 1) * 32 + topBits
    }

    fun toByteArray(): ByteArray {
        if (signum == 0) return byteArrayOf(0)
        
        val bytes = mutableListOf<Byte>()
        for (i in magnitude.indices.reversed()) {
            val limb = magnitude[i]
            bytes.add(((limb shr 24) and 0xFF).toByte())
            bytes.add(((limb shr 16) and 0xFF).toByte())
            bytes.add(((limb shr 8) and 0xFF).toByte())
            bytes.add((limb and 0xFF).toByte())
        }
        
        // Remove leading zeros but keep at least one byte
        while (bytes.size > 1 && bytes[0] == 0.toByte() && (bytes[1].toInt() and 0x80) == 0) {
            bytes.removeAt(0)
        }
        
        // Handle two's complement for negative numbers
        if (signum < 0) {
            val result = bytes.map { (it.toInt().inv() and 0xFF).toByte() }.toMutableList()
            var carry = 1
            for (i in result.indices.reversed()) {
                val sum = (result[i].toInt() and 0xFF) + carry
                result[i] = (sum and 0xFF).toByte()
                carry = sum shr 8
            }
            if ((result[0].toInt() and 0x80) == 0) {
                result.add(0, 0xFF.toByte())
            }
            return result.toByteArray()
        }
        
        // Add leading zero if high bit is set (to preserve sign)
        if ((bytes[0].toInt() and 0x80) != 0) {
            bytes.add(0, 0)
        }
        return bytes.toByteArray()
    }

    fun negate(): BigInteger = BigInteger(magnitude, -signum)

    fun abs(): BigInteger = if (signum < 0) negate() else this

    private fun isOdd(): Boolean = magnitude.isNotEmpty() && (magnitude[0] and 1) == 1

    private fun shiftRight(n: Int): BigInteger {
        if (signum == 0 || n == 0) return this
        
        val limbShift = n / 32
        val bitShift = n % 32
        
        if (limbShift >= magnitude.size) return ZERO
        
        val newSize = magnitude.size - limbShift
        val result = IntArray(newSize)
        
        for (i in 0 until newSize) {
            result[i] = magnitude[i + limbShift] ushr bitShift
            if (bitShift > 0 && i + limbShift + 1 < magnitude.size) {
                result[i] = result[i] or (magnitude[i + limbShift + 1] shl (32 - bitShift))
            }
        }
        
        return BigInteger(trimLeadingZeros(result), signum)
    }

    override fun compareTo(other: BigInteger): Int {
        if (signum != other.signum) return signum - other.signum
        val magCmp = compareMagnitudes(magnitude, other.magnitude)
        return if (signum >= 0) magCmp else -magCmp
    }

    override fun equals(other: Any?): Boolean {
        if (other !is BigInteger) return false
        return signum == other.signum && magnitude.contentEquals(other.magnitude)
    }

    override fun hashCode(): Int = magnitude.contentHashCode() * 31 + signum

    override fun toString(): String {
        if (signum == 0) return "0"
        
        val digits = mutableListOf<Char>()
        var temp = abs()
        
        while (temp > ZERO) {
            val (q, r) = divideMagnitudes(temp.magnitude, intArrayOf(10))
            val digit = r.firstOrNull()?.let { it and 0xF } ?: 0
            digits.add(('0'.code + digit).toChar())
            temp = BigInteger(trimLeadingZeros(q), if (q.all { it == 0 }) 0 else 1)
        }
        
        if (digits.isEmpty()) return "0"
        return (if (signum < 0) "-" else "") + digits.reversed().joinToString("")
    }

    companion object {
        val ZERO = BigInteger(intArrayOf(), 0)
        val ONE = BigInteger(intArrayOf(1), 1)
        val TWO = BigInteger(intArrayOf(2), 1)

        fun valueOf(value: Long): BigInteger {
            if (value == 0L) return ZERO
            val signum = if (value < 0) -1 else 1
            val absValue = if (value < 0) -value else value
            val low = (absValue and 0xFFFFFFFFL).toInt()
            val high = (absValue ushr 32).toInt()
            val mag = if (high == 0) intArrayOf(low) else intArrayOf(low, high)
            return BigInteger(mag, signum)
        }

        fun fromByteArray(bytes: ByteArray): BigInteger {
            if (bytes.isEmpty()) return ZERO
            
            val negative = bytes[0] < 0
            val workBytes = if (negative) {
                // Two's complement: invert and add 1
                val inv = bytes.map { (it.toInt().inv() and 0xFF).toByte() }.toByteArray()
                var carry = 1
                for (i in inv.indices.reversed()) {
                    val sum = (inv[i].toInt() and 0xFF) + carry
                    inv[i] = (sum and 0xFF).toByte()
                    carry = sum shr 8
                }
                inv
            } else bytes
            
            return BigInteger(bytesToMagnitude(workBytes), if (negative) -1 else 1)
        }

        fun fromPositiveBytes(bytes: ByteArray): BigInteger {
            if (bytes.isEmpty()) return ZERO
            val mag = bytesToMagnitude(bytes)
            return BigInteger(mag, if (mag.all { it == 0 }) 0 else 1)
        }

        fun probablePrime(bitLength: Int): BigInteger {
            var candidate: BigInteger
            do {
                candidate = randomBigInt(bitLength)
                if (!candidate.isOdd()) {
                    candidate = candidate + ONE
                }
            } while (!isProbablePrime(candidate, 20))
            return candidate
        }

        private fun randomBigInt(bitLength: Int): BigInteger {
            val numBytes = (bitLength + 7) / 8
            val bytes = ByteArray(numBytes)
            for (i in bytes.indices) {
                bytes[i] = kotlin.random.Random.nextInt(256).toByte()
            }
            // Set top bit
            val extraBits = numBytes * 8 - bitLength
            bytes[0] = (bytes[0].toInt() and (0xFF shr extraBits) or (0x80 shr extraBits)).toByte()
            return fromPositiveBytes(bytes)
        }

        private fun isProbablePrime(n: BigInteger, iterations: Int): Boolean {
            if (n < TWO) return false
            if (n == TWO) return true
            if (!n.isOdd()) return false

            var d = n - ONE
            var r = 0
            while (!d.isOdd()) {
                d = d.shiftRight(1)
                r++
            }

            val nMinusOne = n - ONE

            outer@ for (i in 0 until iterations) {
                val a = randomBigInt(n.bitLength() - 1)
                if (a < TWO || a >= nMinusOne) continue

                var x = a.modPow(d, n)
                if (x == ONE || x == nMinusOne) continue

                for (j in 0 until r - 1) {
                    x = x.modPow(TWO, n)
                    if (x == nMinusOne) continue@outer
                }
                return false
            }
            return true
        }

        private fun bytesToMagnitude(bytes: ByteArray): IntArray {
            // Skip leading zeros
            var start = 0
            while (start < bytes.size && bytes[start] == 0.toByte()) start++
            if (start == bytes.size) return intArrayOf()
            
            val numBytes = bytes.size - start
            val numLimbs = (numBytes + 3) / 4
            val result = IntArray(numLimbs)
            
            var byteIdx = bytes.size - 1
            for (limbIdx in 0 until numLimbs) {
                var limb = 0
                for (shift in 0 until 32 step 8) {
                    if (byteIdx >= start) {
                        limb = limb or ((bytes[byteIdx--].toInt() and 0xFF) shl shift)
                    }
                }
                result[limbIdx] = limb
            }
            return trimLeadingZeros(result)
        }

        private fun parseString(s: String, radix: Int): Pair<IntArray, Int> {
            if (s.isEmpty()) return intArrayOf() to 0
            var start = 0
            val signum = when {
                s[0] == '-' -> { start = 1; -1 }
                s[0] == '+' -> { start = 1; 1 }
                else -> 1
            }
            if (start == s.length) return intArrayOf() to 0
            
            var result = ZERO
            val base = valueOf(radix.toLong())
            for (i in start until s.length) {
                val digit = s[i].digitToIntOrNull(radix) ?: break
                result = result * base + valueOf(digit.toLong())
            }
            return result.magnitude to (if (result.magnitude.isEmpty()) 0 else signum)
        }

        private fun trimLeadingZeros(arr: IntArray): IntArray {
            var len = arr.size
            while (len > 0 && arr[len - 1] == 0) len--
            return if (len == arr.size) arr else arr.copyOf(len)
        }

        private fun addMagnitudes(a: IntArray, b: IntArray): IntArray {
            val (larger, smaller) = if (a.size >= b.size) a to b else b to a
            val result = IntArray(larger.size + 1)
            var carry = 0L
            
            for (i in smaller.indices) {
                val sum = (larger[i].toLong() and 0xFFFFFFFFL) + 
                          (smaller[i].toLong() and 0xFFFFFFFFL) + carry
                result[i] = sum.toInt()
                carry = sum ushr 32
            }
            for (i in smaller.size until larger.size) {
                val sum = (larger[i].toLong() and 0xFFFFFFFFL) + carry
                result[i] = sum.toInt()
                carry = sum ushr 32
            }
            if (carry != 0L) result[larger.size] = carry.toInt()
            
            return trimLeadingZeros(result)
        }

        private fun subtractMagnitudes(a: IntArray, b: IntArray): IntArray {
            // Assumes a >= b
            val result = IntArray(a.size)
            var borrow = 0L
            
            for (i in b.indices) {
                val diff = (a[i].toLong() and 0xFFFFFFFFL) - 
                           (b[i].toLong() and 0xFFFFFFFFL) - borrow
                result[i] = diff.toInt()
                borrow = if (diff < 0) 1 else 0
            }
            for (i in b.size until a.size) {
                val diff = (a[i].toLong() and 0xFFFFFFFFL) - borrow
                result[i] = diff.toInt()
                borrow = if (diff < 0) 1 else 0
            }
            
            return trimLeadingZeros(result)
        }

        private fun multiplyMagnitudes(a: IntArray, b: IntArray): IntArray {
            val result = IntArray(a.size + b.size)
            
            for (i in a.indices) {
                var carry = 0L
                for (j in b.indices) {
                    val prod = (a[i].toLong() and 0xFFFFFFFFL) * 
                               (b[j].toLong() and 0xFFFFFFFFL) +
                               (result[i + j].toLong() and 0xFFFFFFFFL) + carry
                    result[i + j] = prod.toInt()
                    carry = prod ushr 32
                }
                if (carry != 0L) {
                    result[i + b.size] = (result[i + b.size].toLong() and 0xFFFFFFFFL + carry).toInt()
                }
            }
            
            return trimLeadingZeros(result)
        }

        private fun divideMagnitudes(a: IntArray, b: IntArray): Pair<IntArray, IntArray> {
            if (b.isEmpty() || b.all { it == 0 }) throw ArithmeticException("Division by zero")
            if (a.isEmpty()) return intArrayOf() to intArrayOf()
            
            val cmp = compareMagnitudes(a, b)
            if (cmp < 0) return intArrayOf() to a.copyOf()
            if (cmp == 0) return intArrayOf(1) to intArrayOf()
            
            // Simple long division
            val quotient = mutableListOf<Int>()
            var remainder = BigInteger(a, 1)
            val divisor = BigInteger(b, 1)
            
            // Estimate quotient digit by digit
            while (remainder >= divisor) {
                val shift = remainder.bitLength() - divisor.bitLength()
                var tryDivisor = if (shift > 0) divisor.shiftLeft(shift) else divisor
                
                if (tryDivisor > remainder) {
                    tryDivisor = tryDivisor.shiftRight(1)
                }
                
                remainder = remainder - tryDivisor
            }
            
            // Compute actual quotient
            val q = (BigInteger(a, 1) - remainder) / divisor
            return q.magnitude to remainder.magnitude
        }

        private fun compareMagnitudes(a: IntArray, b: IntArray): Int {
            if (a.size != b.size) return a.size.compareTo(b.size)
            for (i in a.indices.reversed()) {
                val cmp = (a[i].toLong() and 0xFFFFFFFFL).compareTo(b[i].toLong() and 0xFFFFFFFFL)
                if (cmp != 0) return cmp
            }
            return 0
        }
    }

    private fun shiftLeft(n: Int): BigInteger {
        if (signum == 0 || n == 0) return this
        
        val limbShift = n / 32
        val bitShift = n % 32
        
        val newSize = magnitude.size + limbShift + 1
        val result = IntArray(newSize)
        
        for (i in magnitude.indices) {
            result[i + limbShift] = result[i + limbShift] or (magnitude[i] shl bitShift)
            if (bitShift > 0 && i + limbShift + 1 < newSize) {
                result[i + limbShift + 1] = magnitude[i] ushr (32 - bitShift)
            }
        }
        
        return BigInteger(trimLeadingZeros(result), signum)
    }
}

private fun Int.countLeadingZeroBits(): Int {
    if (this == 0) return 32
    var n = 1
    var x = this
    if (x ushr 16 == 0) { n += 16; x = x shl 16 }
    if (x ushr 24 == 0) { n += 8; x = x shl 8 }
    if (x ushr 28 == 0) { n += 4; x = x shl 4 }
    if (x ushr 30 == 0) { n += 2; x = x shl 2 }
    return n - (x ushr 31)
}
