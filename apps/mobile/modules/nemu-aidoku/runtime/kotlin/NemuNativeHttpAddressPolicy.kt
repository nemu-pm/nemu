package pm.nemu.mobile.aidoku

import java.io.IOException
import java.net.InetAddress
import java.net.Proxy
import java.net.UnknownHostException
import java.util.Locale
import okhttp3.Dns
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Network boundary for untrusted source packages.
 *
 * A source may choose arbitrary request URLs, so accepting only HTTP(S) is not
 * sufficient: without an address policy it can read loopback/LAN/cloud-metadata
 * services and exfiltrate the response in a later public request. DNS removes
 * every non-public answer and requires at least one public route; OkHttp can
 * therefore select only a validated address. The network interceptor re-checks
 * the connected peer before request bytes are written, which also closes
 * DNS-rebinding and redirect races after lookup.
 */
internal object NemuNativeHttpAddressPolicy {
  private const val BLOCKED_DESTINATION_MESSAGE =
    "Native source networking blocked a private or reserved destination."

  internal fun resolvePublicAddresses(
    hostname: String,
    resolver: (String) -> List<InetAddress>
  ): List<InetAddress> {
    val normalized = normalizeHostname(hostname)
    if (isForbiddenHostname(normalized)) throw blockedDestination()

    val addresses = try {
      resolver(normalized)
    } catch (error: UnknownHostException) {
      throw error
    } catch (error: Throwable) {
      throw UnknownHostException("Native source host lookup failed.").also {
        it.initCause(error)
      }
    }
    if (addresses.isEmpty()) {
      throw UnknownHostException("Native source host lookup returned no addresses.")
    }
    val validatedAddresses = addresses.filter {
      isPublicAddress(it.address) ||
        (!isNumericHostname(normalized) && isProxySyntheticAddress(it.address))
    }
    if (validatedAddresses.isEmpty()) throw blockedDestination()
    return validatedAddresses
  }

  internal fun requirePublicAddress(address: InetAddress, hostname: String) {
    val normalized = normalizeHostname(hostname)
    val allowed = isPublicAddress(address.address) ||
      (!isNumericHostname(normalized) && isProxySyntheticAddress(address.address))
    if (!allowed) throw blockedDestination()
  }

  /**
   * Validates a destination before OkHttp is allowed to build a route for it.
   *
   * OkHttp resolves IP-literal hosts itself and never calls [Dns.lookup] for
   * them, so [NemuPublicAddressDns] cannot see `http://127.0.0.1/` at all. The
   * only remaining guard is a network interceptor, which runs after the TCP
   * connect and TLS handshake have already happened. Check literals here, in
   * the application layer, so a private destination fails closed before any
   * connection is attempted.
   */
  internal fun requirePublicDestination(hostname: String) {
    val normalized = normalizeHostname(hostname)
    if (isForbiddenHostname(normalized)) throw blockedDestination()
    if (!isNumericHostname(normalized)) return
    val literal = parseIpLiteral(normalized) ?: throw blockedDestination()
    if (!isPublicAddress(literal)) throw blockedDestination()
  }

  /**
   * A host that can only be an address literal. Anything numeric that is not a
   * strict literal is rejected rather than resolved: no registry name is fully
   * numeric, and platform resolvers have historically accepted octal, decimal
   * and short-form spellings of loopback and link-local addresses.
   */
  internal fun isNumericHostname(hostname: String): Boolean {
    if (hostname.isEmpty()) return false
    if (hostname.contains(':')) return true
    return hostname.all { it in '0'..'9' || it == '.' }
  }

  /**
   * Surge and compatible TUN proxies synthesize DNS answers from RFC 2544's
   * benchmarking range. The range remains blocked as a direct URL literal and
   * is accepted only when associated with an ordinary DNS hostname.
   */
  internal fun isProxySyntheticAddress(bytes: ByteArray): Boolean {
    return bytes.size == 4 &&
      unsigned(bytes[0]) == 198 &&
      unsigned(bytes[1]) in 18..19
  }

  /** Address bytes for an IP literal, or `null` when [value] is not one. */
  internal fun parseIpLiteral(value: String): ByteArray? {
    if (value.isEmpty()) return null
    return if (value.contains(':')) parseIpv6Literal(value) else parseIpv4Literal(value)
  }

