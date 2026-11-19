// SwiftUI views for every widget size (v2.8: each widget shows what the user chose in Edit Widget).
// Pastel look like the app: a pastel block per meaning (sage good, butter attention, blush urgent,
// sky information) with ink text, on true black in dark mode. System text styles (Dynamic Type),
// widgetAccentable() for tinted / accented Home Screens, a disclaimer on every size that has room.
import SwiftUI
import WidgetKit

private let openURL = URL(string: "casedesk://")!
let notAdded = "Not added yet — open the app"

// MARK: - what one configured widget shows

/// The chosen item, worked out for one timeline entry (days are counted from the entry's date).
struct Shown {
  let title: String    // "In the US · H-1B" / "Passport valid until"
  let big: String      // "210 days left" / "I-485 pending"
  let sub: String      // the exact date, or the date with what sets it
  let extra: String    // "Visa stamp: Yes" (current status outside the US), else ""
  let who: String      // name or initials, as chosen in the app ("" when there is nothing to show)
  let tone: Urgency    // .none = information (sky)
  let url: URL
  let missing: Bool
  let days: Int?
}

func kindTitle(_ kind: String) -> String {
  switch kind {
  case "deadline": return "Next deadline"
  case "passport": return "Passport"
  case "visa": return "Visa stamp"
  case "i94": return "I-94"
  case "ead": return "EAD"
  case "ap": return "Advance parole"
  case "gc": return "Green card stage"
  case "case": return "Latest case update"
  case "pd": return "Priority date"
  default: return "Current status"
  }
}

func daysLeftText(_ n: Int) -> String {
  if n < 0 { return "Ended" }
  if n == 0 { return "Ends today" }
  return n == 1 ? "1 day left" : "\(n) days left"
}

func shown(_ item: WidgetItem?, kind: String, entry: WalletEntry) -> Shown {
  guard let it = item else {
    return Shown(title: kindTitle(kind), big: notAdded, sub: "", extra: "", who: "", tone: .none, url: openURL, missing: true, days: nil)
  }
  let url = URL(string: it.url) ?? openURL
  let days = daysUntil(it.date, from: entry.date)
  var extra = ""
  if let ok = it.stamp { extra = ok ? "Visa stamp: Yes" : "Visa stamp: No" }
  if it.kind == "status" {
    let place = it.place == "Outside" ? "Outside the US" : "In the US"
    let title = it.text.map { it.mode == "until" ? "\(place) · \($0)" : place } ?? place
    if it.mode == "until", let n = days {
      return Shown(title: title, big: daysLeftText(n), sub: "\(it.label) \(shortDate(it.date))", extra: extra, who: it.who, tone: urgency(n), url: url, missing: false, days: n)
    }
    return Shown(title: title, big: it.text ?? it.label, sub: it.label, extra: extra, who: it.who, tone: .none, url: url, missing: false, days: nil)
  }
  if it.mode == "until", let n = days {
    return Shown(title: it.label, big: daysLeftText(n), sub: shortDate(it.date), extra: it.kind == "visa" ? "" : extra, who: it.who, tone: urgency(n), url: url, missing: false, days: n)
  }
  let text = it.text ?? shortDate(it.date)
  let sub = it.text != nil && it.date != nil ? shortDate(it.date) : ""
  return Shown(title: it.label, big: text, sub: sub, extra: "", who: it.who, tone: .none, url: url, missing: false, days: nil)
}

func shown(_ entry: WalletEntry) -> Shown {
  shown(entry.snapshot.item(kind: entry.show, personId: entry.personId), kind: entry.show, entry: entry)
}

func isWholeFamily(_ entry: WalletEntry) -> Bool {
  entry.personId == nil || entry.personId == familyId
}

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
  var onPastel = false
  @Environment(\.widgetRenderingMode) var mode
  var body: some View {
    if onPastel && mode == .fullColor {
      Text(text).font(.system(.caption2)).foregroundStyle(Color("$ink").opacity(0.78)).lineLimit(1).minimumScaleFactor(0.6)
    } else {
      Text(text).font(.system(.caption2)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.6)
    }
  }
}

