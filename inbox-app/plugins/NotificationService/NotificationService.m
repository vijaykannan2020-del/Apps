// Notification Service Extension: turns a message push into an iOS "communication notification" — the sender's
// profile photo and name, like WhatsApp or iMessage. The push carries a "who" block (name, text, app, photo links)
// from the Inbox server. If anything is missing or slow, the plain notification is shown unchanged.
#import <UserNotifications/UserNotifications.h>
#import <Intents/Intents.h>

@interface NotificationService : UNNotificationServiceExtension
@property (nonatomic, copy) void (^contentHandler)(UNNotificationContent *contentToDeliver);
@property (nonatomic, strong) UNMutableNotificationContent *bestAttemptContent;
@property (atomic) BOOL delivered;
@end

static NSString *str(id v) { return [v isKindOfClass:[NSString class]] && [(NSString *)v length] ? v : nil; }

@implementation NotificationService

- (void)deliver:(UNNotificationContent *)content {
  @synchronized (self) {
    if (self.delivered || !self.contentHandler) return;
    self.delivered = YES;
  }
  self.contentHandler(content);
}

- (void)fetch:(NSString *)url key:(NSString *)key into:(NSMutableDictionary *)got group:(dispatch_group_t)g {
  NSURL *u = url ? [NSURL URLWithString:url] : nil;
  if (!u) return;
  dispatch_group_enter(g);
  NSURLSessionConfiguration *cfg = [NSURLSessionConfiguration ephemeralSessionConfiguration];
  cfg.timeoutIntervalForRequest = 8;
  [[[NSURLSession sessionWithConfiguration:cfg] dataTaskWithURL:u completionHandler:^(NSData *data, NSURLResponse *resp, NSError *err) {
    NSInteger code = [resp isKindOfClass:[NSHTTPURLResponse class]] ? ((NSHTTPURLResponse *)resp).statusCode : 0;
    if (!err && code == 200 && data.length > 0) { @synchronized (got) { got[key] = data; } }
    dispatch_group_leave(g);
  }] resume];
}

- (void)didReceiveNotificationRequest:(UNNotificationRequest *)request withContentHandler:(void (^)(UNNotificationContent * _Nonnull))contentHandler {
  self.contentHandler = contentHandler;
  self.bestAttemptContent = [request.content mutableCopy];
  NSDictionary *info = request.content.userInfo;
  NSDictionary *who = [info[@"who"] isKindOfClass:[NSDictionary class]] ? info[@"who"] : nil;
  NSString *name = str(who[@"name"]);
  if (!name) { [self deliver:self.bestAttemptContent]; return; }

  if (@available(iOS 15.0, *)) {
    dispatch_group_t g = dispatch_group_create();
    NSMutableDictionary *got = [NSMutableDictionary dictionary];
    [self fetch:str(who[@"avatar"]) key:@"a" into:got group:g];
    [self fetch:str(who[@"group_avatar"]) key:@"g" into:got group:g];
    dispatch_group_notify(g, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      [self finish:who info:info photo:got[@"a"] groupPhoto:got[@"g"]];
    });
  } else {
    [self deliver:self.bestAttemptContent];
  }
}

- (void)finish:(NSDictionary *)who info:(NSDictionary *)info photo:(NSData *)photo groupPhoto:(NSData *)groupPhoto API_AVAILABLE(ios(15.0)) {
  @try {
    NSString *senderId = str(who[@"id"]) ?: str(who[@"name"]);
    NSString *group = str(who[@"group"]);
    NSString *net = str(who[@"net"]);
    NSString *text = str(who[@"text"]) ?: self.bestAttemptContent.body;
    INPersonHandle *handle = [[INPersonHandle alloc] initWithValue:senderId type:INPersonHandleTypeUnknown];
    INPerson *sender = [[INPerson alloc] initWithPersonHandle:handle nameComponents:nil displayName:str(who[@"name"])
                                                        image:(photo ? [INImage imageWithImageData:photo] : nil)
                                            contactIdentifier:nil customIdentifier:senderId];
    INPerson *me = [[INPerson alloc] initWithPersonHandle:[[INPersonHandle alloc] initWithValue:@"me" type:INPersonHandleTypeUnknown]
                                           nameComponents:nil displayName:nil image:nil contactIdentifier:nil customIdentifier:@"me" isMe:YES];
    INSendMessageIntent *intent = [[INSendMessageIntent alloc] initWithRecipients:(group ? @[me, sender] : @[me])
                                                             outgoingMessageType:INOutgoingMessageTypeOutgoingMessageText
                                                                         content:text
                                                              speakableGroupName:(group ? [[INSpeakableString alloc] initWithSpokenPhrase:group] : nil)
                                                          conversationIdentifier:str(info[@"room_id"])
                                                                     serviceName:net
                                                                          sender:sender
                                                                     attachments:nil];
    if (group && groupPhoto) [intent setImage:[INImage imageWithImageData:groupPhoto] forParameterNamed:@"speakableGroupName"];
    // Which app it came from stays visible under the name.
    if (net) self.bestAttemptContent.subtitle = net;
    if (!group) self.bestAttemptContent.body = text;
    INInteraction *ix = [[INInteraction alloc] initWithIntent:intent response:nil];
    ix.direction = INInteractionDirectionIncoming;
    [ix donateInteractionWithCompletion:^(NSError *error) {
      NSError *err = nil;
      UNNotificationContent *updated = [self.bestAttemptContent contentByUpdatingWithProvider:intent error:&err];
      [self deliver:(updated && !err) ? updated : self.bestAttemptContent];
    }];
  } @catch (NSException *e) {
    [self deliver:self.bestAttemptContent];
  }
}

- (void)serviceExtensionTimeWillExpire {
  [self deliver:self.bestAttemptContent];
}

@end
