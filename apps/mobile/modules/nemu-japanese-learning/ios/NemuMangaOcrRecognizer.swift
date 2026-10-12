import CoreML
import Foundation

/// manga-ocr (kha-white/manga-ocr-base, Apache-2.0) on Core ML.
///
/// Two compiled models ship in the `NemuMangaOcr` resource bundle (see
/// `../OCR.md` and `scripts/fetch-ocr-models.ts`):
/// - `MangaOcrEncoder.mlmodelc`: ViT, `pixel_values` 1×3×224×224 →
///   `encoder_hidden_states` 1×197×768;
/// - `MangaOcrDecoder.mlmodelc`: stateless 2-layer BERT decoder,
///   `input_ids` 1×N (N ≤ 300) + encoder states → next-token `logits`.
/// Decoding is greedy on the host, exactly like the benchmark reference
/// (`scripts/coreml/mangaocr_coreml_run.py`), and the text goes through
/// manga-ocr's own `post_process`.
final class NemuMangaOcrRecognizer: @unchecked Sendable {
  static let inputSide = 224
  static let maxTokens = 300
  static let clsTokenId: Int32 = 2
  static let sepTokenId: Int32 = 3
  /// [PAD] [UNK] [CLS] [SEP] [MASK] are skipped when decoding.
  static let lastSpecialTokenId: Int32 = 4
  /// Greedy decoding stops once one token has been emitted this many times
  /// in a row, keeping the run (see `repetitionCut`). The longest run in the
  /// benchmark's 572 ground-truth blocks is 6 (`……` = six dots); runaway
  /// loops (`ー` × 300, `．` × 298) went on until `maxTokens`.
  static let maxRepeatRun = 12

  struct Failure: Error, LocalizedError {
    let code: String
    let message: String
    var errorDescription: String? { message }
  }

  struct Output: Sendable {
    let text: String
    let tokens: Int
    /// Geometric mean of the greedy tokens' softmax probabilities (incl.
    /// [SEP]): a recognition confidence in 0...1.
    let confidence: Double
    /// Sum of the kept tokens' log-probabilities and their count (the
    /// confidence is `exp(logProbability / steps)`), so pieces of one crop
    /// can be combined.
    let logProbability: Double
    let steps: Int
    /// Decoding stopped on a runaway repetition (`maxRepeatRun`).
    let repetitionStopped: Bool
    let encodeMs: Double
    let decodeMs: Double
  }

  /// When the last `maxRun + 1` tokens are the same token, the length to
  /// truncate `ids` to (dropping the newest copy); otherwise nil. `ids`
  /// starts with [CLS], which never repeats.
  static func repetitionCut(_ ids: [Int32], maxRun: Int = maxRepeatRun) -> Int? {
    guard maxRun > 0, ids.count > maxRun + 1, let last = ids.last else { return nil }
    for id in ids[(ids.count - maxRun - 1)...] where id != last { return nil }
    return ids.count - 1
  }

  private let encoder: MLModel
  private let decoder: MLModel
  private let vocabulary: [String]
  let computeUnitsLabel: String

  /// The files `load(from:)` needs inside a models directory.
  static let encoderName = "MangaOcrEncoder.mlmodelc"
  static let decoderName = "MangaOcrDecoder.mlmodelc"
  static let vocabularyName = "manga-ocr-vocab.txt"

  static func hasModels(in directory: URL) -> Bool {
    let manager = FileManager.default
    return [encoderName, decoderName, vocabularyName].allSatisfy {
      manager.fileExists(atPath: directory.appendingPathComponent($0).path)
    }
  }

  /// Where each model runs. The ViT encoder is one fixed-shape pass that
  /// the Neural Engine / GPU run in ~4 ms; the decoder is ~10–30 tiny
  /// flexible-shape passes per bubble, fastest on the CPU (on a Mac:
  /// 51 ms per bubble all-CPU, 79 ms with both on `.all`).
  struct ComputePlan: Sendable {
    var encoder: MLComputeUnits
    var decoder: MLComputeUnits

