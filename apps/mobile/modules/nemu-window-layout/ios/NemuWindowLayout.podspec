Pod::Spec.new do |s|
  s.name = 'NemuWindowLayout'
  s.version = '1.0.0'
  s.summary = 'View-local reserved region observation for Nemu'
  s.description = 'Reports public UIKit window layout regions to React Native.'
  s.author = 'Nemu'
  s.homepage = 'https://nemu.pm'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoUI'
  # Duo fold / vertical bar APIs (UIHingeInteraction, reserved regions,
  # UIVerticalBarBehavior) exist only in the iOS 27.1+ SDK, while the release
  # Xcode may still ship 27.0; `#available` alone does not stop a 27.0 SDK
  # from failing to compile them, and every Xcode 27.x ships the same Swift
  # compiler, so `#if compiler(...)` cannot tell the SDKs apart. Define
  # NEMU_SDK_27_1 from the SDK being built against instead: the Swift keeps
  # a runtime `#available(iOS 27.1, *)` inside every `#if NEMU_SDK_27_1`.
  sdk_27_1_or_later = (1..9).map { |minor| "27.#{minor}*" } + (28..39).map { |major| "#{major}*" }
  sdk_conditions = sdk_27_1_or_later.flat_map do |version|
    %w[iphoneos iphonesimulator].map { |platform| ["NEMU_SDK_SWIFT_CONDITIONS[sdk=#{platform}#{version}]", 'NEMU_SDK_27_1'] }
  end.to_h
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'NEMU_SDK_SWIFT_CONDITIONS' => '',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => '$(inherited) $(NEMU_SDK_SWIFT_CONDITIONS)',
  }.merge(sdk_conditions)
  s.source_files = '**/*.swift'
end
