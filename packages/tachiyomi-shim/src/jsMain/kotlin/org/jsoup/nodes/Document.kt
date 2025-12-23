package org.jsoup.nodes

import com.fleeksoft.ksoup.nodes.Document as KsoupDocument
import com.fleeksoft.ksoup.nodes.Element as KsoupElement
import com.fleeksoft.ksoup.select.Elements as KsoupElements

/**
 * Jsoup Document compatibility wrapper over Ksoup.
 */
class Document(implDoc: KsoupDocument) : Element(implDoc) {
    // Cast impl to KsoupDocument for Document-specific methods
    private val doc: KsoupDocument get() = impl as KsoupDocument
    /**
     * Get the document's body element.
     */
    fun body(): Element = Element(doc.body())

    /**
     * Get the document's head element.
     */
    fun head(): Element? = doc.head()?.let { Element(it) }

    /**
     * Get the document's title.
     */
    fun title(): String = doc.title()

    /**
     * Get the URL this document was parsed from.
     */
    fun location(): String = doc.location() ?: ""

    /**
     * Set the document's base URI.
     */
    fun setBaseUri(baseUri: String) {
        doc.setBaseUri(baseUri)
    }
}

/**
 * Jsoup Element compatibility wrapper over Ksoup.
 */
open class Element(internal val impl: KsoupElement) {
    /**
     * Find elements matching a CSS selector.
     */
    open fun select(cssQuery: String): Elements = Elements(impl.select(cssQuery))

    /**
     * Find the first element matching a CSS selector.
     */
    open fun selectFirst(cssQuery: String): Element? = impl.selectFirst(cssQuery)?.let { Element(it) }

    /**
     * Get an attribute value by key.
     */
    open fun attr(attributeKey: String): String = impl.attr(attributeKey)

    /**
     * Set an attribute value.
     */
    open fun attr(attributeKey: String, attributeValue: String): Element {
        impl.attr(attributeKey, attributeValue)
        return this
    }

    /**
     * Check if this element has an attribute.
     */
    fun hasAttr(attributeKey: String): Boolean = impl.hasAttr(attributeKey)

    /**
     * Remove an attribute from this element.
     */
    fun removeAttr(attributeKey: String): Element {
        impl.removeAttr(attributeKey)
        return this
    }

    /**
     * Get an absolute URL from an attribute.
     */
    fun absUrl(attributeKey: String): String = impl.absUrl(attributeKey)

    /**
     * Get the combined text of this element and its children.
     */
    open fun text(): String = impl.text()

    /**
     * Set the text content of this element.
     */
    fun text(text: String): Element {
        impl.text(text)
        return this
    }

    /**
     * Get the unencoded text of this element only (not its children).
     */
    open fun ownText(): String = impl.ownText()

    /**
     * Get the inner HTML of this element.
     */
    open fun html(): String = impl.html()

    /**
     * Set the inner HTML of this element.
     */
    fun html(html: String): Element {
        impl.html(html)
        return this
    }

    /**
     * Get the outer HTML of this element.
     */
    fun outerHtml(): String = impl.outerHtml()

    /**
     * Get the tag name of this element.
     */
    fun tagName(): String = impl.tagName()

    /**
     * Get the normalized tag name (lowercase).
     */
    fun normalName(): String = impl.normalName()

    /**
     * Get the element's ID.
     */
    fun id(): String = impl.id()

    /**
     * Get the element's class names as a set.
     */
    fun classNames(): Set<String> = impl.classNames()

    /**
     * Check if this element has the specified class.
     */
    fun hasClass(className: String): Boolean = impl.hasClass(className)

    /**
     * Add a class to this element.
     */
    fun addClass(className: String): Element {
        impl.addClass(className)
        return this
    }

    /**
     * Remove a class from this element.
     */
    fun removeClass(className: String): Element {
        impl.removeClass(className)
        return this
    }

    /**
     * Toggle a class on this element.
     */
    fun toggleClass(className: String): Element {
        impl.toggleClass(className)
        return this
    }

