vendor_dir = File.join(__dir__, 'Vendor')
ichiran_vendored = File.exist?(File.join(vendor_dir, 'IchiranKernel.xcframework', 'Info.plist')) &&
  !Dir.glob(File.join(vendor_dir, 'IchiranSwift', '*.swift')).empty?

# manga-ocr Core ML models (~130 MB, gitignored), materialised by
# `bun run ocr:models` (scripts/fetch-ocr-models.ts). Without them the pod
# still builds and on-device OCR stays on Apple Vision; Release builds refuse
# to build without them (NEMU_OCR_MODELS_OPTIONAL=1 overrides).
manga_ocr_dir = File.join(__dir__, 'Models', 'NemuMangaOcr')
manga_ocr_files = %w[MangaOcrEncoder.mlmodelc MangaOcrDecoder.mlmodelc MangaTextDetector.mlmodelc manga-ocr-vocab.txt manifest.json OCR-NOTICES.txt]
manga_ocr_bundled = manga_ocr_files.all? { |name| File.exist?(File.join(manga_ocr_dir, name)) }

Pod::Spec.new do |s|
  s.name           = 'NemuJapaneseLearning'
  s.version        = '1.0.0'
  s.summary        = 'On-device OCR and Japanese analysis for nemu'
  s.description    = 'Manga OCR (manga-ocr on Core ML, Apple Vision fallback) and the ichiran-node Rust analyzer (optional, vendored by scripts/vendor-ichiran.sh).'
  s.author         = 'Nemu'
  s.homepage       = 'https://nemu.pm'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'ImageIO', 'CoreImage', 'CoreML', 'CryptoKit'

  xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # The model check below reads the pod's own Models/ folder.
    'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO',
    'NEMU_OCR_MODELS_BUNDLED' => manga_ocr_bundled ? 'YES' : 'NO',
  }
  s.source_files = '*.swift'
  if ichiran_vendored
    # Vendored IchiranSwift compiles into this module (it uses same-module
    # internal hooks); the kernel is a static C-ABI archive + module map.
    s.source_files = ['*.swift', 'Vendor/IchiranSwift/*.swift']
    s.vendored_frameworks = 'Vendor/IchiranKernel.xcframework'
    s.libraries = 'z'
    xcconfig['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = '$(inherited) NEMU_ICHIRAN_KERNEL'
  end
  if manga_ocr_bundled
    s.resource_bundles = {
      'NemuMangaOcr' => manga_ocr_files.map { |name| "Models/NemuMangaOcr/#{name}" }
    }
  end
  s.script_phase = {
    :name => 'Check manga OCR models',
    :execution_position => :before_compile,
    :always_out_of_date => '1',
    :script => <<~'SH'
      if [ "${CONFIGURATION}" != "Release" ] || [ "${NEMU_OCR_MODELS_OPTIONAL:-0}" = "1" ]; then exit 0; fi
      dir="${PODS_TARGET_SRCROOT}/Models/NemuMangaOcr"
      for name in MangaOcrEncoder.mlmodelc MangaOcrDecoder.mlmodelc MangaTextDetector.mlmodelc manga-ocr-vocab.txt manifest.json OCR-NOTICES.txt; do
        if [ ! -e "${dir}/${name}" ]; then
          echo "error: manga OCR model file missing: ${dir}/${name}"
          echo "error: run 'bun run ocr:models' in apps/mobile (scripts/fetch-ocr-models.ts), then 'pod install' in apps/mobile/ios."
          echo "error: set NEMU_OCR_MODELS_OPTIONAL=1 to build a Release without them (on-device OCR falls back to Apple Vision)."
          exit 1
        fi
      done
      if [ "${NEMU_OCR_MODELS_BUNDLED}" != "YES" ]; then
        echo "error: the manga OCR models exist but were not present at 'pod install'; run 'pod install' in apps/mobile/ios so they are bundled."
        exit 1
      fi
    SH
  }
  s.pod_target_xcconfig = xcconfig
end
