import Foundation
import React

#if canImport(FoundationModels)
import FoundationModels
#endif

@objc(SanctumFoundationModels)
final class SanctumFoundationModels: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(isAvailable:rejecter:)
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      resolve(foundationModelIsAvailable())
    } else {
      resolve(false)
    }
    #else
    resolve(false)
    #endif
  }

  @objc(createReflection:durationSeconds:prompt:resolver:rejecter:)
  func createReflection(
    _ transcript: String,
    durationSeconds: NSNumber,
    prompt: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      Task {
        do {
          let output = try await createFoundationReflection(prompt: prompt)
          resolve(output)
        } catch {
          reject("foundation_models_error", error.localizedDescription, error)
        }
      }
    } else {
      reject("foundation_models_unavailable", "Apple Foundation Models require iOS 26 or newer.", nil)
    }
    #else
    reject("foundation_models_unavailable", "FoundationModels framework is unavailable in this Xcode/iOS SDK.", nil)
    #endif
  }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
private func foundationModelIsAvailable() -> Bool {
  switch SystemLanguageModel.default.availability {
  case .available:
    return true
  default:
    return false
  }
}

@available(iOS 26.0, *)
private func createFoundationReflection(prompt: String) async throws -> String {
  let instructions = """
  You run fully on device for a private journal app. Create a compact reflection from a voice transcript.
  Return strict JSON only. No markdown. No advice. No chat. No diagnosis.
  Required keys: title, topic, mood, observation.
  mood must be one of: settled, tender, busy, heavy, clear.
  Keep title under 8 words. Keep observation one sentence.
  """

  let session = LanguageModelSession(instructions: instructions)
  let response = try await session.respond(to: prompt)
  return response.content
}
#endif
