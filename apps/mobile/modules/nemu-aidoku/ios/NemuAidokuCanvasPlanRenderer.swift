import CoreGraphics
import Foundation
import ImageIO
import os

/// Renders the declarative canvas plan (`NEMU_CANVAS_PLAN_V2`) recorded by the
/// sandboxed Aidoku canvas host (`runtime/aidokuSandboxCanvas.ts`). Tile
/// descramblers such as Shonen Jump+ draw through the canvas API; the Wasm
/// sandbox records every copy and native code replays it here.
///
/// Port of `AidokuSandboxManager.renderCanvasPlan` (Android): same limits,
/// same validation, same chronological command replay, PNG output.
///
/// Coordinates: Canvas2D/Android use a top-left origin with y pointing down.
/// Every bitmap context gets one base flip (translate(0,h) + scale(1,-1)) so
/// its user space matches Android exactly; translate/rotate/scale then compose
/// identically (a positive angle is clockwise on screen in both). Because
/// `CGContext.draw(_:in:)` assumes a y-up space, each draw is flipped once more
/// locally around its destination rect so the tile lands upright.
enum NemuAidokuCanvasPlanRenderer {
  private static let maxImageBytes = 8 * 1024 * 1024
  private static let maxDimension = 8_192
  private static let maxPixels: Int64 = 12_000_000
  private static let maxTotalPixels: Int64 = 20_000_000
  private static let maxContexts = 16
  private static let maxCommands = 512
  private static let bytesPerPixel: Int64 = 4
  private static let minMemoryReserveBytes: Int64 = 32 * 1024 * 1024

  private struct PlanContext {
    let context: CGContext
    let width: Int
    let height: Int
  }

  static func render(inputBytes: Data, plan: [String: Any]) throws -> Data {
    try autoreleasepool {
      try renderPlan(inputBytes: inputBytes, plan: plan)
    }
  }

