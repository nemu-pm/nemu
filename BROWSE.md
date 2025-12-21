# Browse Feature - Implementation Status


Comparison with Aidoku iOS Swift implementation.

## Overview

| Component | Swift | nemu | Status |
|-----------|-------|------|--------|
| Source List (BrowseViewController) | Full featured | Basic | Partial |
| Source Browse (NewSourceViewController) | Full featured | Good | Mostly Done |
| Filter System | Complete | Complete (with inline header) | Done |

---

## Source List Page (`/browse`)

### Done

| Feature | Notes |
|---------|-------|
| Grid of installed sources | Shows icon, name, language, version |
| Add Source button | Opens existing AddSourceDialog |
| Empty state | Prompts user to add sources |
| Click to browse source | Navigates to source browse page |

### Not Ideal / Needs Improvement

| Feature | Swift Behavior | Current Behavior |
|---------|----------------|------------------|
| Layout | Table view with sections | Simple grid, no sections |
| Source info display | More detailed with disclosure indicator | Basic card layout |

### Not Started

| Feature | Swift Reference |
|---------|-----------------|
| **Sections** (Pinned, Updates, Installed) | `BrowseViewController.Section` enum, `BrowseViewModel` |
| **Pin/Unpin sources** | Context menu action, `SourceManager.shared.pin/unpin` |
| **Reorder pinned sources** | Drag-to-reorder in pinned section |
| **Search/filter sources** | `UISearchController`, filters source list by name |
| **Source updates** | Checks external source lists for newer versions |
| **Update badge** | Tab bar badge showing update count |
| **Pull-to-refresh** | Refreshes source lists from registries |
| **Multi-select editing** | Two-finger drag to select, bulk uninstall |
| **Context menu** | Long-press for pin/unpin/uninstall actions |
| **Migrate sources** | Transfer manga between sources |

---

## Source Browse Page (`/browse/$registryId/$sourceId`)

### Done

