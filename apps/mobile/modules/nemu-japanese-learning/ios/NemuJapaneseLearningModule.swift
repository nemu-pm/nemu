import ExpoModulesCore
import Foundation
import OSLog

/// Off by default; `log stream --level debug --predicate 'subsystem == "pm.nemu.japanese-learning"'`.
private let engineLog = Logger(subsystem: "pm.nemu.japanese-learning", category: "engine")

private func codedException(_ error: Error) -> Exception {
  if let exception = error as? Exception { return exception }
  if error is CancellationError {
    return Exception(name: "NemuJapaneseLearning", description: "Cancelled.", code: "E_CANCELLED")
  }
  if let failure = error as? NemuTextRecognizer.Failure {
    return Exception(name: "NemuJapaneseLearning", description: failure.message, code: failure.code)
  }
  if let failure = error as? NemuIchiranEngine.Failure {
    return Exception(name: "NemuJapaneseLearning", description: failure.message, code: failure.code)
  }
  return Exception(
    name: "NemuJapaneseLearning", description: error.localizedDescription, code: "E_ENGINE")
}

public final class NemuJapaneseLearningModule: Module {
  private let recognitionQueue = NemuSerialWorkQueue()
  private let analysisQueue = NemuSerialWorkQueue()

  public func definition() -> ModuleDefinition {
    Name("NemuJapaneseLearning")
    Events("onAnalysisPackProgress")

    Function("getCapabilities") { () -> [String: Any] in
      [
        "platform": "ios",
        "osVersion": NemuTextRecognizer.osVersion,
        "ocr": [
          "available": NemuTextRecognizer.isSupported,
          "engine": NemuTextRecognizer.engine,
          "engineRevision": NemuTextRecognizer.engineRevision,
          "textDirection": NemuTextRecognizer.supportsTextDirection,
        ],
        "analysis": [
          "kernelLinked": NemuIchiranEngine.kernelLinked,
          "engine": "ichiran-rust",
          "abiVersion": NemuIchiranEngine.abiVersion,
        ],
      ]
    }

    AsyncFunction("recognizeImage") {
      (fileUri: String, options: [String: Any]?) async throws -> [String: Any] in
      guard #available(iOS 18.0, *) else {
        throw Exception(
          name: "NemuJapaneseLearning", description: "On-device OCR needs iOS 18 or later.",
          code: "E_OCR_UNSUPPORTED")
      }
      guard let url = URL(string: fileUri), url.isFileURL else {
        throw Exception(
          name: "NemuJapaneseLearning", description: "OCR needs a local file URI.",
          code: "E_OCR_IMAGE")
      }
      var recognizerOptions = NemuTextRecognizer.Options()
      if let languages = options?["languages"] as? [String], !languages.isEmpty {
        recognizerOptions.languages = Array(languages.prefix(8))
      }
      if let correction = options?["usesLanguageCorrection"] as? Bool {
        recognizerOptions.usesLanguageCorrection = correction
      }
      if let boxes = options?["includeCharacterBoxes"] as? Bool {
        recognizerOptions.includeCharacterBoxes = boxes
      }
      if let fraction = options?["minimumTextHeightFraction"] as? Double {
        recognizerOptions.minimumTextHeightFraction = Float(fraction)
      }
      let requestId = (options?["requestId"] as? String) ?? UUID().uuidString
      let configured = recognizerOptions
      do {
        let result = try await recognitionQueue.run(requestId: requestId) {
          try await NemuTextRecognizer.recognize(fileURL: url, options: configured)
        }
        engineLog.debug(
          "ocr \(requestId, privacy: .public) \(String(describing: result["elapsedMs"] ?? ""), privacy: .public)ms lines=\((result["lines"] as? [Any])?.count ?? 0, privacy: .public)"
        )
        return result
      } catch {
        throw codedException(error)
      }
    }

    AsyncFunction("cancelRecognition") { (requestId: String) async -> Bool in
      await self.recognitionQueue.cancel(requestId: requestId)
    }

    AsyncFunction("getAnalysisStatus") { () async -> [String: Any] in
      #if NEMU_ICHIRAN_KERNEL
        return await NemuIchiranService.shared.status()
      #else
        return ["kernelLinked": false, "installed": false, "installing": false, "abiVersion": 0]
      #endif
    }

    AsyncFunction("installAnalysisPack") {
      (manifestUrl: String, expectedManifestSha256: String) async throws -> [String: Any] in
      #if NEMU_ICHIRAN_KERNEL
        guard let url = URL(string: manifestUrl) else {
          throw Exception(
            name: "NemuJapaneseLearning", description: "Invalid dictionary manifest URL.",
            code: "E_PACK_MANIFEST")
        }
        do {
          return try await NemuIchiranService.shared.install(
            manifestURL: url, expectedManifestSha256: expectedManifestSha256
          ) { [weak self] phase, completed, total in
            self?.sendEvent(
              "onAnalysisPackProgress",
              ["phase": phase, "completedBytes": completed, "totalBytes": total])
          }
        } catch {
          throw codedException(error)
        }
      #else
        throw Exception(
          name: "NemuJapaneseLearning",
          description: "This build does not include the on-device analyzer.",
          code: "E_ANALYSIS_UNAVAILABLE")
      #endif
    }

    AsyncFunction("removeAnalysisPack") { () async throws in
      #if NEMU_ICHIRAN_KERNEL
        do {
          try await NemuIchiranService.shared.remove()
        } catch {
          throw codedException(error)
        }
      #endif
    }

    AsyncFunction("analyzeText") {
      (text: String, options: [String: Any]?) async throws -> [String: Any] in
      #if NEMU_ICHIRAN_KERNEL
        let limit = (options?["limit"] as? Int) ?? 5
        let requestId = (options?["requestId"] as? String) ?? UUID().uuidString
        let entities = ((options?["entities"] as? [[String: Any]]) ?? []).prefix(64).compactMap {
          entity -> IchiranEntityHint? in
          guard let start = entity["start"] as? Int, let end = entity["end"] as? Int else {
            return nil
          }
          return IchiranEntityHint(start: start, end: end, boost: entity["boost"] as? Double)
        }
        do {
          let result = try await analysisQueue.run(requestId: requestId) {
            try await NemuIchiranService.shared.analyze(
              text: text, limit: limit, entities: Array(entities))
          }
          engineLog.debug(
            "analyze \(requestId, privacy: .public) \(String(describing: result["elapsedMs"] ?? ""), privacy: .public)ms"
          )
          return result
        } catch {
          throw codedException(error)
        }
      #else
        throw Exception(
          name: "NemuJapaneseLearning",
          description: "This build does not include the on-device analyzer.",
          code: "E_ANALYSIS_UNAVAILABLE")
      #endif
    }

    AsyncFunction("cancelAnalysis") { (requestId: String) async -> Bool in
      await self.analysisQueue.cancel(requestId: requestId)
    }

    AsyncFunction("romanizeText") { (text: String) async throws -> String in
      #if NEMU_ICHIRAN_KERNEL
        do {
          return try await NemuIchiranService.shared.romanize(text: text)
        } catch {
          throw codedException(error)
        }
      #else
        throw Exception(
          name: "NemuJapaneseLearning",
          description: "This build does not include the on-device analyzer.",
          code: "E_ANALYSIS_UNAVAILABLE")
      #endif
    }
  }
}
