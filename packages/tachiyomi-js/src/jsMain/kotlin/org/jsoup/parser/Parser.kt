package org.jsoup.parser

import com.fleeksoft.ksoup.parser.Parser as KsoupParser

/**
 * Jsoup Parser compatibility wrapper over Ksoup.
 */
class Parser internal constructor(internal val impl: KsoupParser) {
    companion object {
        /**
         * Create an HTML parser.
         */
        fun htmlParser(): Parser = Parser(KsoupParser.htmlParser())

        /**
         * Create an XML parser for parsing XML/XHTML documents.
         */
        fun xmlParser(): Parser = Parser(KsoupParser.xmlParser())

        /**
         * Unescape HTML entities in a string.
         * 
         * @param string the string to unescape
         * @param inAttribute whether the string is within an HTML attribute (affects entity handling)
         */
        fun unescapeEntities(string: String, inAttribute: Boolean): String {
            return KsoupParser.unescapeEntities(string, inAttribute)
        }
    }
}
