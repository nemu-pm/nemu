package eu.kanade.tachiyomi.lib.i18n

import java.util.Locale

/**
 * Internationalization support for extensions.
 * Loads messages from resources based on language.
 */
class Intl(
    val language: String,
    val baseLanguage: String,
    val availableLanguages: Set<String>,
    classLoader: java.lang.ClassLoader? = null,  // Ignored in WASM
    val createMessageFileName: (String) -> String = { lang -> createDefaultMessageFileName(lang) }
) {
    val chosenLanguage: String = if (language in availableLanguages) language else baseLanguage
    private val messages = mutableMapOf<String, String>()
    val collator: Comparator<String> = Comparator { a, b -> a.compareTo(b, ignoreCase = true) }
    
    init {
        // Load default messages for base language
        loadMessages(baseLanguage)
        // Override with target language messages
        if (language != baseLanguage) {
            loadMessages(language)
        }
    }
    
    private fun loadMessages(lang: String) {
        // In WASM, we preload messages or load them from embedded resources
        // For now, we use hardcoded defaults for MangaDex
        loadDefaultMessages()
    }
    
    private fun loadDefaultMessages() {
        // MangaDex common messages
        messages["cover_quality"] = "Cover Quality"
        messages["cover_quality_original"] = "Original"
        messages["cover_quality_medium"] = "Medium"
        messages["cover_quality_low"] = "Low"
        messages["data_saver"] = "Data Saver"
        messages["data_saver_summary"] = "Use lower quality images"
        messages["standard_https_port"] = "Standard HTTPS Port"
        messages["standard_https_port_summary"] = "Force port 443 for HTTPS connections"
        messages["standard_content_rating"] = "Content Rating"
        messages["standard_content_rating_summary"] = "Select content ratings to show"
        messages["content_rating_safe"] = "Safe"
        messages["content_rating_suggestive"] = "Suggestive"
        messages["content_rating_erotica"] = "Erotica"
        messages["content_rating_pornographic"] = "Pornographic"
        messages["filter_original_languages"] = "Original Languages"
        messages["filter_original_languages_summary"] = "Filter by original publication language"
        messages["block_group_by_uuid"] = "Block Groups"
        messages["block_group_by_uuid_summary"] = "Enter group UUIDs separated by commas"
        messages["block_uploader_by_uuid"] = "Block Uploaders"
        messages["block_uploader_by_uuid_summary"] = "Enter uploader UUIDs separated by commas"
        messages["alternative_titles_in_description"] = "Alternative Titles in Description"
        messages["alternative_titles_in_description_summary"] = "Show alternative titles in manga description"
        messages["prefer_title_in_extension_language"] = "Prefer Extension Language Title"
        messages["prefer_title_in_extension_language_summary"] = "Use title in extension's language when available"
        messages["final_chapter_in_description"] = "Final Chapter in Description"
        messages["final_chapter_in_description_summary"] = "Show final chapter number in description"
        messages["include_unavailable"] = "Include Unavailable Chapters"
        messages["include_unavailable_summary"] = "Show chapters that are no longer available"
        messages["invalid_manga_id"] = "Invalid manga ID"
        messages["invalid_group_id"] = "Invalid group ID"
        messages["invalid_author_id"] = "Invalid author ID"
        messages["invalid_uuids"] = "Invalid UUIDs"
        messages["no_series_in_list"] = "No series found in list"
        messages["migrate_warning"] = "Please migrate this entry to the new format"
        messages["unable_to_process_chapter_request"] = "Unable to process chapter request: %s"
        messages["chapter_unavailable_prefix"] = "[Unavailable]"
        messages["no_group"] = "No Group"
        messages["uploaded_by"] = "Uploaded by %s"
        messages["try_using_first_volume_cover"] = "Try Using First Volume Cover"
        messages["try_using_first_volume_cover_summary"] = "Attempt to use the first volume's cover"
        messages["publication_demographic_shounen"] = "Shounen"
        messages["publication_demographic_shoujo"] = "Shoujo"
        messages["publication_demographic_seinen"] = "Seinen"
        messages["publication_demographic_josei"] = "Josei"
        messages["publication_demographic_none"] = "None"
        messages["content_rating_genre"] = "Content: %s"
        messages["alternative_titles"] = "Alternative Titles:"
        messages["final_chapter"] = "Final Chapter:"
        
        // Filter messages
        messages["has_available_chapters"] = "Has Available Chapters"
        messages["original_language"] = "Original Language"
        messages["original_language_filter_japanese"] = "Japanese (%s)"
        messages["original_language_filter_chinese"] = "Chinese (%s)"
        messages["original_language_filter_korean"] = "Korean (%s)"
        messages["content_rating"] = "Content Rating"
        messages["publication_demographic"] = "Publication Demographic"
        messages["status"] = "Status"
        messages["status_ongoing"] = "Ongoing"
        messages["status_completed"] = "Completed"
        messages["status_hiatus"] = "Hiatus"
        messages["status_cancelled"] = "Cancelled"
        messages["sort"] = "Sort"
        messages["sort_alphabetic"] = "Alphabetic"
        messages["sort_chapter_uploaded_at"] = "Chapter Uploaded At"
        messages["sort_number_of_follows"] = "Number of Follows"
        messages["sort_content_created_at"] = "Content Created At"
        messages["sort_content_info_updated_at"] = "Content Info Updated At"
        messages["sort_relevance"] = "Relevance"
        messages["sort_year"] = "Year"
        messages["sort_rating"] = "Rating"
        messages["tags_mode"] = "Tags Mode"
        messages["included_tags_mode"] = "Included Tags Mode"
        messages["excluded_tags_mode"] = "Excluded Tags Mode"
        messages["mode_and"] = "AND"
        messages["mode_or"] = "OR"
        messages["content"] = "Content"
        messages["format"] = "Format"
        messages["genre"] = "Genre"
        messages["theme"] = "Theme"
        
        // Content tags
        messages["content_gore"] = "Gore"
        messages["content_sexual_violence"] = "Sexual Violence"
        
        // Format tags
        messages["format_yonkoma"] = "4-Koma"
        messages["format_adaptation"] = "Adaptation"
        messages["format_anthology"] = "Anthology"
        messages["format_award_winning"] = "Award Winning"
        messages["format_doujinshi"] = "Doujinshi"
        messages["format_fan_colored"] = "Fan Colored"
        messages["format_full_color"] = "Full Color"
        messages["format_long_strip"] = "Long Strip"
        messages["format_official_colored"] = "Official Colored"
        messages["format_oneshot"] = "Oneshot"
        messages["format_user_created"] = "User Created"
        messages["format_web_comic"] = "Web Comic"
        
        // Genre tags
        messages["genre_action"] = "Action"
        messages["genre_adventure"] = "Adventure"
        messages["genre_boys_love"] = "Boys' Love"
        messages["genre_comedy"] = "Comedy"
        messages["genre_crime"] = "Crime"
        messages["genre_drama"] = "Drama"
        messages["genre_fantasy"] = "Fantasy"
        messages["genre_girls_love"] = "Girls' Love"
        messages["genre_historical"] = "Historical"
        messages["genre_horror"] = "Horror"
        messages["genre_isekai"] = "Isekai"
        messages["genre_magical_girls"] = "Magical Girls"
        messages["genre_mecha"] = "Mecha"
        messages["genre_medical"] = "Medical"
        messages["genre_mystery"] = "Mystery"
        messages["genre_philosophical"] = "Philosophical"
        messages["genre_romance"] = "Romance"
        messages["genre_sci_fi"] = "Sci-Fi"
        messages["genre_slice_of_life"] = "Slice of Life"
        messages["genre_sports"] = "Sports"
        messages["genre_superhero"] = "Superhero"
        messages["genre_thriller"] = "Thriller"
        messages["genre_tragedy"] = "Tragedy"
        messages["genre_wuxia"] = "Wuxia"
        
        // Theme tags
        messages["theme_aliens"] = "Aliens"
        messages["theme_animals"] = "Animals"
        messages["theme_cooking"] = "Cooking"
        messages["theme_crossdressing"] = "Crossdressing"
        messages["theme_delinquents"] = "Delinquents"
        messages["theme_demons"] = "Demons"
        messages["theme_gender_swap"] = "Genderswap"
        messages["theme_ghosts"] = "Ghosts"
        messages["theme_gyaru"] = "Gyaru"
        messages["theme_harem"] = "Harem"
        messages["theme_incest"] = "Incest"
        messages["theme_loli"] = "Loli"
        messages["theme_mafia"] = "Mafia"
        messages["theme_magic"] = "Magic"
        messages["theme_martial_arts"] = "Martial Arts"
        messages["theme_military"] = "Military"
        messages["theme_monster_girls"] = "Monster Girls"
        messages["theme_monsters"] = "Monsters"
        messages["theme_music"] = "Music"
        messages["theme_ninja"] = "Ninja"
        messages["theme_office_workers"] = "Office Workers"
        messages["theme_police"] = "Police"
        messages["theme_post_apocalyptic"] = "Post-Apocalyptic"
        messages["theme_psychological"] = "Psychological"
        messages["theme_reincarnation"] = "Reincarnation"
        messages["theme_reverse_harem"] = "Reverse Harem"
        messages["theme_samurai"] = "Samurai"
        messages["theme_school_life"] = "School Life"
        messages["theme_shota"] = "Shota"
        messages["theme_supernatural"] = "Supernatural"
        messages["theme_survival"] = "Survival"
        messages["theme_time_travel"] = "Time Travel"
        messages["theme_traditional_games"] = "Traditional Games"
        messages["theme_vampires"] = "Vampires"
        messages["theme_video_games"] = "Video Games"
        messages["theme_villainess"] = "Villainess"
        messages["theme_virtual_reality"] = "Virtual Reality"
        messages["theme_zombies"] = "Zombies"
    }
    
    operator fun get(key: String): String {
        return messages[key] ?: key
    }
    
    fun format(key: String, vararg args: Any?): String {
        val template = this[key]
        var result = template
        args.forEachIndexed { index, arg ->
            result = result.replace("%s", arg?.toString() ?: "", false)
            result = result.replace("%${index + 1}\$s", arg?.toString() ?: "")
        }
        return result
    }
    
    fun languageDisplayName(languageTag: String): String {
        return Locale.forLanguageTag(languageTag).getDisplayName(Locale.forLanguageTag(language))
    }
    
    companion object {
        fun createDefaultMessageFileName(lang: String): String = "messages_$lang.properties"
    }
}

// Stub Collator class
object Collator {
    fun getInstance(locale: Locale): Comparator<String> {
        return Comparator { a, b -> a.compareTo(b, ignoreCase = true) }
    }
}
