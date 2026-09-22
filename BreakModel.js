// Pure logic for Active Break: config/routine cleanup, the work/break state
// machine, exercise picking and the texts the bar and panel show. No QML in
// here, so node can test it (tests/model.test.js); QML ignores the
// module.exports block at the end, the same trick as Recognition's Format.js.
//
// Time is always epoch milliseconds passed in by the caller, and randomness
// comes from an injected rng() in [0, 1), so every function is deterministic.

var MIN = 60000
var PHASES = ["off", "working", "due", "break", "paused"]
var MODES = ["weekly", "rotation", "random"]
var DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]   // index = Date.getDay()
var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
var MODE_NAMES = { weekly: "Weekly plan", rotation: "Muscle-group rotation", random: "Random" }
var GROUP_NAMES = { legs: "Legs", push: "Push", hinge: "Hinge", pull: "Pull", core: "Core" }
var EQUIPMENT_NAMES = { dumbbells: "Dumbbells", kettlebell: "Kettlebell", barbell: "Barbell", rack: "Rack",
                        bench: "Bench", pullup_bar: "Pull-up bar" }
var DEFAULT_SCHEDULE = { days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "18:00" }

// ---- small helpers

function pad(n) { return n < 10 ? "0" + n : String(n) }

function clock(date) { return pad(date.getHours()) + ":" + pad(date.getMinutes()) }

// Local calendar day, "2026-09-21".
function dateKey(date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
}

function dayKey(date) { return DAY_KEYS[date.getDay()] }

