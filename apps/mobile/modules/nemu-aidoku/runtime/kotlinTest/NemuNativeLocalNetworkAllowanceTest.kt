package pm.nemu.mobile.aidoku

import java.net.InetAddress
import java.net.UnknownHostException
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class NemuNativeLocalNetworkAllowanceTest {
  @Before
  @After
  fun resetGrants() {
    NemuNativeLocalNetworkAllowance.clearAllGrants()
  }

  @Test
  fun grantsOnlyEndpointsTheUserCouldHaveTyped() {
    listOf(
      Triple("http://192.168.1.20:3000", "192.168.1.20", 3000),
      Triple("http://192.168.1.20", "192.168.1.20", 80),
      Triple("https://nas.local", "nas.local", 443),
      Triple("http://NAS.Local.:8080/api", "nas.local", 8080),
      Triple("http://lanraragi:3000", "lanraragi", 3000),
      Triple("http://10.0.0.5:3000/", "10.0.0.5", 3000),
      Triple("http://172.16.4.2:3000", "172.16.4.2", 3000),
      Triple("http://100.101.102.103:3000", "100.101.102.103", 3000),
      Triple("http://169.254.12.1:3000", "169.254.12.1", 3000),
      Triple("http://[fd00::5]:8080", "fd00::5", 8080),
      Triple("https://reader.example.com", "reader.example.com", 443)
    ).forEach { (value, host, port) ->
      val endpoint = NemuNativeLocalNetworkAllowance.endpointFromConfiguredUrl(value)
      assertNotNull("Expected $value to be grantable", endpoint)
      assertEquals("host of $value", host, endpoint!!.host)
      assertEquals("port of $value", port, endpoint.port)
    }

    listOf(
      "",
      "   ",
      "not a url",
      "file:///etc/passwd",
      "ftp://192.168.1.2/",
      "http://user:secret@192.168.1.2:3000",
      "http://127.0.0.1:3000",
      "http://127.1",
      "http://localhost:3000",
      "http://printer.localhost",
      "http://0.0.0.0",
      "http://169.254.169.254/latest/meta-data",
      "http://169.254.170.2/v2",
      "http://224.0.0.1",
      "http://255.255.255.255",
      "http://240.0.0.1",
      "http://192.0.2.1",
      "http://198.18.0.1",
      "http://[::1]:3000",
      "http://[fe80::1]",
      "http://[ff02::1]",
      "http://metadata.goog",
      "http://instance-data",
      "http://8.8.8.8",
      "http://010.0.0.1",
      "http://3232235777",
      "http://192.168.1.20:0",
      "http://192.168.1.20:70000",
      "http://" + "a".repeat(2_100) + ".local"
    ).forEach {
      assertNull("Expected $it to be rejected", NemuNativeLocalNetworkAllowance.endpointFromConfiguredUrl(it))
    }
  }

  @Test
  fun grantsAreScopedToOneSourceAndReplaceable() {
    val a = "local::a:multi.lanraragi"
    val b = "local::a:other.source"

    assertEquals(
      listOf("192.168.1.20:3000"),
      NemuNativeLocalNetworkAllowance.setGrant(
        a,
        listOf("http://192.168.1.20:3000", "http://127.0.0.1", "junk")
      )
    )
    val grantA = NemuNativeLocalNetworkAllowance.grantFor(a)
    assertTrue(grantA.allows("192.168.1.20", 3000))
    assertFalse("port is part of the grant", grantA.allows("192.168.1.20", 3001))
    assertFalse("no subnet grant", grantA.allows("192.168.1.21", 3000))
    assertTrue(grantA.allowsHost("192.168.1.20"))
    assertFalse(
      "another source gets nothing",
      NemuNativeLocalNetworkAllowance.grantFor(b).allows("192.168.1.20", 3000)
    )
    assertTrue(NemuNativeLocalNetworkAllowance.grantFor(null).endpoints.isEmpty())
    assertTrue(NemuNativeLocalNetworkAllowance.grantFor("  ").endpoints.isEmpty())

    NemuNativeLocalNetworkAllowance.setGrant(a, listOf("http://nas.local:8080"))
    val replaced = NemuNativeLocalNetworkAllowance.grantFor(a)
    assertFalse(replaced.allows("192.168.1.20", 3000))
    assertTrue(replaced.allows("NAS.local.", 8080))

    assertTrue(NemuNativeLocalNetworkAllowance.setGrant(a, listOf("http://localhost")).isEmpty())
    assertTrue(NemuNativeLocalNetworkAllowance.grantFor(a).endpoints.isEmpty())

    val many = (1..10).map { "http://192.168.1.$it:3000" }
    assertEquals(
      NemuNativeLocalNetworkAllowance.MAX_ENDPOINTS_PER_SCOPE,
      NemuNativeLocalNetworkAllowance.setGrant(a, many).size
    )
    repeat(NemuNativeLocalNetworkAllowance.MAX_SCOPES + 5) {
      NemuNativeLocalNetworkAllowance.setGrant("scope-$it", listOf("http://10.0.0.1:3000"))
    }
    assertTrue(NemuNativeLocalNetworkAllowance.grantFor("scope-0").endpoints.isEmpty())
    assertFalse(
      NemuNativeLocalNetworkAllowance
        .grantFor("scope-${NemuNativeLocalNetworkAllowance.MAX_SCOPES + 4}")
        .endpoints
        .isEmpty()
    )
    NemuNativeLocalNetworkAllowance.clearAllGrants()
    assertTrue(NemuNativeLocalNetworkAllowance.grantFor("scope-70").endpoints.isEmpty())
  }

  @Test
  fun preflightHonoursOnlyTheGrantedEndpoint() {
    val lan = grant("http://192.168.1.20:3000", "http://nas.local:8080")

    assertThrows(UnknownHostException::class.java) {
      NemuNativeHttpAddressPolicy.requirePublicDestination("192.168.1.20", 3000)
    }
    NemuNativeHttpAddressPolicy.requirePublicDestination("192.168.1.20", 3000, lan)
    NemuNativeHttpAddressPolicy.requirePublicDestination("nas.local", 8080, lan)

    listOf("192.168.1.20" to 22, "192.168.1.21" to 3000, "10.0.0.1" to 3000, "nas.local" to 80)
      .forEach { (host, port) ->
        assertThrows("$host:$port is outside the grant", UnknownHostException::class.java) {
          NemuNativeHttpAddressPolicy.requirePublicDestination(host, port, lan)
        }
      }
    assertThrows(UnknownHostException::class.java) {
      NemuNativeHttpAddressPolicy.requirePublicDestination("169.254.169.254", 80, lan)
    }
  }

  @Test
  fun dnsAnswersForAGrantedNameStayInsideLocalNetworkOrPublicSpace() {
    val lan = grant("http://nas.local:8080")

    assertThrows(UnknownHostException::class.java) {
      NemuNativeHttpAddressPolicy.resolvePublicAddresses("nas.local") { listOf(ip("192.168.1.5")) }
    }
    assertEquals(
      listOf(ip("192.168.1.5")),
      NemuNativeHttpAddressPolicy.resolvePublicAddresses("nas.local", lan) {
        listOf(ip("192.168.1.5"))
      }
    )
    assertEquals(
      "loopback and metadata answers are filtered",
      listOf(ip("192.168.1.5")),
      NemuNativeHttpAddressPolicy.resolvePublicAddresses("nas.local", lan) {
        listOf(ip("127.0.0.1"), ip("192.168.1.5"), ip("169.254.169.254"))
      }
    )
    listOf("127.0.0.1", "0.0.0.0", "169.254.169.254", "224.0.0.1").forEach { answer ->
      assertThrows("granted name answering $answer", UnknownHostException::class.java) {
        NemuNativeHttpAddressPolicy.resolvePublicAddresses("nas.local", lan) { listOf(ip(answer)) }
      }
    }
    assertEquals(
      listOf(ip("1.1.1.1")),
      NemuNativeHttpAddressPolicy.resolvePublicAddresses("nas.local", lan) { listOf(ip("1.1.1.1")) }
    )
    // A different host never inherits the grant.
    assertThrows(UnknownHostException::class.java) {
      NemuNativeHttpAddressPolicy.resolvePublicAddresses("other.local", lan) { listOf(ip("192.168.1.5")) }
    }
  }

  @Test
  fun connectedPeerPortIsEnforcedForGrantedEndpoints() {
    val lan = grant("http://192.168.1.20:3000")
    NemuNativeHttpAddressPolicy.requirePublicAddress(ip("192.168.1.20"), "192.168.1.20", 3000, lan)
    assertThrows(UnknownHostException::class.java) {
      NemuNativeHttpAddressPolicy.requirePublicAddress(ip("192.168.1.20"), "192.168.1.20", 22, lan)
    }
    assertThrows(UnknownHostException::class.java) {
      NemuNativeHttpAddressPolicy.requirePublicAddress(ip("192.168.1.20"), "192.168.1.20")
    }
    // The DNS-rebinding case: the granted name connected to the device itself.
    assertThrows(UnknownHostException::class.java) {
      NemuNativeHttpAddressPolicy.requirePublicAddress(
        ip("127.0.0.1"),
        "192.168.1.20",
        3000,
        lan
      )
    }
  }

  @Test
  fun scopedClientSwapsTheStrictInterceptorsForTheGrantAwareOnes() {
    val base = OkHttpClient.Builder()
      .dns(NemuPublicAddressDns)
      .addInterceptor(NemuPublicAddressPreflightInterceptor())
      .addNetworkInterceptor(NemuPublicAddressNetworkInterceptor())
      .build()
    val scoped = base.newBuilder().withLocalNetworkScope("local::a:multi.lanraragi").build()

    assertEquals(1, scoped.interceptors.count { it is NemuPublicAddressPreflightInterceptor })
    assertEquals(1, scoped.networkInterceptors.count { it is NemuPublicAddressNetworkInterceptor })
    assertTrue(scoped.interceptors.first() is NemuPublicAddressPreflightInterceptor)
    assertTrue(scoped.dns is NemuScopedAddressDns)
    // The base client is untouched.
    assertTrue(base.dns === NemuPublicAddressDns)
  }

  private fun grant(vararg urls: String): NemuLocalNetworkGrant =
    NemuLocalNetworkGrant(
      urls.map {
        NemuNativeLocalNetworkAllowance.endpointFromConfiguredUrl(it)
          ?: error("Test grant URL must be grantable: $it")
      }.toSet()
    )

  private fun ip(literal: String): InetAddress =
    InetAddress.getByAddress(NemuNativeHttpAddressPolicy.parseIpLiteral(literal)!!)
}
