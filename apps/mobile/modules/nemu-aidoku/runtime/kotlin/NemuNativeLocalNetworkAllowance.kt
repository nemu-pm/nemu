package pm.nemu.mobile.aidoku

import java.util.Locale
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Scoped allowance for self-hosted servers on the user's own network.
 *
 * Source packages are untrusted, so [NemuNativeHttpAddressPolicy] refuses every
 * private, loopback and reserved destination. A self-hosted source (LANraragi,
 * a Komga on the home server, ...) legitimately lives on exactly such an
 * address, so one narrow exception exists:
 *
 * - the endpoint (host + port) must come from a setting the *user* typed into
 *   that source's server-URL field. The host app derives it from its own
 *   settings store and hands it here; a package cannot call this API;
 * - it applies to that source's requests only, keyed by the source's cookie
 *   scope, so no other source can reach the endpoint;
 * - it covers that one host and port, not the subnet or the host's other ports;
 * - even for a granted endpoint, answers in loopback, unspecified, multicast,
 *   reserved and cloud-metadata space stay blocked, so a hostname the user
 *   typed cannot be turned (DNS rebinding) into a path to the device itself or
 *   to an instance-metadata service.
 *
 * Mirrors `NemuNativeLocalNetworkAllowance.swift`.
 */
internal data class NemuLocalNetworkEndpoint(val host: String, val port: Int)

internal class NemuLocalNetworkGrant(val endpoints: Set<NemuLocalNetworkEndpoint>) {
  fun allows(host: String, port: Int): Boolean =
    endpoints.contains(
      NemuLocalNetworkEndpoint(NemuNativeLocalNetworkAllowance.normalizeHost(host), port)
    )

  /**
   * Whether any port of [host] is granted. OkHttp's [okhttp3.Dns] only sees a
   * hostname, so DNS answers are classified per host; the exact port is then
   * enforced on the connected peer by the network interceptor.
   */
  fun allowsHost(host: String): Boolean {
    val normalized = NemuNativeLocalNetworkAllowance.normalizeHost(host)
    return endpoints.any { it.host == normalized }
  }

  companion object {
    val NONE = NemuLocalNetworkGrant(emptySet())
  }
}

internal object NemuNativeLocalNetworkAllowance {
  const val MAX_ENDPOINTS_PER_SCOPE = 4
  const val MAX_SCOPES = 64
  const val MAX_URL_LENGTH = 2_048

  private val lock = Any()
  private val grants = LinkedHashMap<String, NemuLocalNetworkGrant>()

  internal fun normalizeHost(host: String): String =
    host
      .trim()
      .removePrefix("[")
      .removeSuffix("]")
      .trimEnd('.')
      .lowercase(Locale.US)

  /**
   * The endpoint a user-typed server URL names, or null when it must never be
   * granted: not http(s), credentials in the URL, no host, loopback or
   * metadata hosts, or an IP literal outside local-network space.
   */
  internal fun endpointFromConfiguredUrl(value: String): NemuLocalNetworkEndpoint? {
    val trimmed = value.trim()
    if (trimmed.isEmpty() || trimmed.length > MAX_URL_LENGTH) return null
    val url = trimmed.toHttpUrlOrNull() ?: return null
    if (url.username.isNotEmpty() || url.password.isNotEmpty()) return null
    val host = normalizeHost(url.host)
    if (host.isEmpty() || isNeverGrantableHostname(host)) return null
    if (NemuNativeHttpAddressPolicy.isNumericHostname(host)) {
      // No octal-looking spellings: "010.0.0.1" is ambiguous across resolvers.
      if (!host.contains(':') && host.split('.').any { it.length > 1 && it.startsWith('0') }) {
        return null
      }
      val literal = NemuNativeHttpAddressPolicy.parseIpLiteral(host) ?: return null
      if (!isLocalNetworkAddress(literal)) return null
    }
    return NemuLocalNetworkEndpoint(host, url.port)
  }

  /**
   * Replaces the source's grant. Returns the accepted endpoints as
   * `host:port` strings. An empty result clears the grant.
   */
  fun setGrant(scope: String, configuredUrls: List<String>): List<String> {
    val normalizedScope = scope.trim()
    if (normalizedScope.isEmpty()) return emptyList()
    val endpoints = LinkedHashSet<NemuLocalNetworkEndpoint>()
    for (value in configuredUrls) {
      if (endpoints.size >= MAX_ENDPOINTS_PER_SCOPE) break
      endpointFromConfiguredUrl(value)?.let(endpoints::add)
    }
    synchronized(lock) {
      if (endpoints.isEmpty()) {
        grants.remove(normalizedScope)
        return emptyList()
      }
      // Re-inserting keeps the map in least-recently-granted order.
      grants.remove(normalizedScope)
      grants[normalizedScope] = NemuLocalNetworkGrant(endpoints)
      while (grants.size > MAX_SCOPES) {
        grants.remove(grants.keys.first())
      }
    }
    return endpoints.map { "${it.host}:${it.port}" }.sorted()
  }

  fun clearAllGrants() {
    synchronized(lock) { grants.clear() }
  }

  fun grantFor(scope: String?): NemuLocalNetworkGrant {
    val normalized = scope?.trim()?.takeIf { it.isNotEmpty() } ?: return NemuLocalNetworkGrant.NONE
    synchronized(lock) {
      return grants[normalized] ?: NemuLocalNetworkGrant.NONE
    }
  }

  /** Hostnames a grant can never name, whatever the user typed. */
  internal fun isNeverGrantableHostname(host: String): Boolean =
    host == "localhost" ||
      host.endsWith(".localhost") ||
      host == "metadata" ||
      host == "metadata.goog" ||
      host.endsWith(".metadata.goog") ||
      host == "instance-data" ||
      host == "instance-data.ec2.internal" ||
      host == "metadata.aws.internal" ||
      host == "metadata.azure.internal"

  /**
   * Private answers a granted endpoint may resolve to: RFC 1918, shared
   * (CGNAT, e.g. Tailscale), IPv4 link-local and IPv6 unique-local space.
   * Loopback, unspecified, multicast, reserved space and the link-local
   * addresses cloud providers use for instance metadata remain blocked.
   */
  internal fun isLocalNetworkAddress(bytes: ByteArray): Boolean =
    when (bytes.size) {
      4 -> isLocalNetworkIpv4(bytes, 0)
      16 ->
        if (
          bytes.take(10).all { it.toInt() == 0 } &&
          (bytes[10].toInt() and 0xff) == 0xff &&
          (bytes[11].toInt() and 0xff) == 0xff
        ) {
          isLocalNetworkIpv4(bytes, 12)
        } else {
          (bytes[0].toInt() and 0xfe) == 0xfc // fc00::/7 unique-local
        }
      else -> false
    }

  private fun isLocalNetworkIpv4(bytes: ByteArray, offset: Int): Boolean {
    val first = bytes[offset].toInt() and 0xff
    val second = bytes[offset + 1].toInt() and 0xff
    val third = bytes[offset + 2].toInt() and 0xff
    val fourth = bytes[offset + 3].toInt() and 0xff
    if (first == 10) return true
    if (first == 172 && second in 16..31) return true
    if (first == 192 && second == 168) return true
    if (first == 100 && second in 64..127) return true
    if (first == 169 && second == 254) {
      // 169.254.169.254 (AWS/GCP/Azure/OpenStack metadata) and 169.254.170.2
      // (ECS task credentials) must stay unreachable.
      if (third == 169 && fourth == 254) return false
      if (third == 170 && fourth == 2) return false
      return true
    }
    return false
  }
}
