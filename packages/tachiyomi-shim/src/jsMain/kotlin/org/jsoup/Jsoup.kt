package org.jsoup

import org.jsoup.nodes.Document
import org.jsoup.parser.Parser
import com.fleeksoft.ksoup.Ksoup as KsoupImpl

/**
 * Jsoup compatibility wrapper over Ksoup.
 * 
 * Ksoup is a Kotlin Multiplatform port of Jsoup that provides real HTML parsing.
 * This wrapper maintains API compatibility with extension code that imports org.jsoup.
 */
object Jsoup {
    /**
     * Parse HTML into a Document.
     */
    fun parse(html: String): Document {
        return Document(KsoupImpl.parse(html))
    }

    /**
     * Parse HTML with a base URI for resolving relative URLs.
     */
    fun parse(html: String, baseUri: String): Document {
        return Document(KsoupImpl.parse(html = html, baseUri = baseUri))
    }

    /**
     * Parse HTML with a base URI and specific parser (HTML or XML).
     */
    fun parse(html: String, baseUri: String, parser: Parser): Document {
        return Document(KsoupImpl.parse(html = html, baseUri = baseUri, parser = parser.impl))
    }
}
