package eu.kanade.tachiyomi.source.online

import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import rx.Observable
import java.security.MessageDigest

/**
 * Base class for HTTP-based manga sources.
 * 
 * HTTP calls are synchronous using XMLHttpRequest.
 * MUST be run in a Web Worker context!
 */
@Suppress("unused")
abstract class HttpSource : CatalogueSource {

    protected val network: NetworkHelper = NetworkHelper

    abstract val baseUrl: String

    open val versionId = 1

    override val id: Long by lazy { generateId(name, lang, versionId) }

    val headers: Headers by lazy { headersBuilder().build() }

    open val client: OkHttpClient
        get() = network.client

    protected fun generateId(name: String, lang: String, versionId: Int): Long {
        val key = "${name.lowercase()}/$lang/$versionId"
        val bytes = MessageDigest.getInstance("MD5").digest(key.encodeToByteArray())
        return (0..7).map { bytes[it].toLong() and 0xff shl 8 * (7 - it) }.reduce(Long::or) and Long.MAX_VALUE
    }

    protected open fun headersBuilder() = Headers.Builder().apply {
        add("User-Agent", network.defaultUserAgentProvider())
    }

    override fun toString() = "$name (${lang.uppercase()})"

    // Popular manga
    
    /**
     * Returns an observable with the page of popular manga.
     * Extensions can override this to provide custom behavior (e.g., single-manga sources).
     */
    @Deprecated("Use the non-RxJava API instead", replaceWith = ReplaceWith("getPopularManga"))
    override fun fetchPopularManga(page: Int): Observable<MangasPage> {
        return Observable.defer {
            val response = client.newCall(popularMangaRequest(page)).execute()
            Observable.just(popularMangaParse(response))
        }
    }

    /**
     * Get popular manga by calling fetchPopularManga.
     * This allows extensions that override fetchPopularManga to work correctly.
     */
    @Suppress("DEPRECATION")
    override fun getPopularManga(page: Int): MangasPage {
        return fetchPopularManga(page).blockingFirst()
    }

    protected abstract fun popularMangaRequest(page: Int): Request
    protected abstract fun popularMangaParse(response: Response): MangasPage

    // Search manga

    /**
     * Returns an observable with the page of search results.
     * Extensions can override this to provide custom behavior.
     */
    @Deprecated("Use the non-RxJava API instead", replaceWith = ReplaceWith("getSearchManga"))
    override fun fetchSearchManga(page: Int, query: String, filters: FilterList): Observable<MangasPage> {
        return Observable.defer {
            val response = client.newCall(searchMangaRequest(page, query, filters)).execute()
            Observable.just(searchMangaParse(response))
        }
    }

    /**
     * Get search results by calling fetchSearchManga.
     * This allows extensions that override fetchSearchManga to work correctly.
     */
    @Suppress("DEPRECATION")
    override fun getSearchManga(page: Int, query: String, filters: FilterList): MangasPage {
        return fetchSearchManga(page, query, filters).blockingFirst()
    }

    protected abstract fun searchMangaRequest(page: Int, query: String, filters: FilterList): Request
    protected abstract fun searchMangaParse(response: Response): MangasPage

    // Latest updates

    /**
     * Returns an observable with the page of latest manga updates.
     * Extensions can override this to provide custom behavior.
     */
    @Deprecated("Use the non-RxJava API instead", replaceWith = ReplaceWith("getLatestUpdates"))
    override fun fetchLatestUpdates(page: Int): Observable<MangasPage> {
        return Observable.defer {
            val response = client.newCall(latestUpdatesRequest(page)).execute()
            Observable.just(latestUpdatesParse(response))
        }
    }

    /**
     * Get latest updates by calling fetchLatestUpdates.
     * This allows extensions that override fetchLatestUpdates to work correctly.
     */
    @Suppress("DEPRECATION")
    override fun getLatestUpdates(page: Int): MangasPage {
        return fetchLatestUpdates(page).blockingFirst()
    }

    protected abstract fun latestUpdatesRequest(page: Int): Request
    protected abstract fun latestUpdatesParse(response: Response): MangasPage

    // Manga details

    /**
     * Get manga details by calling fetchMangaDetails.
     * This allows extensions that override fetchMangaDetails to work correctly.
     */
    @Suppress("DEPRECATION")
    override fun getMangaDetails(manga: SManga): SManga {
        return fetchMangaDetails(manga).blockingFirst()
    }

