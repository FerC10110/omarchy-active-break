import QtQuick
import qs.Commons
import "BreakModel.js" as Model
import "I18n.js" as I18n

// One exercise: name, sets × reps, group and equipment, and the technique cue.
Rectangle {
  id: card
  property var exercise: null
  property string label: ""
  property var host: null
  property color foreground: Color.foreground
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.55)
  // Where to look for the exercise's demo image. Empty means no images.
  property string mediaDir: ""
  property var service: null
  readonly property string mediaSource: mediaDir !== "" && exercise && exercise.id
    && service && service.hasMedia(exercise.id)
    ? "file://" + mediaDir + "/" + exercise.id + ".gif" : ""
  readonly property string language: host ? host.language : "en"
  function t(s, args) { return I18n.t(s, card.language, args) }

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

    // The demo image, when there is one for this exercise. The images are
    // yours, not the plugin's: drop a <exercise id>.gif in the media folder
    // and it shows up here. An exercise without one simply has no image, and
    // the card closes up around it.
    Rectangle {
      visible: demo.status === Image.Ready
      anchors.horizontalCenter: parent.horizontalCenter
      width: Math.min(parent.width, Style.space(180))
      height: width
      radius: Style.cornerRadius
      color: "white"
      clip: true

      AnimatedImage {
        id: demo
        anchors.fill: parent
        source: card.mediaSource
        // Every frame of an animation is cached, so don't: these loop forever
        // while the panel is open.
        cache: false
        asynchronous: true
        playing: card.visible
        fillMode: Image.PreserveAspectFit
      }
    }

    Text {
      width: parent.width
      text: card.exercise ? card.exercise.name : card.t("The routine has no exercises")
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
      text: Model.prescription(card.exercise, card.t)
      textFormat: Text.PlainText
      color: card.accent
      font.family: card.fontFamily
      font.pixelSize: Style.font.display
      font.bold: true
    }

    Text {
      width: parent.width
      visible: card.exercise !== null
      text: Model.groupText(card.exercise, card.t) + " · " + Model.equipmentText(card.exercise, card.t)
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
      text: card.t("Moderate weight, stop short of failure: it's a break, not your workout of the day.")
      textFormat: Text.PlainText
      wrapMode: Text.Wrap
      color: card.dim
      font.family: card.fontFamily
      font.pixelSize: Style.font.caption
    }
  }
}
