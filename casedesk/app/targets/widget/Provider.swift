// One timeline entry per day for a week (days-left counts change at midnight). The app also asks
// WidgetKit to reload whenever it writes a new snapshot (ExtensionStorage.reloadWidget()).
// v2.8: each entry carries what the user chose in Edit Widget (ConfigIntent).
import WidgetKit
import AppIntents
import Foundation

struct WalletEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot
  var personId: String? = nil  // nil or "family" = Whole family
  var show: String = "status"  // a WIDGET_KINDS value; Current status by default
}

struct ConfigProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> WalletEntry {
    WalletEntry(date: Date(), snapshot: .preview)
  }

  private func entry(_ date: Date, _ snap: WidgetSnapshot, _ c: ConfigIntent) -> WalletEntry {
    WalletEntry(date: date, snapshot: snap, personId: c.person?.id, show: c.show.rawValue)
  }

  func snapshot(for configuration: ConfigIntent, in context: Context) async -> WalletEntry {
    // The widget gallery shows example data; the real Home Screen shows what the app wrote.
    if context.isPreview { return WalletEntry(date: Date(), snapshot: .preview, show: configuration.show.rawValue) }
    return entry(Date(), WidgetSnapshot.load(), configuration)
  }

  func timeline(for configuration: ConfigIntent, in context: Context) async -> Timeline<WalletEntry> {
    let snap = WidgetSnapshot.load()
    let cal = Calendar.current
    let start = cal.startOfDay(for: Date())
    var entries = [entry(Date(), snap, configuration)]
    for n in 1...7 {
      if let d = cal.date(byAdding: .day, value: n, to: start) { entries.append(entry(d, snap, configuration)) }
    }
    return Timeline(entries: entries, policy: .atEnd)
  }
}
