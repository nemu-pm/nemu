Pod::Spec.new do |s|
  s.name           = 'NemuAidoku'
  s.version        = '1.0.0'
  s.summary        = 'Native Aidoku bridge for Nemu mobile'
  s.description    = 'Provides synchronous native HTTP primitives for the mobile Aidoku source runtime.'
  s.author         = 'Nemu'
  s.homepage       = 'https://nemu.pm'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
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
      'NemuAidokuRuntimeMarker.txt'
    ]
  }
  s.script_phase = {
    :name => 'Copy isolated Aidoku runtime assets',
    :execution_position => :after_compile,
    :input_files => [
      '${PODS_TARGET_SRCROOT}/../runtime/assets/nemu_aidoku_sandbox.js',
      '${PODS_TARGET_SRCROOT}/../runtime/ios/nemu_aidoku_worker_host.js'
    ],
    :output_files => [
      '${CONFIGURATION_BUILD_DIR}/NemuAidokuRuntime.bundle/nemu_aidoku_sandbox.js',
      '${CONFIGURATION_BUILD_DIR}/NemuAidokuRuntime.bundle/nemu_aidoku_worker_host.js'
    ],
    :script => <<-'SCRIPT'
set -eu
runtime_bundle="${CONFIGURATION_BUILD_DIR}/NemuAidokuRuntime.bundle"
mkdir -p "${runtime_bundle}"
install -m 0644 "${SCRIPT_INPUT_FILE_0}" "${runtime_bundle}/nemu_aidoku_sandbox.js"
install -m 0644 "${SCRIPT_INPUT_FILE_1}" "${runtime_bundle}/nemu_aidoku_worker_host.js"
SCRIPT
  }
end