    /**
     * Returns an observable with the manga details.
     * Extensions can override this to provide custom behavior.
     */
    @Deprecated("Use the non-RxJava API instead", replaceWith = ReplaceWith("getMangaDetails"))
    override fun fetchMangaDetails(manga: SManga): Observable<SManga> {
        return Observable.defer {
            val response = client.newCall(mangaDetailsRequest(manga)).execute()
            Observable.just(mangaDetailsParse(response).apply { initialized = true })
        }
    }

    open fun mangaDetailsRequest(manga: SManga): Request {
        return GET(baseUrl + manga.url, headers)
    }

    protected abstract fun mangaDetailsParse(response: Response): SManga

    // Chapter list

    /**
     * Get chapter list by calling fetchChapterList.
     * This allows extensions that override fetchChapterList to work correctly.
     */
    @Suppress("DEPRECATION")
    override fun getChapterList(manga: SManga): List<SChapter> {
        return fetchChapterList(manga).blockingFirst()
    }

    /**
     * Returns an observable with the chapter list.
     * Extensions can override this to provide custom behavior.
     */
    @Deprecated("Use the non-RxJava API instead", replaceWith = ReplaceWith("getChapterList"))
    override fun fetchChapterList(manga: SManga): Observable<List<SChapter>> {
        return Observable.defer {
            val response = client.newCall(chapterListRequest(manga)).execute()
            Observable.just(chapterListParse(response))
        }
    }

    protected open fun chapterListRequest(manga: SManga): Request {
        return GET(baseUrl + manga.url, headers)
    }

    protected abstract fun chapterListParse(response: Response): List<SChapter>

    // Page list

    /**
     * Get page list by calling fetchPageList.
     * This allows extensions that override fetchPageList to work correctly.
     */
    @Suppress("DEPRECATION")
    override fun getPageList(chapter: SChapter): List<Page> {
        return fetchPageList(chapter).blockingFirst()
    }

    /**
     * Returns an observable with the page list.
     * Extensions can override this to provide custom behavior.
     */
    @Deprecated("Use the non-RxJava API instead", replaceWith = ReplaceWith("getPageList"))
    override fun fetchPageList(chapter: SChapter): Observable<List<Page>> {
        return Observable.defer {
            val response = client.newCall(pageListRequest(chapter)).execute()
            Observable.just(pageListParse(response))
        }
    }

    protected open fun pageListRequest(chapter: SChapter): Request {
        return GET(baseUrl + chapter.url, headers)
    }

    protected abstract fun pageListParse(response: Response): List<Page>

    // Image URL

    /**
     * Get image URL by calling fetchImageUrl.
     * This allows extensions that override fetchImageUrl to work correctly.
     */
    @Suppress("DEPRECATION")
    open fun getImageUrl(page: Page): String {
        return fetchImageUrl(page).blockingFirst()
    }

    /**
     * Returns an observable with the image URL.
     * Extensions can override this to provide custom behavior.
     */
    @Deprecated("Use the non-RxJava API instead", replaceWith = ReplaceWith("getImageUrl"))
    open fun fetchImageUrl(page: Page): Observable<String> {
        return Observable.defer {
            val response = client.newCall(imageUrlRequest(page)).execute()
            Observable.just(imageUrlParse(response))
        }
    }

    protected open fun imageUrlRequest(page: Page): Request {
        return GET(page.url, headers)
    }

    protected open fun imageUrlParse(response: Response): String {
        throw UnsupportedOperationException("Not implemented")
    }

    // Image request

    open fun getImage(page: Page): Response {
        return client.newCall(imageRequest(page)).execute()
    }

    // Made public for JS interop - extensions can override this
    open fun imageRequest(page: Page): Request {
        return GET(page.imageUrl!!, headers)
    }

    // URL helpers

    fun SChapter.setUrlWithoutDomain(url: String) {
        this.url = getUrlWithoutDomain(url)
    }

    fun SManga.setUrlWithoutDomain(url: String) {
        this.url = getUrlWithoutDomain(url)
    }

    private fun getUrlWithoutDomain(orig: String): String {
        return try {
            val url = orig.replace(" ", "%20")
            val schemeIdx = url.indexOf("://")
            // If no scheme found, URL is already relative - return as-is
            if (schemeIdx < 0) return url
            val pathStart = url.indexOf("/", schemeIdx + 3)
            if (pathStart >= 0) url.substring(pathStart) else url
        } catch (e: Exception) {
            orig
        }
    }

    open fun getMangaUrl(manga: SManga): String {
        return mangaDetailsRequest(manga).url.toString()
    }

    open fun getChapterUrl(chapter: SChapter): String {
        return pageListRequest(chapter).url.toString()
    }

    open fun prepareNewChapter(chapter: SChapter, manga: SManga) {}

    override fun getFilterList() = FilterList()
}
