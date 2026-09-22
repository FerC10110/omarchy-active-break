// Run with: node --test tests/
// Dates are built with the local-time Date constructor, so the suite does not
// depend on TZ. 2026-09-21 is a Monday.
const test = require("node:test")
const assert = require("node:assert/strict")
const M = require("../BreakModel.js")
const I18n = require("../I18n.js")
const es = (s, args) => I18n.t(s, "es", args)   // el traductor atado al español

const MIN = 60000
const first = () => 0                     // rng that always takes the first candidate
const at = (d, h, m) => new Date(2026, 8, d, h, m || 0).getTime()
const MON_10 = at(21, 10)

const routine = M.normalizeRoutine({
  exercises: [
    { id: "goblet", name: "Goblet squat", group: "legs", equipment: ["kettlebell"], sets: 3, reps: "10", cue: "Chest up" },
    { id: "lunge", name: "Reverse lunge", group: "legs", equipment: ["dumbbells"], sets: 3, reps: "8/leg", cue: "" },
    { id: "pushups", name: "Push-ups", group: "push", equipment: [], sets: 3, reps: "max", cue: "" },
    { id: "press", name: "Overhead press", group: "push", equipment: ["barbell", "rack"], sets: 4, reps: "6", cue: "" },
    { id: "row", name: "Barbell row", group: "pull", equipment: ["barbell"], sets: 4, reps: "8", cue: "" }
  ],
  plan: {
    mon: { focus: "Push", exercises: ["press", "pushups"] },
    tue: { focus: "Legs", exercises: ["goblet", "lunge", "missing"] }
  },
  rotation: ["legs", "push", "pull", "core"]
})

const config = M.normalizeConfig({})

function working(overrides) {
  return Object.assign(M.initialState(), {
    phase: "working", dueAt: MON_10 + 30 * MIN, lastTickAt: MON_10, exerciseId: "press"
  }, overrides || {})
}

// ---- config

test("normalizeConfig fills defaults", () => {
  assert.deepEqual(config, {
    work: 30, break: 10, renotify: 5, snooze: 10, mode: "weekly", sound: true,
    schedule: { days: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "18:00" }
  })
})

test("normalizeConfig clamps numbers and rejects bad values", () => {
  const c = M.normalizeConfig({ work: 0, break: 500, renotify: "x", mode: "chaos", sound: false,
                                schedule: { days: ["mon", "holiday"], start: "25:00", end: "17:30" } })
  assert.equal(c.work, 1)
  assert.equal(c.break, 60)
  assert.equal(c.renotify, 5)
  assert.equal(c.mode, "weekly")
  assert.equal(c.sound, false)
  assert.deepEqual(c.schedule, { days: ["mon"], start: "09:00", end: "17:30" })
})

// ---- routine

test("normalizeRoutine drops unknown ids from the plan and incomplete exercises", () => {
  const r = M.normalizeRoutine({ exercises: [{ id: "a", name: "A", group: "core" }, { name: "no id" }],
                                 plan: { mon: { exercises: ["a", "b"] } } })
  assert.deepEqual(r.exercises.map(e => e.id), ["a"])
  assert.deepEqual(r.plan.mon.exercises, ["a"])
  assert.deepEqual(routine.plan.tue.exercises, ["goblet", "lunge"])
})

// ---- schedule

test("inWorkHours respects days and the [start, end) window", () => {
  const s = config.schedule
  assert.equal(M.inWorkHours(s, new Date(MON_10)), true)
  assert.equal(M.inWorkHours(s, new Date(at(21, 8, 59))), false)
  assert.equal(M.inWorkHours(s, new Date(at(21, 9))), true)
  assert.equal(M.inWorkHours(s, new Date(at(21, 18))), false)
  assert.equal(M.inWorkHours(s, new Date(at(19, 10))), false)   // Saturday
})

// ---- picking

test("weekly mode walks the day's plan in order and cycles", () => {
  let memo = {}
  const picked = []
  for (let i = 0; i < 3; i++) {
    const r = M.pickExercise("weekly", routine, memo, new Date(MON_10), first)
    picked.push(r.exerciseId)
    memo = r.memo
  }
  assert.deepEqual(picked, ["press", "pushups", "press"])
})

test("weekly mode restarts the plan on a new day", () => {
  const memo = { planDay: "2026-09-21", planIndex: 1, lastExerciseId: "press" }
  const r = M.pickExercise("weekly", routine, memo, new Date(at(22, 10)), first)
  assert.equal(r.exerciseId, "goblet")
  assert.equal(r.memo.planDay, "2026-09-22")
  assert.equal(r.memo.planIndex, 1)
})

