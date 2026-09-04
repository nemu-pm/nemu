Pod::Spec.new do |s|
  s.name           = 'NemuAidoku'
  s.version        = '1.0.0'
  s.summary        = 'Native Aidoku bridge for Nemu mobile'
  s.description    = 'Provides synchronous native HTTP primitives for the mobile Aidoku source runtime.'
  s.author         = 'Nemu'
  s.homepage       = 'https://nemu.pm'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.resource_bundles = {
    'NemuAidokuRuntime' => [
      'Resources/nemu_aidoku_sandbox.js',
      'Resources/nemu_aidoku_worker_host.js'
    ]
  }
end