// "09:30" -> 570; anything else -> null.
function parseClock(text) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(text || ""))
  if (!m) return null
  var h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function clampInt(value, lo, hi, fallback) {
  var n = Number(value)
  if (value === null || value === undefined || value === "" || !isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function copy(obj) { return Object.assign({}, obj) }

// Every text the model builds goes through here: `t` is the caller's
// translator (I18n.t bound to a language) and its absence means English.
function tr(t, s, args) {
  if (t) return t(s, args)
  if (!args) return s
  var out = s
  for (var i = 0; i < args.length; i++) out = out.split("%" + (i + 1)).join(String(args[i]))
  return out
}

// ---- config

function normalizeConfig(raw) {
  var c = raw && typeof raw === "object" ? raw : {}
  var s = c.schedule && typeof c.schedule === "object" ? c.schedule : {}
  var days = Array.isArray(s.days) ? s.days.filter(function(d) { return DAY_KEYS.indexOf(d) !== -1 })
                                   : DEFAULT_SCHEDULE.days.slice()
  return {
    work: clampInt(c.work, 1, 240, 30),
    break: clampInt(c["break"], 1, 60, 10),
    renotify: clampInt(c.renotify, 1, 60, 5),
    snooze: clampInt(c.snooze, 1, 120, 10),
    mode: MODES.indexOf(c.mode) !== -1 ? c.mode : "weekly",
    sound: c.sound !== false,
    schedule: {
      days: days,
      start: parseClock(s.start) !== null ? s.start : DEFAULT_SCHEDULE.start,
      end: parseClock(s.end) !== null ? s.end : DEFAULT_SCHEDULE.end
    }
  }
}

function inWorkHours(schedule, date) {
  if (schedule.days.indexOf(dayKey(date)) === -1) return false
  var minute = date.getHours() * 60 + date.getMinutes()
  return minute >= parseClock(schedule.start) && minute < parseClock(schedule.end)
}

// ---- routine

// Keeps exercises that have at least an id, a name and a group, and drops plan
// entries that point at ids the catalog doesn't have.
function normalizeRoutine(raw) {
  var r = raw && typeof raw === "object" ? raw : {}
  var exercises = (Array.isArray(r.exercises) ? r.exercises : []).filter(function(e) {
    return e && e.id && e.name && e.group
  }).map(function(e) {
    return { id: String(e.id), name: String(e.name), group: String(e.group),
             equipment: Array.isArray(e.equipment) ? e.equipment.map(String) : [],
             sets: clampInt(e.sets, 1, 20, 3), reps: String(e.reps || ""), cue: String(e.cue || "") }
  })
  var ids = exercises.map(function(e) { return e.id })
  var plan = {}
  var rawPlan = r.plan && typeof r.plan === "object" ? r.plan : {}
  for (var key in rawPlan) {
    if (DAY_KEYS.indexOf(key) === -1) continue
    var day = rawPlan[key] || {}
    plan[key] = { focus: String(day.focus || ""),
                  exercises: (Array.isArray(day.exercises) ? day.exercises : []).filter(function(id) {
                    return ids.indexOf(id) !== -1
                  }) }
  }
  var rotation = Array.isArray(r.rotation) ? r.rotation.map(String) : ["legs", "push", "hinge", "pull", "core"]
  return { exercises: exercises, plan: plan, rotation: rotation }
}

function findExercise(routine, id) {
  for (var i = 0; i < routine.exercises.length; i++)
    if (routine.exercises[i].id === id) return routine.exercises[i]
  return null
}

// ---- picking

function pickFrom(list, avoidId, rng) {
  var candidates = list.length > 1 ? list.filter(function(e) { return e.id !== avoidId }) : list
  if (candidates.length === 0) return null
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]
}

// memo carries what picking needs to remember between breaks:
// { lastExerciseId, lastGroup, planDay, planIndex }. Returns the chosen id
// (null when the catalog is empty) and the updated memo. `reroll` asks for a
// different exercise for the same slot: in rotation mode it stays in the group.
function pickExercise(mode, routine, memo, date, rng, reroll) {
  var next = copy(memo || {})
  var exercise = null

  if (mode === "weekly") {
    var day = routine.plan[dayKey(date)]
    var list = day ? day.exercises : []
    if (list.length > 0) {
      var today = dateKey(date)
      var index = next.planDay === today ? (next.planIndex || 0) : 0
      exercise = findExercise(routine, list[index % list.length])
      next.planDay = today
      next.planIndex = index + 1
    }
  } else if (mode === "rotation") {
    var groups = routine.rotation.filter(function(g) {
      return routine.exercises.some(function(e) { return e.group === g })
    })
    if (groups.length > 0) {
      var group = reroll && groups.indexOf(next.lastGroup) !== -1 ? next.lastGroup
                : groups[(groups.indexOf(next.lastGroup) + 1) % groups.length]
      exercise = pickFrom(routine.exercises.filter(function(e) { return e.group === group }), next.lastExerciseId, rng)
      next.lastGroup = group
    }
  }

  // random mode, and the fallback when the plan or rotation has nothing
  if (!exercise) exercise = pickFrom(routine.exercises, next.lastExerciseId, rng)

  next.lastExerciseId = exercise ? exercise.id : null
  return { exerciseId: next.lastExerciseId, memo: next }
}

// ---- state

// workMin, breakMin and mode record the config the running clock was built
// with, so step() can follow a change made mid-cycle.
function initialState() {
  return { phase: "off", dueAt: null, breakEndsAt: null, remainingMs: null, lastNotifiedAt: null,
           lastTickAt: 0, exerciseId: null, lastExerciseId: null, lastGroup: null, planDay: null,
           planIndex: 0, pausedDay: null, workMin: null, breakMin: null, mode: null }
}

function normalizeState(raw) {
  var s = initialState()
  if (!raw || typeof raw !== "object") return s
  for (var key in s) if (raw[key] !== undefined) s[key] = raw[key]
  if (PHASES.indexOf(s.phase) === -1) s.phase = "off"
  return s
}

function memoOf(s) {
  return { lastExerciseId: s.lastExerciseId, lastGroup: s.lastGroup, planDay: s.planDay, planIndex: s.planIndex }
}

function choose(s, config, routine, now, rng, reroll) {
  var picked = pickExercise(config.mode, routine, memoOf(s), new Date(now), rng, reroll)
  s.exerciseId = picked.exerciseId
  s.lastExerciseId = picked.memo.lastExerciseId
  s.lastGroup = picked.memo.lastGroup === undefined ? null : picked.memo.lastGroup
  s.planDay = picked.memo.planDay === undefined ? null : picked.memo.planDay
  s.planIndex = picked.memo.planIndex || 0
}

// A fresh work cycle, or off when outside work hours. `keepExercise` is for
// restarts where the pending exercise was never done (a suspend gap).
function startCycle(s, config, routine, now, rng, keepExercise) {
  s.breakEndsAt = null
  s.remainingMs = null
  s.lastNotifiedAt = null
  s.pausedDay = null
  if (!inWorkHours(config.schedule, new Date(now))) {
    s.phase = "off"
    s.dueAt = null
    return
  }
  s.phase = "working"
  s.dueAt = now + config.work * MIN
  if (!keepExercise || !s.exerciseId) choose(s, config, routine, now, rng, false)
}

// Settings saved mid-cycle: the running clock moves by the difference, and a
// new mode re-picks the exercise still to come. A state that recorded nothing
// yet (first run) just adopts the config.
function followConfig(s, config, routine, now, rng) {
  if (s.workMin !== null && s.workMin !== config.work && s.phase === "working")
    s.dueAt = Math.max(now, s.dueAt + (config.work - s.workMin) * MIN)
  if (s.breakMin !== null && s.breakMin !== config["break"] && s.phase === "break")
    s.breakEndsAt = Math.max(now, s.breakEndsAt + (config["break"] - s.breakMin) * MIN)
  if (s.mode !== null && s.mode !== config.mode && s.phase === "working")
    choose(s, config, routine, now, rng, false)
  s.workMin = config.work
  s.breakMin = config["break"]
  s.mode = config.mode
}

// Advances the clock to `now`. Returns the new state and the events the caller
// must act on: "due" (notify the break) and "breakEnd" (notify back to work).
function step(state, config, routine, now, rng) {
  var s = copy(state)
  var events = []
  var gap = s.lastTickAt > 0 && now - s.lastTickAt > config["break"] * MIN
  var inHours = inWorkHours(config.schedule, new Date(now))
  s.lastTickAt = now
  followConfig(s, config, routine, now, rng)

  if (s.phase === "paused" && s.pausedDay !== dateKey(new Date(now))) {
    s.phase = "off"
    s.remainingMs = null
    s.pausedDay = null
  }

  if (s.phase === "off") {
    if (inHours) startCycle(s, config, routine, now, rng, false)
  } else if (s.phase === "working" || s.phase === "due") {
    if (!inHours) {
      s.phase = "off"
      s.dueAt = null
      s.lastNotifiedAt = null
    } else if (gap) {
      startCycle(s, config, routine, now, rng, true)
    } else if (s.phase === "working" && now >= s.dueAt) {
      s.phase = "due"
      s.lastNotifiedAt = now
      events.push("due")
    } else if (s.phase === "due" && now - s.lastNotifiedAt >= config.renotify * MIN) {
      s.lastNotifiedAt = now
      events.push("due")
    }
  } else if (s.phase === "break" && now >= s.breakEndsAt) {
    startCycle(s, config, routine, now, rng, false)
    if (!gap) events.push("breakEnd")
  }

  // The pending exercise was deleted (in the editor or by hand): pick another.
  // Last, so a transition above that already re-picked isn't followed by a
  // second pick (which would skip a plan entry or a rotation group).
  if (s.phase !== "off" && s.exerciseId && !findExercise(routine, s.exerciseId))
    choose(s, config, routine, now, rng, false)

  return { state: s, events: events }
}

// A user action. Actions that don't apply to the current phase return the
// state unchanged.
function apply(state, action, config, routine, now, rng) {
  var s = copy(state)
  var phase = s.phase

  if (action === "togglePause") action = phase === "paused" ? "resume" : "pause"

  if (action === "startBreak" && (phase === "working" || phase === "due")) {
    s.phase = "break"
    s.breakEndsAt = now + config["break"] * MIN
    s.lastNotifiedAt = null
  } else if (action === "snooze" && phase === "due") {
    s.phase = "working"
    s.dueAt = now + config.snooze * MIN
    s.lastNotifiedAt = null
  } else if (action === "skip" && phase === "due") {
    startCycle(s, config, routine, now, rng, false)
  } else if (action === "finishBreak" && phase === "break") {
    startCycle(s, config, routine, now, rng, false)
  } else if (action === "pause" && (phase === "working" || phase === "due")) {
    s.remainingMs = phase === "due" ? 0 : Math.max(0, s.dueAt - now)
    s.phase = "paused"
    s.pausedDay = dateKey(new Date(now))
    s.lastNotifiedAt = null
  } else if (action === "resume" && phase === "paused") {
    var remaining = s.remainingMs || 0
    s.remainingMs = null
    s.pausedDay = null
    if (inWorkHours(config.schedule, new Date(now))) {
      s.phase = "working"
      s.dueAt = now + remaining
    } else {
      s.phase = "off"
      s.dueAt = null
    }
  } else if (action === "reroll" && (phase === "working" || phase === "due" || phase === "break")) {
    choose(s, config, routine, now, rng, true)
  } else {
    return { state: state, events: [] }
  }
  return { state: s, events: [] }
}

// What the service runs for a user action: first bring the clock up to `now`
// (after a suspend the first tick may not have run yet), then apply. A due
// notice from that catch-up is dropped when the action already answers it.
// `changed` is false when the action didn't apply.
function act(state, action, config, routine, now, rng) {
  var caught = step(state, config, routine, now, rng)
  var applied = apply(caught.state, action, config, routine, now, rng)
  var events = caught.events.filter(function(e) { return e !== "due" || applied.state.phase === "due" })
  return { state: applied.state, events: events, changed: applied.state !== caught.state }
}

// ---- texts

// "18m", "1h35"; rounds up so the bar never shows 0m while time remains.
function minutesLeft(ms) {
  var m = Math.max(0, Math.ceil(ms / MIN))
  if (m < 60) return m + "m"
  return Math.floor(m / 60) + "h" + pad(m % 60)
}

// "7:32"
function clockLeft(ms) {
  var s = Math.max(0, Math.ceil(ms / 1000))
  return Math.floor(s / 60) + ":" + pad(s % 60)
}

function prescription(ex, t) {
  if (!ex) return ""
  return ex.reps ? ex.sets + " × " + ex.reps : tr(t, "%1 sets", [ex.sets])
}

function equipmentText(ex, t) {
  if (!ex || ex.equipment.length === 0) return tr(t, "Bodyweight")
  return ex.equipment.map(function(k) { return tr(t, EQUIPMENT_NAMES[k] || k) }).join(" · ")
}

function groupText(ex, t) { return ex ? tr(t, GROUP_NAMES[ex.group] || ex.group) : "" }

function modeText(config, routine, date, t) {
  var name = tr(t, MODE_NAMES[config.mode] || config.mode)
  if (config.mode !== "weekly") return name
  var day = routine.plan[dayKey(date)]
  // day.focus is user data from routine.json (via PlanTab), not UI text: only
  // the "no plan" fallback goes through t().
  var focus = day && day.focus ? day.focus : tr(t, "no plan")
  return name + " · " + tr(t, DAY_NAMES[date.getDay()]) + ": " + focus
}

function scheduleText(schedule, t) {
  var labels = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" }
  var order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
  var days = order.filter(function(d) { return schedule.days.indexOf(d) !== -1 })
                  .map(function(d) { return tr(t, labels[d]) }).join(" ")
  return (days || tr(t, "no days")) + " · " + schedule.start + "–" + schedule.end
}

// What the bar shows: text next to the icon, a tone (dim | normal | urgent |
// accent) and the tooltip.
function barFace(state, routine, now, t) {
  var ex = findExercise(routine, state.exerciseId)
  var name = ex ? ex.name : tr(t, "no exercise")
  switch (state.phase) {
  case "working":
    return { text: minutesLeft(state.dueAt - now), tone: "normal",
             tooltip: tr(t, "Next break %1 · %2", [clock(new Date(state.dueAt)), name]) }
  case "due":
    return { text: tr(t, "Go!"), tone: "urgent",
             tooltip: ex ? tr(t, "Time to move! %1 · %2", [name, prescription(ex, t)])
                         : tr(t, "Time to move! %1", [name]) }
  case "break":
    return { text: clockLeft(state.breakEndsAt - now), tone: "accent",
             tooltip: tr(t, "Break until %1 · %2", [clock(new Date(state.breakEndsAt)), name]) }
  case "paused":
    return { text: "", tone: "dim", tooltip: tr(t, "Active Break paused · right click to resume") }
  default:
    return { text: "", tone: "dim", tooltip: tr(t, "Active Break · outside work hours") }
  }
}

// ---- routine editing (RoutineEditor.qml)
//
// Each function takes a routine and returns a new one without touching its
// input, so QML bindings on the editor's draft see every change. Exercises
// created in the editor carry a temporary "new:<n>" id until finalizeIds()
// names them at save time; a slug never contains ":", so the two can't clash.

var GROUP_ORDER = ["legs", "push", "hinge", "pull", "core"]
var EQUIPMENT_ORDER = ["dumbbells", "kettlebell", "barbell", "rack", "bench", "pullup_bar"]
var EXERCISE_FIELDS = ["name", "group", "equipment", "sets", "reps", "cue"]
var WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
var NEW_ID = "new:"

function cloneRoutine(routine) { return JSON.parse(JSON.stringify(routine)) }

function rank(order, value) {
  var i = order.indexOf(value)
  return i === -1 ? order.length : i
}

// "Goblet Squat!" → "goblet-squat". Accents are dropped where the engine can.
function slug(name) {
  var s = String(name || "")
  if (typeof s.normalize === "function") s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return s || "exercise"
}

function exerciseId(name, routine) {
  var base = slug(name)
  var id = base
  for (var n = 2; findExercise(routine, id); n++) id = base + "-" + n
  return id
}

function newExercise(routine, group) {
  var r = cloneRoutine(routine)
  var n = 1
  while (findExercise(r, NEW_ID + n)) n++
  var id = NEW_ID + n
  r.exercises.push({ id: id, name: "", group: group || "legs", equipment: [], sets: 3, reps: "10", cue: "" })
  return { routine: r, id: id }
}

function updateExercise(routine, id, fields) {
  var r = cloneRoutine(routine)
  var ex = findExercise(r, id)
  if (!ex || !fields) return r
  EXERCISE_FIELDS.forEach(function(key) {
    if (fields[key] !== undefined) ex[key] = Array.isArray(fields[key]) ? fields[key].slice() : fields[key]
  })
  return r
}

function toggleEquipment(routine, id, key) {
  var ex = findExercise(routine, id)
  if (!ex) return cloneRoutine(routine)
  var next = ex.equipment.indexOf(key) !== -1 ? ex.equipment.filter(function(k) { return k !== key })
                                              : ex.equipment.concat([key])
  next.sort(function(a, b) { return rank(EQUIPMENT_ORDER, a) - rank(EQUIPMENT_ORDER, b) })
  return updateExercise(routine, id, { equipment: next })
}

// A day with no focus and no exercises is the same as no plan: drop it.
function pruneDays(r) {
  for (var day in r.plan) {
    if (r.plan[day].focus === "" && r.plan[day].exercises.length === 0) delete r.plan[day]
  }
  return r
}

function removeExercise(routine, id) {
  var r = cloneRoutine(routine)
  r.exercises = r.exercises.filter(function(e) { return e.id !== id })
  for (var day in r.plan) {
    r.plan[day].exercises = r.plan[day].exercises.filter(function(x) { return x !== id })
  }
  return pruneDays(r)
}

function exerciseUsage(routine, id) {
  return WEEK.filter(function(day) {
    return routine.plan[day] !== undefined && routine.plan[day].exercises.indexOf(id) !== -1
  })
}

// "a", "a and b", "a, b and c"
function listText(items, t) {
  if (items.length <= 1) return items.join("")
  return items.slice(0, -1).join(", ") + " " + tr(t, "and") + " " + items[items.length - 1]
}

function deleteText(routine, id, t) {
  var ex = findExercise(routine, id)
  var name = ex ? ex.name.trim() : ""
  var question = name !== "" ? tr(t, "Delete %1?", [name]) : tr(t, "Delete this exercise?")
  var days = exerciseUsage(routine, id).map(function(d) { return tr(t, DAY_NAMES[DAY_KEYS.indexOf(d)]) })
  if (days.length === 0) return question
  var template = days.length === 1 ? "It's in the %1 plan; it will be removed from it."
                                    : "It's in the %1 plans; it will be removed from them."
  return question + " " + tr(t, template, [listText(days, t)])
}

// Prepares the draft for saving: trims every exercise's name, then gives
// each "new:<n>" exercise its real id, from the name it ended up with,
// and follows the rename in the plan. Existing ids never change.
function finalizeIds(routine) {
  var r = cloneRoutine(routine)
  r.exercises.forEach(function(e) { e.name = e.name.trim() })
  var renames = {}
  r.exercises.forEach(function(e) {
    if (e.id.indexOf(NEW_ID) !== 0) return
    var id = exerciseId(e.name, r)
    renames[e.id] = id
    e.id = id
  })
  for (var day in r.plan) {
    r.plan[day].exercises = r.plan[day].exercises.map(function(x) { return renames[x] || x })
  }
  return r
}

function byName(a, b) { return a.name.localeCompare(b.name) }

function dayEntry(r, day) {
  if (!r.plan[day]) r.plan[day] = { focus: "", exercises: [] }
  return r.plan[day]
}

// Moves list[from] to position `to` in place; out-of-range moves do nothing.
function moveItem(list, from, to) {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return
  list.splice(to, 0, list.splice(from, 1)[0])
}

function setFocus(routine, day, text) {
  var r = cloneRoutine(routine)
  dayEntry(r, day).focus = String(text || "")
  return pruneDays(r)
}

function addToDay(routine, day, id) {
  var r = cloneRoutine(routine)
  if (!findExercise(r, id)) return r
  var entry = dayEntry(r, day)
  if (entry.exercises.indexOf(id) === -1) entry.exercises.push(id)
  return r
}

function removeFromDay(routine, day, index) {
  var r = cloneRoutine(routine)
  if (r.plan[day]) r.plan[day].exercises.splice(index, 1)
  return pruneDays(r)
}

function moveInDay(routine, day, from, to) {
  var r = cloneRoutine(routine)
  if (r.plan[day]) moveItem(r.plan[day].exercises, from, to)
  return r
}

// The "Add exercise…" choices for a day: named exercises not in it yet.
function dayOptions(routine, day, t) {
  var taken = routine.plan[day] ? routine.plan[day].exercises : []
  return routine.exercises.filter(function(e) { return e.name.trim() !== "" && taken.indexOf(e.id) === -1 })
    .sort(byName)
    .map(function(e) { return { value: e.id, label: e.name, description: groupText(e, t) } })
}

function moveGroup(routine, from, to) {
  var r = cloneRoutine(routine)
  moveItem(r.rotation, from, to)
  return r
}

// Excluding takes a group out of the rotation; including puts it last.
function toggleGroup(routine, group) {
  var r = cloneRoutine(routine)
  var i = r.rotation.indexOf(group)
  if (i === -1) r.rotation.push(group)
  else r.rotation.splice(i, 1)
  return r
}

function countText(n, t) { return n === 1 ? tr(t, "1 exercise") : tr(t, "%1 exercises", [n]) }

// Included groups first, in rotation order (so a row's index is its index in
// `rotation`), then the known groups left out.
function rotationRows(routine, t) {
  var groups = routine.rotation.slice()
  GROUP_ORDER.forEach(function(g) { if (groups.indexOf(g) === -1) groups.push(g) })
  return groups.map(function(g) {
    var included = routine.rotation.indexOf(g) !== -1
    var count = routine.exercises.filter(function(e) { return e.group === g }).length
    return { group: g, name: groupText({ group: g }, t), included: included, count: count,
             detail: included && count === 0 ? tr(t, "No exercises: skipped") : countText(count, t) }
  })
}

// The editor's exercise list: known groups in GROUP_ORDER, unknown ones after
// them in order of appearance, each sorted by name. `query` filters by name.
function catalogSections(routine, query, t) {
  var q = String(query || "").trim().toLowerCase()
  var groups = GROUP_ORDER.slice()
  routine.exercises.forEach(function(e) { if (groups.indexOf(e.group) === -1) groups.push(e.group) })
  var sections = []
  groups.forEach(function(g) {
    var list = routine.exercises.filter(function(e) {
      return e.group === g && (q === "" || e.name.toLowerCase().indexOf(q) !== -1)
    }).sort(byName)
    if (list.length > 0) sections.push({ group: g, name: groupText({ group: g }, t), exercises: list })
  })
  return sections
}

function catalogIds(routine, query) {
  var ids = []
  catalogSections(routine, query).forEach(function(s) {
    s.exercises.forEach(function(e) { ids.push(e.id) })
  })
  return ids
}

// What to select once `id` is deleted: the next one in the list, or the
// previous one when it was last, or nothing.
function selectionAfterRemove(routine, id) {
  var ids = catalogIds(routine)
  var i = ids.indexOf(id)
  if (i === -1 || ids.length === 1) return ""
  return i < ids.length - 1 ? ids[i + 1] : ids[i - 1]
}

function routineProblem(routine, t) {
  if (routine.exercises.length === 0) return tr(t, "Add at least one exercise")
  var seen = {}
  for (var i = 0; i < routine.exercises.length; i++) {
    var name = String(routine.exercises[i].name).trim()
    if (name === "") return tr(t, "An exercise needs a name")
    if (seen[name.toLowerCase()]) return tr(t, "Two exercises are called %1", [name])
    seen[name.toLowerCase()] = true
  }
  return ""
}

function canonicalRoutine(r) {
  return JSON.stringify({
    exercises: r.exercises.map(function(e) { return [e.id, e.name, e.group, e.equipment, e.sets, e.reps, e.cue] }),
    plan: DAY_KEYS.map(function(k) { return r.plan[k] ? [k, r.plan[k].focus, r.plan[k].exercises] : null }),
    rotation: r.rotation
  })
}

function sameRoutine(a, b) { return canonicalRoutine(a) === canonicalRoutine(b) }

if (typeof module !== "undefined") {
  module.exports = { MIN: MIN, DAY_KEYS: DAY_KEYS, MODE_NAMES: MODE_NAMES, clock: clock, dateKey: dateKey,
                     parseClock: parseClock, normalizeConfig: normalizeConfig, inWorkHours: inWorkHours,
                     normalizeRoutine: normalizeRoutine, findExercise: findExercise, pickExercise: pickExercise,
                     initialState: initialState, normalizeState: normalizeState, step: step, apply: apply, act: act,
                     minutesLeft: minutesLeft, clockLeft: clockLeft, prescription: prescription,
                     equipmentText: equipmentText, groupText: groupText, modeText: modeText,
                     scheduleText: scheduleText, barFace: barFace,
                     // routine editing
                     GROUP_ORDER: GROUP_ORDER, EQUIPMENT_ORDER: EQUIPMENT_ORDER, cloneRoutine: cloneRoutine,
                     slug: slug, exerciseId: exerciseId, newExercise: newExercise, updateExercise: updateExercise,
                     toggleEquipment: toggleEquipment, removeExercise: removeExercise,
                     exerciseUsage: exerciseUsage, listText: listText, deleteText: deleteText, finalizeIds: finalizeIds,
                     setFocus: setFocus, addToDay: addToDay, removeFromDay: removeFromDay, moveInDay: moveInDay,
                     dayOptions: dayOptions, moveGroup: moveGroup, toggleGroup: toggleGroup, countText: countText,
                     rotationRows: rotationRows, catalogSections: catalogSections, catalogIds: catalogIds,
                     selectionAfterRemove: selectionAfterRemove, routineProblem: routineProblem,
                     sameRoutine: sameRoutine }
}
