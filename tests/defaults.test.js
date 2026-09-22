// The bundled routine ships in two languages. They are two files, so nothing
// stops them drifting apart: an exercise added to one and forgotten in the
// other, a set count changed on one side only, a day's list reordered. These
// tests are what keeps them the same routine in two languages instead of two
// different routines.

const test = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const path = require("node:path")

const dir = path.join(__dirname, "..", "defaults")
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
const en = read("routine.json")
const es = read("routine.es.json")

const byId = routine => Object.fromEntries(routine.exercises.map(e => [e.id, e]))

test("both bundled routines hold the same exercises", () => {
  assert.deepEqual(Object.keys(byId(es)).sort(), Object.keys(byId(en)).sort())
})

test("translating the routine changes no exercise's data", () => {
  const a = byId(en)
  const b = byId(es)
  for (const id of Object.keys(a)) {
    assert.equal(b[id].group, a[id].group, `group differs for ${id}`)
    assert.deepEqual(b[id].equipment, a[id].equipment, `equipment differs for ${id}`)
    assert.equal(b[id].sets, a[id].sets, `sets differ for ${id}`)
  }
})

test("the weekly plan and the rotation are the same in both", () => {
  assert.deepEqual(Object.keys(es.plan).sort(), Object.keys(en.plan).sort())
  for (const day of Object.keys(en.plan))
    assert.deepEqual(es.plan[day].exercises, en.plan[day].exercises, `${day} differs`)
  assert.deepEqual(es.rotation, en.rotation)
})

test("every name, cue and focus is actually translated", () => {
  // A copy-paste that left an English name behind would otherwise ship
  // unnoticed: the file would still be valid and every other test would pass.
  const a = byId(en)
  const b = byId(es)
  for (const id of Object.keys(a)) {
    if (id === "turkish-get-up") continue   // the same name in Spanish
    assert.notEqual(b[id].name, a[id].name, `name not translated: ${id}`)
    assert.notEqual(b[id].cue, a[id].cue, `cue not translated: ${id}`)
  }
  for (const day of Object.keys(en.plan))
    assert.notEqual(es.plan[day].focus, en.plan[day].focus, `focus not translated: ${day}`)
})

test("every exercise in both plans exists in the catalog", () => {
  for (const [routine, name] of [[en, "routine.json"], [es, "routine.es.json"]]) {
    const ids = new Set(routine.exercises.map(e => e.id))
    for (const day of Object.keys(routine.plan))
      for (const id of routine.plan[day].exercises)
        assert.ok(ids.has(id), `${name}: ${day} points at a missing exercise: ${id}`)
  }
})
