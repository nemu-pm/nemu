package org.jsoup

import org.jsoup.nodes.Document

/**
 * Minimal Jsoup stub - MangaDex uses JSON APIs, not HTML parsing.
 */
object Jsoup {
    fun parse(html: String): Document = Document(html)
    fun parse(html: String, baseUri: String): Document = Document(html)
}

