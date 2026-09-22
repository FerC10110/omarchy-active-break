import QtQuick
import qs.Commons
import qs.Ui
import "BreakModel.js" as Model
import "I18n.js" as I18n

// Main view: where the clock is, the exercise that comes next (or now), and
// the actions that fit the current phase.
Item {
  id: view
  property var host: null
  readonly property bool typing: false
  readonly property var service: host ? host.service : null
  readonly property var session: service ? service.session : Model.initialState()
  readonly property string phase: service && service.ready ? session.phase : "off"
  readonly property real now: service ? service.now : Date.now()
  readonly property color foreground: host ? host.foreground : Color.foreground
  readonly property color accent: host ? host.accent : Color.accent
  readonly property color dim: host ? host.dim : Qt.darker(Color.foreground, 1.55)
  readonly property string fontFamily: host ? host.fontFamily : Style.font.family
  readonly property string language: host ? host.language : "en"
  function t(s, args) { return I18n.t(s, view.language, args) }

  readonly property var status: ({
    off: { title: view.t("Outside work hours"),
           detail: view.t("Active %1. Change it in Settings.", [service ? service.scheduleText : ""]) },
    working: { title: view.t("Working"),
               detail: view.t("Next break at %1 (in %2)", [Model.clock(new Date(session.dueAt || now)),
                              Model.minutesLeft((session.dueAt || now) - now)]) },
    due: { title: view.t("Time to move!"),
           detail: view.t("Grab your gear and start. I'll remind you again every %1 min.",
                          [service ? service.config.renotify : 5]) },
    "break": { title: view.t("Break"),
               detail: view.t("Until %1. Then the work timer starts again.",
                              [Model.clock(new Date(session.breakEndsAt || now))]) },
    paused: { title: view.t("Paused"),
              detail: view.t("%1 of work left when you resume.", [Model.minutesLeft(session.remainingMs || 0)]) }
  })[phase]

  readonly property var actions: ({
    off: [],
    working: [{ action: "startBreak", label: view.t("Start now") }, { action: "pause", label: view.t("Pause") },
              { action: "reroll", label: view.t("Another exercise") }],
    due: [{ action: "startBreak", label: view.t("Start"), primary: true },
          { action: "snooze", label: view.t("Snooze %1 min", [service ? service.config.snooze : 10]) },
          { action: "skip", label: view.t("Skip") }, { action: "reroll", label: view.t("Another exercise") }],
    "break": [{ action: "finishBreak", label: view.t("Done"), primary: true },
              { action: "reroll", label: view.t("Another exercise") }],
    paused: [{ action: "resume", label: view.t("Resume"), primary: true }]
  })[phase]

  implicitHeight: column.implicitHeight

  Column {
    id: column
    width: view.width
    spacing: Style.space(8)

    Text {
      width: parent.width
      text: view.status.title
      textFormat: Text.PlainText
      color: view.phase === "due" ? (view.host ? view.host.urgent : Color.urgent) : view.foreground
      font.family: view.fontFamily
      font.pixelSize: Style.font.title
      font.bold: true
    }

    Text {
      width: parent.width
      text: view.status.detail
      textFormat: Text.PlainText
      wrapMode: Text.Wrap
      color: view.dim
      font.family: view.fontFamily
      font.pixelSize: Style.font.bodySmall
    }

    Text {
      width: parent.width
      visible: view.phase === "break"
      text: Model.clockLeft((view.session.breakEndsAt || view.now) - view.now)
      textFormat: Text.PlainText
      horizontalAlignment: Text.AlignHCenter
      color: view.accent
      font.family: view.fontFamily
      font.pixelSize: Style.font.displayLarge * 2
      font.bold: true
    }

    ExerciseCard {
      width: parent.width
      visible: view.phase !== "off"
      exercise: view.service ? view.service.exercise : null
      label: view.phase === "break" ? view.t("Now") : (view.phase === "due" ? view.t("Your turn") : view.t("Up next"))
      host: view.host
      mediaDir: view.service ? view.service.mediaDir : ""
      service: view.service
      foreground: view.foreground
      accent: view.accent
      fontFamily: view.fontFamily
    }

    Flow {
      width: parent.width
      spacing: Style.space(6)
      Repeater {
        model: view.actions
        delegate: Button {
          required property var modelData
          text: modelData.label
          bordered: true
          foreground: modelData.primary ? view.accent : view.foreground
          fontFamily: view.fontFamily
          fontSize: Style.font.bodySmall
          onClicked: view.host.act(modelData.action)
        }
      }
    }
  }
}
