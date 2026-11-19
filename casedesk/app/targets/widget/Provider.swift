// One timeline entry per day for a week (days-left counts change at midnight). The app also asks
// WidgetKit to reload whenever it writes a new snapshot (ExtensionStorage.reloadWidget()).
import WidgetKit
import Foundation

struct WalletEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
}

struct WalletProvider: TimelineProvider {
  func placeholder(in context: Context) -> WalletEntry { WalletEntry(date: Date(), snapshot: .preview) }

  func getSnapshot(in context: Context, completion: @escaping (WalletEntry) -> Void) {
    // The widget gallery shows example data; the real home screen shows what the app wrote.
    completion(WalletEntry(date: Date(), snapshot: context.isPreview ? .preview : WidgetSnapshot.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<WalletEntry>) -> Void) {
    let snap = WidgetSnapshot.load()
    let cal = Calendar.current
    let start = cal.startOfDay(for: Date())
    var entries = [WalletEntry(date: Date(), snapshot: snap)]
    for n in 1...7 {
      if let d = cal.date(byAdding: .day, value: n, to: start) { entries.append(WalletEntry(date: d, snapshot: snap)) }
    }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}