| Feature | Notes |
|---------|-------|
| Listing selector | Horizontal button tabs (Latest, Popular, etc.) |
| Search within source | Text input with search button |
| **Filter header bar** | Inline filter pills under search (like Swift's FilterHeaderView) |
| **Filter drawer** | ResponsiveDialog with all filter types |
| **Filter dropdowns** | Select/Sort/MultiSelect use dropdown menus like Swift |
| Manga grid | Virtualized responsive grid (react-virtuoso) |
| Infinite scroll | Automatic via VirtuosoGrid endReached |
| Loading states | Spinner during initial load and pagination |
| Error states | Error message display |
| **Home layout support** | Full: BigScroller, Scroller, MangaList, MangaChapterList, ImageScroller, Filters, Links |
| **Listing kind** | Supported in types (`ListingKind.Default` / `ListingKind.List`) |

### Not Ideal / Needs Improvement

| Feature | Swift Behavior | Current Behavior |
|---------|----------------|------------------|
| Listings UI | Horizontal scrolling header that replaces search bar | Simple button group |
| Search UX | Overlay that slides in with animation | Always visible input |
| Filter persistence | Saves enabled filters per source | Resets on page reload |
| Loading feedback | Skeleton placeholders | Simple spinner |

### Not Started

| Feature | Swift Reference |
|---------|-----------------|
| **Source settings access** | Gear button opens source settings sheet |
| **Open website** | Safari button opens source URL |
| **Pull-to-refresh** | `.refreshable` modifier reloads listings |
| **Bookmark indicators** | Shows which manga are in library |
| **Animated transitions** | Smooth show/hide of search overlay |

---

## Filter System

### Done

| Filter Type | Implementation |
|-------------|----------------|
| Text | Text input field |
| Select | Dropdown menu with checkmark indicator (string IDs) |
| Sort | Dropdown menu with ascending/descending toggle |
| Check | Click-to-toggle pill (supports tri-state with canExclude) |
| Group | Nested filter container with border |
| Genre/MultiSelect | Dropdown menu with include/exclude states, stays open for multi-toggle |

| Feature | Implementation |
|---------|----------------|
| **Inline Filter Header** | Horizontal scrolling pills under search bar (like Swift's FilterHeaderView) |
| **Active filters first** | Enabled filters sorted to front of header bar |
| **Filter badge count** | Shows total active selections in filter button |
| **ResponsiveDialog** | Full filter drawer uses responsive dialog (drawer on mobile, dialog on desktop) |
| **String ID values** | Filter values use string IDs (from `filter.ids` or `filter.options`), not indices |
| **Dropdown stays open** | MultiSelect dropdown doesn't close on item toggle (`closeOnClick={false}`) |

### Not Ideal

| Issue | Notes |
|-------|-------|
| Group filters | Simplified implementation, doesn't fully track nested state |
| Filter persistence | Not saved between sessions |
| Check filters with default | Hidden from header bar (matches Swift, but could be confusing) |

---

## Files Reference

### New Files Created
- `src/pages/browse.tsx` - Source list page
- `src/pages/source-browse.tsx` - Individual source browsing
- `src/components/filter-drawer.tsx` - Filter drawer (ResponsiveDialog) + FilterHeaderBar (inline pills)
- `src/components/manga-card-gallery.tsx` - Virtualized manga grid (uses react-virtuoso)
- `src/components/home-components.tsx` - Home layout components (BigScroller, Scroller, MangaList, etc.)

### Modified Files
- `src/router.tsx` - Added Browse routes and nav item
- `src/lib/sources/aidoku/adapter.ts` - Added `BrowsableSource` interface, `convertFilterInfo` with ids support, `getHome()`
- `src/lib/sources/aidoku/async-source.ts` - Exposed listing and home methods
- `src/lib/sources/aidoku/source.worker.ts` - Added worker methods for listings and home
- `src/lib/sources/aidoku/types.ts` - Added `ids` to SelectFilter/GenreFilter, `MultiSelectValue` type, full Home types
- `src/lib/sources/aidoku/runtime.ts` - Added complete HomeLayout postcard decoder
- `src/lib/sources/aidoku/postcard.ts` - Updated filter encoding to use string IDs
- `src/components/ui/dropdown-menu.tsx` - Added `closeOnClick` prop for menu items
- `src/locales/en.json`, `src/locales/zh.json` - Added translations

### Notes
- **Filters from manifest** - Most sources define filters in `source.json` manifest, not via WASM export
- **Filter values use string IDs** - Matches Swift's `filter.ids?[offset] ?? filter.options[offset]` pattern

---

## Swift Reference Files

| File | Purpose |
|------|---------|
| `vendor/Aidoku/Aidoku/iOS/UI/Browse/BrowseViewController.swift` | Source list UI |
| `vendor/Aidoku/Aidoku/iOS/UI/Browse/BrowseViewModel.swift` | Source list data |
| `vendor/Aidoku/Aidoku/iOS/New/Views/Source/NewSourceViewController.swift` | Source browse UI |
| `vendor/Aidoku/Aidoku/iOS/New/Views/Source/SourceHomeContentView.swift` | Home/listings view |
| `vendor/Aidoku/Aidoku/iOS/New/Views/Source/SourceSearchViewController.swift` | Search within source |

---

## Priority Recommendations

### High Priority
1. ~~**Home layout support**~~ ✅ Done - Full implementation with all component types
2. **Filter persistence** - Save filter state per source
3. **Pull-to-refresh** - Standard UX expectation

### Medium Priority
4. **Pinned sources** - Quick access to favorite sources
5. **Source settings access** - Configure source-specific settings
6. ~~**Listing kind support**~~ ✅ Done - Types in place

### Low Priority
7. **Source updates/badges** - Update notifications
8. **Multi-select editing** - Bulk operations
9. **Migrate sources** - Advanced feature