    /**
     * Get the value of a form element (input, textarea, select).
     */
    fun value(): String = impl.value()
    
    /**
     * Get the value of a form element (alias for value()).
     * Name uses backticks because 'val' is a Kotlin keyword.
     */
    fun `val`(): String = value()

    /**
     * Set the value of a form element.
     */
    fun value(value: String): Element {
        impl.value(value)
        return this
    }
    
    /**
     * Set the value of a form element (alias for value()).
     */
    fun `val`(value: String): Element = value(value)

    /**
     * Get the parent element.
     */
    fun parent(): Element? = impl.parent()?.let { Element(it) }

    /**
     * Get the owner document of this element.
     */
    fun ownerDocument(): Document? = impl.ownerDocument()?.let { Document(it) }

    /**
     * Get all parent elements up to the root.
     */
    fun parents(): Elements = Elements(impl.parents())

    /**
     * Get child elements.
     */
    fun children(): Elements = Elements(impl.children())

    /**
     * Get a child element by index.
     */
    fun child(index: Int): Element = Element(impl.child(index))

    /**
     * Get the number of child elements.
     */
    fun childrenSize(): Int = impl.childrenSize()

    /**
     * Get the first child element.
     */
    fun firstElementChild(): Element? = impl.firstElementChild()?.let { Element(it) }

    /**
     * Get the last child element.
     */
    fun lastElementChild(): Element? = impl.lastElementChild()?.let { Element(it) }

    /**
     * Get the next sibling element.
     */
    fun nextElementSibling(): Element? = impl.nextElementSibling()?.let { Element(it) }

    /**
     * Get all next sibling elements.
     */
    fun nextElementSiblings(): Elements = Elements(impl.nextElementSiblings())

    /**
     * Get the previous sibling element.
     */
    fun previousElementSibling(): Element? = impl.previousElementSibling()?.let { Element(it) }

    /**
     * Get all previous sibling elements.
     */
    fun previousElementSiblings(): Elements = Elements(impl.previousElementSiblings())

    /**
     * Get sibling elements.
     */
    fun siblingElements(): Elements = Elements(impl.siblingElements())

    /**
     * Append HTML to this element.
     */
    fun append(html: String): Element {
        impl.append(html)
        return this
    }

    /**
     * Prepend HTML to this element.
     */
    fun prepend(html: String): Element {
        impl.prepend(html)
        return this
    }

    /**
     * Insert HTML before this element.
     */
    fun before(html: String): Element {
        impl.before(html)
        return this
    }

    /**
     * Insert HTML after this element.
     */
    fun after(html: String): Element {
        impl.after(html)
        return this
    }

    /**
     * Wrap this element with the specified HTML.
     */
    fun wrap(html: String): Element {
        impl.wrap(html)
        return this
    }

    /**
     * Remove this element from the DOM.
     */
    fun remove(): Element {
        impl.remove()
        return this
    }

    /**
     * Remove all children from this element.
     */
    fun empty(): Element {
        impl.empty()
        return this
    }

    /**
     * Get elements by ID.
     */
    fun getElementById(id: String): Element? = impl.getElementById(id)?.let { Element(it) }

    /**
     * Get elements by tag name.
     */
    fun getElementsByTag(tagName: String): Elements = Elements(impl.getElementsByTag(tagName))

    /**
     * Get elements by class name.
     */
    fun getElementsByClass(className: String): Elements = Elements(impl.getElementsByClass(className))

    /**
     * Get elements with the specified attribute.
     */
    fun getElementsByAttribute(key: String): Elements = Elements(impl.getElementsByAttribute(key))

    /**
     * Get elements with an attribute starting with the prefix.
     */
    fun getElementsByAttributeStarting(keyPrefix: String): Elements = 
        Elements(impl.getElementsByAttributeStarting(keyPrefix))

    /**
     * Get elements with the specified attribute value.
     */
    fun getElementsByAttributeValue(key: String, value: String): Elements = 
        Elements(impl.getElementsByAttributeValue(key, value))