    static let cpuOnly = ComputePlan(encoder: .cpuOnly, decoder: .cpuOnly)
    static let all = ComputePlan(encoder: .all, decoder: .all)
    static let acceleratedEncoder = ComputePlan(encoder: .all, decoder: .cpuOnly)

    /// Core ML on `.all` in the iOS Simulator decodes every crop to the same
    /// garbage sentence (benchmark §D), so the simulator runs on the CPU.
    static var platformDefault: ComputePlan {
      #if targetEnvironment(simulator)
        return .cpuOnly
      #else
        return .acceleratedEncoder
      #endif
    }

    var label: String {
      func name(_ units: MLComputeUnits) -> String {
        switch units {
        case .cpuOnly: return "cpu"
        case .cpuAndGPU: return "cpu+gpu"
        case .cpuAndNeuralEngine: return "cpu+ne"
        default: return "all"
        }
      }
      return "encoder=\(name(encoder)),decoder=\(name(decoder))"
    }
  }

  init(directory: URL, plan: ComputePlan = .platformDefault) throws {
    guard Self.hasModels(in: directory) else {
      throw Failure(code: "E_OCR_MODELS_MISSING", message: "The manga OCR models are not bundled.")
    }
    let encoderConfiguration = MLModelConfiguration()
    encoderConfiguration.computeUnits = plan.encoder
    let decoderConfiguration = MLModelConfiguration()
    decoderConfiguration.computeUnits = plan.decoder
    do {
      encoder = try MLModel(
        contentsOf: directory.appendingPathComponent(Self.encoderName),
        configuration: encoderConfiguration)
      decoder = try MLModel(
        contentsOf: directory.appendingPathComponent(Self.decoderName),
        configuration: decoderConfiguration)
    } catch {
      throw Failure(
        code: "E_OCR_MODEL_LOAD", message: "The manga OCR models could not be loaded: \(error)")
    }
    let text = try String(
      contentsOf: directory.appendingPathComponent(Self.vocabularyName), encoding: .utf8)
    vocabulary = text.split(separator: "\n", omittingEmptySubsequences: false).map {
      String($0).trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
    }
    computeUnitsLabel = plan.label
  }

  /// `ViTImageProcessor` on a PIL "L" crop: bilinear 224×224, then
  /// `float32(x * (1/255))`, then `(v − 0.5) / 0.5`, copied to 3 channels.
  static func pixelValues(_ crop: NemuGrayImage) throws -> MLMultiArray {
    let side = inputSide
    let resized = crop.resizedBilinear(width: side, height: side)
    let array = try MLMultiArray(
      shape: [1, 3, NSNumber(value: side), NSNumber(value: side)], dataType: .float32)
    let plane = side * side
    let pointer = array.dataPointer.bindMemory(to: Float.self, capacity: 3 * plane)
    let rescale = 1.0 / 255.0
    for index in 0..<plane {
      let scaled = Float(Double(resized.pixels[index]) * rescale)
      let value = (scaled - 0.5) / 0.5
      pointer[index] = value
      pointer[plane + index] = value
      pointer[2 * plane + index] = value
    }
    return array
  }