  private static func renderPlan(inputBytes: Data, plan: [String: Any]) throws -> Data {
    guard optionalInt(plan["version"]) == 2 else {
      throw failure("Unsupported Aidoku canvas plan.")
    }
    guard let imageSource = CGImageSourceCreateWithData(inputBytes as CFData, nil) else {
      throw failure("Aidoku canvas plan input is not a decodable image.")
    }
    let inputDimensions = imageBounds(imageSource)
    guard inputDimensions.width > 0, inputDimensions.height > 0 else {
      throw failure("Aidoku canvas plan input is not a decodable image.")
    }
    guard
      let contextsJson = plan["contexts"] as? [Any],
      (1...maxContexts).contains(contextsJson.count)
    else {
      throw failure("Aidoku canvas plan exceeds the context limit.")
    }
    guard let commandsJson = plan["commands"] as? [Any], commandsJson.count <= maxCommands else {
      throw failure("Aidoku canvas plan exceeds the command limit.")
    }
    let outputContextId = try requiredInt(plan["outputContextId"])
    try ensureAllocationBudget(
      Int64(inputDimensions.width) * Int64(inputDimensions.height)
    )
    // EXIF orientation is ignored, like BitmapFactory: the sandbox was given
    // the raw pixel dimensions, so source rectangles address raw pixels.
    let decodeOptions = [kCGImageSourceShouldCacheImmediately: true] as CFDictionary
    guard let inputImage = CGImageSourceCreateImageAtIndex(imageSource, 0, decodeOptions) else {
      throw failure("Aidoku canvas plan input could not be decoded.")
    }
    guard validImageDimensions(inputImage.width, inputImage.height) else {
      throw failure("Aidoku canvas decoded beyond the image safety limit.")
    }

    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
    var contexts: [Int: PlanContext] = [:]
    var totalPixels = Int64(inputImage.width) * Int64(inputImage.height)
    for rawContext in contextsJson {
      guard let contextJson = rawContext as? [String: Any] else {
        throw failure("Aidoku canvas plan context ID is invalid.")
      }
      let contextId = try requiredInt(contextJson["id"])
      guard contextId > 0, contexts[contextId] == nil else {
        throw failure("Aidoku canvas plan context ID is invalid.")
      }
      let width = try requiredInt(contextJson["width"])
      let height = try requiredInt(contextJson["height"])
      guard validImageDimensions(width, height) else {
        throw failure("Aidoku canvas plan dimensions exceed the safety limit.")
      }
      totalPixels += Int64(width) * Int64(height)
      guard totalPixels <= maxTotalPixels else {
        throw failure("Aidoku canvas plan exceeds the aggregate pixel limit.")
      }
      try ensureAllocationBudget(Int64(width) * Int64(height))
      guard
        let context = CGContext(
          data: nil,
          width: width,
          height: height,
          bitsPerComponent: 8,
          bytesPerRow: 0,
          space: colorSpace,
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
      else {
        throw failure("Aidoku canvas bitmap could not be allocated.")
      }
      // Fresh canvases are transparent, like an ARGB_8888 Bitmap.
      context.clear(CGRect(x: 0, y: 0, width: width, height: height))
      // Paint(ANTI_ALIAS_FLAG | FILTER_BITMAP_FLAG): bilinear-class filtering.
      context.interpolationQuality = .default
      context.setShouldAntialias(true)
      // Base flip: user space becomes top-left origin, y down (Canvas2D).
      context.translateBy(x: 0, y: CGFloat(height))
      context.scaleBy(x: 1, y: -1)
      contexts[contextId] = PlanContext(context: context, width: width, height: height)
    }

    // Snapshots of contexts used as sources. A snapshot stays valid until its
    // context is drawn into again, so repeated reads of an unchanged context
    // share one copy. A self-copy reads the snapshot taken before the draw,
    // which is exactly Android's explicit self-copy snapshot.
    var snapshots: [Int: CGImage] = [:]

    // Replaying one chronological stream preserves Canvas2D semantics across
    // contexts. Grouping commands by context would make a destination created
    // first read a source context before that source had been rendered.
    for rawCommand in commandsJson {
      guard let command = rawCommand as? [String: Any] else {
        throw failure("Aidoku canvas plan contains an unsupported command.")
      }
      guard (command["op"] as? String) == "copy" else {
        throw failure("Aidoku canvas plan contains an unsupported command.")
      }
      let destinationId = try requiredInt(command["destinationContextId"])
      guard let destination = contexts[destinationId] else {
        throw failure("Aidoku canvas plan references an unavailable destination context.")
      }
      guard
        let sourceDescription = command["source"] as? [String: Any],
        let sourceType = sourceDescription["type"] as? String
      else {
        throw failure("Aidoku canvas plan image is invalid.")
      }
      let source: CGImage
      switch sourceType {
      case "input":
        source = inputImage
      case "context":
        let sourceId = try requiredInt(sourceDescription["id"])
        guard let sourceContext = contexts[sourceId] else {
          throw failure("Aidoku canvas plan references an unavailable source context.")
        }
        if let snapshot = snapshots[sourceId] {
          source = snapshot
        } else {
          try ensureAllocationBudget(
            Int64(sourceContext.width) * Int64(sourceContext.height)
          )
          guard let snapshot = sourceContext.context.makeImage() else {
            throw failure("Aidoku canvas source context could not be read.")
          }
          snapshots[sourceId] = snapshot
          source = snapshot
        }
      default:
        throw failure("Aidoku canvas plan image is invalid.")
      }

      guard let sourceRectJson = command["sourceRect"] as? [String: Any] else {
        throw failure("Aidoku canvas source rectangle is out of bounds.")
      }
      let sourceX = try planInteger(sourceRectJson["x"])
      let sourceY = try planInteger(sourceRectJson["y"])
      let sourceWidth = try planInteger(sourceRectJson["width"])
      let sourceHeight = try planInteger(sourceRectJson["height"])
      guard
        sourceX >= 0,
        sourceY >= 0,
        sourceWidth > 0,
        sourceHeight > 0,
        sourceX + sourceWidth <= source.width,
        sourceY + sourceHeight <= source.height
      else {
        throw failure("Aidoku canvas source rectangle is out of bounds.")
      }
      guard let destinationRectJson = command["destinationRect"] as? [String: Any] else {
        throw failure("Aidoku canvas destination rectangle is invalid.")
      }
      let destinationX = try finitePlanNumber(destinationRectJson["x"])
      let destinationY = try finitePlanNumber(destinationRectJson["y"])
      let destinationWidth = try finitePlanNumber(destinationRectJson["width"])
      let destinationHeight = try finitePlanNumber(destinationRectJson["height"])
      guard destinationWidth > 0, destinationHeight > 0 else {
        throw failure("Aidoku canvas destination rectangle is invalid.")
      }
      guard let transform = command["transform"] as? [String: Any] else {
        throw failure("Aidoku canvas plan contains an invalid number.")
      }
      let translateX = try finitePlanNumber(transform["translateX"])
      let translateY = try finitePlanNumber(transform["translateY"])
      let scaleX = try finitePlanNumber(transform["scaleX"])
      let scaleY = try finitePlanNumber(transform["scaleY"])
      let rotateAngle = try finitePlanNumber(transform["rotateAngle"])
      guard abs(scaleX) <= 16, abs(scaleY) <= 16, abs(rotateAngle) <= CGFloat.pi * 100 else {
        throw failure("Aidoku canvas transform exceeds the safety limit.")
      }

      // CGImage cropping uses pixel coordinates with a top-left origin, the
      // same addressing as the plan's source rectangle.
      guard
        let tile = source.cropping(
          to: CGRect(x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight)
        )
      else {
        throw failure("Aidoku canvas source rectangle is out of bounds.")
      }

      let canvas = destination.context
      canvas.saveGState()
      // Same order as Android: translate, rotate (radians here, degrees
      // there), scale, then draw into the destination rectangle.
      canvas.translateBy(x: translateX, y: translateY)
      canvas.rotate(by: rotateAngle)
      canvas.scaleBy(x: scaleX, y: scaleY)
      // Local flip so the y-up `draw` renders the tile upright with its top
      // edge at destinationY in the y-down user space.
      canvas.translateBy(x: destinationX, y: destinationY + destinationHeight)
      canvas.scaleBy(x: 1, y: -1)
      canvas.draw(
        tile,
        in: CGRect(x: 0, y: 0, width: destinationWidth, height: destinationHeight)
      )
      canvas.restoreGState()
      snapshots[destinationId] = nil
    }

    guard let output = contexts[outputContextId] else {
      throw failure("Aidoku canvas output context is unavailable.")
    }
    snapshots.removeAll()
    guard let outputImage = output.context.makeImage() else {
      throw failure("Aidoku processed image could not be encoded.")
    }
    return try encodePngBounded(outputImage)
  }

  private static func encodePngBounded(_ image: CGImage) throws -> Data {
    let data = NSMutableData()
    guard
      let destination = CGImageDestinationCreateWithData(
        data as CFMutableData,
        "public.png" as CFString,
        1,
        nil
      )
    else {
      throw failure("Aidoku processed image could not be encoded.")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination), data.length > 0 else {
      throw failure("Aidoku processed image could not be encoded.")
    }
    guard data.length <= maxImageBytes else {
      throw failure("Aidoku processed image exceeds the safety limit.")
    }
    return data as Data
  }

  private static func imageBounds(_ source: CGImageSource) -> (width: Int, height: Int) {
    guard
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
      let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
      validImageDimensions(width, height)
    else {
      return (0, 0)
    }
    return (width, height)
  }

  private static func validImageDimensions(_ width: Int, _ height: Int) -> Bool {
    (1...maxDimension).contains(width) &&
      (1...maxDimension).contains(height) &&
      Int64(width) * Int64(height) <= maxPixels
  }

  /// iOS counterpart of Android's JVM-heap check: refuse a bitmap that would
  /// leave less than the reserve before the process memory limit. The
  /// simulator reports 0 (no jetsam limit); then only the pixel caps apply.
  private static func ensureAllocationBudget(_ additionalPixels: Int64) throws {
    guard additionalPixels > 0, additionalPixels <= Int64.max / bytesPerPixel else {
      throw failure("Aidoku canvas bitmap dimensions are invalid.")
    }
    let available = Int64(os_proc_available_memory())
    guard available > 0 else { return }
    let requiredBytes = additionalPixels * bytesPerPixel
    guard
      available > minMemoryReserveBytes,
      requiredBytes <= available - minMemoryReserveBytes
    else {
      throw failure("Aidoku canvas does not have enough free memory for a safe bitmap allocation.")
    }
  }

  private static func number(_ value: Any?) -> Double? {
    guard let number = value as? NSNumber else { return nil }
    return number.doubleValue
  }

  /// JSONObject.optInt semantics for a missing/non-numeric value: nil here.
  private static func optionalInt(_ value: Any?) -> Int? {
    guard
      let double = number(value),
      double.isFinite,
      abs(double) < 2_147_483_648
    else {
      return nil
    }
    // JSONObject.getInt truncates fractional numbers.
    return Int(double.rounded(.towardZero))
  }

  private static func requiredInt(_ value: Any?) throws -> Int {
    guard let integer = optionalInt(value) else {
      throw failure("Aidoku canvas plan contains an invalid number.")
    }
    return integer
  }

  private static func finitePlanNumber(_ value: Any?) throws -> CGFloat {
    guard let double = number(value), double.isFinite, abs(double) <= 1_000_000 else {
      throw failure("Aidoku canvas plan contains an invalid number.")
    }
    return CGFloat(double)
  }

  private static func planInteger(_ value: Any?) throws -> Int {
    guard let double = number(value), double.isFinite, abs(double) <= 1_000_000 else {
      throw failure("Aidoku canvas source rectangles must use integer pixels.")
    }
    let rounded = double.rounded(.toNearestOrAwayFromZero)
    guard abs(double - rounded) <= 0.001 else {
      throw failure("Aidoku canvas source rectangles must use integer pixels.")
    }
    return Int(rounded)
  }

  private static func failure(_ detail: String) -> NSError {
    NSError(
      domain: "NemuAidokuIOSandbox",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: detail]
    )
  }
}
