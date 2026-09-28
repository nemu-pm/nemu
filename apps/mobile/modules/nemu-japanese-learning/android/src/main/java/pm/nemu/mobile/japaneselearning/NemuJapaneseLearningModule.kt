package pm.nemu.mobile.japaneselearning

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android stub: reports both on-device engines as unavailable so the app keeps
 * the cloud OCR/analysis path. Planned: ML Kit Japanese text recognition
 * (bundled model) for OCR and a JNI binding of the same ichiran Rust kernel.
 */
class NemuJapaneseLearningModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NemuJapaneseLearning")
    Events("onAnalysisPackProgress")

    Function("getCapabilities") {
      mapOf(
        "platform" to "android",
        "osVersion" to android.os.Build.VERSION.RELEASE,
        "ocr" to mapOf(
          "available" to false,
          "engine" to "none",
          "engineRevision" to "unavailable",
          "textDirection" to false,
        ),
        "analysis" to mapOf(
          "kernelLinked" to false,
          "engine" to "ichiran-rust",
          "abiVersion" to 0,
        ),
      )
    }

    AsyncFunction("getAnalysisStatus") {
      mapOf("kernelLinked" to false, "installed" to false, "installing" to false, "abiVersion" to 0)
    }
  }
}