test("weekly mode with no plan for the day falls back to the catalog", () => {
  const r = M.pickExercise("weekly", routine, { lastExerciseId: "goblet" }, new Date(at(23, 10)), first)
  assert.equal(r.exerciseId, "lunge")
})

test("rotation mode moves to the next group that has exercises", () => {
  const r = M.pickExercise("rotation", routine, { lastGroup: "push", lastExerciseId: "press" }, new Date(MON_10), first)
  assert.equal(r.exerciseId, "row")
  assert.equal(r.memo.lastGroup, "pull")
  const wrap = M.pickExercise("rotation", routine, { lastGroup: "pull" }, new Date(MON_10), first)
  assert.equal(wrap.memo.lastGroup, "legs")   // "core" has no exercises, skipped
})

test("rotation reroll stays in the same group with another exercise", () => {
  const r = M.pickExercise("rotation", routine, { lastGroup: "legs", lastExerciseId: "goblet" },
                           new Date(MON_10), first, true)
  assert.equal(r.exerciseId, "lunge")
  assert.equal(r.memo.lastGroup, "legs")
})

test("random mode never repeats the last exercise", () => {
  const r = M.pickExercise("random", routine, { lastExerciseId: "goblet" }, new Date(MON_10), first)
  assert.equal(r.exerciseId, "lunge")
  assert.equal(r.memo.lastExerciseId, "lunge")
})

// ---- step

test("off starts a work cycle when work hours begin", () => {
  const r = M.step(M.initialState(), config, routine, MON_10, first)
  assert.equal(r.state.phase, "working")
  assert.equal(r.state.dueAt, MON_10 + 30 * MIN)
  assert.equal(r.state.exerciseId, "press")
  assert.deepEqual(r.events, [])
})

test("off stays off outside work hours", () => {
  const r = M.step(M.initialState(), config, routine, at(19, 10), first)
  assert.equal(r.state.phase, "off")
})

test("working becomes due at dueAt and asks for a notification", () => {
  const before = M.step(working({ lastTickAt: MON_10 + 29 * MIN - 1000 }), config, routine, MON_10 + 29 * MIN, first)
  assert.equal(before.state.phase, "working")
  assert.deepEqual(before.events, [])
  const s = working({ lastTickAt: MON_10 + 30 * MIN - 1000 })
  const r = M.step(s, config, routine, MON_10 + 30 * MIN, first)
  assert.equal(r.state.phase, "due")
  assert.equal(r.state.lastNotifiedAt, MON_10 + 30 * MIN)
  assert.deepEqual(r.events, ["due"])
})

test("due notifies again every renotify minutes", () => {
  const due = working({ phase: "due", lastNotifiedAt: MON_10, lastTickAt: MON_10 + 4 * MIN })
  const quiet = M.step(due, config, routine, MON_10 + 4 * MIN + 30000, first)
  assert.deepEqual(quiet.events, [])
  const again = M.step(Object.assign({}, due, { lastTickAt: MON_10 + 5 * MIN - 1000 }), config, routine,
                       MON_10 + 5 * MIN, first)
  assert.deepEqual(again.events, ["due"])
  assert.equal(again.state.lastNotifiedAt, MON_10 + 5 * MIN)
})

test("break ends into a new work cycle with a new exercise", () => {
  const s = working({ phase: "break", breakEndsAt: MON_10 + 10 * MIN, lastTickAt: MON_10 + 10 * MIN - 1000,
                      exerciseId: "press", lastExerciseId: "press", planDay: "2026-09-21", planIndex: 1 })
  const r = M.step(s, config, routine, MON_10 + 10 * MIN, first)
  assert.equal(r.state.phase, "working")
  assert.equal(r.state.dueAt, MON_10 + 40 * MIN)
  assert.equal(r.state.exerciseId, "pushups")
  assert.deepEqual(r.events, ["breakEnd"])
})

test("working and due turn off when work hours end", () => {
  const late = at(21, 18)
  assert.equal(M.step(working({ lastTickAt: late - 1000 }), config, routine, late, first).state.phase, "off")
  assert.equal(M.step(working({ phase: "due", lastTickAt: late - 1000 }), config, routine, late, first).state.phase, "off")
})

test("a break in progress finishes even after work hours end", () => {
  const late = at(21, 18)
  const s = working({ phase: "break", breakEndsAt: late + 5 * MIN, lastTickAt: late - 1000 })
  assert.equal(M.step(s, config, routine, late, first).state.phase, "break")
  const done = M.step(Object.assign({}, s, { lastTickAt: late + 5 * MIN - 1000 }), config, routine, late + 5 * MIN, first)
  assert.equal(done.state.phase, "off")
  assert.deepEqual(done.events, ["breakEnd"])
})

