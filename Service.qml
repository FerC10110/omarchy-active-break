import QtQuick
import Quickshell
import Quickshell.Io
import "BreakModel.js" as Model

// Active Break service: the single instance that owns the clock. It ticks the
// state machine in BreakModel.js once a second, sends the notifications, persists
// the session and answers IPC. The bar widget (one per monitor) and its panel
// only read from here and call act().
//
// The shell destroys services whenever a file under ~/.config/omarchy/plugins
// changes, so everything that matters is saved as wall-clock timestamps in
// ~/.local/state/active-break/state.json and read back on load.
Item {
  id: service

  readonly property string pluginId: "io.github.ferc10110.active-break"
  readonly property string homeDir: Quickshell.env("HOME")
  readonly property string configDir: (Quickshell.env("XDG_CONFIG_HOME") || homeDir + "/.config") + "/active-break"
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || homeDir + "/.local/state") + "/active-break"
  readonly property string soundFile: "/usr/share/sounds/freedesktop/stereo/complete.oga"
  readonly property string dueTitle: "Time to move"

  // Not `state`: Item already has one (QML states).
  property var session: Model.initialState()
  property var config: Model.normalizeConfig({})
  property var routine: Model.normalizeRoutine({})
  property real now: Date.now()
  property string configError: ""
  property string routineError: ""

  property bool seeded: false
  property bool sessionLoaded: false
  property bool configLoaded: false
  property bool routineLoaded: false
  readonly property bool ready: seeded && sessionLoaded && configLoaded && routineLoaded

  property real savedTickAt: 0
  property int dueNotificationId: 0

  // ---- what the widget and panel read
  readonly property var exercise: Model.findExercise(routine, session.exerciseId)
  readonly property var face: ready ? Model.barFace(session, routine, now)
                                    : ({ text: "", tone: "dim", tooltip: "Active Break · loading" })
  readonly property string modeText: Model.modeText(config, routine, new Date(now))
  readonly property string scheduleText: Model.scheduleText(config.schedule)
  readonly property string problem: configError !== "" ? configError : routineError

  function pluginPath(relative) {
    var url = String(Qt.resolvedUrl(relative))
    return url.indexOf("file://") === 0 ? decodeURIComponent(url.substring(7)) : url
  }

  // ---- clock

  function tick() {
    now = Date.now()
    commit(Model.step(session, config, routine, now, Math.random))
  }

  // A user action from the panel, the bar or IPC. False when it doesn't apply
  // to the current phase. Model.act() catches the clock up first, so an action
  // right after a suspend applies to the current cycle, not a stale one.
  function act(action) {
    if (!ready) return false
    now = Date.now()
    var result = Model.act(session, action, config, routine, now, Math.random)
    commit(result)
    return result.changed
  }

  function commit(result) {
    var before = session
    session = result.state
    for (var i = 0; i < result.events.length; i++) notify(result.events[i])
    if (before.phase === "due" && session.phase !== "due") closeDueNotification()
    // lastTickAt changes every second; only rewrite the file for it once a
    // minute (enough to detect a suspend across a shell restart).
    if (changed(before, session) || session.lastTickAt - savedTickAt >= 60000) saveSession()
  }

  function changed(a, b) {
    return JSON.stringify(Object.assign({}, a, { lastTickAt: 0 }))
        !== JSON.stringify(Object.assign({}, b, { lastTickAt: 0 }))
  }

  // The toast id rides along so a reload can still replace or close it.
  function saveSession() {
    savedTickAt = session.lastTickAt
    sessionFile.setText(JSON.stringify(Object.assign({}, session, { notificationId: dueNotificationId }),
                                       null, 2) + "\n")
  }

  Timer {
    interval: 1000
    repeat: true
    running: service.ready
    triggeredOnStart: true
    onTriggered: service.tick()
  }

  // ---- notifications

  function notify(kind) {
    var ex = Model.findExercise(routine, session.exerciseId)
    if (kind === "due") {
      var body = ex ? ex.name + " · " + Model.prescription(ex) + " · " + Model.equipmentText(ex)
                    : "Get up and move for a bit"
      // Critical, so the toast stays up until acted on; -p prints its id so the
      // next reminder replaces it instead of stacking, and act() can close it.
      var argv = ["omarchy-notification-send", "-g", "\u{F1300}", "-u", "critical"]
      if (dueNotificationId > 0) argv = argv.concat(["-r", String(dueNotificationId)])
      argv = argv.concat([dueTitle, body, "--exec", "omarchy-shell", "shell", "summon", pluginId])
      if (notifyProc.running) {
        Quickshell.execDetached(argv)
      } else {
        notifyProc.command = [argv[0], "-p"].concat(argv.slice(1))
        notifyProc.running = true
      }
    } else if (kind === "breakEnd") {
      var next = session.phase === "working"
        ? "Next break " + Model.clock(new Date(session.dueAt)) + (ex ? " · " + ex.name : "")
        : "Work hours are over for today"
      Quickshell.execDetached(["omarchy-notification-send", "-g", "\u{F012C}", "-u", "normal",
                               "Break over", "Back to work. " + next])
    }
    if (config.sound) Quickshell.execDetached(["pw-play", soundFile])
  }

  // Omarchy's notification service ignores the D-Bus CloseNotification call
  // for popups, so dismiss through its own IPC, which matches on the title.
  function closeDueNotification() {
    Quickshell.execDetached(["omarchy-shell", "notifications", "dismiss", dueTitle])
    dueNotificationId = 0
  }

  Process {
    id: notifyProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var id = parseInt(String(text).trim(), 10)
        if (id > 0 && id !== service.dueNotificationId) {
          service.dueNotificationId = id
          service.saveSession()
        }
      }
    }
  }

  // ---- files

  // First run: create both directories and copy the bundled config and
  // routine. Never overwrites an existing file.
  Process {
    id: seedProc
    command: ["sh", "-c",
              "mkdir -p \"$1\" \"$2\" && "
              + "{ [ -e \"$1/config.json\" ] || cp \"$3/config.json\" \"$1/config.json\"; } && "
              + "{ [ -e \"$1/routine.json\" ] || cp \"$3/routine.json\" \"$1/routine.json\"; }",
              "sh", service.configDir, service.stateDir, service.pluginPath("defaults")]
    onExited: function(exitCode) {
      if (exitCode !== 0) service.configError = "Could not create " + service.configDir
      service.seeded = true
      // A FileView whose file didn't exist at load time never fires again.
      if (!service.configLoaded) configFile.reload()
      if (!service.routineLoaded) routineFile.reload()
    }
  }

  function parseJson(text) {
    try { return { value: JSON.parse(String(text || "")) } } catch (e) { return { error: String(e.message || e) } }
  }

  function loadConfig(text) {
    var parsed = parseJson(text)
    if (parsed.error) {
      configError = "config.json is not valid JSON: " + parsed.error
    } else {
      configError = ""
      config = Model.normalizeConfig(parsed.value)
    }
    configLoaded = true
  }

  function loadRoutine(text) {
    var parsed = parseJson(text)
    var candidate = parsed.error ? null : Model.normalizeRoutine(parsed.value)
    if (!candidate || candidate.exercises.length === 0) {
      routineError = parsed.error ? "routine.json is not valid JSON: " + parsed.error
                                  : "routine.json has no valid exercises"
      // Keep the last good routine; on a broken first load use the bundled one.
      if (!routineLoaded) routine = Model.normalizeRoutine(parseJson(bundledRoutine.text()).value)
    } else {
      routineError = ""
      routine = candidate
    }
    routineLoaded = true
  }

  function saveConfig(newConfig) {
    config = Model.normalizeConfig(newConfig)
    configError = ""
    configFile.setText(JSON.stringify(config, null, 2) + "\n")
    tick()
  }

  FileView {
    id: sessionFile
    path: service.stateDir + "/state.json"
    atomicWrites: true
    printErrors: false
    onLoaded: {
      if (service.sessionLoaded) return
      var raw = service.parseJson(text()).value
      service.session = Model.normalizeState(raw)
      service.dueNotificationId = raw && raw.notificationId > 0 ? raw.notificationId : 0
      service.savedTickAt = service.session.lastTickAt || 0
      service.sessionLoaded = true
    }
    onLoadFailed: service.sessionLoaded = true   // no file yet: start fresh
  }

  FileView {
    id: configFile
    path: service.configDir + "/config.json"
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: service.loadConfig(text())
    onLoadFailed: {
      if (!service.seeded) return   // seedProc reloads once the file exists
      service.configError = "Could not read " + path
      service.configLoaded = true
    }
  }

  FileView {
    id: routineFile
    path: service.configDir + "/routine.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: service.loadRoutine(text())
    onLoadFailed: {
      if (!service.seeded) return
      service.loadRoutine("")
    }
  }

  FileView {
    id: bundledRoutine
    path: service.pluginPath("defaults/routine.json")
    blockLoading: true
    printErrors: false
  }

  Component.onCompleted: seedProc.running = true

  // ---- IPC: omarchy-shell io.github.ferc10110.active-break <function>

  IpcHandler {
    target: service.pluginId

    function status(): string {
      var ex = service.exercise
      return JSON.stringify({ phase: service.session.phase, bar: service.face.text, tooltip: service.face.tooltip,
                              exercise: ex ? ex.name : null, prescription: ex ? Model.prescription(ex) : null,
                              dueAt: service.session.dueAt, breakEndsAt: service.session.breakEndsAt,
                              mode: service.modeText, schedule: service.scheduleText,
                              problem: service.problem || null })
    }
    function startBreak(): string { return service.act("startBreak") ? "ok" : "not applicable" }
    function snooze(): string { return service.act("snooze") ? "ok" : "not applicable" }
    function skip(): string { return service.act("skip") ? "ok" : "not applicable" }
    function finishBreak(): string { return service.act("finishBreak") ? "ok" : "not applicable" }
    function pause(): string { return service.act("pause") ? "ok" : "not applicable" }
    function resume(): string { return service.act("resume") ? "ok" : "not applicable" }
    function togglePause(): string { return service.act("togglePause") ? "ok" : "not applicable" }
    function reroll(): string { return service.act("reroll") ? "ok" : "not applicable" }
  }
}
