import QtQuick
import qs.Commons
import qs.Ui
import "BreakModel.js" as Model

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

  readonly property var status: ({
    off: { title: "Outside work hours",
           detail: "Active " + (service ? service.scheduleText : "") + ". Change it in Settings." },
    working: { title: "Working",
               detail: "Next break at " + Model.clock(new Date(session.dueAt || now))
                       + " (in " + Model.minutesLeft((session.dueAt || now) - now) + ")" },
    due: { title: "Time to move!",
           detail: "Grab your gear and start. I'll remind you again every "
                   + (service ? service.config.renotify : 5) + " min." },
    "break": { title: "Break",
               detail: "Until " + Model.clock(new Date(session.breakEndsAt || now))
                       + ". Then the work timer starts again." },
    paused: { title: "Paused",
              detail: Model.minutesLeft(session.remainingMs || 0) + " of work left when you resume." }
  })[phase]

  readonly property var actions: ({
    off: [],
    working: [{ action: "startBreak", label: "Start now" }, { action: "pause", label: "Pause" },
              { action: "reroll", label: "Another exercise" }],
    due: [{ action: "startBreak", label: "Start", primary: true },
          { action: "snooze", label: "Snooze " + (service ? service.config.snooze : 10) + " min" },
          { action: "skip", label: "Skip" }, { action: "reroll", label: "Another exercise" }],
    "break": [{ action: "finishBreak", label: "Done", primary: true }, { action: "reroll", label: "Another exercise" }],
    paused: [{ action: "resume", label: "Resume", primary: true }]
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
      label: view.phase === "break" ? "Now" : (view.phase === "due" ? "Your turn" : "Up next")
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
