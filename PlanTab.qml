import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "BreakModel.js" as Model
import "I18n.js" as I18n

// Weekly plan tab of the routine editor: pick a day, name its focus and list
// the exercises weekly mode walks through, in order. Days outside work hours
// are dimmed but still editable.
Item {
  id: view

  property var host: null
  readonly property var draft: host ? host.draft : null
  readonly property string day: host ? host.selectedDay : "mon"
  readonly property var entry: draft && draft.plan[day] ? draft.plan[day] : ({ focus: "", exercises: [] })
  readonly property var workDays: host && host.service ? host.service.config.schedule.days : []
  readonly property bool typing: focusField.activeFocus || addDropdown.popupOpen
  readonly property color foreground: host ? host.foreground : Color.foreground
  readonly property color accent: host ? host.accent : Color.accent
  readonly property color dim: host ? host.dim : Qt.darker(Color.foreground, 1.55)
  readonly property string fontFamily: host ? host.fontFamily : Style.font.family

  function t(s, args) { return host ? host.t(s, args) : I18n.t(s, "en", args) }

  readonly property var dayChips: [
    { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" }, { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" }, { key: "sat", label: "Sat" },
    { key: "sun", label: "Sun" }
  ]

  // Filled, not bound, like the Exercises form.
  function load() {
    var d = host && host.draft ? host.draft.plan[host.selectedDay] : null
    focusField.text = d ? d.focus : ""
  }

  function move(from, to) {
    var d = day
    host.edit(function(r) { return Model.moveInDay(r, d, from, to) })
  }

  function remove(index) {
    var d = day
    host.edit(function(r) { return Model.removeFromDay(r, d, index) })
  }

  onHostChanged: load()
  onDayChanged: load()

  // Escape always closes the editor. The day chips and the ↑ ↓ × buttons
  // never take focus (kit Button.focusable defaults to false), so this is
  // for the two controls that do: the Focus field has its own handler below,
  // and the "Add exercise…" trigger only swallows Escape while its popup is
  // open, so this catches it when the trigger itself has focus.
  Keys.onEscapePressed: function(event) { view.host.requestClose(); event.accepted = true }

  Connections {
    target: view.host
    function onReloadForm(focusName) { view.load() }
  }

  ColumnLayout {
    anchors.fill: parent
    spacing: Style.space(8)

    Row {
      spacing: Style.space(4)
      Repeater {
        model: view.dayChips
        delegate: Button {
          required property var modelData
          readonly property bool working: view.workDays.indexOf(modelData.key) !== -1
          text: view.t(modelData.label)
          bordered: true
          selected: view.day === modelData.key
          opacity: working ? 1 : 0.55
          tooltipText: working ? "" : view.t("Outside your work hours")
          foreground: view.foreground
          accent: view.accent
          fontFamily: view.fontFamily
          fontSize: Style.font.bodySmall
          onClicked: view.host.selectedDay = modelData.key
        }
      }
    }

    PanelSectionHeader {
      text: view.t("Focus")
      foreground: view.foreground
      fontFamily: view.fontFamily
    }
    TextField {
      id: focusField
      Layout.preferredWidth: Style.space(320)
      placeholderText: view.t("e.g. Push")
      maximumLength: 40
      foreground: view.foreground
      font.family: view.fontFamily
      onTextEdited: {
        var d = view.day
        var t = text
        view.host.edit(function(r) { return Model.setFocus(r, d, t) })
      }
      Keys.onEscapePressed: function(event) { view.host.requestClose(); event.accepted = true }
    }

    PanelSectionHeader {
      text: view.t("Exercises, in order")
      foreground: view.foreground
      fontFamily: view.fontFamily
    }
    Text {
      visible: view.entry.exercises.length === 0
      text: view.t("No plan: any exercise from the catalog.")
      textFormat: Text.PlainText
      color: view.dim
      font.family: view.fontFamily
      font.pixelSize: Style.font.bodySmall
    }

    Flickable {
      id: dayFlick
      Layout.fillWidth: true
      Layout.fillHeight: true
      clip: true
      contentWidth: width
      contentHeight: dayList.implicitHeight
      boundsBehavior: Flickable.StopAtBounds

      Column {
        id: dayList
        width: dayFlick.width
        spacing: Style.space(4)

        Repeater {
          model: view.entry.exercises
          delegate: RowLayout {
            required property var modelData
            required property int index
            readonly property var exercise: Model.findExercise(view.draft, modelData)
            width: dayList.width
            spacing: Style.space(6)

            Text {
              Layout.fillWidth: true
              text: (index + 1) + ". " + (exercise && exercise.name !== "" ? exercise.name : view.t("New exercise"))
              textFormat: Text.PlainText
              elide: Text.ElideRight
              color: view.foreground
              font.family: view.fontFamily
              font.pixelSize: Style.font.body
            }
            Text {
              text: exercise ? Model.groupText(exercise, view.t) : ""
              textFormat: Text.PlainText
              color: view.dim
              font.family: view.fontFamily
              font.pixelSize: Style.font.bodySmall
            }
            Button {
              text: "↑"
              tooltipText: view.t("Earlier")
              bordered: true
              enabled: index > 0
              opacity: enabled ? 1 : 0.35
              foreground: view.foreground
              fontFamily: view.fontFamily
              fontSize: Style.font.bodySmall
              onClicked: view.move(index, index - 1)
            }
            Button {
              text: "↓"
              tooltipText: view.t("Later")
              bordered: true
              enabled: index < view.entry.exercises.length - 1
              opacity: enabled ? 1 : 0.35
              foreground: view.foreground
              fontFamily: view.fontFamily
              fontSize: Style.font.bodySmall
              onClicked: view.move(index, index + 1)
            }
            Button {
              text: "×"
              tooltipText: view.t("Remove from this day")
              bordered: true
              foreground: view.foreground
              fontFamily: view.fontFamily
              fontSize: Style.font.bodySmall
              onClicked: view.remove(index)
            }
          }
        }
      }
    }

    SearchableDropdown {
      id: addDropdown
      Layout.preferredWidth: Style.space(320)
      showLabel: false
      value: ""
      options: view.draft ? Model.dayOptions(view.draft, view.day, view.t) : []
      triggerLabel: view.t("Add exercise…")
      placeholderText: view.t("Search exercises")
      emptyText: view.t("Every exercise is already in this day")
      foreground: view.foreground
      accent: view.accent
      fontFamily: view.fontFamily
      onChanged: function(value) {
        var d = view.day
        view.host.edit(function(r) { return Model.addToDay(r, d, value) })
        addDropdown.value = ""   // back to "Add exercise…"
      }
    }
  }
}
