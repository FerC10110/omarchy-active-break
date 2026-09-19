import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "BreakModel.js" as Model

// Exercises tab of the routine editor: the catalog on the left, grouped by
// muscle group, and the selected exercise's form on the right. Every change
// goes straight into the editor's draft through host.edit().
Item {
  id: view

  property var host: null
  property string query: ""
  readonly property var draft: host ? host.draft : null
  readonly property var exercise: draft && host ? Model.findExercise(draft, host.selectedId) : null
  readonly property var sections: draft ? Model.catalogSections(draft, query) : []
  readonly property bool typing: searchField.activeFocus || nameField.activeFocus || repsField.activeFocus
                                 || cueField.activeFocus || setsField.field.activeFocus
  readonly property color foreground: host ? host.foreground : Color.foreground
  readonly property color accent: host ? host.accent : Color.accent
  readonly property color dim: host ? host.dim : Qt.darker(Color.foreground, 1.55)
  readonly property string fontFamily: host ? host.fontFamily : Style.font.family

  // The text fields are filled here instead of bound, so the draft changing
  // under them never moves the cursor. Reads host.draft directly: inside
  // onHostChanged the `exercise` binding can still hold its null fallback.
  function load(focusName) {
    var ex = host && host.draft ? Model.findExercise(host.draft, host.selectedId) : null
    nameField.text = ex ? ex.name : ""
    repsField.text = ex ? ex.reps : ""
    cueField.text = ex ? ex.cue : ""
    if (focusName) Qt.callLater(function() { nameField.forceActiveFocus() })
  }

  function focusFirst() { searchField.forceActiveFocus() }

  function change(fields) {
    var id = host.selectedId
    host.edit(function(r) { return Model.updateExercise(r, id, fields) })
  }

  onHostChanged: load(false)

  Connections {
    target: view.host
    function onReloadForm(focusName) { view.load(focusName) }
  }

  RowLayout {
    anchors.fill: parent
    spacing: Style.space(16)

    // ---- the catalog
    ColumnLayout {
      Layout.preferredWidth: Style.space(250)
      Layout.fillWidth: false
      Layout.fillHeight: true
      spacing: Style.space(6)

      TextField {
        id: searchField
        Layout.fillWidth: true
        placeholderText: "Search exercises"
        foreground: view.foreground
        font.family: view.fontFamily
        onTextEdited: view.query = text
        Keys.onEscapePressed: function(event) { view.host.requestClose(); event.accepted = true }
      }

      Flickable {
        id: listFlick
        Layout.fillWidth: true
        Layout.fillHeight: true
        clip: true
        contentWidth: width
        contentHeight: listColumn.implicitHeight
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: listColumn
          width: listFlick.width
          spacing: Style.space(2)

          Text {
            visible: view.sections.length === 0
            width: listColumn.width
            text: "No exercises match."
            textFormat: Text.PlainText
            color: view.dim
            font.family: view.fontFamily
            font.pixelSize: Style.font.bodySmall
          }

          Repeater {
            model: view.sections
            delegate: Column {
              required property var modelData
              width: listColumn.width
              spacing: Style.space(2)

              PanelSectionHeader {
                text: modelData.name
                foreground: view.foreground
                fontFamily: view.fontFamily
              }

              Repeater {
                model: modelData.exercises
                delegate: Rectangle {
                  required property var modelData
                  readonly property bool current: view.host !== null && modelData.id === view.host.selectedId
                  width: listColumn.width
                  height: Style.space(28)
                  radius: Style.cornerRadius
                  color: current ? Util.alpha(view.accent, 0.18)
                                 : (rowMouse.containsMouse ? Util.alpha(view.foreground, 0.06) : "transparent")

                  Text {
                    anchors.left: parent.left
                    anchors.leftMargin: Style.space(8)
                    anchors.right: presc.left
                    anchors.rightMargin: Style.space(8)
                    anchors.verticalCenter: parent.verticalCenter
                    text: modelData.name !== "" ? modelData.name : "New exercise"
                    textFormat: Text.PlainText
                    elide: Text.ElideRight
                    color: modelData.name !== "" ? view.foreground : view.dim
                    font.family: view.fontFamily
                    font.pixelSize: Style.font.body
                  }
                  Text {
                    id: presc
                    anchors.right: parent.right
                    anchors.rightMargin: Style.space(8)
                    anchors.verticalCenter: parent.verticalCenter
                    text: Model.prescription(modelData)
                    textFormat: Text.PlainText
                    color: view.dim
                    font.family: view.fontFamily
                    font.pixelSize: Style.font.bodySmall
                  }
                  MouseArea {
                    id: rowMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: view.host.select(modelData.id, false)
                  }
                }
              }
            }
          }
        }
      }

      Button {
        Layout.fillWidth: true
        text: "+ New exercise"
        bordered: true
        foreground: view.foreground
        accent: view.accent
        fontFamily: view.fontFamily
        fontSize: Style.font.bodySmall
        onClicked: {
          searchField.text = ""
          view.query = ""
          view.host.addExercise()
        }
      }
    }

    // ---- the selected exercise
    Item {
      Layout.fillWidth: true
      Layout.fillHeight: true

      Text {
        visible: view.exercise === null
        anchors.centerIn: parent
        text: "Pick an exercise or add a new one."
        textFormat: Text.PlainText
        color: view.dim
        font.family: view.fontFamily
        font.pixelSize: Style.font.body
      }

      Flickable {
        id: formFlick
        anchors.fill: parent
        visible: view.exercise !== null
        clip: true
        contentWidth: width
        contentHeight: form.implicitHeight
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: form
          width: formFlick.width
          spacing: Style.space(8)

          PanelSectionHeader {
            text: "Name"
            foreground: view.foreground
            fontFamily: view.fontFamily
          }
          TextField {
            id: nameField
            width: form.width
            placeholderText: "e.g. Goblet squat"
            maximumLength: 60
            foreground: view.foreground
            font.family: view.fontFamily
            onTextEdited: view.change({ name: text })
            Keys.onEscapePressed: function(event) { view.host.requestClose(); event.accepted = true }
          }

          PanelSectionHeader {
            text: "Group"
            foreground: view.foreground
            fontFamily: view.fontFamily
          }
          ButtonGroup {
            options: Model.GROUP_ORDER.map(function(g) { return { value: g, label: Model.GROUP_NAMES[g] } })
            value: view.exercise ? view.exercise.group : ""
            foreground: view.foreground
            accent: view.accent
            fontFamily: view.fontFamily
            fontSize: Style.font.bodySmall
            onChanged: function(value) { view.change({ group: value }) }
          }

          PanelSectionHeader {
            text: "Equipment"
            foreground: view.foreground
            fontFamily: view.fontFamily
          }
          Flow {
            width: form.width
            spacing: Style.space(4)
            Repeater {
              model: Model.EQUIPMENT_ORDER
              delegate: Button {
                required property var modelData
                text: Model.EQUIPMENT_NAMES[modelData]
                bordered: true
                selected: view.exercise !== null && view.exercise.equipment.indexOf(modelData) !== -1
                foreground: view.foreground
                accent: view.accent
                fontFamily: view.fontFamily
                fontSize: Style.font.bodySmall
                onClicked: {
                  var id = view.host.selectedId
                  var key = modelData
                  view.host.edit(function(r) { return Model.toggleEquipment(r, id, key) })
                }
              }
            }
          }
          Text {
            visible: view.exercise !== null && view.exercise.equipment.length === 0
            text: "No equipment: bodyweight"
            textFormat: Text.PlainText
            color: view.dim
            font.family: view.fontFamily
            font.pixelSize: Style.font.bodySmall
          }

          Row {
            spacing: Style.space(16)

            NumberField {
              id: setsField
              label: "Sets"
              value: view.exercise ? view.exercise.sets : 3
              from: 1
              to: 10
              foreground: view.foreground
              accent: view.accent
              fontFamily: view.fontFamily
              onModified: function(value) { view.change({ sets: value }) }
            }
            Column {
              spacing: Style.spacing.md
              Text {
                text: "Reps"
                textFormat: Text.PlainText
                color: Qt.darker(view.foreground, 1.4)
                font.family: view.fontFamily
                font.pixelSize: Style.font.bodySmall
              }
              TextField {
                id: repsField
                width: Style.space(200)
                placeholderText: "10, 8/leg, max, 40 s"
                maximumLength: 20
                foreground: view.foreground
                font.family: view.fontFamily
                onTextEdited: view.change({ reps: text })
                Keys.onEscapePressed: function(event) { view.host.requestClose(); event.accepted = true }
              }
            }
          }

          PanelSectionHeader {
            text: "Technique cue"
            foreground: view.foreground
            fontFamily: view.fontFamily
          }
          TextField {
            id: cueField
            width: form.width
            placeholderText: "One line to keep in mind while you lift"
            maximumLength: 160
            foreground: view.foreground
            font.family: view.fontFamily
            onTextEdited: view.change({ cue: text })
            Keys.onEscapePressed: function(event) { view.host.requestClose(); event.accepted = true }
          }

          Item { width: 1; height: Style.space(6) }

          Button {
            text: "Delete exercise"
            bordered: true
            enabled: view.draft !== null && view.draft.exercises.length > 1
            opacity: enabled ? 1 : 0.4
            foreground: view.host ? view.host.urgent : Color.urgent
            fontFamily: view.fontFamily
            fontSize: Style.font.bodySmall
            onClicked: view.host.requestDelete()
          }
        }
      }
    }
  }
}
