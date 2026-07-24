#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SanctumFoundationModels, NSObject)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createReflection:(NSString *)transcript
                  durationSeconds:(nonnull NSNumber *)durationSeconds
                  prompt:(NSString *)prompt
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
