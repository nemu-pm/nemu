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
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