  private fun parseIpv4Literal(value: String): ByteArray? {
    val parts = value.split('.')
    if (parts.size != 4) return null
    val bytes = ByteArray(4)
    parts.forEachIndexed { index, part ->
      if (part.isEmpty() || part.length > 3) return null
      if (!part.all { it in '0'..'9' }) return null
      val octet = part.toInt()
      if (octet > 255) return null
      bytes[index] = octet.toByte()
    }
    return bytes
  }

  private fun parseIpv6Literal(value: String): ByteArray? {
    // A scoped literal only ever names a local interface.
    if (value.contains('%')) return null
    val compression = value.indexOf("::")
    if (compression >= 0 && compression != value.lastIndexOf("::")) return null
    val headText = if (compression >= 0) value.substring(0, compression) else value
    val tailText = if (compression >= 0) value.substring(compression + 2) else ""
    if (headText.endsWith(':') || tailText.startsWith(':') || tailText.endsWith(':')) {
      return null
    }
    if (compression < 0 && headText.startsWith(':')) return null

    val headGroups = if (headText.isEmpty()) emptyList() else headText.split(':')
    val tailGroups = if (tailText.isEmpty()) emptyList() else tailText.split(':')
    val head = ipv6GroupBytes(
      headGroups,
      allowEmbeddedIpv4 = compression < 0
    ) ?: return null
    val tail = ipv6GroupBytes(
      tailGroups,
      allowEmbeddedIpv4 = true
    ) ?: return null

    if (compression < 0) return if (head.size == 16) head else null
    val zeroes = 16 - head.size - tail.size
    if (zeroes < 1) return null
    return head + ByteArray(zeroes) + tail
  }

  private fun ipv6GroupBytes(groups: List<String>, allowEmbeddedIpv4: Boolean): ByteArray? {
    val output = ArrayList<Byte>(16)
    groups.forEachIndexed { index, group ->
      if (group.contains('.')) {
        if (!allowEmbeddedIpv4 || index != groups.size - 1) return null
        val embedded = parseIpv4Literal(group) ?: return null
        for (byte in embedded) output.add(byte)
        return@forEachIndexed
      }
      if (group.isEmpty() || group.length > 4) return null
      if (!group.all { it in '0'..'9' || it in 'a'..'f' }) return null
      val parsed = group.toInt(16)
      output.add(((parsed shr 8) and 0xff).toByte())
      output.add((parsed and 0xff).toByte())
    }
    if (output.size > 16) return null
    return output.toByteArray()
  }

  internal fun isForbiddenHostname(hostname: String): Boolean {
    val normalized = normalizeHostname(hostname)
    if (normalized.isEmpty()) return true
    if (
      normalized == "localhost" ||
      normalized.endsWith(".localhost") ||
      normalized == "local" ||
      normalized.endsWith(".local") ||
      normalized == "localdomain" ||
      normalized.endsWith(".localdomain") ||
      normalized == "internal" ||
      normalized.endsWith(".internal") ||
      normalized == "home.arpa" ||
      normalized.endsWith(".home.arpa")
    ) {
      return true
    }

    return normalized == "metadata" ||
      normalized == "metadata.goog" ||
      normalized.endsWith(".metadata.goog") ||
      normalized == "instance-data" ||
      normalized == "instance-data.ec2.internal" ||
      normalized == "metadata.aws.internal" ||
      normalized == "metadata.azure.internal"
  }

  internal fun isPublicAddress(bytes: ByteArray): Boolean {
    return when (bytes.size) {
      4 -> isPublicIpv4(bytes, 0)
      16 -> isPublicIpv6(bytes)
      else -> false
    }
  }

  private fun isPublicIpv4(bytes: ByteArray, offset: Int): Boolean {
    val first = unsigned(bytes[offset])
    val second = unsigned(bytes[offset + 1])
    val third = unsigned(bytes[offset + 2])
    val fourth = unsigned(bytes[offset + 3])

    if (first == 0 || first == 10 || first == 127 || first >= 224) return false
    if (first == 100 && second in 64..127) return false // shared/CGNAT
    if (first == 169 && second == 254) return false // link-local + metadata
    if (first == 172 && second in 16..31) return false
    if (
      first == 192 && second == 0 && third == 0 && fourth != 9 && fourth != 10
    ) return false
    if (first == 192 && second == 0 && third == 2) return false
    if (first == 192 && second == 88 && third == 99 && fourth != 2) return false
    if (first == 192 && second == 168) return false
    if (first == 198 && second in 18..19) return false // benchmark networks
    if (first == 198 && second == 51 && third == 100) return false
    if (first == 203 && second == 0 && third == 113) return false
    return true
  }

