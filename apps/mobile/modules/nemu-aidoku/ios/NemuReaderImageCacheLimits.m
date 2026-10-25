// Raises React Native's decoded-image memory cache limits for reader pages,
// and keeps a small, separate store of decoded reader pages (file:// URLs).
//
// RCTImageCache keeps a decoded bitmap only when it is at most 2 MiB, with a
// 20 MiB total. The limits are plain statics read when the cache is created
// (on the first image load), so they are set before main, from a
// constructor. The cache still empties itself on memory warnings and when
// the app resigns active.
//
// RCTImageCache never keeps a file:// image at all: -addImageToCache:URL:…
// stores only for an NSHTTPURLResponse, and RCTFileRequestHandler answers a
// file:// load with a plain NSURLResponse. Every cached reader page is a
// file:// URL, so a reopen's stand-in (the page last shown, mounted from the
// tap) decoded its page again, racing the zoom and the reader's own mount.
// That stays the default for file:// images. Only URLs JS registers (the
// reader's paged pages near the current one, and the reopen stand-in; see
// NemuReaderRetainDecodedImageNotification, posted by NemuAidokuModule's
// retainReaderDecodedImage) are kept, in their own bounded LRU:
//   - at most NemuReaderRetainedURLLimit registered URLs (oldest dropped,
//     with its bitmaps),
//   - at most NemuReaderRetainedImageCountLimit decoded bitmaps and
//     NemuReaderRetainedImageCostLimit bytes in total (least recently used
//     evicted first), a bitmap over NemuReaderRetainedImageMaxBytes never,
//   - emptied on a memory warning.
// The key is RCTImageCache's own (RCTCacheKeyForImage: url|w|h|scale|mode;
// Fabric loads every image with RCTResizeModeStretch at its layout size), so
// the reader's decode of a page is what the stand-in finds on a reopen.
//
// Guarded: if the header is not visible to this pod the file compiles to
// nothing and the stock behaviour stays in place.

#if __has_include(<React/RCTImageCache.h>)
#import <React/RCTImageCache.h>
#import <objc/runtime.h>

static const NSUInteger NemuReaderMaxCacheableDecodedImageBytes = 12 * 1024 * 1024;
static const NSUInteger NemuReaderDecodedImageCacheTotalBytes = 160 * 1024 * 1024;

static const NSUInteger NemuReaderRetainedURLLimit = 16;
static const NSUInteger NemuReaderRetainedImageCountLimit = 8;
static const NSUInteger NemuReaderRetainedImageCostLimit = 48 * 1024 * 1024;
static const NSUInteger NemuReaderRetainedImageMaxBytes = 12 * 1024 * 1024;

static NSString *const NemuReaderRetainDecodedImageNotification = @"NemuReaderRetainDecodedImage";

@interface NemuReaderRetainedImages : NSObject
@end

@implementation NemuReaderRetainedImages {
  // Registered URLs, least recently registered first.
  NSMutableArray<NSString *> *_urls;
  // Decoded bitmaps by RCTImageCache key, least recently used first.
  NSMutableArray<NSString *> *_keys;
  NSMutableDictionary<NSString *, UIImage *> *_images;
  NSMutableDictionary<NSString *, NSString *> *_urlForKey;
  NSMutableDictionary<NSString *, NSNumber *> *_costForKey;
  NSUInteger _totalCost;
}

+ (instancetype)shared
{
  static NemuReaderRetainedImages *shared;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    shared = [NemuReaderRetainedImages new];
  });
  return shared;
}

- (instancetype)init
{
  if (self = [super init]) {
    _urls = [NSMutableArray new];
    _keys = [NSMutableArray new];
    _images = [NSMutableDictionary new];
    _urlForKey = [NSMutableDictionary new];
    _costForKey = [NSMutableDictionary new];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(clear)
                                                 name:UIApplicationDidReceiveMemoryWarningNotification
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(retainNotification:)
                                                 name:NemuReaderRetainDecodedImageNotification
                                               object:nil];
  }
  return self;
}

- (void)retainNotification:(NSNotification *)notification
{
  id url = notification.userInfo[@"url"];
  if ([url isKindOfClass:[NSString class]]) {
    [self retainURL:(NSString *)url];
  }
}

- (void)clear
{
  @synchronized(self) {
    [_keys removeAllObjects];
    [_images removeAllObjects];
    [_urlForKey removeAllObjects];
    [_costForKey removeAllObjects];
    _totalCost = 0;
  }
}

- (void)removeKeyLocked:(NSString *)key
{
  NSNumber *cost = _costForKey[key];
  if (cost != nil) {
    _totalCost -= MIN(_totalCost, cost.unsignedIntegerValue);
  }
  [_keys removeObject:key];
  [_images removeObjectForKey:key];
  [_urlForKey removeObjectForKey:key];
  [_costForKey removeObjectForKey:key];
}

