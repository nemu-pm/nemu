package org.jsoup.nodes

/**
 * Minimal Document stub.
 */
class Document(private val html: String) : Element("html") {
    fun body(): Element = Element("body")
    fun head(): Element = Element("head")
    override fun html(): String = html
}

open class Element(private val tagName: String) {
    open fun select(cssQuery: String): Elements = Elements()
    open fun selectFirst(cssQuery: String): Element? = null
    open fun attr(attributeKey: String): String = ""
    open fun text(): String = ""
    open fun ownText(): String = ""
    open fun html(): String = ""
    fun tagName(): String = tagName
}

class Elements : List<Element> by emptyList() {
    fun first(): Element? = firstOrNull()
    fun text(): String = ""
    fun attr(attributeKey: String): String = ""
}