    /**
     * Get elements where attribute value contains the match string.
     */
    fun getElementsByAttributeValueContaining(key: String, match: String): Elements = 
        Elements(impl.getElementsByAttributeValueContaining(key, match))

    /**
     * Get elements where attribute value ends with the suffix.
     */
    fun getElementsByAttributeValueEnding(key: String, valueSuffix: String): Elements = 
        Elements(impl.getElementsByAttributeValueEnding(key, valueSuffix))

    /**
     * Get elements where attribute value starts with the prefix.
     */
    fun getElementsByAttributeValueStarting(key: String, valuePrefix: String): Elements = 
        Elements(impl.getElementsByAttributeValueStarting(key, valuePrefix))

    /**
     * Get elements where attribute value matches the regex.
     */
    fun getElementsByAttributeValueMatching(key: String, pattern: Regex): Elements = 
        Elements(impl.getElementsByAttributeValueMatching(key, pattern))

    /**
     * Get elements that contain the specified text.
     */
    fun getElementsContainingText(searchText: String): Elements = 
        Elements(impl.getElementsContainingText(searchText))

    /**
     * Get elements that contain the specified text directly (own text, not children).
     */
    fun getElementsContainingOwnText(searchText: String): Elements = 
        Elements(impl.getElementsContainingOwnText(searchText))

    /**
     * Get elements whose text matches the regex.
     */
    fun getElementsMatchingText(pattern: Regex): Elements = 
        Elements(impl.getElementsMatchingText(pattern))

    /**
     * Get elements whose own text matches the regex.
     */
    fun getElementsMatchingOwnText(pattern: Regex): Elements = 
        Elements(impl.getElementsMatchingOwnText(pattern))

    /**
     * Get all elements in this element's subtree.
     */
    fun getAllElements(): Elements = Elements(impl.getAllElements())

    /**
     * Get the combined data of this element (for script/style).
     */
    fun data(): String = impl.data()

    /**
     * Check if this element matches a CSS selector.
     */
    fun `is`(cssQuery: String): Boolean = impl.`is`(cssQuery)

    /**
     * Find the closest ancestor matching a CSS selector.
     */
    fun closest(cssQuery: String): Element? = impl.closest(cssQuery)?.let { Element(it) }

    /**
     * Get the element index among its siblings.
     */
    fun elementSiblingIndex(): Int = impl.elementSiblingIndex()

    override fun toString(): String = impl.toString()

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Element) return false
        return impl == other.impl
    }

    override fun hashCode(): Int = impl.hashCode()
}

/**
 * Jsoup Elements compatibility wrapper over Ksoup.
 * A list of Elements with additional selector methods.
 */
class Elements internal constructor(private val impl: KsoupElements) : AbstractList<Element>() {
    
    override val size: Int get() = impl.size
    
    override fun get(index: Int): Element = Element(impl[index])
    
    /**
     * Get the first element or null.
     */
    fun first(): Element? = impl.firstOrNull()?.let { Element(it) }

    /**
     * Get the last element or null.
     */
    fun last(): Element? = impl.lastOrNull()?.let { Element(it) }

    /**
     * Get the combined text of all elements.
     */
    fun text(): String = impl.text()

    /**
     * Check if text contains the search string.
     */
    fun hasText(): Boolean = impl.hasText()

    /**
     * Get the combined inner HTML of all elements.
     */
    fun html(): String = impl.html()

    /**
     * Get the combined outer HTML of all elements.
     */
    fun outerHtml(): String = impl.outerHtml()

    /**
     * Get an attribute from the first element.
     */
    fun attr(attributeKey: String): String = impl.attr(attributeKey)

    /**
     * Check if any element has the specified attribute.
     */
    fun hasAttr(attributeKey: String): Boolean = impl.hasAttr(attributeKey)

    /**
     * Get attribute values as a list.
     */
    fun eachAttr(attributeKey: String): List<String> = impl.eachAttr(attributeKey)

    /**
     * Get text values from each element.
     */
    fun eachText(): List<String> = impl.eachText()

