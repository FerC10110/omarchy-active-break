import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "BreakModel.js" as Model

// Durations, how the exercise is chosen, work hours and sound. Saved to
// ~/.config/active-break/config.json; the routine has its own editor (RoutineEditor.qml).
Item {
  id: view
  property var host: null
  property int work: 30
  property int breakMin: 10
  property int renotify: 5
  property int snooze: 10
  property string mode: "weekly"
  property var days: []
  property bool sound: true
  property string error: ""
  readonly property bool typing: startField.activeFocus || endField.activeFocus || workField.field.activeFocus
                                 || breakField.field.activeFocus || renotifyField.field.activeFocus
                                 || snoozeField.field.activeFocus
  readonly property color foreground: host ? host.foreground : Color.foreground
  readonly property color accent: host ? host.accent : Color.accent
  readonly property string fontFamily: host ? host.fontFamily : Style.font.family

  readonly property var dayChips: [
    { key: "mon", label: "Mo" }, { key: "tue", label: "Tu" }, { key: "wed", label: "We" }, { key: "thu", label: "Th" },
    { key: "fri", label: "Fr" }, { key: "sat", label: "Sa" }, { key: "sun", label: "Su" }
  ]

  implicitHeight: column.implicitHeight

  function seed() {
    if (!host || !host.service) return
    var c = host.service.config
    work = c.work
    breakMin = c["break"]
    renotify = c.renotify
    snooze = c.snooze
    mode = c.mode
    days = c.schedule.days.slice()
    sound = c.sound
    startField.text = c.schedule.start
    endField.text = c.schedule.end
  }

  // Views get `host` after their own onCompleted, so seed here.
  onHostChanged: seed()

  function toggleDay(key) {
    var next = days.slice()
    var i = next.indexOf(key)
    if (i === -1) next.push(key)
    else next.splice(i, 1)
    days = next
  }

  function save() {
    // NumberField commits typed text on focus loss; move focus first so the
    // values read below are current (same as Recognition's settings).
    host.focusKeys()
    var start = startField.text.trim()
    var end = endField.text.trim()
    if (Model.parseClock(start) === null || Model.parseClock(end) === null) {
      error = "Times go as HH:MM, for example 09:00."
      return
    }
    if (Model.parseClock(start) >= Model.parseClock(end)) {
      error = "The start time must be before the end time."
      return
    }
    host.saveConfig({ work: work, "break": breakMin, renotify: renotify, snooze: snooze, mode: mode,
                      sound: sound, schedule: { days: days, start: start, end: end } })
  }

  Flickable {
    id: flick
    anchors.fill: parent
    clip: true
    contentWidth: width
    contentHeight: column.implicitHeight
    boundsBehavior: Flickable.StopAtBounds
    interactive: contentHeight > height

    Column {
      id: column
      width: flick.width
      spacing: Style.space(8)

      PanelSectionHeader {
        text: "Times (minutes)"
        foreground: view.foreground
        fontFamily: view.fontFamily
      }
      NumberField {
        id: workField
        label: "Work between breaks"
        value: view.work
        from: 1
        to: 240
        foreground: view.foreground
        fontFamily: view.fontFamily
        onModified: function(value) { view.work = value }
      }
      NumberField {
        id: breakField
        label: "Break length"
        value: view.breakMin
        from: 1
        to: 60
        foreground: view.foreground
        fontFamily: view.fontFamily
        onModified: function(value) { view.breakMin = value }
      }
      NumberField {
        id: renotifyField
        label: "Remind again every"
        value: view.renotify
        from: 1
        to: 60
        foreground: view.foreground
        fontFamily: view.fontFamily
        onModified: function(value) { view.renotify = value }
      }
      NumberField {
        id: snoozeField
        label: "Snooze for"
        value: view.snooze
        from: 1
        to: 120
        foreground: view.foreground
        fontFamily: view.fontFamily
        onModified: function(value) { view.snooze = value }
      }

      PanelSectionHeader {
        text: "How to pick the exercise"
        foreground: view.foreground
        fontFamily: view.fontFamily
      }
      ButtonGroup {
        options: [
          { value: "weekly", label: "Weekly plan", tooltip: "Each day has a focus and its list is worked through in order" },
          { value: "rotation", label: "Rotation", tooltip: "Legs → push → hinge → pull → core" },
          { value: "random", label: "Random", tooltip: "Anything from the catalog, never the previous one" }
        ]
        value: view.mode
        foreground: view.foreground
        accent: view.accent
        fontFamily: view.fontFamily
        fontSize: Style.font.bodySmall
        onChanged: function(value) { view.mode = value }
      }

      PanelSectionHeader {
        text: "Work hours"
        foreground: view.foreground
        fontFamily: view.fontFamily
      }
      Row {
        spacing: Style.space(4)
        Repeater {
          model: view.dayChips
          delegate: Button {
            required property var modelData
            text: modelData.label
            bordered: true
            selected: view.days.indexOf(modelData.key) !== -1
            foreground: view.foreground
            accent: view.accent
            fontFamily: view.fontFamily
            fontSize: Style.font.bodySmall
            onClicked: view.toggleDay(modelData.key)
          }
        }
      }
      RowLayout {
        width: column.width
        spacing: Style.space(6)
        Text {
          text: "From"
          textFormat: Text.PlainText
          color: view.foreground
          font.family: view.fontFamily
          font.pixelSize: Style.font.body
        }
        TextField {
          id: startField
          Layout.preferredWidth: Style.space(80)
          placeholderText: "09:00"
          foreground: view.foreground
          font.family: view.fontFamily
          Keys.onEscapePressed: function(event) { view.host.back(); event.accepted = true }
          Keys.onReturnPressed: function(event) { view.save(); event.accepted = true }
        }
        Text {
          text: "to"
          textFormat: Text.PlainText
          color: view.foreground
          font.family: view.fontFamily
          font.pixelSize: Style.font.body
        }
        TextField {
          id: endField
          Layout.preferredWidth: Style.space(80)
          placeholderText: "18:00"
          foreground: view.foreground
          font.family: view.fontFamily
          Keys.onEscapePressed: function(event) { view.host.back(); event.accepted = true }
          Keys.onReturnPressed: function(event) { view.save(); event.accepted = true }
        }
        Item { Layout.fillWidth: true }
      }

      Toggle {
        width: column.width
        label: "Sound"
        description: "A chime with every notification"
        checked: view.sound
        foreground: view.foreground
        accent: view.accent
        fontFamily: view.fontFamily
        onClicked: view.sound = !view.sound
      }

      PanelSectionHeader {
        text: "Routine"
        foreground: view.foreground
        fontFamily: view.fontFamily
      }
      Text {
        width: column.width
        text: "Exercises, the weekly plan and the rotation order."
        textFormat: Text.PlainText
        wrapMode: Text.Wrap
        color: view.host ? view.host.dim : view.foreground
        font.family: view.fontFamily
        font.pixelSize: Style.font.bodySmall
      }
      Button {
        text: "Edit routine"
        bordered: true
        foreground: view.foreground
        fontFamily: view.fontFamily
        fontSize: Style.font.bodySmall
        onClicked: {
          var service = view.host.service
          view.host.close()   // close first so the editor gets the keyboard
          service.openEditor()
        }
      }

      Text {
        visible: view.error !== ""
        width: column.width
        text: view.error
        textFormat: Text.PlainText
        wrapMode: Text.Wrap
        color: view.host ? view.host.urgent : Color.urgent
        font.family: view.fontFamily
        font.pixelSize: Style.font.bodySmall
      }

      RowLayout {
        width: column.width
        spacing: Style.space(6)
        Item { Layout.fillWidth: true }
        Button {
          text: "Cancel"
          bordered: true
          foreground: view.foreground
          fontFamily: view.fontFamily
          onClicked: view.host.back()
        }
        Button {
          text: "Save"
          bordered: true
          foreground: view.accent
          fontFamily: view.fontFamily
          onClicked: view.save()
        }
      }
    }
  }
}
