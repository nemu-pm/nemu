package eu.kanade.tachiyomi.source

import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import rx.Observable

interface CatalogueSource : Source {
    override val lang: String

    val supportsLatest: Boolean

    fun getPopularManga(page: Int): MangasPage

    fun getSearchManga(page: Int, query: String, filters: FilterList): MangasPage

    fun getLatestUpdates(page: Int): MangasPage

    fun getFilterList(): FilterList

    @Deprecated("Use the non-RxJava API instead", ReplaceWith("getPopularManga"))
    fun fetchPopularManga(page: Int): Observable<MangasPage> =
        throw IllegalStateException("Not used")

    @Deprecated("Use the non-RxJava API instead", ReplaceWith("getSearchManga"))
    fun fetchSearchManga(page: Int, query: String, filters: FilterList): Observable<MangasPage> =
        throw IllegalStateException("Not used")

    @Deprecated("Use the non-RxJava API instead", ReplaceWith("getLatestUpdates"))
    fun fetchLatestUpdates(page: Int): Observable<MangasPage> =
        throw IllegalStateException("Not used")
}