test("a gap longer than a break (suspend) restarts the work cycle quietly", () => {
  const wake = MON_10 + 45 * MIN
  const r = M.step(working({ lastTickAt: MON_10 + 5 * MIN }), config, routine, wake, first)
  assert.equal(r.state.phase, "working")
  assert.equal(r.state.dueAt, wake + 30 * MIN)
  assert.equal(r.state.exerciseId, "press")        // not done yet, so it stays
  assert.deepEqual(r.events, [])
  const fromDue = M.step(working({ phase: "due", lastTickAt: MON_10 + 5 * MIN }), config, routine, wake, first)
  assert.equal(fromDue.state.phase, "working")
})

test("a break that ended during a gap closes without notifying", () => {
  const s = working({ phase: "break", breakEndsAt: MON_10 + 10 * MIN, lastTickAt: MON_10 + 5 * MIN })
  const r = M.step(s, config, routine, MON_10 + 60 * MIN, first)
  assert.equal(r.state.phase, "working")
  assert.deepEqual(r.events, [])
})

test("paused stays paused the same day and clears on the next workday", () => {
  const paused = working({ phase: "paused", remainingMs: 12 * MIN, pausedDay: "2026-09-21" })
  assert.equal(M.step(paused, config, routine, MON_10 + 90 * MIN, first).state.phase, "paused")
  const nextDay = M.step(paused, config, routine, at(22, 9, 30), first)
  assert.equal(nextDay.state.phase, "working")
  assert.equal(nextDay.state.remainingMs, null)
})

test("step always records lastTickAt", () => {
  const r = M.step(working(), config, routine, MON_10 + MIN, first)
  assert.equal(r.state.lastTickAt, MON_10 + MIN)
})

// ---- actions

test("startBreak from due or working runs the break clock", () => {
  for (const phase of ["due", "working"]) {
    const r = M.apply(working({ phase: phase }), "startBreak", config, routine, MON_10, first)
    assert.equal(r.state.phase, "break")
    assert.equal(r.state.breakEndsAt, MON_10 + 10 * MIN)
  }
})

test("snooze keeps the exercise and pushes dueAt", () => {
  const r = M.apply(working({ phase: "due" }), "snooze", config, routine, MON_10, first)
  assert.equal(r.state.phase, "working")
  assert.equal(r.state.dueAt, MON_10 + 10 * MIN)
  assert.equal(r.state.exerciseId, "press")
})

test("skip starts a full cycle with the next exercise", () => {
  const s = working({ phase: "due", lastExerciseId: "press", planDay: "2026-09-21", planIndex: 1 })
  const r = M.apply(s, "skip", config, routine, MON_10, first)
  assert.equal(r.state.phase, "working")
  assert.equal(r.state.dueAt, MON_10 + 30 * MIN)
  assert.equal(r.state.exerciseId, "pushups")
})

test("finishBreak ends the break early into a new cycle", () => {
  const s = working({ phase: "break", breakEndsAt: MON_10 + 8 * MIN, lastExerciseId: "press",
                      planDay: "2026-09-21", planIndex: 1 })
  const r = M.apply(s, "finishBreak", config, routine, MON_10, first)
  assert.equal(r.state.phase, "working")
  assert.equal(r.state.exerciseId, "pushups")
  assert.deepEqual(r.events, [])
})

test("pause keeps the remaining time and resume restores it", () => {
  const paused = M.apply(working(), "pause", config, routine, MON_10 + 12 * MIN, first).state
  assert.equal(paused.phase, "paused")
  assert.equal(paused.remainingMs, 18 * MIN)
  assert.equal(paused.pausedDay, "2026-09-21")
  const resumed = M.apply(paused, "resume", config, routine, MON_10 + 60 * MIN, first).state
  assert.equal(resumed.phase, "working")
  assert.equal(resumed.dueAt, MON_10 + 78 * MIN)
})

test("togglePause flips between paused and working", () => {
  const p = M.apply(working(), "togglePause", config, routine, MON_10, first).state
  assert.equal(p.phase, "paused")
  assert.equal(M.apply(p, "togglePause", config, routine, MON_10, first).state.phase, "working")
})

test("resume outside work hours lands in off", () => {
  const p = working({ phase: "paused", remainingMs: 5 * MIN, pausedDay: "2026-09-21" })
  assert.equal(M.apply(p, "resume", config, routine, at(21, 19), first).state.phase, "off")
})

test("reroll swaps the exercise without touching the clock", () => {
  const s = working({ lastExerciseId: "press", planDay: "2026-09-21", planIndex: 1 })
  const r = M.apply(s, "reroll", config, routine, MON_10, first)
  assert.equal(r.state.exerciseId, "pushups")
  assert.equal(r.state.dueAt, s.dueAt)
})

