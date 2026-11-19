// SwiftUI views for every widget size. System text styles (Dynamic Type), system colours (light/dark),
// widgetAccentable() for tinted / accented home screens, and a disclaimer on every size that has room.
import SwiftUI
import WidgetKit

private let openURL = URL(string: "casedesk://")!

// MARK: - shared bits

struct LockedView: View {
  var compact = false
  var body: some View {
    VStack(alignment: compact ? .center : .leading, spacing: 4) {
      Image(systemName: "lock.fill").font(.headline).widgetAccentable()
      Text("Open Immigration Wallet").font(compact ? .caption2 : .subheadline).fontWeight(.semibold)
        .multilineTextAlignment(compact ? .center : .leading).minimumScaleFactor(0.7)
      if !compact { Text("Details are hidden while Face ID lock is on.").font(.caption2).foregroundStyle(.secondary) }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: compact ? .center : .leading)
    .widgetURL(openURL)
  }
}

struct EmptyStateView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Image(systemName: "person.crop.rectangle.stack").font(.headline).widgetAccentable()
      Text("Add your family in Immigration Wallet").font(.subheadline).fontWeight(.semibold).minimumScaleFactor(0.7)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(openURL)
  }
}

struct Disclaimer: View {
  let text: String
  var body: some View {
    Text(text).font(.system(.caption2)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.6)
  }
}

struct UrgencyDot: View {
  let u: Urgency
  var body: some View { Circle().fill(u.color).frame(width: 8, height: 8).widgetAccentable().accessibilityHidden(true) }
}

// MARK: - (a) Small: next deadline

struct NextDeadlineSmall: View {
  let entry: WalletEntry
  var body: some View {
    let s = entry.snapshot
    if s.locked { LockedView() }
    else if let d = s.deadlines.first {
      let days = daysUntil(d.date, from: entry.date)
      let u = urgency(days)
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 6) { UrgencyDot(u: u); Text("Next deadline").font(.caption2).foregroundStyle(.secondary) }
        Spacer(minLength: 2)
        Text(days.map(daysText) ?? "—").font(.system(.title, design: .rounded)).fontWeight(.bold)
          .foregroundStyle(u.color).minimumScaleFactor(0.6).lineLimit(1).widgetAccentable()
        Text(d.what).font(.footnote).fontWeight(.semibold).lineLimit(2).minimumScaleFactor(0.8)
        Text("\(d.who) · \(shortDate(d.date))").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        Spacer(minLength: 2)
        Disclaimer(text: "Reference only")
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .widgetURL(URL(string: d.url) ?? openURL)
      .accessibilityElement(children: .combine)
    } else if s.people.isEmpty { EmptyStateView() }
    else {
      VStack(alignment: .leading, spacing: 4) {
        Image(systemName: "checkmark.circle.fill").font(.title2).foregroundStyle(.green).widgetAccentable()
        Text("No dates coming up").font(.subheadline).fontWeight(.semibold)
        Spacer()
        Disclaimer(text: "Reference only")
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .widgetURL(openURL)
    }
  }
}

// MARK: - (d) Lock Screen accessories: days to the nearest deadline

struct DeadlineAccessory: View {
  @Environment(\.widgetFamily) var family
  let entry: WalletEntry
  var body: some View {
    let s = entry.snapshot
    let d = s.locked ? nil : s.deadlines.first
    let days = daysUntil(d?.date, from: entry.date)
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        if s.locked { Image(systemName: "lock.fill") }
        else if let n = days {
          VStack(spacing: 0) {
            Text(n < 0 ? "!" : "\(n)").font(.system(.title3, design: .rounded)).fontWeight(.bold).minimumScaleFactor(0.5)
            Text(n == 1 ? "day" : "days").font(.system(size: 9)).textCase(.uppercase)
          }
        } else { Image(systemName: "checkmark") }
      }
      .widgetURL(URL(string: d?.url ?? "") ?? openURL)
      .accessibilityLabel(s.locked ? "Open Immigration Wallet" : days.map { "\(daysText($0)) to \(d?.what ?? "next deadline")" } ?? "No dates coming up")
    case .accessoryInline:
      if s.locked { Text("Immigration Wallet") }
      else if let d = d, let n = days { Text("\(d.who): \(d.what) · \(daysText(n))") }
      else { Text("No dates coming up") }
    default: // accessoryRectangular
      VStack(alignment: .leading, spacing: 1) {
        if s.locked {
          Label("Immigration Wallet", systemImage: "lock.fill").font(.headline)
          Text("Open to see dates").font(.caption)
        } else if let d = d, let n = days {
          Text(daysText(n)).font(.headline).widgetAccentable()
          Text(d.what).font(.caption).lineLimit(1)
          Text("\(d.who) · \(shortDate(d.date))").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        } else {
          Text("No dates coming up").font(.headline)
          Text("Immigration Wallet").font(.caption)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetURL(URL(string: d?.url ?? "") ?? openURL)
    }
  }
}