  func recognize(
    _ crop: NemuGrayImage, maxTokens: Int = NemuMangaOcrRecognizer.maxTokens,
    maxRepeatRun: Int = NemuMangaOcrRecognizer.maxRepeatRun
  ) throws -> Output {
    let pixels = try Self.pixelValues(crop)
    let encodeStarted = DispatchTime.now()
    guard
      let hidden = try encoder.prediction(
        from: MLDictionaryFeatureProvider(dictionary: ["pixel_values": pixels])
      ).featureValue(for: "encoder_hidden_states")?.multiArrayValue
    else {
      throw Failure(code: "E_OCR_MODEL_OUTPUT", message: "The OCR encoder returned no states.")
    }
    let encodeMs = Self.milliseconds(since: encodeStarted)
    let decodeStarted = DispatchTime.now()
    var ids: [Int32] = [Self.clsTokenId]
    var logProbability = 0.0
    var repetitionStopped = false
    let limit = max(2, min(maxTokens, Self.maxTokens))
    while ids.count < limit {
      try Task.checkCancellation()
      let input = try MLMultiArray(shape: [1, NSNumber(value: ids.count)], dataType: .int32)
      let inputPointer = input.dataPointer.bindMemory(to: Int32.self, capacity: ids.count)
      for (index, id) in ids.enumerated() { inputPointer[index] = id }
      guard
        let logits = try decoder.prediction(
          from: MLDictionaryFeatureProvider(dictionary: [
            "input_ids": input, "encoder_hidden_states": hidden,
          ])
        ).featureValue(for: "logits")?.multiArrayValue
      else {
        throw Failure(code: "E_OCR_MODEL_OUTPUT", message: "The OCR decoder returned no logits.")
      }
      let (best, bestLogProbability) = Self.argmaxWithLogProbability(logits)
      let next = Int32(best)
      ids.append(next)
      if next == Self.sepTokenId {
        logProbability += bestLogProbability
        break
      }
      if let cut = Self.repetitionCut(ids, maxRun: maxRepeatRun) {
        ids.removeSubrange(cut...)
        repetitionStopped = true
        break
      }
      logProbability += bestLogProbability
    }
    let text = Self.postProcess(decodeTokens(ids))
    let steps = max(1, ids.count - 1)
    return Output(
      text: text, tokens: ids.count, confidence: exp(logProbability / Double(steps)),
      logProbability: logProbability, steps: steps, repetitionStopped: repetitionStopped,
      encodeMs: encodeMs,
      decodeMs: Self.milliseconds(since: decodeStarted))
  }

  /// `tokenizer.decode(ids, skip_special_tokens=True)` for the character
  /// BertJapaneseTokenizer: tokens joined with spaces (removed again by
  /// `post_process`); the vocabulary has no `##` continuation tokens.
  func decodeTokens(_ ids: [Int32]) -> String {
    var text = ""
    for id in ids where id > Self.lastSpecialTokenId {
      let index = Int(id)
      guard index < vocabulary.count else { continue }
      text += vocabulary[index]
    }
    return text
  }

  /// `argmax` plus the log-softmax at that index.
  static func argmaxWithLogProbability(_ array: MLMultiArray) -> (Int, Double) {
    let best = argmax(array)
    let count = array.count
    var maximum = -Double.infinity
    var values = [Double](repeating: 0, count: count)
    switch array.dataType {
    case .float32:
      let pointer = array.dataPointer.bindMemory(to: Float.self, capacity: count)
      for index in 0..<count { values[index] = Double(pointer[index]) }
    default:
      for index in 0..<count { values[index] = array[index].doubleValue }
    }
    for value in values where value > maximum { maximum = value }
    var sum = 0.0
    for value in values { sum += exp(value - maximum) }
    return (best, values[best] - maximum - log(sum))
  }

  /// First index of the maximum (numpy `argmax` tie-breaking).
  static func argmax(_ array: MLMultiArray) -> Int {
    let count = array.count
    var best = 0
    switch array.dataType {
    case .float32:
      let pointer = array.dataPointer.bindMemory(to: Float.self, capacity: count)
      var value = -Float.infinity
      for index in 0..<count where pointer[index] > value {
        value = pointer[index]
        best = index
      }
    case .double:
      let pointer = array.dataPointer.bindMemory(to: Double.self, capacity: count)
      var value = -Double.infinity
      for index in 0..<count where pointer[index] > value {
        value = pointer[index]
        best = index
      }
    default:
      var value = -Float.infinity
      for index in 0..<count {
        let candidate = array[index].floatValue
        if candidate > value {
          value = candidate
          best = index
        }
      }
    }
    return best
  }

