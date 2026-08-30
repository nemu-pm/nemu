package pm.nemu.mobile.aidoku

/** Merge native-cookie-jar values into an image request without allowing the
 * jar to overwrite a source's explicit Cookie value for the same name. */
internal fun mergeAidokuSandboxCookieHeaders(
  existingHeaders: Map<String, String>,
  nativeCookies: List<Pair<String, String>>
): Map<String, String> {
  if (nativeCookies.isEmpty()) return existingHeaders
  val output = LinkedHashMap(existingHeaders)
  val existingCookieKey = output.keys.firstOrNull {
    it.equals("cookie", ignoreCase = true)
  }
  val existingCookieHeader = existingCookieKey?.let(output::get).orEmpty()
  val explicitNames = existingCookieHeader
    .split(";")
    .mapNotNull { cookie ->
      val separator = cookie.indexOf('=')
      if (separator <= 0) null else cookie.substring(0, separator).trim()
    }
    .toSet()
  val nativeCookieHeader = nativeCookies
    .filterNot { (name) -> name in explicitNames }
    .joinToString("; ") { (name, value) -> "$name=$value" }
  if (nativeCookieHeader.isBlank()) return output

  output[existingCookieKey ?: "Cookie"] = listOf(
    existingCookieHeader,
    nativeCookieHeader
  ).filter { it.isNotBlank() }.joinToString("; ")
  return output
}
