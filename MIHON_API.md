# Mihon/Tachiyomi Source API Reference

Official API contract from [Mihon source-api](https://github.com/mihonapp/mihon/tree/main/source-api).

This documents what extensions implement and what nemu's Tachiyomi runtime must support.

---

## Interface Hierarchy

```
Source                        # Base interface
  │
  ├─► CatalogueSource         # Adds browsing/search
  │     │
  │     └─► HttpSource        # HTTP-based sources (most extensions)
  │
  └─► ConfigurableSource      # Adds settings/preferences
```

Most extensions implement `HttpSource` + `ConfigurableSource`.

---

## Source (Base Interface)

```kotlin
interface Source {
    val id: Long              // Unique identifier
    val name: String          // Display name
    val lang: String          // ISO 639-1 code (e.g., "en", "ja")

    suspend fun getMangaDetails(manga: SManga): SManga
    suspend fun getChapterList(manga: SManga): List<SChapter>
    suspend fun getPageList(chapter: SChapter): List<Page>
}
```

---

## CatalogueSource

```kotlin
interface CatalogueSource : Source {
    val supportsLatest: Boolean    // Whether getLatestUpdates() is implemented

    suspend fun getPopularManga(page: Int): MangasPage
    suspend fun getSearchManga(page: Int, query: String, filters: FilterList): MangasPage
    suspend fun getLatestUpdates(page: Int): MangasPage
    
    fun getFilterList(): FilterList
}
```

---

## HttpSource

```kotlin
abstract class HttpSource : CatalogueSource {
    abstract val baseUrl: String      // e.g., "https://mangadex.org"
    open val versionId: Int = 1       // Bump to regenerate source ID
    
    val client: OkHttpClient          // HTTP client
    val headers: Headers              // Default request headers

    // ID is auto-generated from name/lang/versionId
    override val id: Long by lazy { generateId(name, lang, versionId) }

    // Image handling
    open suspend fun getImageUrl(page: Page): String    // Resolve page → image URL
    open suspend fun getImage(page: Page): Response     // Fetch actual image bytes
    protected open fun imageRequest(page: Page): Request // Build image request

    // URL helpers
    open fun getMangaUrl(manga: SManga): String
    open fun getChapterUrl(chapter: SChapter): String
}
```

### ID Generation Algorithm

```kotlin
fun generateId(name: String, lang: String, versionId: Int): Long {
    val key = "${name.lowercase()}/$lang/$versionId"
    val bytes = MessageDigest.getInstance("MD5").digest(key.toByteArray())
    return (0..7).map { bytes[it].toLong() and 0xff shl 8 * (7 - it) }
        .reduce(Long::or) and Long.MAX_VALUE  // Clear sign bit
}
```

---

## ConfigurableSource

```kotlin
interface ConfigurableSource : Source {
    fun getSourcePreferences(): SharedPreferences
    fun setupPreferenceScreen(screen: PreferenceScreen)
}

// Preference key pattern
fun ConfigurableSource.preferenceKey(): String = "source_$id"
```

---

## Data Models

### SManga

```kotlin
interface SManga {
    var url: String              // Relative URL (without domain)
    var title: String
    var artist: String?
    var author: String?
    var description: String?
    var genre: String?           // Comma-separated tags (e.g., "Action, Comedy")
    var status: Int              // See status constants below
    var thumbnail_url: String?   // Cover image URL
    var update_strategy: UpdateStrategy
    var initialized: Boolean     // True after getMangaDetails() called

    companion object {
        const val UNKNOWN = 0
        const val ONGOING = 1
        const val COMPLETED = 2
        const val LICENSED = 3
        const val PUBLISHING_FINISHED = 4
        const val CANCELLED = 5
        const val ON_HIATUS = 6
    }
}
```

### SChapter

```kotlin
interface SChapter {
    var url: String              // Relative URL (without domain)
    var name: String             // Chapter title
    var date_upload: Long        // Unix timestamp in milliseconds
    var chapter_number: Float    // e.g., 1.0, 1.5, 2.0
    var scanlator: String?       // Scanlation group name
}
```

### Page

```kotlin
class Page(
    val index: Int,              // 0-based page index
    val url: String = "",        // Metadata/intermediate URL
    var imageUrl: String? = null // Final image URL (may need resolution)
)
```

**Note**: Some sources (like MangaDex) use `url` for metadata (e.g., `"host,tokenUrl,timestamp"`) and `imageUrl` for the relative path. The full URL is constructed by `imageRequest()`.

### MangasPage

```kotlin
data class MangasPage(
    val mangas: List<SManga>,
    val hasNextPage: Boolean
)
```

---

## Filter System

### Filter Types

```kotlin
sealed class Filter<T>(val name: String, var state: T) {
    
    // Display-only (no state)
    open class Header(name: String) : Filter<Any>(name, 0)
    open class Separator(name: String = "") : Filter<Any>(name, 0)
    
    // Input types
    abstract class Text(name: String, state: String = "") : Filter<String>(name, state)
    abstract class CheckBox(name: String, state: Boolean = false) : Filter<Boolean>(name, state)
    
    // Selection types
    abstract class Select<V>(name: String, val values: Array<V>, state: Int = 0) : Filter<Int>(name, state)
    
    // Tri-state (include/exclude/ignore)
    abstract class TriState(name: String, state: Int = STATE_IGNORE) : Filter<Int>(name, state) {
        companion object {
            const val STATE_IGNORE = 0
            const val STATE_INCLUDE = 1
            const val STATE_EXCLUDE = 2
        }
    }
    
    // Grouping
    abstract class Group<V>(name: String, state: List<V>) : Filter<List<V>>(name, state)
    
    // Sorting
    abstract class Sort(name: String, val values: Array<String>, state: Selection? = null) : Filter<Sort.Selection?>(name, state) {
        data class Selection(val index: Int, val ascending: Boolean)
    }
}
```

### FilterList

```kotlin
class FilterList(vararg filters: Filter<*>) : List<Filter<*>> by filters.toList()
```

---

## Preference Types

Used in `setupPreferenceScreen()`:

```kotlin
// From androidx.preference
ListPreference          // Dropdown selection
SwitchPreferenceCompat  // Boolean toggle
EditTextPreference      // Text input
MultiSelectListPreference // Multi-select checkboxes
CheckBoxPreference      // Single checkbox
```

Each preference has:
- `key: String` - Unique identifier for storage
- `title: String` - Display label
- `summary: String?` - Description text
- `defaultValue` - Initial value

---

## Extension Entry Points

### Single Source

```kotlin
// Declared in AndroidManifest: tachiyomi.extension.class=.MySource
class MySource : HttpSource() {
    override val name = "My Source"
    override val lang = "en"
    override val baseUrl = "https://example.com"
    // ... implement abstract methods
}
```

### Multi-Source (Factory)

```kotlin
// Declared in AndroidManifest: tachiyomi.extension.class=.MyFactory
class MyFactory : SourceFactory {
    override fun createSources(): List<Source> = listOf(
        MySource("en"),
        MySource("es"),
        MySource("fr"),
    )
}

class MySource(override val lang: String) : HttpSource() {
    override val name = "My Source"
    override val baseUrl = "https://example.com"
    // ...
}
```

---

## Extension Metadata (build.gradle)

```groovy
ext {
    extName = 'MangaDex'           // Display name
    extClass = '.MangaDexFactory'  // Entry point class
    extVersionCode = 204           // Version number
    isNsfw = true                  // Content rating
}
```

---

## What nemu Exports via @JsExport

| Mihon API | nemu Export | Return Type |
|-----------|-------------|-------------|
| `id` | `getSourceId(index)` | `String` (Long as string) |
| `name` | `getSourceName(index)` | `String` |
| `lang` | `getSourceLang(index)` | `String` |
| `baseUrl` | `getSourceBaseUrl(index)` | `String` |
| `supportsLatest` | TBD | `Boolean` |
| `getPopularManga(page)` | `getPopularManga(index, page)` | `String` (JSON) |
| `getLatestUpdates(page)` | `getLatestUpdates(index, page)` | `String` (JSON) |
| `getSearchManga(...)` | `searchManga(index, page, query)` | `String` (JSON) |
| `getMangaDetails(manga)` | `getMangaDetails(index, url)` | `String` (JSON) |
| `getChapterList(manga)` | `getChapterList(index, url)` | `String` (JSON) |
| `getPageList(chapter)` | `getPageList(index, url)` | `String` (JSON) |
| `imageRequest(page)` | `getImageUrl(index, url, imageUrl)` | `String` (full URL) |
| `getFilterList()` | TBD | `String` (JSON schema) |
| `setupPreferenceScreen()` | TBD | `String` (JSON schema) |

All JSON returns are wrapped in result type:
```typescript
interface JsResult<T> {
  ok: boolean;
  data?: T;
  error?: { type: string; message: string; stack: string; logs: string[] };
}
```

---

## Gaps / Future Work

1. **Filter serialization** - Need to pass filter state from JS → Kotlin in `searchManga()`
2. **Preference schema** - Extract from `setupPreferenceScreen()` calls
3. **`supportsLatest`** - Expose this boolean per source
4. **UpdateStrategy** - Currently ignored