test("actions that do not apply to the phase change nothing", () => {
  const off = M.initialState()
  assert.deepEqual(M.apply(off, "snooze", config, routine, MON_10, first).state, off)
  assert.deepEqual(M.apply(off, "finishBreak", config, routine, MON_10, first).state, off)
})

test("normalizeState repairs a broken state file", () => {
  assert.deepEqual(M.normalizeState(null), M.initialState())
  assert.equal(M.normalizeState({ phase: "bailando" }).phase, "off")
  assert.equal(M.normalizeState({ phase: "working", dueAt: 5 }).dueAt, 5)
})

// ---- text

test("countdown formats", () => {
  assert.equal(M.minutesLeft(18 * MIN - 1000), "18m")
  assert.equal(M.minutesLeft(0), "0m")
  assert.equal(M.minutesLeft(95 * MIN), "1h35")
  assert.equal(M.clockLeft(7 * MIN + 32000), "7:32")
  assert.equal(M.clockLeft(-5), "0:00")
  assert.equal(M.clock(new Date(at(21, 9, 5))), "09:05")
})

test("prescription and equipment labels", () => {
  const ex = routine.exercises.find(e => e.id === "press")
  assert.equal(M.prescription(ex), "4 × 6")
  assert.equal(M.equipmentText(ex), "Barbell · Rack")
  assert.equal(M.equipmentText(routine.exercises.find(e => e.id === "pushups")), "Bodyweight")
})

test("modeText names the day's focus in weekly mode", () => {
  assert.equal(M.modeText(config, routine, new Date(MON_10)), "Weekly plan · Monday: Push")
  assert.equal(M.modeText(Object.assign({}, config, { mode: "rotation" }), routine, new Date(MON_10)),
               "Muscle-group rotation")
})

test("barFace per phase", () => {
  const now = MON_10 + 12 * MIN
  const w = M.barFace(working(), routine, now)
  assert.equal(w.text, "18m")
  assert.equal(w.tone, "normal")
  assert.match(w.tooltip, /Next break 10:30 · Overhead press/)
  const d = M.barFace(working({ phase: "due" }), routine, now)
  assert.equal(d.tone, "urgent")
  assert.equal(d.text, "Go!")
  assert.match(d.tooltip, /Time to move! Overhead press · 4 × 6/)
  const b = M.barFace(working({ phase: "break", breakEndsAt: now + 7 * MIN + 32000 }), routine, now)
  assert.equal(b.text, "7:32")
  assert.equal(b.tone, "accent")
  const off = M.barFace(M.initialState(), routine, now)
  assert.equal(off.tone, "dim")
  assert.equal(off.tooltip, "Active Break · outside work hours")
  assert.equal(M.barFace(working({ phase: "paused", remainingMs: MIN }), routine, now).tone, "dim")
})

test("scheduleText lists days in week order", () => {
  assert.equal(M.scheduleText(config.schedule), "Mon Tue Wed Thu Fri · 09:00–18:00")
  assert.equal(M.scheduleText({ days: ["sun", "mon"], start: "08:00", end: "12:00" }), "Mon Sun · 08:00–12:00")
  assert.equal(M.scheduleText({ days: [], start: "08:00", end: "12:00" }), "no days · 08:00–12:00")
})

test("bundled defaults are valid as shipped", () => {
  const raw = require("../defaults/routine.json")
  const r = M.normalizeRoutine(raw)
  assert.equal(r.exercises.length, raw.exercises.length)
  assert.equal(new Set(r.exercises.map(e => e.id)).size, r.exercises.length)
  for (const day in raw.plan) assert.deepEqual(r.plan[day].exercises, raw.plan[day].exercises)
  for (const g of r.rotation) assert.ok(r.exercises.some(e => e.group === g), "group without exercises: " + g)
  assert.deepEqual(M.normalizeConfig(require("../defaults/config.json")), M.normalizeConfig({}))
})

// ---- settings changed mid-cycle (the running clock follows the new values)

test("shortening work while working brings the break forward", () => {
  const s = working({ workMin: 30, lastTickAt: MON_10 + 5 * MIN - 1000 })
  const r = M.step(s, M.normalizeConfig({ work: 1 }), routine, MON_10 + 5 * MIN, first)
  assert.equal(r.state.phase, "due")
  assert.deepEqual(r.events, ["due"])
  assert.equal(r.state.workMin, 1)
})

test("lengthening work while working pushes the break back", () => {
  const s = working({ workMin: 30, lastTickAt: MON_10 + 5 * MIN - 1000 })
  const r = M.step(s, M.normalizeConfig({ work: 45 }), routine, MON_10 + 5 * MIN, first)
  assert.equal(r.state.dueAt, MON_10 + 45 * MIN)
})

