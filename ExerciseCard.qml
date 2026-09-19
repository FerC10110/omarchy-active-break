import QtQuick
import qs.Commons
import "BreakModel.js" as Model

// One exercise: name, sets × reps, group and equipment, and the technique cue.
Rectangle {
  id: card
  property var exercise: null
  property string label: ""
  property color foreground: Color.foreground
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.55)

  implicitHeight: column.implicitHeight + Style.space(24)
  radius: Style.cornerRadius
  color: Util.alpha(foreground, 0.06)
  border.width: 1
  border.color: Util.alpha(foreground, 0.12)

  Column {
    id: column
    anchors { left: parent.left; right: parent.right; top: parent.top; margins: Style.space(12) }
    spacing: Style.space(4)

    Text {
      width: parent.width
      visible: card.label !== ""
      text: card.label
      textFormat: Text.PlainText
      color: card.dim
      font.family: card.fontFamily
      font.pixelSize: Style.font.caption
    }

    Text {
      width: parent.width
      text: card.exercise ? card.exercise.name : "The routine has no exercises"
      textFormat: Text.PlainText
      wrapMode: Text.Wrap
      color: card.foreground
      font.family: card.fontFamily
      font.pixelSize: Style.font.heading
      font.bold: true
    }

    Text {
      width: parent.width
      visible: card.exercise !== null
      text: Model.prescription(card.exercise)
      textFormat: Text.PlainText
      color: card.accent
      font.family: card.fontFamily
      font.pixelSize: Style.font.display
      font.bold: true
    }

    Text {
      width: parent.width
      visible: card.exercise !== null
      text: Model.groupText(card.exercise) + " · " + Model.equipmentText(card.exercise)
      textFormat: Text.PlainText
      wrapMode: Text.Wrap
      color: card.dim
      font.family: card.fontFamily
      font.pixelSize: Style.font.bodySmall
    }

    Text {
      width: parent.width
      visible: card.exercise !== null && card.exercise.cue !== ""
      topPadding: Style.space(4)
      text: card.exercise ? card.exercise.cue : ""
      textFormat: Text.PlainText
      wrapMode: Text.Wrap
      color: card.foreground
      font.family: card.fontFamily
      font.pixelSize: Style.font.body
    }

    Text {
      width: parent.width
      visible: card.exercise !== null
      topPadding: Style.space(4)
      text: "Moderate weight, stop short of failure: it's a break, not your workout of the day."
      textFormat: Text.PlainText
      wrapMode: Text.Wrap
      color: card.dim
      font.family: card.fontFamily
      font.pixelSize: Style.font.caption
    }
  }
}
