const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");
const xcode = require("xcode");
const { addBuildSourceFileToGroup } = require("@expo/config-plugins/build/ios/utils/Xcodeproj");

const SWIFT_FILE = "SanctumFoundationModels.swift";
const BRIDGE_FILE = "SanctumFoundationModelsBridge.m";

const swiftSource = String.raw`import Foundation
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
`;

const bridgeSource = String.raw`#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SanctumFoundationModels, NSObject)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createReflection:(NSString *)transcript
                  durationSeconds:(nonnull NSNumber *)durationSeconds
                  prompt:(NSString *)prompt
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`;

function addSourceFile(project, fileName, groupName, targetUuid) {
  addBuildSourceFileToGroup({
    filepath: `${groupName}/${fileName}`,
    groupName,
    project,
    targetUuid
  });
}

module.exports = function withSanctumFoundationModels(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const iosRoot = path.join(modConfig.modRequest.platformProjectRoot);
      const appName = modConfig.modRequest.projectName || "Sanctum";
      const nativeAppName = fs.existsSync(path.join(iosRoot, appName)) ? appName : "Slated";
      const appDir = path.join(iosRoot, nativeAppName);
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, SWIFT_FILE), swiftSource);
      fs.writeFileSync(path.join(appDir, BRIDGE_FILE), bridgeSource);

      const preferredPbxPath = path.join(iosRoot, `${appName}.xcodeproj`, "project.pbxproj");
      const pbxPath = fs.existsSync(preferredPbxPath) ? preferredPbxPath : path.join(iosRoot, "Slated.xcodeproj", "project.pbxproj");
      if (fs.existsSync(pbxPath)) {
        const project = xcode.project(pbxPath);
        project.parseSync();
        const targetUuid = project.getFirstTarget().uuid;
        addSourceFile(project, SWIFT_FILE, nativeAppName, targetUuid);
        addSourceFile(project, BRIDGE_FILE, nativeAppName, targetUuid);
        const serialized = project.writeSync().replace(/; explicitFileType = undefined/g, "");
        fs.writeFileSync(pbxPath, serialized);
      }

      return modConfig;
    }
  ]);
};
