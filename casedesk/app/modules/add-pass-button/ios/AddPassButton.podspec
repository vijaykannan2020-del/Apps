Pod::Spec.new do |s|
  s.name           = 'AddPassButton'
  s.version        = '1.0.0'
  s.summary        = 'PKAddPassButton for Expo (Immigration Wallet local module)'
  s.description    = 'Shows Apple’s system Add to Apple Wallet button, as Apple’s guidelines ask apps to do.'
  s.author         = ''
  s.homepage       = 'https://casedeskapp.duckdns.org'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'PassKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.{h,m,mm,swift}'
end
