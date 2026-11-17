// A view that accepts photos and videos dragged in from other apps (Photos, Files, Safari…) and hands them to
// JavaScript as local files, so the chat can send them.
import ExpoModulesCore
import UIKit
import AVFoundation
import UniformTypeIdentifiers

public class InboxDropModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InboxDrop")
    View(InboxDropView.self) {
      Events("onDropFiles", "onDragOver")
    }
  }
}

class InboxDropView: ExpoView, UIDropInteractionDelegate {
  let onDropFiles = EventDispatcher()
  let onDragOver = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIDropInteraction(delegate: self))
  }

  private let accepted = [UTType.image.identifier, UTType.movie.identifier]

  func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession) -> Bool {
    return session.hasItemsConforming(toTypeIdentifiers: accepted)
  }
  func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: UIDropSession) -> UIDropProposal {
    return UIDropProposal(operation: .copy)
  }
  func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnter session: UIDropSession) {
    onDragOver(["over": true])
  }
  func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: UIDropSession) {
    onDragOver(["over": false])
  }
  func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: UIDropSession) {
    onDragOver(["over": false])
  }

  func dropInteraction(_ interaction: UIDropInteraction, performDrop session: UIDropSession) {
    let group = DispatchGroup()
    let lock = NSLock()
    var files: [[String: Any]] = []
    for item in session.items {
      let provider = item.itemProvider
      let isMovie = provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
      let isImage = !isMovie && provider.hasItemConformingToTypeIdentifier(UTType.image.identifier)
      if !isMovie && !isImage { continue }
      let base: UTType = isMovie ? .movie : .image
      let typeId = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: base) == true }) ?? base.identifier
      group.enter()
      provider.loadFileRepresentation(forTypeIdentifier: typeId) { url, _ in
        defer { group.leave() }
        guard let url = url else { return }
        var ext = url.pathExtension
        if ext.isEmpty { ext = UTType(typeId)?.preferredFilenameExtension ?? (isMovie ? "mov" : "jpg") }
        let dest = FileManager.default.temporaryDirectory.appendingPathComponent("drop-\(UUID().uuidString).\(ext)")
        do { try FileManager.default.copyItem(at: url, to: dest) } catch { return }
        let mime = UTType(filenameExtension: ext)?.preferredMIMEType ?? (isMovie ? "video/quicktime" : "image/jpeg")
        let name = provider.suggestedName.map { "\($0).\(ext)" } ?? dest.lastPathComponent
        var f: [String: Any] = ["uri": dest.absoluteString, "mime": mime, "kind": isMovie ? "video" : "image", "name": name]
        if isImage, let img = UIImage(contentsOfFile: dest.path) {
          f["width"] = Double(img.size.width * img.scale)
          f["height"] = Double(img.size.height * img.scale)
        }
        if isMovie {
          let asset = AVURLAsset(url: dest)
          let secs = CMTimeGetSeconds(asset.duration)
          if secs.isFinite { f["durationMs"] = Int(secs * 1000) }
          if let track = asset.tracks(withMediaType: .video).first {
            let size = track.naturalSize.applying(track.preferredTransform)
            f["width"] = Double(abs(size.width)); f["height"] = Double(abs(size.height))
          }
        }
        lock.lock(); files.append(f); lock.unlock()
      }
    }
    group.notify(queue: .main) { [weak self] in
      guard let self = self else { return }
      self.onDragOver(["over": false])
      if !files.isEmpty { self.onDropFiles(["files": files]) }
    }
  }
}