test("changing the break length during a break moves its end", () => {
  const s = working({ phase: "break", breakMin: 10, breakEndsAt: MON_10 + 10 * MIN, lastTickAt: MON_10 + MIN - 1000 })
  const r = M.step(s, M.normalizeConfig({ break: 5 }), routine, MON_10 + MIN, first)
  assert.equal(r.state.breakEndsAt, MON_10 + 5 * MIN)
  assert.equal(r.state.breakMin, 5)
})

test("a state without recorded durations adopts the config as is", () => {
  const r = M.step(working({ lastTickAt: MON_10 + MIN - 1000 }), M.normalizeConfig({ work: 45 }), routine, MON_10 + MIN, first)
  assert.equal(r.state.dueAt, MON_10 + 30 * MIN)
  assert.equal(r.state.workMin, 45)
})

test("changing the mode while working re-picks the upcoming exercise", () => {
  const s = working({ mode: "weekly", lastExerciseId: "press", lastTickAt: MON_10 + MIN - 1000 })
  const r = M.step(s, M.normalizeConfig({ mode: "rotation" }), routine, MON_10 + MIN, first)
  assert.equal(r.state.exerciseId, "goblet")
  assert.equal(r.state.mode, "rotation")
})

test("a cycle records the durations and mode it started with", () => {
  const r = M.step(M.initialState(), config, routine, MON_10, first)
  assert.equal(r.state.workMin, 30)
  assert.equal(r.state.breakMin, 10)
  assert.equal(r.state.mode, "weekly")
})

// ---- act: an action first brings the clock up to date, then applies

test("act catches up on a gap before applying the action", () => {
  // Woke from a long suspend: the pending cycle is stale. Pausing must pause
  // the fresh cycle the gap starts, not the stale one (which had 0 left).
  const stale = working({ workMin: 30, breakMin: 10, mode: "weekly", lastTickAt: MON_10 + 5 * MIN })
  const wake = MON_10 + 3 * 60 * MIN
  const r = M.act(stale, "pause", config, routine, wake, first)
  assert.equal(r.state.phase, "paused")
  assert.equal(r.state.remainingMs, 30 * MIN)
  assert.equal(r.changed, true)
})

test("act drops a due notice that the action already answers", () => {
  const s = working({ workMin: 30, breakMin: 10, mode: "weekly", lastTickAt: MON_10 + 30 * MIN - 1000 })
  const r = M.act(s, "snooze", config, routine, MON_10 + 30 * MIN, first)
  assert.deepEqual(r.events, [])
  assert.equal(r.state.phase, "working")
  assert.equal(r.state.dueAt, MON_10 + 40 * MIN)
})

test("act reports when the action does not apply", () => {
  const r = M.act(M.initialState(), "snooze", config, routine, at(19, 10), first)
  assert.equal(r.changed, false)
})

// ---- routine editing

test("slug makes ids from names", () => {
  assert.equal(M.slug("Goblet Squat!"), "goblet-squat")
  assert.equal(M.slug("  Farmer's walk  "), "farmer-s-walk")
  assert.equal(M.slug("Búlgara"), "bulgara")
  assert.equal(M.slug("!!!"), "exercise")
})

test("exerciseId avoids ids the catalog already has", () => {
  assert.equal(M.exerciseId("Plank", routine), "plank")
  const r = M.normalizeRoutine({ exercises: [{ id: "plank", name: "Plank", group: "core" },
                                             { id: "plank-2", name: "Side plank", group: "core" }] })
  assert.equal(M.exerciseId("Plank", r), "plank-3")
})

test("newExercise adds a blank exercise with a temporary id and leaves the input alone", () => {
  const made = M.newExercise(routine, "push")
  assert.equal(made.id, "new:1")
  assert.deepEqual(M.findExercise(made.routine, "new:1"),
                   { id: "new:1", name: "", group: "push", equipment: [], sets: 3, reps: "10", cue: "" })
  assert.equal(routine.exercises.length, 5)
  assert.equal(M.newExercise(made.routine, "legs").id, "new:2")
})

test("updateExercise changes only the given fields", () => {
  const r = M.updateExercise(routine, "goblet", { name: "Goblet squat (pause)", sets: 4 })
  const ex = M.findExercise(r, "goblet")
  assert.equal(ex.name, "Goblet squat (pause)")
  assert.equal(ex.sets, 4)
  assert.equal(ex.reps, "10")
  assert.equal(M.findExercise(routine, "goblet").name, "Goblet squat")
})

