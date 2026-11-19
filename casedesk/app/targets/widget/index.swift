// Immigration Wallet widgets (v2.8): both are configurable — long-press → Edit Widget to choose the
// person (or Whole family) and what to show (Current status by default).
//   NextDeadline: small + Lock Screen.  FamilyStatus: medium, large (iPad extra large).
// The kind strings are unchanged from v2.5, so widgets already on a Home Screen keep working and
// start with the defaults (Whole family · Current status).
import SwiftUI
import WidgetKit
import AppIntents

struct SmallEntryView: View {
  @Environment(\.widgetFamily) var family
  let entry: WalletEntry
  var body: some View {
    switch family {
    case .accessoryCircular, .accessoryRectangular, .accessoryInline: ChosenAccessory(entry: entry)
    default: ChosenSmall(entry: entry)
    }
  }
}

struct FamilyEntryView: View {
  @Environment(\.widgetFamily) var family
  let entry: WalletEntry
  var body: some View {
    switch family {
    case .systemMedium: ChosenMedium(entry: entry)
    default: ChosenLarge(entry: entry)
    }
  }
}

/// Small widget background: the pastel of the chosen item's meaning; plain when there is nothing to colour.
struct SmallBackground: View {
  let entry: WalletEntry
  var body: some View {
    if entry.snapshot.locked || entry.snapshot.people.isEmpty {
      Color("$widgetBackground")
    } else {
      shown(entry).tone.fill
    }
  }
}

struct NextDeadlineWidget: Widget {
  let kind = "NextDeadline"
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: ConfigIntent.self, provider: ConfigProvider()) { entry in
      SmallEntryView(entry: entry).containerBackground(for: .widget) { SmallBackground(entry: entry) }
    }
    .configurationDisplayName("One date")
    .description("Current status by default. Edit Widget to choose a person and what to show. For personal reference — not an official document.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

struct FamilyWidget: Widget {
  let kind = "FamilyStatus"
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: ConfigIntent.self, provider: ConfigProvider()) { entry in
      FamilyEntryView(entry: entry).containerBackground(for: .widget) { Color("$widgetBackground") }
    }
    .configurationDisplayName("Family status")
    .description("Everyone’s dates, or one person in detail. Edit Widget to choose a person and what to show.")
    .supportedFamilies([.systemMedium, .systemLarge, .systemExtraLarge])
  }
}

@main
struct ImmigrationWalletWidgets: WidgetBundle {
  var body: some Widget {
    NextDeadlineWidget()
    FamilyWidget()
  }
}
