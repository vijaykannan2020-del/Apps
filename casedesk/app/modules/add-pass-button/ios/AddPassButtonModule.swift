// Apple's Add to Apple Wallet button (PKAddPassButton) as a React Native view. Apple's guidelines ask
// apps to use this class rather than badge artwork: the system draws the right style and language.
import ExpoModulesCore
import PassKit
import UIKit

public class AddPassButtonModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AddPassButton")

    Function("canAddPasses") { () -> Bool in
      PKAddPassesViewController.canAddPasses()
    }

    View(AddPassButtonView.self) {
      Events("onPress")
      Prop("outline") { (view: AddPassButtonView, outline: Bool) in
        view.setOutline(outline)
      }
    }
  }
}

class AddPassButtonView: ExpoView {
  let onPress = EventDispatcher()
  private let button = PKAddPassButton(addPassButtonStyle: .black)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    button.addTarget(self, action: #selector(tapped), for: .touchUpInside)
    addSubview(button)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
  }

  func setOutline(_ outline: Bool) {
    // .blackOutline is Apple's variant for dark backgrounds.
    button.addPassButtonStyle = outline ? .blackOutline : .black
  }

  @objc private func tapped() {
    onPress([:])
  }
}