test("toggleEquipment keeps the equipment in catalog order", () => {
  let r = M.toggleEquipment(routine, "pushups", "bench")
  r = M.toggleEquipment(r, "pushups", "dumbbells")
  assert.deepEqual(M.findExercise(r, "pushups").equipment, ["dumbbells", "bench"])
  r = M.toggleEquipment(r, "pushups", "bench")
  assert.deepEqual(M.findExercise(r, "pushups").equipment, ["dumbbells"])
  assert.deepEqual(M.findExercise(routine, "pushups").equipment, [])
})

test("removeExercise takes it out of the catalog and every plan day", () => {
  const r = M.removeExercise(routine, "press")
  assert.equal(M.findExercise(r, "press"), null)
  assert.deepEqual(r.plan.mon.exercises, ["pushups"])
  assert.ok(M.findExercise(routine, "press"))
})

test("removeExercise drops a plan day it leaves with no focus and no exercises", () => {
  const r = M.normalizeRoutine({ exercises: [{ id: "a", name: "A", group: "core" }, { id: "b", name: "B", group: "core" }],
                                 plan: { wed: { focus: "", exercises: ["a"] } } })
  assert.equal(M.removeExercise(r, "a").plan.wed, undefined)
})

test("exerciseUsage lists the days that use an exercise, Monday first", () => {
  const r = M.normalizeRoutine(Object.assign({}, routine, {
    plan: Object.assign({}, routine.plan, { sun: { focus: "", exercises: ["goblet"] } }) }))
  assert.deepEqual(M.exerciseUsage(r, "goblet"), ["tue", "sun"])
  assert.deepEqual(M.exerciseUsage(r, "row"), [])
})

test("deleteText warns about the plans that use the exercise", () => {
  assert.equal(M.deleteText(routine, "row"), "Delete Barbell row?")
  assert.equal(M.deleteText(routine, "goblet"),
               "Delete Goblet squat? It's in the Tuesday plan; it will be removed from it.")
  const r = M.normalizeRoutine(Object.assign({}, routine, { plan: {
    mon: { focus: "", exercises: ["row"] }, wed: { focus: "", exercises: ["row"] }, fri: { focus: "", exercises: ["row"] } } }))
  assert.equal(M.deleteText(r, "row"),
               "Delete Barbell row? It's in the Monday, Wednesday and Friday plans; it will be removed from them.")
  assert.equal(M.deleteText(M.newExercise(routine, "legs").routine, "new:1"), "Delete this exercise?")
})

test("finalizeIds names new exercises after their final name and fixes the plan", () => {
  let made = M.newExercise(routine, "core")
  let r = M.updateExercise(made.routine, made.id, { name: "Dead bug" })
  made = M.newExercise(r, "core")
  r = M.updateExercise(made.routine, made.id, { name: "Dead bug" })
  r = JSON.parse(JSON.stringify(r))
  r.plan.mon.exercises.push("new:1")
  const done = M.finalizeIds(r)
  assert.deepEqual(done.exercises.slice(-2).map(e => e.id), ["dead-bug", "dead-bug-2"])
  assert.deepEqual(done.plan.mon.exercises, ["press", "pushups", "dead-bug"])
  assert.equal(M.findExercise(done, "goblet").name, "Goblet squat")
  assert.deepEqual(r.plan.mon.exercises, ["press", "pushups", "new:1"])
})

test("finalizeIds trims every exercise's name", () => {
  const r = M.updateExercise(routine, "goblet", { name: "  Goblet squat  " })
  assert.equal(M.finalizeIds(r).exercises.find(e => e.id === "goblet").name, "Goblet squat")
})

test("setFocus names a day, and a day with no focus and no exercises disappears", () => {
  let r = M.setFocus(routine, "wed", "Pull")
  assert.deepEqual(r.plan.wed, { focus: "Pull", exercises: [] })
  r = M.setFocus(r, "wed", "")
  assert.equal(r.plan.wed, undefined)
  assert.equal(routine.plan.wed, undefined)
})

test("addToDay appends an exercise once and ignores unknown ids", () => {
  let r = M.addToDay(routine, "mon", "row")
  r = M.addToDay(r, "mon", "row")
  r = M.addToDay(r, "mon", "nope")
  assert.deepEqual(r.plan.mon.exercises, ["press", "pushups", "row"])
  assert.deepEqual(M.addToDay(routine, "sat", "goblet").plan.sat, { focus: "", exercises: ["goblet"] })
  assert.deepEqual(routine.plan.mon.exercises, ["press", "pushups"])
})

