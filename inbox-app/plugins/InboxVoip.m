// Rings the iPhone for incoming Inbox calls, even when the app is closed or the phone is locked.
// Registers for Apple VoIP pushes at launch and reports every call to CallKit immediately (Apple requires this).
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <PushKit/PushKit.h>
#import "RNVoipPushNotificationManager.h"
#import "RNCallKeep.h"

@interface InboxVoip : NSObject <PKPushRegistryDelegate>
@property (nonatomic, strong) PKPushRegistry *registry;
@end

@implementation InboxVoip

+ (instancetype)shared {
  static InboxVoip *s; static dispatch_once_t once;
  dispatch_once(&once, ^{ s = [InboxVoip new]; });
  return s;
}

+ (void)load {
  [[NSNotificationCenter defaultCenter] addObserverForName:UIApplicationDidFinishLaunchingNotification object:nil
                                                     queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *note) {
    InboxVoip *me = [InboxVoip shared];
    if (me.registry) return;
    me.registry = [[PKPushRegistry alloc] initWithQueue:dispatch_get_main_queue()];
    me.registry.delegate = me;
    me.registry.desiredPushTypes = [NSSet setWithObject:PKPushTypeVoIP];
  }];
}

- (void)pushRegistry:(PKPushRegistry *)registry didUpdatePushCredentials:(PKPushCredentials *)credentials forType:(PKPushType)type {
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

- (void)pushRegistry:(PKPushRegistry *)registry didInvalidatePushTokenForType:(PKPushType)type {}

- (void)pushRegistry:(PKPushRegistry *)registry didReceiveIncomingPushWithPayload:(PKPushPayload *)payload
             forType:(PKPushType)type withCompletionHandler:(void (^)(void))completion {
  NSDictionary *d = payload.dictionaryPayload;
  NSString *uuid = [d[@"uuid"] isKindOfClass:[NSString class]] ? d[@"uuid"] : [[NSUUID UUID] UUIDString];
  NSString *caller = [d[@"caller"] isKindOfClass:[NSString class]] ? d[@"caller"] : @"Inbox";
  BOOL video = [d[@"video"] respondsToSelector:@selector(boolValue)] ? [d[@"video"] boolValue] : NO;
  // Hand the push to JavaScript (joins the call once the app is up)…
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];
  // …and show the native incoming-call screen right now.
  [RNCallKeep reportNewIncomingCall:uuid handle:caller handleType:@"generic" hasVideo:video localizedCallerName:caller
                    supportsHolding:NO supportsDTMF:NO supportsGrouping:NO supportsUngrouping:NO
                        fromPushKit:YES payload:d withCompletionHandler:completion];
}

@end
