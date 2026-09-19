import QtQuick
import qs.Commons
import qs.Ui

// Bar entry point for Active Break: an icon plus the time left. The clock lives
// in Service.qml (one instance); this widget exists once per monitor and only
// shows it. Left click opens the panel, right click pauses/resumes, middle
// click starts the break now.
BarWidget {
  id: root
  moduleName: "io.github.ferc10110.active-break"

  // Looked up on a timer rather than bound: the service is created
  // asynchronously and can be rebuilt on a plugin reload.
  property var service: null

  readonly property var panel: panelLoader.item
  readonly property bool opened: panel ? panel.opened === true : false
  readonly property bool popoutSwitchClosing: panel ? panel.popoutSwitchClosing === true : false

  readonly property string phase: service && service.ready ? service.session.phase : "off"
  readonly property var face: service ? service.face : ({ text: "", tone: "dim", tooltip: "Active Break · loading" })
  readonly property string icon: phase === "paused" ? "\u{F03E4}"        // nf-md-pause
                                : phase === "due" ? "\u{F115D}"          // nf-md-weight_lifter
                                : "\u{F1300}"                            // nf-md-kettlebell

  function open() { if (panel) panel.open() }
  function close() { if (panel) panel.close() }
  function togglePanel() { if (panel) panel.toggle() }
  function closeForPopoutSwitch() { if (panel) panel.closeForPopoutSwitch() }

  function lookupService() {
    var found = bar && bar.shell ? bar.shell.serviceFor(moduleName) : null
    if (found !== service) service = found
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
    if ("service" in target) target.service = root.service
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: { lookupService(); injectPanel() }
  onSettingsChanged: injectPanel()
  onServiceChanged: injectPanel()

  Timer {
    interval: 1000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.lookupService()
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.face.text !== "" && !root.vertical ? root.icon + " " + root.face.text : root.icon
    // Same widening as Recognition: the face is more than one glyph, so grow
    // the slot to the painted text in a horizontal bar.
    slotSize: vertical ? Style.bar.statusSlot
                        : Math.max(Style.bar.statusSlot, glyphPaintedWidth + Style.space(8))
    dimmed: root.face.tone === "dim"
    active: root.face.tone === "urgent" || root.face.tone === "accent"
    activeColor: root.face.tone === "urgent" ? (root.bar ? root.bar.urgent : Color.urgent) : Color.accent
    tooltipText: root.face.tooltip
    onPressed: function(b) {
      if (b === Qt.RightButton) { if (root.service) root.service.act("togglePause") }
      else if (b === Qt.MiddleButton) { if (root.service) root.service.act("startBreak") }
      else root.togglePanel()
    }
  }
}