test("removeFromDay takes out one entry and drops a day left empty", () => {
  assert.deepEqual(M.removeFromDay(routine, "mon", 0).plan.mon.exercises, ["pushups"])
  assert.equal(M.removeFromDay(M.addToDay(routine, "sat", "goblet"), "sat", 0).plan.sat, undefined)
  const bare = M.removeFromDay(M.removeFromDay(routine, "mon", 0), "mon", 0)
  assert.deepEqual(bare.plan.mon, { focus: "Push", exercises: [] })
})

test("moveInDay reorders a day and ignores moves past the ends", () => {
  assert.deepEqual(M.moveInDay(routine, "mon", 0, 1).plan.mon.exercises, ["pushups", "press"])
  assert.deepEqual(M.moveInDay(routine, "mon", 1, 2).plan.mon.exercises, ["press", "pushups"])
  assert.deepEqual(routine.plan.mon.exercises, ["press", "pushups"])
})

test("dayOptions offers the catalog minus the day's exercises, by name", () => {
  assert.deepEqual(M.dayOptions(routine, "mon"), [
    { value: "row", label: "Barbell row", description: "Pull" },
    { value: "goblet", label: "Goblet squat", description: "Legs" },
    { value: "lunge", label: "Reverse lunge", description: "Legs" }
  ])
  assert.equal(M.dayOptions(M.newExercise(routine, "legs").routine, "mon").length, 3)
})

test("moveGroup and toggleGroup edit the rotation", () => {
  assert.deepEqual(M.moveGroup(routine, 2, 1).rotation, ["legs", "pull", "push", "core"])
  assert.deepEqual(M.toggleGroup(routine, "push").rotation, ["legs", "pull", "core"])
  assert.deepEqual(M.toggleGroup(routine, "hinge").rotation, ["legs", "push", "pull", "core", "hinge"])
  assert.deepEqual(routine.rotation, ["legs", "push", "pull", "core"])
})

test("rotationRows lists included groups in order, then the rest", () => {
  const rows = M.rotationRows(routine)
  assert.deepEqual(rows.map(r => [r.group, r.included, r.count]),
    [["legs", true, 2], ["push", true, 2], ["pull", true, 1], ["core", true, 0], ["hinge", false, 0]])
  assert.equal(rows[0].name, "Legs")
  assert.equal(rows[0].detail, "2 exercises")
  assert.equal(rows[2].detail, "1 exercise")
  assert.equal(rows[3].detail, "No exercises: skipped")
  assert.equal(rows[4].detail, "0 exercises")
})

test("catalogSections groups by muscle group, sorted by name", () => {
  const sections = M.catalogSections(routine, "")
  assert.deepEqual(sections.map(s => s.group), ["legs", "push", "pull"])
  assert.equal(sections[0].name, "Legs")
  assert.deepEqual(sections[1].exercises.map(e => e.id), ["press", "pushups"])
})

test("catalogSections filters by name and puts unknown groups last", () => {
  const r = M.normalizeRoutine({ exercises: routine.exercises.concat([{ id: "carry", name: "Suitcase carry", group: "carries" }]) })
  assert.deepEqual(M.catalogSections(r, "").map(s => s.group), ["legs", "push", "pull", "carries"])
  assert.equal(M.catalogSections(r, "").slice(-1)[0].name, "carries")
  assert.deepEqual(M.catalogSections(r, "  PRESS ").map(s => s.exercises.map(e => e.id)), [["press"]])
})

test("catalogIds and selectionAfterRemove follow the list order", () => {
  assert.deepEqual(M.catalogIds(routine), ["goblet", "lunge", "press", "pushups", "row"])
  assert.equal(M.selectionAfterRemove(routine, "lunge"), "press")
  assert.equal(M.selectionAfterRemove(routine, "row"), "pushups")
  const one = M.normalizeRoutine({ exercises: [{ id: "a", name: "A", group: "core" }] })
  assert.equal(M.selectionAfterRemove(one, "a"), "")
})

test("routineProblem finds what blocks saving", () => {
  assert.equal(M.routineProblem(routine), "")
  assert.equal(M.routineProblem(M.newExercise(routine, "legs").routine), "An exercise needs a name")
  assert.equal(M.routineProblem(M.updateExercise(routine, "row", { name: " goblet SQUAT " })),
               "Two exercises are called goblet SQUAT")
  assert.equal(M.routineProblem({ exercises: [], plan: {}, rotation: [] }), "Add at least one exercise")
})

test("sameRoutine ignores plan key order and sees real edits", () => {
  const copy = JSON.parse(JSON.stringify(routine))
  assert.equal(M.sameRoutine(routine, copy), true)
  assert.equal(M.sameRoutine(routine, Object.assign({}, copy, { plan: { tue: copy.plan.tue, mon: copy.plan.mon } })), true)
  assert.equal(M.sameRoutine(routine, M.updateExercise(routine, "row", { reps: "10" })), false)
  assert.equal(M.sameRoutine(routine, M.moveGroup(routine, 0, 1)), false)
})

