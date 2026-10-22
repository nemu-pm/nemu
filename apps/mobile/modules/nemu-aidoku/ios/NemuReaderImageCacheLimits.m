// Raises React Native's decoded-image memory cache limits for reader pages.
//
// RCTImageCache keeps a decoded bitmap only when it is at most 2 MiB, with a
// 20 MiB total. A manga page (800x1280 RGBA is ~4 MiB) never qualifies, so
// every page scrolled back into view is read from disk and decoded again.
// The limits are plain statics read when the cache is created (on the first
// image load), so they are set before main, from a constructor. The cache
// still empties itself on memory warnings and when the app resigns active.
//
// Guarded: if the header is not visible to this pod the file compiles to
// nothing and the stock limits stay in place.

#if __has_include(<React/RCTImageCache.h>)
#import <React/RCTImageCache.h>

static const NSUInteger NemuReaderMaxCacheableDecodedImageBytes = 12 * 1024 * 1024;
static const NSUInteger NemuReaderDecodedImageCacheTotalBytes = 160 * 1024 * 1024;

__attribute__((constructor)) static void NemuRaiseReaderImageCacheLimits(void)
{
  RCTSetImageCacheLimits(
      NemuReaderMaxCacheableDecodedImageBytes,
      NemuReaderDecodedImageCacheTotalBytes);
}
#endif
