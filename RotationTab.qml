import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "BreakModel.js" as Model

// Rotation tab of the routine editor: the order rotation mode walks the
// muscle groups in, one exercise per break. Groups left out sit below, dimmed.
Item {
  id: view

  property var host: null
  readonly property var draft: host ? host.draft : null
  readonly property var rows: draft ? Model.rotationRows(draft) : []
  readonly property int included: draft ? draft.rotation.length : 0
  readonly property bool typing: false
  readonly property color foreground: host ? host.foreground : Color.foreground
  readonly property color accent: host ? host.accent : Color.accent
  readonly property color urgent: host ? host.urgent : Color.urgent
  readonly property color dim: host ? host.dim : Qt.darker(Color.foreground, 1.55)
  readonly property string fontFamily: host ? host.fontFamily : Style.font.family

  function move(from, to) { host.edit(function(r) { return Model.moveGroup(r, from, to) }) }
  function toggle(group) { host.edit(function(r) { return Model.toggleGroup(r, group) }) }

  // Escape always closes the editor, even from a focused control without its
  // own handler (the ↑ ↓ buttons and the switch have none).
  Keys.onEscapePressed: function(event) { view.host.requestClose(); event.accepted = true }

  ColumnLayout {
    anchors.fill: parent
    spacing: Style.space(8)

    Text {
      Layout.fillWidth: true
      text: "In rotation mode each break takes the next group in this list and picks one of its exercises."
      textFormat: Text.PlainText
      wrapMode: Text.Wrap
      color: view.dim
      font.family: view.fontFamily
      font.pixelSize: Style.font.bodySmall
    }
    Text {
      Layout.fillWidth: true
      visible: view.draft !== null && view.included === 0
      text: "Rotation is empty: exercises are picked at random."
      textFormat: Text.PlainText
      wrapMode: Text.Wrap
      color: view.urgent
      font.family: view.fontFamily
      font.pixelSize: Style.font.bodySmall
    }

    Repeater {
      model: view.rows
      delegate: RowLayout {
        required property var modelData
        required property int index
        Layout.fillWidth: true
        spacing: Style.space(8)
        opacity: modelData.included ? 1 : 0.55

        Text {
          Layout.preferredWidth: Style.space(90)
          text: modelData.name
          textFormat: Text.PlainText
          color: view.foreground
          font.family: view.fontFamily
          font.pixelSize: Style.font.body
          font.bold: modelData.included
        }
        Text {
          Layout.fillWidth: true
          text: modelData.detail
          textFormat: Text.PlainText
          color: modelData.included && modelData.count === 0 ? view.urgent : view.dim
          font.family: view.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
        Button {
          text: "↑"
          tooltipText: "Earlier"
          bordered: true
          enabled: modelData.included && index > 0
          opacity: enabled ? 1 : 0.35
          foreground: view.foreground
          fontFamily: view.fontFamily
          fontSize: Style.font.bodySmall
          onClicked: view.move(index, index - 1)
        }
        Button {
          text: "↓"
          tooltipText: "Later"
          bordered: true
          enabled: modelData.included && index < view.included - 1
          opacity: enabled ? 1 : 0.35
          foreground: view.foreground
          fontFamily: view.fontFamily
          fontSize: Style.font.bodySmall
          onClicked: view.move(index, index + 1)
        }
        ToggleSwitch {
          checked: modelData.included
          foreground: view.foreground
          accent: view.accent
          onToggled: view.toggle(modelData.group)
        }
      }
    }

    Item { Layout.fillHeight: true }
  }
}
