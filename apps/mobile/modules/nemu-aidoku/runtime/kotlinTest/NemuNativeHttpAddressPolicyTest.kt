package pm.nemu.mobile.aidoku

import java.net.InetAddress
import java.net.UnknownHostException
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuNativeHttpAddressPolicyTest {
  @Test
  fun allowsOrdinaryPublicIpv4AndIpv6Destinations() {
    assertPublic("1.1.1.1")
    assertPublic("8.8.8.8")
    assertPublic("2606:4700:4700::1111")
    assertPublic("2001:4860:4860::8888")
  }

  @Test
  fun blocksLoopbackPrivateLinkLocalMetadataAndCarrierNetworks() {
    listOf(
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "100.100.100.200",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "::",
      "::1",
      "fc00::1",
      "fd00:ec2::254",
      "fe80::1"
    ).forEach(::assertBlocked)
  }

  @Test
  fun blocksReservedMulticastDocumentationAndBenchmarkRanges() {
    listOf(
      "192.0.2.1",
      "192.88.99.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
      "2001:2::1",
      "2001:db8::1",
      "3fff::1",
      "ff02::1"
    ).forEach(::assertBlocked)
  }

  @Test
  fun validatesEmbeddedIpv4AddressesInsteadOfLettingIpv6BypassThePolicy() {
    val mappedLoopback = ByteArray(16).apply {
      this[10] = 0xff.toByte()
      this[11] = 0xff.toByte()
      this[12] = 127
      this[15] = 1
    }
    val mappedPublic = mappedLoopback.copyOf().apply {
      this[12] = 8
      this[15] = 8
    }
    val nat64Private = byteArrayOf(
      0x00, 0x64, 0xff.toByte(), 0x9b.toByte(),
      0, 0, 0, 0, 0, 0, 0, 0,
      10, 0, 0, 1
    )
    val nat64Public = nat64Private.copyOf().apply {
      this[12] = 1
      this[13] = 1
      this[14] = 1
      this[15] = 1
    }

    assertFalse(NemuNativeHttpAddressPolicy.isPublicAddress(mappedLoopback))
    assertTrue(NemuNativeHttpAddressPolicy.isPublicAddress(mappedPublic))
    assertFalse(NemuNativeHttpAddressPolicy.isPublicAddress(nat64Private))
    assertTrue(NemuNativeHttpAddressPolicy.isPublicAddress(nat64Public))
    assertBlocked("2002:7f00:1::")
    assertPublic("2002:0808:0808::")
  }

  @Test
  fun rejectsSpecialHostnamesBeforeCallingDns() {
    var resolverCalled = false
    listOf(
      "localhost",
      "api.localhost.",
      "router.local",
      "service.internal",
      "metadata.google.internal",
      "metadata.goog",
      "home.arpa"
    ).forEach { hostname ->
      assertThrows(UnknownHostException::class.java) {
        NemuNativeHttpAddressPolicy.resolvePublicAddresses(hostname) {
          resolverCalled = true
          listOf(InetAddress.getByName("1.1.1.1"))
        }
      }
    }
    assertFalse(resolverCalled)
  }

  @Test
  fun filtersMixedDnsAnswersAndReturnsOnlyThePublicSet() {
    val public = InetAddress.getByName("1.1.1.1")
    val private = InetAddress.getByName("192.168.0.1")
    assertEquals(
      listOf(public),
      NemuNativeHttpAddressPolicy.resolvePublicAddresses("source.example") {
        listOf(public, private)
      }
    )

    assertEquals(
      listOf(public),
      NemuNativeHttpAddressPolicy.resolvePublicAddresses("source.example") {
        listOf(public)
      }
    )
  }

  @Test
  fun allowsSurgeFakeIpOnlyForResolvedHostnames() {
    val fakeIp = InetAddress.getByName("198.18.3.207")
    assertEquals(
      listOf(fakeIp),
      NemuNativeHttpAddressPolicy.resolvePublicAddresses("source.example") {
        listOf(fakeIp)
      }
    )
    NemuNativeHttpAddressPolicy.requirePublicAddress(fakeIp, "source.example")

    assertThrows(UnknownHostException::class.java) {
      NemuNativeHttpAddressPolicy.resolvePublicAddresses("198.18.3.207") {
        listOf(fakeIp)
      }
    }
    assertThrows(UnknownHostException::class.java) {
      NemuNativeHttpAddressPolicy.requirePublicAddress(fakeIp, "198.18.3.207")
    }
  }

  @Test
  fun preflightBlocksIpLiteralHostsOkHttpWouldNeverResolveThroughDns() {
    // OkHttp builds a route for a literal host itself, so the DNS policy above
    // never sees these. Without the pre-flight the only check left runs after
    // the socket and TLS handshake are already established.
    assertBlockedDestination("127.0.0.1")
    assertBlockedDestination("[::1]")
    assertBlockedDestination("::1")
    assertBlockedDestination("10.0.0.5")
    assertBlockedDestination("192.168.1.1")
    assertBlockedDestination("169.254.169.254")
    assertBlockedDestination("[::ffff:169.254.169.254]")
    assertBlockedDestination("[fe80::1]")
    assertBlockedDestination("[fd00::1]")
    assertBlockedDestination("100.100.100.200")
  }

  @Test
  fun preflightRejectsNonLiteralNumericHostsInsteadOfResolvingThem() {
    // Platform resolvers have accepted octal/decimal shorthands for loopback.
    // A fully numeric host can never be a registry name, so fail closed.
    assertBlockedDestination("2130706433")
    assertBlockedDestination("0177.0.0.1")
    assertBlockedDestination("127.1")
    assertBlockedDestination("1.2.3.4.5")
    assertBlockedDestination("999.1.1.1")
    assertBlockedDestination("::ffff:127.0.0.1%1")
    assertBlockedDestination("1::2::3")
  }

  @Test
  fun preflightAllowsPublicLiteralsAndDefersRegistryNamesToDns() {
    NemuNativeHttpAddressPolicy.requirePublicDestination("1.1.1.1")
    NemuNativeHttpAddressPolicy.requirePublicDestination("[2606:4700:4700::1111]")
    NemuNativeHttpAddressPolicy.requirePublicDestination("2606:4700:4700::1111")
    // Names are validated by NemuPublicAddressDns once every answer is known.
    NemuNativeHttpAddressPolicy.requirePublicDestination("source.example")
    NemuNativeHttpAddressPolicy.requirePublicDestination("mangadex.org")
  }

  @Test
  fun literalParserMatchesThePlatformForWellFormedAddresses() {
    for (literal in listOf(
      "1.1.1.1",
      "255.255.255.255",
      "0.0.0.0",
      "2606:4700:4700::1111",
      "::1",
      "::",
      "fe80::1",
      "2001:db8:0:0:1:0:0:1",
      "64:ff9b::1.2.3.4"
    )) {
      assertArrayEquals(
        "$literal should parse like the platform",
        InetAddress.getByName(literal).address,
        NemuNativeHttpAddressPolicy.parseIpLiteral(literal)
      )
    }
    assertNull(NemuNativeHttpAddressPolicy.parseIpLiteral("source.example"))
  }

  private fun assertBlockedDestination(hostname: String) {
    assertThrows(
      "$hostname should be blocked before any connection",
      UnknownHostException::class.java
    ) {
      NemuNativeHttpAddressPolicy.requirePublicDestination(hostname)
    }
  }

  private fun assertPublic(literal: String) {
    assertTrue(
      "$literal should be public",
      NemuNativeHttpAddressPolicy.isPublicAddress(InetAddress.getByName(literal).address)
    )
  }

  private fun assertBlocked(literal: String) {
    assertFalse(
      "$literal should be blocked",
      NemuNativeHttpAddressPolicy.isPublicAddress(InetAddress.getByName(literal).address)
    )
  }
}
