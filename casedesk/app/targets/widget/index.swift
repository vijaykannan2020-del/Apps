// Immigration Wallet widgets: Next deadline (small + Lock Screen) and Family status (medium, large).
import SwiftUI
import WidgetKit

struct NextDeadlineEntryView: View {
  @Environment(\.widgetFamily) var family
  let entry: WalletEntry
  var body: some View {
    switch family {
    case .accessoryCircular, .accessoryRectangular, .accessoryInline: DeadlineAccessory(entry: entry)
    default: NextDeadlineSmall(entry: entry)
    }
  }
}

struct NextDeadlineWidget: Widget {
  let kind = "NextDeadline"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: WalletProvider()) { entry in
      NextDeadlineEntryView(entry: entry).containerBackground(for: .widget) { Color("$widgetBackground") }
    }
    .configurationDisplayName("Next deadline")
    .description("Who, what and how many days are left. For personal reference — not an official document.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

struct FamilyWidget: Widget {
  let kind = "FamilyStatus"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: WalletProvider()) { entry in
      FamilyView(entry: entry).containerBackground(for: .widget) { Color("$widgetBackground") }
    }
    .configurationDisplayName("Family status")
    .description("Everyone’s status and valid-until date; the large size adds the latest case and the Visa Bulletin.")
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
