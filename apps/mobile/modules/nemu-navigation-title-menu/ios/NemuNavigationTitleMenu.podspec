Pod::Spec.new do |s|
  s.name = 'NemuNavigationTitleMenu'
  s.version = '1.0.0'
  s.summary = 'Native navigation title menu for Nemu screens'
  s.description = 'Attaches a UIKit title menu (UINavigationItem.titleMenuProvider) to the react-native-screens screen that hosts the view.'
  s.author = 'Nemu'
  s.homepage = 'https://nemu.pm'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
