vendor_dir = File.join(__dir__, 'Vendor')
ichiran_vendored = File.exist?(File.join(vendor_dir, 'IchiranKernel.xcframework', 'Info.plist')) &&
  !Dir.glob(File.join(vendor_dir, 'IchiranSwift', '*.swift')).empty?

Pod::Spec.new do |s|
  s.name           = 'NemuJapaneseLearning'
  s.version        = '1.0.0'
  s.summary        = 'On-device OCR and Japanese analysis for nemu'
  s.description    = 'Apple Vision manga OCR and the ichiran-node Rust analyzer (optional, vendored by scripts/vendor-ichiran.sh).'
  s.author         = 'Nemu'
  s.homepage       = 'https://nemu.pm'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'ImageIO', 'CryptoKit'

  xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '*.swift'
  if ichiran_vendored
    # Vendored IchiranSwift compiles into this module (it uses same-module
    # internal hooks); the kernel is a static C-ABI archive + module map.
    s.source_files = ['*.swift', 'Vendor/IchiranSwift/*.swift']
    s.vendored_frameworks = 'Vendor/IchiranKernel.xcframework'
    s.libraries = 'z'
    xcconfig['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) NEMU_ICHIRAN_KERNEL'
  end
  s.pod_target_xcconfig = xcconfig
end