// MARK: - (b) Medium / (c) Large: family status

struct PersonRow: View {
  let p: WidgetPerson
  let now: Date
  var body: some View {
    let days = daysUntil(p.until, from: now)
    Link(destination: URL(string: p.url) ?? openURL) {
      HStack(spacing: 8) {
        ZStack {
          Circle().fill(Color.accentColor.opacity(0.18))
          Text(p.name.prefix(2)).font(.caption).fontWeight(.semibold).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(width: 26, height: 26).widgetAccentable()
        VStack(alignment: .leading, spacing: 0) {
          Text(p.name).font(.footnote).fontWeight(.semibold).lineLimit(1)
          Text(p.status).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer(minLength: 4)
        VStack(alignment: .trailing, spacing: 0) {
          if p.until != nil {
            HStack(spacing: 4) { UrgencyDot(u: urgency(days)); Text(shortDate(p.until)).font(.caption).fontWeight(.medium).lineLimit(1) }
            Text("\(p.untilLabel ?? "Valid") until").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          } else {
            Text("—").font(.caption).foregroundStyle(.secondary)
          }
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

struct FamilyView: View {
  @Environment(\.widgetFamily) var family
  let entry: WalletEntry
  var body: some View {
    let s = entry.snapshot
    let large = family == .systemLarge || family == .systemExtraLarge
    if s.locked { LockedView() }
    else if s.people.isEmpty { EmptyStateView() }
    else {
      VStack(alignment: .leading, spacing: large ? 8 : 5) {
        HStack {
          Text("Family status").font(.caption).fontWeight(.semibold).foregroundStyle(.secondary)
          Spacer()
          Image(systemName: "person.2.fill").font(.caption).foregroundStyle(.secondary).widgetAccentable()
        }
        ForEach(Array(s.people.prefix(4)), id: \.self) { p in PersonRow(p: p, now: entry.date) }
        if large {
          Divider()
          if let c = s.latestCase {
            Link(destination: URL(string: c.url) ?? openURL) {
              VStack(alignment: .leading, spacing: 1) {
                Text("Latest case update").font(.caption2).foregroundStyle(.secondary)
                Text("\(c.who) · \(c.form): \(c.status)").font(.footnote).fontWeight(.semibold).lineLimit(1)
                if let d = c.date { Text(shortDate(d)).font(.caption2).foregroundStyle(.secondary) }
              }
            }
          }
          if let b = s.bulletin {
            VStack(alignment: .leading, spacing: 1) {
              Text("Visa Bulletin").font(.caption2).foregroundStyle(.secondary)
              Text(b.next.map { "\(b.month) · next expected around \(shortDate($0))" } ?? b.month).font(.footnote).lineLimit(2).minimumScaleFactor(0.8)
            }
          }
          if let d = s.deadlines.first, let n = daysUntil(d.date, from: entry.date) {
            HStack(spacing: 6) {
              UrgencyDot(u: urgency(n))
              Text("Next: \(d.who) · \(d.what) · \(daysText(n))").font(.caption).lineLimit(1).minimumScaleFactor(0.8)
            }
          }
          Spacer(minLength: 0)
        }
        Disclaimer(text: s.disclaimer)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}