  /// manga-ocr `post_process`:
  /// ```
  /// text = "".join(text.split())
  /// text = text.replace("…", "...")
  /// text = re.sub("[・.]{2,}", lambda x: (x.end() - x.start()) * ".", text)
  /// text = jaconv.h2z(text, ascii=True, digit=True)
  /// ```
  static func postProcess(_ raw: String) -> String {
    var scalars: [Unicode.Scalar] = []
    for scalar in raw.unicodeScalars where !isPythonWhitespace(scalar) {
      if scalar == "\u{2026}" {
        scalars.append(contentsOf: [".", ".", "."])
      } else {
        scalars.append(scalar)
      }
    }
    // Runs of two or more ・/. become the same number of dots.
    var index = 0
    while index < scalars.count {
      guard scalars[index] == "・" || scalars[index] == "." else {
        index += 1
        continue
      }
      var end = index
      while end < scalars.count && (scalars[end] == "・" || scalars[end] == ".") { end += 1 }
      if end - index >= 2 {
        for position in index..<end { scalars[position] = "." }
      }
      index = end
    }
    var text = String(String.UnicodeScalarView(scalars))
    for (from, to) in halfwidthDakuten { text = text.replacingOccurrences(of: from, with: to) }
    var out = String.UnicodeScalarView()
    for scalar in text.unicodeScalars {
      if let mapped = halfwidthToFullwidth[scalar] {
        out.append(mapped)
      } else {
        out.append(scalar)
      }
    }
    return String(out)
  }

  /// Python `str.split()` whitespace (`str.isspace`).
  private static func isPythonWhitespace(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x09...0x0D, 0x1C...0x20, 0x85, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F,
      0x205F, 0x3000:
      return true
    default:
      return false
    }
  }

  /// jaconv `_conv_dakuten` (applied before the table, in this order).
  private static let halfwidthDakuten: [(String, String)] = [
    ("ｶﾞ", "ガ"), ("ｷﾞ", "ギ"), ("ｸﾞ", "グ"), ("ｹﾞ", "ゲ"), ("ｺﾞ", "ゴ"), ("ｻﾞ", "ザ"),
    ("ｼﾞ", "ジ"), ("ｽﾞ", "ズ"), ("ｾﾞ", "ゼ"), ("ｿﾞ", "ゾ"), ("ﾀﾞ", "ダ"), ("ﾁﾞ", "ヂ"),
    ("ﾂﾞ", "ヅ"), ("ﾃﾞ", "デ"), ("ﾄﾞ", "ド"), ("ﾊﾞ", "バ"), ("ﾋﾞ", "ビ"), ("ﾌﾞ", "ブ"),
    ("ﾍﾞ", "ベ"), ("ﾎﾞ", "ボ"), ("ﾊﾟ", "パ"), ("ﾋﾟ", "ピ"), ("ﾌﾟ", "プ"), ("ﾍﾟ", "ペ"),
    ("ﾎﾟ", "ポ"), ("ｳﾞ", "ヴ"),
  ]

  /// jaconv `H2Z_ALL` (ascii + digit + kana), generated from jaconv 0.5.0.
  private static let halfwidthToFullwidth: [Unicode.Scalar: Unicode.Scalar] = {
    let from = Array(
      " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ヮヰヱヵヶヽヾ｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ"
        .unicodeScalars)
    let to = Array(
      "　！＂＃＄％＆＇（）＊＋，－．／０１２３４５６７８９：；＜＝＞？＠ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ［＼］＾＿｀ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ｛｜｝～ヮヰヱヵヶヽヾ。「」、・ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン"
        .unicodeScalars)
    precondition(from.count == to.count)
    var table: [Unicode.Scalar: Unicode.Scalar] = [:]
    for (key, value) in zip(from, to) { table[key] = value }
    return table
  }()

  static func milliseconds(since start: DispatchTime) -> Double {
    let nanos = DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds
    return (Double(nanos) / 1_000_000 * 10).rounded() / 10
  }
}
