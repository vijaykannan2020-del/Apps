// The summary the app writes to the shared App Group (src/core/widgets.ts builds it, src/native/widgets.ts
// writes it as a JSON string under "snapshot.v1"). Only non-sensitive data: initials or first names,
// status labels, dates. Never passport, receipt or A-numbers.
import Foundation
import SwiftUI

let appGroup = "group.com.vijaykannan.casedesk"
let snapshotKey = "snapshot.v1"

struct WidgetPerson: Codable, Hashable {
  let id: String
  let name: String
  let status: String
  let until: String?
  let untilLabel: String?
  let url: String
}

struct WidgetDeadline: Codable, Hashable {
  let personId: String
  let who: String
  let what: String
  let date: String
  let url: String
}

struct WidgetCase: Codable, Hashable {
  let who: String
  let form: String
  let status: String
  let date: String?
  let url: String
}

struct WidgetBulletin: Codable, Hashable {
  let month: String
  let next: String?
}

struct WidgetSnapshot: Codable {
  let v: Int
  let updatedAt: String
  let locked: Bool
  let people: [WidgetPerson]
  let deadlines: [WidgetDeadline]
  let latestCase: WidgetCase?
  let bulletin: WidgetBulletin?
  let disclaimer: String

  static let empty = WidgetSnapshot(v: 1, updatedAt: "", locked: false, people: [], deadlines: [], latestCase: nil, bulletin: nil,
                                    disclaimer: "For personal reference — not an official document")

  /// Example data for the widget gallery (made-up people, never real data).
  static let preview = WidgetSnapshot(
    v: 1, updatedAt: "", locked: false,
    people: [
      WidgetPerson(id: "p1", name: "A", status: "H-1B", until: isoDate(daysFromNow: 210), untilLabel: "I-94", url: "casedesk://person/p1"),
      WidgetPerson(id: "p2", name: "B", status: "H-4", until: isoDate(daysFromNow: 210), untilLabel: "I-94", url: "casedesk://person/p2"),
      WidgetPerson(id: "p3", name: "C", status: "H-4", until: isoDate(daysFromNow: 45), untilLabel: "I-94", url: "casedesk://person/p3"),
    ],
    deadlines: [WidgetDeadline(personId: "p3", who: "C", what: "Passport expires", date: isoDate(daysFromNow: 45), url: "casedesk://person/p3")],
    latestCase: WidgetCase(who: "A", form: "I-129", status: "Pending", date: isoDate(daysFromNow: -12), url: "casedesk://"),
    bulletin: WidgetBulletin(month: "November 2026", next: isoDate(daysFromNow: 20)),
    disclaimer: "For personal reference — not an official document")

  static func load() -> WidgetSnapshot {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return .empty }
    var data: Data?
    if let s = defaults.string(forKey: snapshotKey) { data = s.data(using: .utf8) } else { data = defaults.data(forKey: snapshotKey) }
    guard let d = data, let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: d) else { return .empty }
    return snap
  }
}

// MARK: - dates

private let isoFormatter: DateFormatter = {
  let f = DateFormatter()
  f.calendar = Calendar(identifier: .gregorian)
  f.locale = Locale(identifier: "en_US_POSIX")
  f.timeZone = TimeZone.current
  f.dateFormat = "yyyy-MM-dd"
  return f
}()

func isoDate(daysFromNow n: Int) -> String {
  isoFormatter.string(from: Calendar.current.date(byAdding: .day, value: n, to: Date()) ?? Date())
}

/// Whole days from `now` to an ISO date (yyyy-MM-dd), counted on the calendar like the app (negative = past).
func daysUntil(_ iso: String?, from now: Date) -> Int? {
  guard let iso = iso, let d = isoFormatter.date(from: String(iso.prefix(10))) else { return nil }
  let cal = Calendar.current
  return cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: d)).day
}

func shortDate(_ iso: String?) -> String {
  guard let iso = iso, let d = isoFormatter.date(from: String(iso.prefix(10))) else { return "—" }
  return d.formatted(.dateTime.month(.abbreviated).day().year())
}

func daysText(_ n: Int) -> String {
  if n < 0 { return "Ended" }
  if n == 0 { return "Today" }
  return n == 1 ? "1 day" : "\(n) days"
}

// MARK: - urgency (mirrors urgencyFor() in src/core/widgets.ts: ≤ 30 days red, ≤ 90 amber, else green)

enum Urgency { case red, amber, green, none }

func urgency(_ days: Int?) -> Urgency {
  guard let d = days else { return .none }
  if d <= 30 { return .red }
  if d <= 90 { return .amber }
  return .green
}

extension Urgency {
  var color: Color {
    switch self {
    case .red: return .red
    case .amber: return .orange
    case .green: return .green
    case .none: return .secondary
    }
  }
  var word: String {
    switch self {
    case .red: return "Act soon"
    case .amber: return "Coming up"
    case .green: return "On track"
    case .none: return ""
    }
  }
}