- (void)retainURL:(NSString *)rawURL
{
  if (![rawURL hasPrefix:@"file://"]) {
    return;
  }
  // The loader keys by request.URL.absoluteString (RCTConvert's NSURL of the
  // same string): the same normalisation here.
  NSURL *parsed = [NSURL URLWithString:rawURL];
  if (parsed == nil) {
    NSString *encoded =
        [rawURL stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLFragmentAllowedCharacterSet]];
    parsed = encoded != nil ? [NSURL URLWithString:encoded] : nil;
  }
  NSString *url = parsed.absoluteString;
  if (url == nil) {
    return;
  }
  @synchronized(self) {
    [_urls removeObject:url];
    [_urls addObject:url];
    // Registered again (the page on screen, a stand-in): its bitmaps are the
    // most recently used.
    for (NSString *key in [_keys copy]) {
      if ([_urlForKey[key] isEqualToString:url]) {
        [_keys removeObject:key];
        [_keys addObject:key];
      }
    }
    while (_urls.count > NemuReaderRetainedURLLimit) {
      NSString *dropped = _urls.firstObject;
      [_urls removeObjectAtIndex:0];
      for (NSString *key in [_keys copy]) {
        if ([_urlForKey[key] isEqualToString:dropped]) {
          [self removeKeyLocked:key];
        }
      }
    }
  }
}

- (void)storeImage:(UIImage *)image key:(NSString *)key url:(NSString *)url
{
  NSInteger bytes = image.reactDecodedImageBytes;
  if (bytes <= 0 || (NSUInteger)bytes > NemuReaderRetainedImageMaxBytes) {
    return;
  }
  @synchronized(self) {
    if (![_urls containsObject:url]) {
      return;
    }
    [self removeKeyLocked:key];
    [_keys addObject:key];
    _images[key] = image;
    _urlForKey[key] = url;
    _costForKey[key] = @(bytes);
    _totalCost += (NSUInteger)bytes;
    while (_keys.count > 0 && (_keys.count > NemuReaderRetainedImageCountLimit || _totalCost > NemuReaderRetainedImageCostLimit)) {
      [self removeKeyLocked:_keys.firstObject];
    }
  }
}

- (UIImage *)imageForKey:(NSString *)key
{
  @synchronized(self) {
    UIImage *image = _images[key];
    if (image != nil) {
      [_keys removeObject:key];
      [_keys addObject:key];
    }
    return image;
  }
}

@end

static NSString *NemuRCTCacheKey(NSString *url, CGSize size, CGFloat scale, RCTResizeMode resizeMode)
{
  // RCTImageCache.mm's RCTCacheKeyForImage.
  return [NSString stringWithFormat:@"%@|%g|%g|%g|%lld", url, size.width, size.height, scale, (long long)resizeMode];
}

typedef void (*NemuAddImageToCacheIMP)(
    id, SEL, UIImage *, NSString *, CGSize, CGFloat, RCTResizeMode, NSURLResponse *);
static NemuAddImageToCacheIMP NemuOriginalAddImageToCache = NULL;

typedef UIImage *(*NemuImageForUrlIMP)(id, SEL, NSString *, CGSize, CGFloat, RCTResizeMode);
static NemuImageForUrlIMP NemuOriginalImageForUrl = NULL;

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
  if (image == nil || [response isKindOfClass:[NSHTTPURLResponse class]]) {
    return;
  }
  if (![url isKindOfClass:[NSString class]] || ![url hasPrefix:@"file://"]) {
    return;
  }
  [[NemuReaderRetainedImages shared] storeImage:image key:NemuRCTCacheKey(url, size, scale, resizeMode) url:url];
}

static UIImage *NemuImageForUrl(id self, SEL _cmd, NSString *url, CGSize size, CGFloat scale, RCTResizeMode resizeMode)
{
  UIImage *image = NemuOriginalImageForUrl != NULL ? NemuOriginalImageForUrl(self, _cmd, url, size, scale, resizeMode) : nil;
  if (image != nil || ![url isKindOfClass:[NSString class]] || ![url hasPrefix:@"file://"]) {
    return image;
  }
  return [[NemuReaderRetainedImages shared] imageForKey:NemuRCTCacheKey(url, size, scale, resizeMode)];
}

__attribute__((constructor)) static void NemuRaiseReaderImageCacheLimits(void)
{
  RCTSetImageCacheLimits(
      NemuReaderMaxCacheableDecodedImageBytes,
      NemuReaderDecodedImageCacheTotalBytes);
  // Observing from now on (registrations arrive from JS later).
  [NemuReaderRetainedImages shared];

  Class cacheClass = [RCTImageCache class];
  Method add = class_getInstanceMethod(cacheClass, @selector(addImageToCache:URL:size:scale:resizeMode:response:));
  Method lookup = class_getInstanceMethod(cacheClass, @selector(imageForUrl:size:scale:resizeMode:));
  if (add == NULL || lookup == NULL) {
    return;
  }
  NemuOriginalAddImageToCache = (NemuAddImageToCacheIMP)method_setImplementation(add, (IMP)NemuAddImageToCache);
  NemuOriginalImageForUrl = (NemuImageForUrlIMP)method_setImplementation(lookup, (IMP)NemuImageForUrl);
}
#endif