test("step re-picks when the pending exercise was deleted", () => {
  const r = M.removeExercise(routine, "press")
  const { state } = M.step(working({ exerciseId: "press" }), config, r, MON_10 + MIN, first)
  assert.equal(state.phase, "working")
  assert.equal(state.dueAt, MON_10 + 30 * MIN)
  assert.equal(state.exerciseId, "pushups")   // Monday's plan is now just push-ups
})

test("a break whose exercise was deleted shows another one and keeps its clock", () => {
  const s = Object.assign(M.initialState(), { phase: "break", breakEndsAt: MON_10 + 10 * MIN, lastTickAt: MON_10,
                                              exerciseId: "press", workMin: 30, breakMin: 10, mode: "weekly" })
  const { state } = M.step(s, config, M.removeExercise(routine, "press"), MON_10 + MIN, first)
  assert.equal(state.phase, "break")
  assert.equal(state.breakEndsAt, MON_10 + 10 * MIN)
  assert.equal(state.exerciseId, "pushups")
})

test("a break that ends as its deleted exercise is noticed picks only once", () => {
  const s = Object.assign(M.initialState(), { phase: "break", breakEndsAt: MON_10 + 10 * MIN, lastTickAt: MON_10 + 9 * MIN,
                                              exerciseId: "row", planDay: "2026-09-21", planIndex: 1,
                                              workMin: 30, breakMin: 10, mode: "weekly" })
  const { state } = M.step(s, config, M.removeExercise(routine, "row"), MON_10 + 10 * MIN, first)
  assert.equal(state.phase, "working")
  assert.equal(state.exerciseId, "pushups")   // the next plan entry, not the one after it
})

test("a pause from yesterday with a deleted exercise starts today's plan at the top", () => {
  const s = Object.assign(M.initialState(), { phase: "paused", pausedDay: "2026-09-21", remainingMs: 5 * MIN,
                                              lastTickAt: at(21, 17), exerciseId: "row", planDay: "2026-09-21",
                                              planIndex: 2, workMin: 30, breakMin: 10, mode: "weekly" })
  const { state } = M.step(s, config, M.removeExercise(routine, "row"), at(22, 10), first)
  assert.equal(state.phase, "working")
  assert.equal(state.exerciseId, "goblet")    // Tuesday's first entry
})

// ---- i18n: the model builds its texts through a translator

test("the texts of the model come out in Spanish with a Spanish translator", () => {
  const ex = M.findExercise(routine, "press")
  assert.equal(M.groupText(ex, es), "Empuje")
  assert.equal(M.equipmentText({ equipment: [] }, es), "Peso corporal")
  assert.equal(M.equipmentText({ equipment: ["kettlebell", "bench"] }, es), "Pesa rusa · Banco")
  assert.equal(M.countText(1, es), "1 ejercicio")
  assert.equal(M.countText(6, es), "6 ejercicios")
  assert.equal(M.listText(["Lunes", "Viernes"], es), "Lunes y Viernes")
})

test("the same texts stay in English without a translator", () => {
  const ex = M.findExercise(routine, "press")
  assert.equal(M.groupText(ex), "Push")
  assert.equal(M.countText(6), "6 exercises")
  assert.equal(M.listText(["Monday", "Friday"]), "Monday and Friday")
})

test("the bar face is translated", () => {
  const s = Object.assign(M.initialState(), { phase: "due", exerciseId: "press", workMin: 30, breakMin: 10 })
  assert.equal(M.barFace(s, routine, MON_10, es).text, "¡Dale!")
  assert.match(M.barFace(s, routine, MON_10, es).tooltip, /^¡Hora de moverte!/)
  assert.equal(M.barFace(s, routine, MON_10).text, "Go!")
})

test("the mode and schedule lines are translated", () => {
  assert.match(M.modeText(config, routine, new Date(MON_10), es), /^Plan semanal · Lunes:/)
  assert.equal(M.scheduleText(config.schedule, es), "Lun Mar Mié Jue Vie · 09:00–18:00")
})

test("the delete question names the days in Spanish", () => {
  const text = M.deleteText(routine, "press", es)
  assert.match(text, /^¿Borrar /)
  assert.match(text, /Está en (el plan|los planes) de /)
})

test("the routine problems are translated", () => {
  assert.equal(M.routineProblem({ exercises: [], plan: {}, rotation: [] }, es),
               "Agregá al menos un ejercicio")
  assert.equal(M.routineProblem({ exercises: [], plan: {}, rotation: [] }),
               "Add at least one exercise")
})
