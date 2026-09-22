import QtQuick
import Quickshell
import Quickshell.Io
import Qt.labs.folderlistmodel
import "BreakModel.js" as Model
import "I18n.js" as I18n

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
  // Demo images for the exercises, named after their ids. The plugin ships
  // none: whatever is in here is the user's, so nothing is downloaded, copied
  // or deleted — the card just shows what it finds.
  readonly property string mediaDir: configDir + "/media"

  // Which exercises actually have an image. Asking the folder first keeps a
  // card from pointing an AnimatedImage at a file that isn't there, which Qt
  // reports as a warning in the shell log — one per exercise without an
  // image, and one for every exercise when nobody has any.
  property var mediaIds: ({})
  function hasMedia(id) { return id !== undefined && mediaIds[id] === true }
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || homeDir + "/.local/state") + "/active-break"
  readonly property string soundFile: "/usr/share/sounds/freedesktop/stereo/complete.oga"
  readonly property string dueTitle: "Time to move"
  readonly property string omarchyConfigDir: (Quickshell.env("XDG_CONFIG_HOME") || homeDir + "/.config") + "/omarchy"
  // Shared by every plugin of mine, so changing it in one changes them all.
  property string language: "en"

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
  property string dueTitleSent: ""
  property bool editorOpen: false

  // ---- what the widget and panel read
  readonly property var exercise: Model.findExercise(routine, session.exerciseId)
  readonly property var face: ready ? Model.barFace(session, routine, now, service.t)
                                    : ({ text: "", tone: "dim", tooltip: t("Active Break · loading") })
  readonly property string modeText: Model.modeText(config, routine, new Date(now), service.t)
  readonly property string scheduleText: Model.scheduleText(config.schedule, service.t)
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

  // The toast id rides along so a reload can still replace or close it. The
  // title rides along too: closeDueNotification() dismisses by matching the
  // title it was sent with, so a service recreated by a shell restart (or a
  // language change) must not forget which title is actually on screen.
  function saveSession() {
    savedTickAt = session.lastTickAt
    sessionFile.setText(JSON.stringify(Object.assign({}, session,
                                       { notificationId: dueNotificationId, dueTitle: dueTitleSent }),
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
      var body = ex ? ex.name + " · " + Model.prescription(ex, t) + " · " + Model.equipmentText(ex, t)
                    : t("Get up and move for a bit")
      // The title is saved because closeDueNotification() dismisses by
      // matching it, and the language could change while the toast is open.
      dueTitleSent = t("Time to move")
      // Critical, so the toast stays up until acted on; -p prints its id so the
      // next reminder replaces it instead of stacking, and act() can close it.
      var argv = ["omarchy-notification-send", "-g", "\u{F1300}", "-u", "critical"]
      if (dueNotificationId > 0) argv = argv.concat(["-r", String(dueNotificationId)])
      argv = argv.concat([dueTitleSent, body, "--exec", "omarchy-shell", "shell", "summon", pluginId])
      if (notifyProc.running) {
        Quickshell.execDetached(argv)
      } else {
        notifyProc.command = [argv[0], "-p"].concat(argv.slice(1))
        notifyProc.running = true
      }
    } else if (kind === "breakEnd") {
      var next = session.phase === "working"
        ? (ex ? t("Next break %1 · %2", [Model.clock(new Date(session.dueAt)), ex.name])
              : t("Next break %1", [Model.clock(new Date(session.dueAt))]))
        : t("Work hours are over for today")
      Quickshell.execDetached(["omarchy-notification-send", "-g", "\u{F012C}", "-u", "normal",
                               t("Break over"), t("Back to work. %1", [next])])
    }
    if (config.sound) Quickshell.execDetached(["pw-play", soundFile])
  }

  // Omarchy's notification service ignores the D-Bus CloseNotification call
  // for popups, so dismiss through its own IPC, which matches on the title.
  function closeDueNotification() {
    Quickshell.execDetached(["omarchy-shell", "notifications", "dismiss",
                             dueTitleSent !== "" ? dueTitleSent : dueTitle])
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
  // routine. Never overwrites an existing file. The routine is copied in the
  // language in force at that moment: its exercise names and cues are content
  // we wrote, not the user's, so a Spanish desktop should not start in English.
  Process {
    id: seedProc
    command: ["sh", "-c",
              "mkdir -p \"$1\" \"$2\" && "
              + "{ [ -e \"$1/config.json\" ] || cp \"$3/config.json\" \"$1/config.json\"; } && "
              + "{ [ -e \"$1/routine.json\" ] || cp \"$3/$4\" \"$1/routine.json\"; }",
              "sh", service.configDir, service.stateDir, service.pluginPath("defaults"),
              service.language === "es" ? "routine.es.json" : "routine.json"]
    onExited: function(exitCode) {
      if (exitCode !== 0) service.configError = service.t("Could not create %1", [service.configDir])
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
      configError = t("config.json is not valid JSON: %1", [parsed.error])
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
      routineError = parsed.error ? t("routine.json is not valid JSON: %1", [parsed.error])
                                  : t("routine.json has no valid exercises")
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

  // The routine editor hands its draft here. False (and nothing written) when
  // it has no exercises left; the editor never sends one, but hand-made IPC
  // or a bug shouldn't be able to empty the file.
  function saveRoutine(newRoutine) {
    var clean = Model.normalizeRoutine(newRoutine)
    if (clean.exercises.length === 0) return false
    routine = clean
    routineError = ""
    routineFile.setText(JSON.stringify(clean, null, 2) + "\n")
    tick()   // re-picks the pending exercise if it was deleted
    return true
  }

  // The bundled routine ships in both languages — same ids, groups, equipment,
  // sets and weekly plan, translated names, cues and reps — so Restore defaults
  // hands back the one that matches the language. The user's own routine is
  // never swapped behind their back: this only runs when they ask for it, or on
  // a first run when there is no routine yet. English is the fallback if the
  // Spanish file is missing or unreadable.
  function defaultRoutine() {
    var raw = language === "es" ? parseJson(bundledRoutineEs.text()).value : null
    if (!raw) raw = parseJson(bundledRoutine.text()).value
    return Model.normalizeRoutine(raw)
  }

  function openEditor() {
    if (!ready) return false
    editorOpen = true
    return true
  }

  function closeEditor() { editorOpen = false }

  // Created only while open: it needs the shell's UI kit, which the isolated
  // test harness doesn't load.
  Loader {
    active: service.editorOpen
    source: "RoutineEditor.qml"
    onLoaded: item.service = service
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
      // Falls back to "" (and from there to the English dueTitle on dismiss)
      // for session files written before this field existed.
      service.dueTitleSent = raw && typeof raw.dueTitle === "string" ? raw.dueTitle : ""
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
      service.configError = service.t("Could not read %1", [path])
      service.configLoaded = true
    }
  }

  FileView {
    id: routineFile
    path: service.configDir + "/routine.json"
    watchChanges: true
    atomicWrites: true
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

  FolderListModel {
    id: mediaFolder
    folder: "file://" + service.mediaDir
    nameFilters: ["*.gif"]
    showDirs: false
    onCountChanged: {
      var ids = {}
      for (var i = 0; i < count; i++) {
        var name = String(get(i, "fileName"))
        ids[name.slice(0, -4)] = true      // drop ".gif"
      }
      service.mediaIds = ids
    }
  }

  FileView {
    id: bundledRoutineEs
    path: service.pluginPath("defaults/routine.es.json")
    blockLoading: true
    printErrors: false
  }

  FileView {
    id: languageFile
    path: service.omarchyConfigDir + "/plugin-language.json"
    // Loaded synchronously: the first run copies the routine in this language,
    // and that happens before an async load would have answered.
    blockLoading: true
    watchChanges: true
    atomicWrites: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      var raw = service.parseJson(text()).value
      var lang = raw && raw.language ? String(raw.language) : "en"
      service.language = (lang === "es") ? "es" : "en"
    }
    onLoadFailed: service.language = "en"   // no file yet, or unreadable: English
  }

  function t(s, args) { return I18n.t(s, service.language, args) }

  function setLanguage(lang) {
    service.language = (lang === "es") ? "es" : "en"
    languageFile.setText(JSON.stringify({ language: service.language }, null, 2) + "\n")
  }

  Component.onCompleted: seedProc.running = true

  // ---- IPC: omarchy-shell io.github.ferc10110.active-break <function>

  IpcHandler {
    target: service.pluginId

    function status(): string {
      var ex = service.exercise
      return JSON.stringify({ phase: service.session.phase, bar: service.face.text, tooltip: service.face.tooltip,
                              exercise: ex ? ex.name : null, prescription: ex ? Model.prescription(ex, service.t) : null,
                              dueAt: service.session.dueAt, breakEndsAt: service.session.breakEndsAt,
                              mode: service.modeText, schedule: service.scheduleText,
                              editorOpen: service.editorOpen,
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
    function editRoutine(): string { return service.openEditor() ? "ok" : "not ready" }
  }
}
