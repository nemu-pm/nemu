package pm.nemu.mobile.japaneselearning

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android stub: reports both on-device engines as unavailable so the app keeps
 * the cloud OCR/analysis path. Planned: ML Kit Japanese text recognition
 * (bundled model) for OCR and a JNI binding of the same ichiran Rust kernel.
 *
 * Every function the TS contract (`NemuJapaneseLearningNativeModule`) marks as
 * required exists here, with the codes an iOS build without the engines uses:
 * work rejects with E_OCR_UNSUPPORTED / E_ANALYSIS_UNAVAILABLE, cancels find
 * nothing to cancel, and removing the (never installed) pack is a no-op.
 * `recognizeRegions` / `recognizePage` are optional in the contract and stay
 * absent.
 */
class NemuJapaneseLearningModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NemuJapaneseLearning")
    Events("onAnalysisPackProgress", "onOcrBlock")

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

    AsyncFunction<Unit, String, Map<String, Any?>?>("recognizeImage") { _, _ ->
      throw ocrUnsupported()
    }

    AsyncFunction("cancelRecognition") { _: String -> false }

    AsyncFunction("getAnalysisStatus") {
      mapOf("kernelLinked" to false, "installed" to false, "installing" to false, "abiVersion" to 0)
    }

    AsyncFunction<Unit, String, String>("installAnalysisPack") { _, _ ->
      throw analysisUnavailable()
    }

    AsyncFunction<Unit>("removeAnalysisPack") { }

    AsyncFunction<Unit, String, Map<String, Any?>?>("analyzeText") { _, _ ->
      throw analysisUnavailable()
    }

    AsyncFunction("cancelAnalysis") { _: String -> false }

    AsyncFunction<Unit, String>("romanizeText") { _ ->
      throw analysisUnavailable()
    }
  }
}

private fun ocrUnsupported() =
  CodedException("E_OCR_UNSUPPORTED", "On-device OCR is not available on Android.", null)

private fun analysisUnavailable() =
  CodedException("E_ANALYSIS_UNAVAILABLE", "This build does not include the on-device analyzer.", null)
