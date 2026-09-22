import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "BreakModel.js" as Model
import "I18n.js" as I18n

// The routine editor: a card in the middle of the focused screen over a
// dimmed background, like Omarchy's menus and Readily's centered card.
// Service.qml creates it only while it's open and hands it `service`.
//
// Everything edits `draft`, a copy of the service's routine; the tabs change
// it through edit() and nothing touches routine.json until Save. The tabs are
// separate files loaded one at a time; each gets `host` (this editor).
Item {
  id: editor

  property var service: null
  property var draft: null
  property string tab: "exercises"
  property string selectedId: ""                          // Exercises tab
  property string selectedDay: Model.dayKey(new Date())    // Weekly plan tab
  property string confirmKind: ""                         // delete | restore | discard

  readonly property var tabs: [{ value: "exercises", label: editor.t("Exercises") }, { value: "plan", label: editor.t("Weekly plan") },
                               { value: "rotation", label: editor.t("Rotation") }]
  readonly property var tabFiles: ({ exercises: "ExercisesTab.qml", plan: "PlanTab.qml", rotation: "RotationTab.qml" })
  readonly property bool dirty: draft !== null && service !== null && !Model.sameRoutine(draft, service.routine)
  readonly property string problem: draft !== null ? Model.routineProblem(draft, editor.t) : ""

  readonly property color foreground: Color.foreground
  readonly property color accent: Color.accent
  readonly property color urgent: Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: Style.font.family

  readonly property string language: service ? service.language : "en"
  function t(s, args) { return I18n.t(s, editor.language, args) }

  // The draft was replaced or the selection moved: tabs refill their text
  // fields (they aren't bound, so typing never fights the draft).
  signal reloadForm(bool focusName)

  // Service sets `service` right after creating the editor.
  onServiceChanged: if (service && draft === null) start()

  function start() {
    draft = Model.cloneRoutine(service.routine)
    select(Model.catalogIds(draft)[0] || "", false)
    focusTab()
  }

  // ---- the `host` API for tabs

  function edit(fn) { draft = fn(draft) }

  function select(id, focusName) {
    keyCatcher.forceActiveFocus()   // commit a Sets value typed for the previous selection
    selectedId = id
    reloadForm(focusName === true)
  }

  function addExercise() {
    var current = Model.findExercise(draft, selectedId)
    var made = Model.newExercise(draft, current ? current.group : "legs")
    draft = made.routine
    select(made.id, true)
  }

  function requestDelete() {
    if (Model.findExercise(draft, selectedId)) ask("delete")
  }

  function requestClose() {
    keyCatcher.forceActiveFocus()   // a number typed in Sets commits on focus loss
    if (confirm.opened) closeConfirm()
    else if (dirty) ask("discard")
    else service.closeEditor()
  }

  function save() {
    if (confirm.opened) return
    keyCatcher.forceActiveFocus()   // a number typed in Sets commits on focus loss
    if (problem !== "") return
    if (!service) return
    if (!dirty && service.routineError === "") {
      service.closeEditor()
      return
    }
    if (service.saveRoutine(Model.finalizeIds(draft))) service.closeEditor()
  }

  function focusTab() {
    Qt.callLater(function() {
      if (tabLoader.item && tabLoader.item.focusFirst) tabLoader.item.focusFirst()
      else keyCatcher.forceActiveFocus()
    })
  }

  // ---- confirmations

  // The dialog's texts are bindings on confirmKind in the ConfirmDialog below
  // (not set here) so a language change while it's open still reaches them.
  function ask(kind) {
    confirmKind = kind
    confirm.selectedIndex = 0
    confirm.opened = true
    keyCatcher.forceActiveFocus()
  }

  function closeConfirm() {
    confirm.opened = false
    confirmKind = ""
    focusTab()
  }

  function confirmAction() {
    var kind = confirmKind
    confirm.opened = false
    confirmKind = ""
    if (kind === "discard") {
      service.closeEditor()
      return
    }
    if (kind === "delete") {
      var next = Model.selectionAfterRemove(draft, selectedId)
      draft = Model.removeExercise(draft, selectedId)
      select(next, false)
    } else if (kind === "restore") {
      draft = service.defaultRoutine()
      select(Model.catalogIds(draft)[0] || "", false)
    }
    focusTab()
  }

  PanelWindow {
    id: window
    visible: true
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "io.github.ferc10110.active-break.editor"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

    Rectangle {
      anchors.fill: parent
      color: Color.menu.scrim
    }

    MouseArea {
      anchors.fill: parent
      acceptedButtons: Qt.AllButtons
      onClicked: editor.requestClose()
    }

    BorderSurface {
      id: card
      anchors.centerIn: parent
      width: Math.round(Math.min(Style.space(760), window.width - Style.gapsOut * 2))
      height: Math.round(Math.min(Style.space(560), window.height - Style.gapsOut * 2))
      color: Color.popups.background
      borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.space(2)))
      padding: Style.spacing.popupPadding
      radius: Style.cornerRadius

      // Clicks on the card stay on the card.
      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.AllButtons
      }

      Item {
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset

        // Ctrl+S from anywhere: text fields pass on keys they don't use, and
        // so does the catcher below while it's blocked.
        Keys.onPressed: function(event) {
          if ((event.modifiers & Qt.ControlModifier) && event.key === Qt.Key_S) {
            editor.save()
            event.accepted = true
          }
        }

        PanelKeyCatcher {
          id: keyCatcher
          anchors.fill: parent
          // While a text field owns the keyboard, letters and Escape must reach it.
          blocked: !confirm.opened && tabLoader.item !== null && tabLoader.item.typing === true
          onCloseRequested: editor.requestClose()
          onTabRequested: function(direction) {
            if (confirm.opened) {
              confirm.selectedIndex = confirm.selectedIndex === 0 ? 1 : 0
              return
            }
            var next = keyCatcher.nextItemInFocusChain(direction > 0)
            if (next) next.forceActiveFocus()
          }
          onMoveRequested: function(dx, dy) {
            if (confirm.opened && dx !== 0) confirm.selectedIndex = confirm.selectedIndex === 0 ? 1 : 0
          }
          onActivateRequested: {
            if (!confirm.opened) return
            if (confirm.selectedIndex === 0) editor.closeConfirm()
            else editor.confirmAction()
          }

          ColumnLayout {
            anchors.fill: parent
            spacing: Style.space(10)

            RowLayout {
              Layout.fillWidth: true
              spacing: Style.space(12)

              Text {
                text: editor.t("Routine")
                textFormat: Text.PlainText
                color: editor.foreground
                font.family: editor.fontFamily
                font.pixelSize: Style.font.title
                font.bold: true
              }
              ButtonGroup {
                options: editor.tabs
                value: editor.tab
                foreground: editor.foreground
                accent: editor.accent
                fontFamily: editor.fontFamily
                fontSize: Style.font.bodySmall
                onChanged: function(value) {
                  keyCatcher.forceActiveFocus()   // commit a Sets value typed for the previous selection
                  editor.tab = value
                  editor.focusTab()
                }
              }
              Item { Layout.fillWidth: true }
              Button {
                text: editor.t("Restore defaults")
                bordered: true
                foreground: editor.foreground
                accent: editor.accent
                fontFamily: editor.fontFamily
                fontSize: Style.font.bodySmall
                onClicked: editor.ask("restore")
              }
            }

            Loader {
              id: tabLoader
              Layout.fillWidth: true
              Layout.fillHeight: true
              active: editor.draft !== null
              source: editor.tabFiles[editor.tab]
              onLoaded: item.host = editor
            }

            RowLayout {
              Layout.fillWidth: true
              spacing: Style.space(8)

              Text {
                Layout.fillWidth: true
                text: editor.problem !== "" ? editor.problem
                      : (editor.service !== null && editor.service.routineError !== ""
                         ? editor.t("routine.json has an error; Save replaces it with this routine")
                         : (editor.dirty ? editor.t("Unsaved changes") : ""))
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: editor.problem !== "" || (editor.service !== null && editor.service.routineError !== "")
                       ? editor.urgent : editor.dim
                font.family: editor.fontFamily
                font.pixelSize: Style.font.bodySmall
              }
              Button {
                text: editor.t("Cancel")
                bordered: true
                foreground: editor.foreground
                fontFamily: editor.fontFamily
                onClicked: editor.requestClose()
              }
              Button {
                text: editor.t("Save")
                bordered: true
                enabled: editor.problem === ""
                opacity: enabled ? 1 : 0.4
                foreground: editor.accent
                fontFamily: editor.fontFamily
                onClicked: editor.save()
              }
            }
          }

          ConfirmDialog {
            id: confirm
            anchors.fill: parent
            z: 10
            background: Color.popups.background
            foreground: editor.foreground
            selectedText: editor.accent
            fontFamily: editor.fontFamily
            message: editor.confirmKind === "delete" ? Model.deleteText(editor.draft, editor.selectedId, editor.t)
                     : editor.confirmKind === "restore"
                       ? editor.t("Replace your routine with the original one? You can still cancel before saving.")
                       : editor.t("Discard your changes to the routine?")
            cancelText: editor.confirmKind === "discard" ? editor.t("Keep editing") : editor.t("Cancel")
            confirmText: editor.confirmKind === "delete" ? editor.t("Delete")
                         : editor.confirmKind === "restore" ? editor.t("Replace") : editor.t("Discard")
            onCanceled: editor.closeConfirm()
            onConfirmed: editor.confirmAction()
          }
        }
      }
    }
  }
}