    /**
     * Find elements matching a CSS selector within these elements.
     */
    fun select(cssQuery: String): Elements = Elements(impl.select(cssQuery))

    /**
     * Filter elements that do not match the selector.
     */
    fun not(cssQuery: String): Elements = Elements(impl.not(cssQuery))

    /**
     * Check if any element matches the selector.
     */
    fun `is`(cssQuery: String): Boolean = impl.`is`(cssQuery)

    /**
     * Get the next sibling elements.
     */
    fun next(): Elements = Elements(impl.next())

    /**
     * Get next sibling elements matching the selector.
     */
    fun next(cssQuery: String): Elements = Elements(impl.next(cssQuery))

    /**
     * Get all following sibling elements.
     */
    fun nextAll(): Elements = Elements(impl.nextAll())

    /**
     * Get all following sibling elements matching the selector.
     */
    fun nextAll(cssQuery: String): Elements = Elements(impl.nextAll(cssQuery))

    /**
     * Get the previous sibling elements.
     */
    fun prev(): Elements = Elements(impl.prev())

    /**
     * Get previous sibling elements matching the selector.
     */
    fun prev(cssQuery: String): Elements = Elements(impl.prev(cssQuery))

    /**
     * Get all preceding sibling elements.
     */
    fun prevAll(): Elements = Elements(impl.prevAll())

    /**
     * Get all preceding sibling elements matching the selector.
     */
    fun prevAll(cssQuery: String): Elements = Elements(impl.prevAll(cssQuery))

    /**
     * Get parent elements.
     */
    fun parents(): Elements = Elements(impl.parents())

    /**
     * Get the first matching element.
     */
    fun first(cssQuery: String): Element? = impl.select(cssQuery).firstOrNull()?.let { Element(it) }

    /**
     * Set an attribute on all elements.
     */
    fun attr(attributeKey: String, attributeValue: String): Elements {
        impl.attr(attributeKey, attributeValue)
        return this
    }

    /**
     * Remove an attribute from all elements.
     */
    fun removeAttr(attributeKey: String): Elements {
        impl.removeAttr(attributeKey)
        return this
    }

    /**
     * Add a class to all elements.
     */
    fun addClass(className: String): Elements {
        impl.addClass(className)
        return this
    }

    /**
     * Remove a class from all elements.
     */
    fun removeClass(className: String): Elements {
        impl.removeClass(className)
        return this
    }

    /**
     * Toggle a class on all elements.
     */
    fun toggleClass(className: String): Elements {
        impl.toggleClass(className)
        return this
    }

    /**
     * Check if any element has the specified class.
     */
    fun hasClass(className: String): Boolean = impl.hasClass(className)

    /**
     * Set the value of form elements.
     */
    fun value(value: String): Elements {
        impl.value(value)
        return this
    }

    /**
     * Set the inner HTML of all elements.
     */
    fun html(html: String): Elements {
        impl.html(html)
        return this
    }

    /**
     * Prepend HTML to all elements.
     */
    fun prepend(html: String): Elements {
        impl.prepend(html)
        return this
    }

    /**
     * Append HTML to all elements.
     */
    fun append(html: String): Elements {
        impl.append(html)
        return this
    }

    /**
     * Insert HTML before all elements.
     */
    fun before(html: String): Elements {
        impl.before(html)
        return this
    }

    /**
     * Insert HTML after all elements.
     */
    fun after(html: String): Elements {
        impl.after(html)
        return this
    }

    /**
     * Wrap each element with the specified HTML.
     */
    fun wrap(html: String): Elements {
        impl.wrap(html)
        return this
    }

    /**
     * Unwrap elements (remove parent, keep children).
     */
    fun unwrap(): Elements {
        impl.unwrap()
        return this
    }

    /**
     * Remove all elements from the DOM.
     */
    fun remove(): Elements {
        impl.remove()
        return this
    }

    /**
     * Remove all children from all elements.
     */
    fun empty(): Elements {
        impl.empty()
        return this
    }

    override fun toString(): String = impl.toString()
}