  private fun isPublicIpv6(bytes: ByteArray): Boolean {
    // IPv4-mapped IPv6. Some JDKs expose these as four-byte Inet4Address values,
    // but handling the 16-byte representation prevents platform drift bypasses.
    if (
      bytes.take(10).all { it.toInt() == 0 } &&
      unsigned(bytes[10]) == 0xff &&
      unsigned(bytes[11]) == 0xff
    ) {
      return isPublicIpv4(bytes, 12)
    }

    // The well-known NAT64 prefix is public only when its embedded IPv4 address
    // is public. The local-use 64:ff9b:1::/48 prefix remains blocked below.
    if (
      unsigned(bytes[0]) == 0x00 &&
      unsigned(bytes[1]) == 0x64 &&
      unsigned(bytes[2]) == 0xff &&
      unsigned(bytes[3]) == 0x9b &&
      bytes.sliceArray(4 until 12).all { it.toInt() == 0 }
    ) {
      return isPublicIpv4(bytes, 12)
    }

    // Only currently allocated global-unicast space is eligible. This rejects
    // unspecified, loopback, link/site-local, ULA, multicast, discard-only and
    // other reserved blocks before the narrower exclusions below.
    if ((unsigned(bytes[0]) and 0xe0) != 0x20) return false // 2000::/3

    // 6to4 embeds an IPv4 destination in bits 16...48.
    if (unsigned(bytes[0]) == 0x20 && unsigned(bytes[1]) == 0x02) {
      return isPublicIpv4(bytes, 2)
    }

    if (
      unsigned(bytes[0]) == 0x3f &&
      unsigned(bytes[1]) == 0xff &&
      (unsigned(bytes[2]) and 0xf0) == 0
    ) {
      return false // 3fff::/20 documentation space
    }
    if (unsigned(bytes[0]) == 0x20 && unsigned(bytes[1]) == 0x01) {
      val third = unsigned(bytes[2])
      val fourth = unsigned(bytes[3])
      if (third == 0x00 && fourth == 0x00) return false // Teredo special range
      if (
        third == 0x00 &&
        fourth == 0x02 &&
        unsigned(bytes[4]) == 0 &&
        unsigned(bytes[5]) == 0
      ) return false // benchmarking
      if (third == 0x0d && fourth == 0xb8) return false // documentation
      if (third == 0x00 && (fourth and 0xf0) in setOf(0x10, 0x20, 0x30)) {
        return false // ORCHID/ORCHIDv2/Drone DETs
      }
    }
    return true
  }

  private fun normalizeHostname(hostname: String): String {
    return hostname
      .trim()
      .removePrefix("[")
      .removeSuffix("]")
      .trimEnd('.')
      .lowercase(Locale.US)
  }

  private fun unsigned(value: Byte): Int = value.toInt() and 0xff

  private fun blockedDestination(): UnknownHostException {
    return UnknownHostException(BLOCKED_DESTINATION_MESSAGE)
  }
}

/** Returns only validated DNS answers to OkHttp, including redirect lookups. */
internal object NemuPublicAddressDns : Dns {
  override fun lookup(hostname: String): List<InetAddress> {
    return NemuNativeHttpAddressPolicy.resolvePublicAddresses(hostname) {
      Dns.SYSTEM.lookup(it)
    }
  }
}

/**
 * Runs before OkHttp selects a route, so an IP-literal destination is refused
 * without opening a socket. Application interceptors do not re-run for redirect
 * hops; those stay covered by [NemuPublicAddressDns] and the connected-peer
 * network interceptor below.
 */
internal class NemuPublicAddressPreflightInterceptor : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    NemuNativeHttpAddressPolicy.requirePublicDestination(chain.request().url.host)
    return chain.proceed(chain.request())
  }
}

/**
 * Runs once per network hop after connect but before request headers/body. With
 * proxies disabled on the client, the route address is the actual destination;
 * rejecting it here prevents a DNS answer that changed after lookup from being
 * used for SSRF.
 */
internal class NemuPublicAddressNetworkInterceptor : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val address = chain.connection()?.route()?.socketAddress?.address
      ?: throw IOException("Native source destination could not be validated.")
    NemuNativeHttpAddressPolicy.requirePublicAddress(
      address,
      chain.request().url.host
    )
    return chain.proceed(chain.request())
  }
}

internal val NEMU_NATIVE_HTTP_DIRECT_PROXY: Proxy = Proxy.NO_PROXY
