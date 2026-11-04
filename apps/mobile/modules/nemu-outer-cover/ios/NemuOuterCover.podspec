Pod::Spec.new do |s|
  s.name = 'NemuOuterCover'
  s.version = '1.0.0'
  s.summary = "The book's cover on the iPhone Duo outer display while reading"
  s.description = 'Registers a camera capture scene accessory (iOS 27.1) on the reader and keeps a minimal capture session running while it is wanted.'
  s.author = 'Nemu'
  s.homepage = 'https://nemu.pm'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'ImageIO'
  # UISceneAccessory.cameraCapture, UIHingeInteraction and friends exist only
  # in the iOS 27.1+ SDK; `#available` alone does not stop an older SDK from
  # failing to compile them, and every Xcode 27.x ships the same Swift
  # compiler. Same trick as NemuWindowLayout.podspec: NEMU_SDK_27_1 is
  # defined from the SDK being built against, and the Swift keeps a runtime
  # `#available(iOS 27.1, *)` inside every `#if NEMU_SDK_27_1`. Older SDKs
  # build a no-op module.
  sdk_27_1_or_later = (1..9).map { |minor| "27.#{minor}*" } + (28..39).map { |major| "#{major}*" }
  sdk_conditions = sdk_27_1_or_later.flat_map do |version|
    %w[iphoneos iphonesimulator].map { |platform| ["NEMU_SDK_SWIFT_CONDITIONS[sdk=#{platform}#{version}]", 'NEMU_SDK_27_1'] }
  end.to_h
  # Verification builds only: `NEMU_OUTER_COVER_PREVIEW=1 pod install`
  # compiles in a preview that draws the accessory content over the reader
  # while the device is folded closed (the simulator has no camera, so the
  # system never presents the real accessory there). Unset, the preview code
  # is not compiled at all. Never set it for a build that ships.
  preview = ENV['NEMU_OUTER_COVER_PREVIEW'] == '1' ? ' NEMU_OUTER_COVER_PREVIEW' : ''
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'NEMU_SDK_SWIFT_CONDITIONS' => '',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => "$(inherited) $(NEMU_SDK_SWIFT_CONDITIONS)#{preview}",
  }.merge(sdk_conditions)
  s.source_files = '**/*.swift'
end
