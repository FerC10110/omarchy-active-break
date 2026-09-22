import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "I18n.js" as I18n

// Active Break panel: a face over Service.qml. It holds no clock of its own;
// the views read `host.service` (session, exercise, config) and send actions
// through it. Views are separate files loaded one at a time; each gets `host`
// (this panel).
Panel {
  id: activeBreak   // not `root`: views reach the panel through `host`
  moduleName: "io.github.ferc10110.active-break"
  ipcTarget: "io.github.ferc10110.active-break"
  // The service owns the IPC target (one handler, not one per monitor), and
  // summon/hide still reach this panel through the bar-widget path.
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property var service: null

  property string view: "main"        // main | settings

  // ---- colours
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color accent: (bar && bar.accent !== undefined) ? bar.accent : Color.accent
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property string language: service ? service.language : "en"
  function t(s, args) { return I18n.t(s, language, args) }

  readonly property string viewSource: view === "settings" ? "SettingsView.qml" : "MainView.qml"

  // ---- the `host` API for views
  function focusKeys() { keyCatcher.forceActiveFocus() }
  function act(action) { if (service) service.act(action) }
  function openSettings() { view = "settings" }

  function back() {
    view = "main"
    focusKeys()
  }

  function saveConfig(newConfig) {
    if (service) service.saveConfig(newConfig)
    back()
  }

  onOpenedChanged: if (!opened) view = "main"

  KeyboardPanel {
    id: panel
    anchorItem: activeBreak.anchorItem
    owner: activeBreak.hostWidget || activeBreak
    bar: activeBreak.bar
    open: activeBreak.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(380))
    contentHeight: panel.fittedContentHeight(Math.max(Style.space(200), layout.implicitHeight), Style.space(600))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      // While a text field owns the keyboard, letters and Escape must reach it.
      blocked: viewLoader.item !== null && viewLoader.item.typing === true
      onCloseRequested: {
        if (activeBreak.view === "main") activeBreak.close()
        else activeBreak.back()
      }
      onTabRequested: function(direction) { activeBreak.switchPanel(direction) }

      ColumnLayout {
        id: layout
        anchors.fill: parent
        spacing: Style.space(8)

        PanelHero {
          Layout.fillWidth: true
          title: "Active Break"
          meta: activeBreak.service ? activeBreak.service.modeText : ""
          foreground: activeBreak.foreground
          fontFamily: activeBreak.fontFamily

          trailingControl: Component {
            PanelActionButton {
              iconText: activeBreak.view === "settings" ? "\u{F004D}" : "\u{F0493}"   // nf-md-arrow_left / nf-md-cog
              tooltipText: activeBreak.view === "settings" ? activeBreak.t("Back without saving") : activeBreak.t("Settings")
              foreground: activeBreak.foreground
              hoverColor: activeBreak.accent
              onClicked: activeBreak.view === "settings" ? activeBreak.back() : activeBreak.openSettings()
            }
          }
        }

        Text {
          Layout.fillWidth: true
          visible: activeBreak.service !== null && activeBreak.service.problem !== ""
          text: activeBreak.service ? activeBreak.service.problem : ""
          textFormat: Text.PlainText
          wrapMode: Text.Wrap
          color: activeBreak.urgent
          font.family: activeBreak.fontFamily
          font.pixelSize: Style.font.bodySmall
        }

        Text {
          Layout.fillWidth: true
          visible: activeBreak.service === null
          text: activeBreak.t("The Active Break service has not started yet.")
          textFormat: Text.PlainText
          wrapMode: Text.Wrap
          color: activeBreak.dim
          font.family: activeBreak.fontFamily
          font.pixelSize: Style.font.body
        }

        Loader {
          id: viewLoader
          Layout.fillWidth: true
          Layout.fillHeight: true
          Layout.preferredHeight: item ? item.implicitHeight : 0
          active: activeBreak.service !== null
          source: activeBreak.viewSource
          onLoaded: item.host = activeBreak
        }
      }
    }
  }
}
