package pm.nemu.mobile.aidoku

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NemuCloudflareSocketGuardTest {
  private val host = "reader.example.com"

  @Test
  fun embedsExactlyTheHostsTheRequestAllowListAdmits() {
    val script = NemuCloudflareSocketGuard.script(host)!!
    assertTrue(
      script.endsWith("""(self, ["reader.example.com","challenges.cloudflare.com"]);""")
    )
    // One invocation, one host list: nothing else in the script names a host.
    assertEquals(1, Regex("""\(self, \[""").findAll(script).count())
    assertFalse(script.contains("static.reader.example.com"))

    // The guard's list is the request callbacks' list, not a copy of it.
    assertEquals(
      listOf(host, NemuCloudflareChallengePolicy.CHALLENGE_PLATFORM_HOST),
      NemuCloudflareChallengePolicy.allowedHosts(host)
    )
    NemuCloudflareChallengePolicy.allowedHosts(host)!!.forEach { allowed ->
      assertTrue(NemuCloudflareChallengePolicy.allowsSubresource("https", allowed, false, host))
    }
  }

  @Test
  fun aChallengeOnThePlatformHostListsItOnce() {
    val script = NemuCloudflareSocketGuard.script("challenges.cloudflare.com")!!
    assertTrue(script.endsWith("""(self, ["challenges.cloudflare.com"]);"""))
  }

  @Test
  fun refusesToBuildAGuardForAHostTheAllowListCouldNeverAdmit() {
    listOf(
      "Reader.Example.com",
      "reader.example.com.",
      "reader\".example.com",
      "reader.example.com\"]);alert(1);//",
      "reader.example.com\u2028",
      "com",
      "10.0.0.5",
      "[::1]",
      "localhost",
      "printer.local",
      ""
    ).forEach { candidate ->
      assertNull(candidate, NemuCloudflareSocketGuard.script(candidate))
      assertNull(candidate, NemuCloudflareChallengePolicy.allowedHosts(candidate))
      // And the request callbacks agree: nothing, not even the platform host.
      assertFalse(
        candidate,
        NemuCloudflareChallengePolicy.allowsSubresource(
          "https",
          NemuCloudflareChallengePolicy.CHALLENGE_PLATFORM_HOST,
          false,
          candidate
        )
      )
    }
  }

  @Test
  fun escapesEverythingThatCouldLeaveTheStringLiteral() {
    assertEquals("\"reader.example.com\"", NemuCloudflareSocketGuard.jsStringLiteral(host))
    assertEquals("\"a\\\"b\"", NemuCloudflareSocketGuard.jsStringLiteral("a\"b"))
    assertEquals("\"a\\\\b\"", NemuCloudflareSocketGuard.jsStringLiteral("a\\b"))
    assertEquals("\"a\\nb\\rc\\td\"", NemuCloudflareSocketGuard.jsStringLiteral("a\nb\rc\td"))
    assertEquals(
      "\"\\u2028\\u2029\\u0000\\u001f\\u007f\"",
      NemuCloudflareSocketGuard.jsStringLiteral("\u2028\u2029\u0000\u001f\u007f")
    )
    assertEquals(
      "\"\\u003c/script\\u003e\"",
      NemuCloudflareSocketGuard.jsStringLiteral("</script>")
    )
    // Plain non-ASCII passes through; it cannot terminate anything.
    assertEquals("\"é\"", NemuCloudflareSocketGuard.jsStringLiteral("é"))
  }

  @Test
  fun injectsIntoEveryFrameAndGuardsEveryUninterceptedChannel() {
    // Opaque-origin (data:, sandboxed srcdoc) frames only match `*`.
    assertEquals(setOf("*"), NemuCloudflareSocketGuard.ALLOWED_ORIGIN_RULES)

    val script = NemuCloudflareSocketGuard.script(host)!!
    listOf(
      "\"WebSocket\"",
      "\"WebSocketStream\"",
      "\"WebTransport\"",
      "\"RTCPeerConnection\"",
      "\"webkitRTCPeerConnection\"",
      "\"contentWindow\"",
      "\"contentDocument\""
    ).forEach { name -> assertTrue(name, script.contains(name)) }
    assertTrue(script.contains("socketSchemes[\"wss:\"] = \"wss:\""))
    assertTrue(script.contains("transportSchemes[\"https:\"] = \"https:\""))
    // Plain `ws:`/`http:` are never admitted.
    assertFalse(script.contains("\"ws:\""))
    assertFalse(script.contains("\"http:\""))
    // A Kotlin template slipping into the raw string would corrupt the script.
    assertFalse(NEMU_CLOUDFLARE_SOCKET_GUARD_FUNCTION.contains("$"))
  }
}
