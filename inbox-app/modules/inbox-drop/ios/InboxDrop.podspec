Pod::Spec.new do |s|
  s.name           = 'InboxDrop'
  s.version        = '1.0.0'
  s.summary        = 'Drop photos and videos into an Inbox chat'
  s.description    = 'UIDropInteraction view for the Inbox app'
  s.author         = 'Inbox'
  s.homepage       = 'https://github.com/vijaykannan2020-del/Apps'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
