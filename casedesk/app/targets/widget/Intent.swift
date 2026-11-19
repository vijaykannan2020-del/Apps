// v2.8 Edit Widget (AppIntents, iOS 17+): long-press a widget → Edit Widget to choose whose data
// (Whole family or one person) and what it shows. People come from the App Group snapshot, in the
// name style chosen in the app (initials by default). While Face ID lock hides details the snapshot
// has no people, so only "Whole family" is offered.
import AppIntents
import WidgetKit

struct PersonEntity: AppEntity {
  let id: String
  let name: String

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Person" }
  static var defaultQuery: PersonQuery { PersonQuery() }

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }

  static var family: PersonEntity { PersonEntity(id: familyId, name: "Whole family") }
}

struct PersonQuery: EntityQuery {
  init() {}

  private func everyone() -> [PersonEntity] {
    let snap = WidgetSnapshot.load()
    return [PersonEntity.family] + snap.people.map { PersonEntity(id: $0.id, name: $0.name) }
  }

  func entities(for identifiers: [String]) async throws -> [PersonEntity] {
    let all = everyone()
    // Keep a chosen person even when the snapshot has no names right now (Face ID lock hides them).
    return identifiers.map { id in
      all.first(where: { $0.id == id }) ?? PersonEntity(id: id, name: id == familyId ? "Whole family" : "Person")
    }
  }

  func suggestedEntities() async throws -> [PersonEntity] {
    everyone()
  }

  func defaultResult() async -> PersonEntity? {
    PersonEntity.family
  }
}

/// Raw values match WIDGET_KINDS in src/core/widgets.ts (same order).
enum ShowItem: String, AppEnum {
  case status
  case deadline
  case passport
  case visa
  case i94
  case ead
  case ap
  case gc
  case caseUpdate = "case"
  case pd

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Show" }
  static var caseDisplayRepresentations: [ShowItem: DisplayRepresentation] {
    [
      .status: DisplayRepresentation(title: "Current status"),
      .deadline: DisplayRepresentation(title: "Next deadline"),
      .passport: DisplayRepresentation(title: "Passport"),
      .visa: DisplayRepresentation(title: "Visa stamp"),
      .i94: DisplayRepresentation(title: "I-94"),
      .ead: DisplayRepresentation(title: "EAD (work permit)"),
      .ap: DisplayRepresentation(title: "Advance parole"),
      .gc: DisplayRepresentation(title: "Green card stage"),
      .caseUpdate: DisplayRepresentation(title: "Latest case update"),
      .pd: DisplayRepresentation(title: "Priority date"),
    ]
  }
}

struct ConfigIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource { "Immigration Wallet" }
  static var description: IntentDescription { IntentDescription("Choose whose details and what this widget shows. For personal reference — not an official document.") }

  @Parameter(title: "Person")
  var person: PersonEntity?

  @Parameter(title: "Show", default: .status)
  var show: ShowItem

  init() {}
}