struct UrgencyDot: View {
  let u: Urgency
  var body: some View { Circle().fill(u.color).frame(width: 8, height: 8).widgetAccentable().accessibilityHidden(true) }
}

/// The chosen item as text: small label, the big value, a second line, who. `onPastel` = ink text
/// (the caller draws the pastel behind it). In tinted / accented mode system colours are used instead.
struct ItemText: View {
  let s: Shown
  var onPastel = true
  var bigStyle: Font = .system(.title, design: .rounded)
  @Environment(\.widgetRenderingMode) var mode
  var body: some View {
    let ink = onPastel && mode == .fullColor
    let main: Color = ink ? Color("$ink") : .primary
    let soft: Color = ink ? Color("$ink").opacity(0.78) : .secondary
    VStack(alignment: .leading, spacing: 2) {
      Text(s.title).font(.caption2).fontWeight(.semibold).foregroundStyle(soft).lineLimit(2).minimumScaleFactor(0.8)
      if s.missing {
        Text(s.big).font(.footnote).fontWeight(.semibold).foregroundStyle(main).lineLimit(3).minimumScaleFactor(0.8)
      } else {
        Text(s.big).font(bigStyle).fontWeight(.bold).foregroundStyle(main).lineLimit(2).minimumScaleFactor(0.5).widgetAccentable()
        if !s.sub.isEmpty { Text(s.sub).font(.caption).foregroundStyle(soft).lineLimit(1).minimumScaleFactor(0.7) }
        if !s.extra.isEmpty { Text(s.extra).font(.caption).fontWeight(.semibold).foregroundStyle(main).lineLimit(1).minimumScaleFactor(0.8) }
        if !s.who.isEmpty { Text(s.who).font(.caption2).fontWeight(.semibold).foregroundStyle(soft).lineLimit(1) }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// A pastel block (rounded) holding the chosen item.
struct ItemBlock: View {
  let s: Shown
  @Environment(\.widgetRenderingMode) var mode
  var body: some View {
    ItemText(s: s, onPastel: true, bigStyle: .system(.title2, design: .rounded))
      .padding(10)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .background {
        if mode == .fullColor {
          RoundedRectangle(cornerRadius: 14, style: .continuous).fill(s.tone.fill)
        } else {
          RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.primary.opacity(0.12))
        }
      }
  }
}

// MARK: - Small: the chosen item fills the widget (the pastel is the widget background, see index.swift)

struct ChosenSmall: View {
  let entry: WalletEntry
  var body: some View {
    let snap = entry.snapshot
    if snap.locked { LockedView() }
    else if snap.people.isEmpty { EmptyStateView() }
    else {
      let s = shown(entry)
      VStack(alignment: .leading, spacing: 2) {
        ItemText(s: s, onPastel: true)
        Spacer(minLength: 2)
        Disclaimer(text: "Reference only", onPastel: true)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .widgetURL(s.url)
    }
  }
}

// MARK: - Lock Screen accessories

struct ChosenAccessory: View {
  @Environment(\.widgetFamily) var family
  let entry: WalletEntry
  var body: some View {
    let snap = entry.snapshot
    let s = shown(entry)
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        if snap.locked { Image(systemName: "lock.fill") }
        else if s.missing { Image(systemName: "plus") }
        else if let n = s.days {
          VStack(spacing: 0) {
            Text(n < 0 ? "!" : "\(n)").font(.system(.title3, design: .rounded)).fontWeight(.bold).minimumScaleFactor(0.5)
            Text(n == 1 ? "day" : "days").font(.system(size: 9)).textCase(.uppercase)
          }
        } else {
          Text(s.big).font(.system(.caption2, design: .rounded)).fontWeight(.semibold).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.5).padding(3)
        }
      }
      .widgetURL(snap.locked ? openURL : s.url)
      .accessibilityLabel(snap.locked ? "Open Immigration Wallet" : "\(s.title): \(s.big)")
    case .accessoryInline:
      if snap.locked { Text("Immigration Wallet") }
      else if s.missing { Text("\(s.title): not added yet") }
      else { Text(s.who.isEmpty ? "\(s.title) · \(s.big)" : "\(s.who): \(s.title) · \(s.big)") }
    default: // accessoryRectangular
      VStack(alignment: .leading, spacing: 1) {
        if snap.locked {
          Label("Immigration Wallet", systemImage: "lock.fill").font(.headline)
          Text("Open to see dates").font(.caption)
        } else if s.missing {
          Text(s.title).font(.headline).lineLimit(1)
          Text(notAdded).font(.caption).lineLimit(2)
        } else {
          Text(s.big).font(.headline).lineLimit(1).widgetAccentable()
          Text(s.title).font(.caption).lineLimit(1)
          Text([s.who, s.sub, s.extra].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetURL(snap.locked ? openURL : s.url)
    }
  }
}

// MARK: - Medium / Large

/// One person in the family list: avatar, name and status, and their value for the chosen item.
struct PersonRow: View {
  let p: WidgetPerson
  let entry: WalletEntry
  var body: some View {
    let name = p.name
    let s = shown(entry.snapshot.item(kind: entry.show, personId: p.id), kind: entry.show, entry: entry)
    Link(destination: s.missing ? (URL(string: p.url) ?? openURL) : s.url) {
      HStack(spacing: 8) {
        ZStack {
          Circle().fill(Color("$sky"))
          Text((p.initials ?? p.name).prefix(2)).font(.caption).fontWeight(.semibold).foregroundStyle(Color("$ink")).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(width: 26, height: 26).widgetAccentable()
        VStack(alignment: .leading, spacing: 0) {
          Text(name).font(.footnote).fontWeight(.semibold).lineLimit(1)
          Text(p.status).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer(minLength: 4)
        VStack(alignment: .trailing, spacing: 0) {
          if s.missing {
            Text("Not added yet").font(.caption).foregroundStyle(.secondary).lineLimit(1)
          } else {
            HStack(spacing: 4) {
              if s.days != nil { UrgencyDot(u: s.tone) }
              Text(s.big).font(.caption).fontWeight(.medium).lineLimit(1).minimumScaleFactor(0.7)
            }
            Text([s.sub.isEmpty ? s.title : s.sub, s.extra].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
          }
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// A secondary line under / beside the chosen item: another item of the same person.
struct SecondaryLine: View {
  let s: Shown
  var body: some View {
    Link(destination: s.url) {
      VStack(alignment: .leading, spacing: 0) {
        Text(s.title).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        HStack(spacing: 4) {
          if s.days != nil { UrgencyDot(u: s.tone) }
          Text(s.big).font(.footnote).fontWeight(.semibold).lineLimit(1).minimumScaleFactor(0.7)
        }
      }
    }
  }
}

/// Two more items for the same person (or the family), skipping the chosen one and anything not added.
func secondary(_ entry: WalletEntry, limit: Int = 2) -> [Shown] {
  let order = ["status", "deadline", "passport", "i94", "visa", "ead", "ap", "gc", "case", "pd"]
  var out: [Shown] = []
  var seen: Set<String> = []
  let main = entry.snapshot.item(kind: entry.show, personId: entry.personId)
  if let m = main { seen.insert("\(m.label)|\(m.date ?? "")") }
  for k in order where k != entry.show {
    guard let it = entry.snapshot.item(kind: k, personId: entry.personId) else { continue }
    let key = "\(it.label)|\(it.date ?? "")"
    if seen.contains(key) { continue } // "next deadline" is often the same date as another item
    seen.insert(key)
    out.append(shown(it, kind: k, entry: entry))
    if out.count >= limit { break }
  }
  return out
}

struct FamilyHeader: View {
  let title: String
  var body: some View {
    HStack {
      Text(title).font(.caption).fontWeight(.semibold).foregroundStyle(.secondary).lineLimit(1)
      Spacer()
      Image(systemName: "person.2.fill").font(.caption).foregroundStyle(.secondary).widgetAccentable()
    }
  }
}

struct ChosenMedium: View {
  let entry: WalletEntry
  var body: some View {
    let snap = entry.snapshot
    if snap.locked { LockedView() }
    else if snap.people.isEmpty { EmptyStateView() }
    else if isWholeFamily(entry) {
      // Whole family: the family list, each row showing that person's value for the chosen item.
      VStack(alignment: .leading, spacing: 5) {
        FamilyHeader(title: "Family · \(kindTitle(entry.show))")
        ForEach(Array(snap.people.prefix(3)), id: \.self) { p in PersonRow(p: p, entry: entry) }
        Spacer(minLength: 0)
        Disclaimer(text: snap.disclaimer)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      // One person: the chosen item big, two more of their dates beside it.
      let s = shown(entry)
      let more = secondary(entry)
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .top, spacing: 10) {
          Link(destination: s.url) { ItemBlock(s: s) }
          VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(more.enumerated()), id: \.offset) { _, x in SecondaryLine(s: x) }
            if more.isEmpty { Text("Add documents in the app to see more dates here.").font(.caption2).foregroundStyle(.secondary) }
            Spacer(minLength: 0)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        Disclaimer(text: snap.disclaimer)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}

struct ChosenLarge: View {
  let entry: WalletEntry
  var body: some View {
    let snap = entry.snapshot
    if snap.locked { LockedView() }
    else if snap.people.isEmpty { EmptyStateView() }
    else if isWholeFamily(entry) {
      let s = shown(entry)
      VStack(alignment: .leading, spacing: 7) {
        FamilyHeader(title: "Family · \(kindTitle(entry.show))")
        ForEach(Array(snap.people.prefix(4)), id: \.self) { p in PersonRow(p: p, entry: entry) }
        Link(destination: s.url) { ItemBlock(s: s).frame(maxHeight: 96) }
        HStack(alignment: .top, spacing: 12) {
          ForEach(Array(secondary(entry).enumerated()), id: \.offset) { _, x in
            SecondaryLine(s: x).frame(maxWidth: .infinity, alignment: .leading)
          }
        }
        if let b = snap.bulletin {
          Text(b.next.map { "Visa Bulletin: \(b.month) · next expected around \(shortDate($0))" } ?? "Visa Bulletin: \(b.month)")
            .font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
        }
        Spacer(minLength: 0)
        Disclaimer(text: snap.disclaimer)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    } else {
      // One person: the chosen item in a big pastel block, then up to six more of their dates.
      let s = shown(entry)
      let more = secondary(entry, limit: 6)
      VStack(alignment: .leading, spacing: 8) {
        FamilyHeader(title: s.who.isEmpty ? kindTitle(entry.show) : "\(s.who) · \(kindTitle(entry.show))")
        Link(destination: s.url) { ItemBlock(s: s).frame(maxHeight: 130) }
        ForEach(Array(stride(from: 0, to: more.count, by: 2)), id: \.self) { i in
          HStack(alignment: .top, spacing: 12) {
            SecondaryLine(s: more[i]).frame(maxWidth: .infinity, alignment: .leading)
            if i + 1 < more.count {
              SecondaryLine(s: more[i + 1]).frame(maxWidth: .infinity, alignment: .leading)
            } else {
              Spacer().frame(maxWidth: .infinity)
            }
          }
        }
        if more.isEmpty { Text("Add documents in the app to see more dates here.").font(.caption2).foregroundStyle(.secondary) }
        Spacer(minLength: 0)
        Disclaimer(text: snap.disclaimer)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}
