// Raises React Native's decoded-image memory cache limits for reader pages,
// and lets it keep decoded file:// images at all.
//
// RCTImageCache keeps a decoded bitmap only when it is at most 2 MiB, with a
// 20 MiB total. A manga page (800x1280 RGBA is ~4 MiB) never qualifies, so
// every page scrolled back into view is read from disk and decoded again.
// The limits are plain statics read when the cache is created (on the first
// image load), so they are set before main, from a constructor. The cache
// still empties itself on memory warnings and when the app resigns active.
//
// The limits alone never helped a cached page: -addImageToCache:URL:…
// stores an image only for an NSHTTPURLResponse, and every reader page is a
// file:// URL from the image cache (RCTFileRequestHandler answers with a
// plain NSURLResponse), so it was decoded again on each mount. A reopen's
// stand-in (the page last shown, mounted from the tap) then waited on a full
// decode racing the zoom and the reader's own mount. The same entry point
// now also stores decoded file:// images, under RCTImageCache's own key
// (RCTCacheKeyForImage: url|width|height|scale|resizeMode; Fabric loads
// every image with RCTResizeModeStretch at its layout size), so the reader's
// decode of a page is what the stand-in shows on a reopen.
//
// Guarded: if the header is not visible to this pod the file compiles to
// nothing and the stock behaviour stays in place; if RCTImageCache's private
// -addImageToCache:forKey: is gone, file:// images are simply not kept.

#if __has_include(<React/RCTImageCache.h>)
#import <React/RCTImageCache.h>
#import <objc/runtime.h>

static const NSUInteger NemuReaderMaxCacheableDecodedImageBytes = 12 * 1024 * 1024;
static const NSUInteger NemuReaderDecodedImageCacheTotalBytes = 160 * 1024 * 1024;

@interface RCTImageCache (NemuFileDecodedImages)
// RCTImageCache.mm: stores the image under the key when within the size cap.
- (void)addImageToCache:(UIImage *)image forKey:(NSString *)cacheKey;
@end

typedef void (*NemuAddImageToCacheIMP)(
    id, SEL, UIImage *, NSString *, CGSize, CGFloat, RCTResizeMode, NSURLResponse *);
static NemuAddImageToCacheIMP NemuOriginalAddImageToCache = NULL;

static void NemuAddImageToCache(
    id self,
    SEL _cmd,
    UIImage *image,
    NSString *url,
    CGSize size,
    CGFloat scale,
    RCTResizeMode resizeMode,
    NSURLResponse *response)
{
  if (NemuOriginalAddImageToCache != NULL) {
    NemuOriginalAddImageToCache(self, _cmd, image, url, size, scale, resizeMode, response);
  }
  // HTTP responses keep React Native's own handling (Cache-Control etc.).
  if (image == nil || [response isKindOfClass:[NSHTTPURLResponse class]]) {
    return;
  }
  if (![url isKindOfClass:[NSString class]] || ![url hasPrefix:@"file://"]) {
    return;
  }
  if (![self respondsToSelector:@selector(addImageToCache:forKey:)]) {
    return;
  }
  NSString *cacheKey = [NSString stringWithFormat:@"%@|%g|%g|%g|%lld",
                                                  url,
                                                  size.width,
                                                  size.height,
                                                  scale,
                                                  (long long)resizeMode];
  [(RCTImageCache *)self addImageToCache:image forKey:cacheKey];
}

__attribute__((constructor)) static void NemuRaiseReaderImageCacheLimits(void)
{
  RCTSetImageCacheLimits(
      NemuReaderMaxCacheableDecodedImageBytes,
      NemuReaderDecodedImageCacheTotalBytes);

  Class cacheClass = [RCTImageCache class];
  SEL selector = @selector(addImageToCache:URL:size:scale:resizeMode:response:);
  Method method = class_getInstanceMethod(cacheClass, selector);
  if (method == NULL) {
    return;
  }
  NemuOriginalAddImageToCache =
      (NemuAddImageToCacheIMP)method_setImplementation(method, (IMP)NemuAddImageToCache);
}
#endif
