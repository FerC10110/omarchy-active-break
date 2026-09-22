// Run with: node --test tests/
const test = require("node:test")
const assert = require("node:assert/strict")
const I18n = require("../I18n.js")

test("English returns the text as it came in", () => {
  assert.equal(I18n.t("Legs", "en"), "Legs")
})

test("a text with no translation comes back in English", () => {
  assert.equal(I18n.t("Not translated yet", "es"), "Not translated yet")
})

test("Spanish returns the translation", () => {
  assert.equal(I18n.t("Legs", "es"), "Piernas")
})

test("an unknown language falls back to English", () => {
  assert.equal(I18n.t("Legs", "de"), "Legs")
  assert.equal(I18n.t("Legs"), "Legs")
})

test("%1 and %2 take their values in order", () => {
  assert.equal(I18n.t("Next break %1 · %2", "en", ["10:30", "Back squat"]),
               "Next break 10:30 · Back squat")
  assert.equal(I18n.t("Next break %1 · %2", "es", ["10:30", "Back squat"]),
               "Próximo descanso 10:30 · Back squat")
})

test("a translation can put the placeholders in another order", () => {
  I18n.STRINGS.es["%1 before %2"] = "%2 después de %1"
  try {
    assert.equal(I18n.t("%1 before %2", "es", ["a", "b"]), "b después de a")
  } finally {
    delete I18n.STRINGS.es["%1 before %2"]
  }
})

test("numbers are stringified", () => {
  assert.equal(I18n.t("%1 exercises", "es", [6]), "6 ejercicios")
})

test("the same placeholder twice is filled twice", () => {
  I18n.STRINGS.es["%1 and %1"] = "%1 y %1"
  try {
    assert.equal(I18n.t("%1 and %1", "es", ["x"]), "x y x")
  } finally {
    delete I18n.STRINGS.es["%1 and %1"]
  }
})

test("an argument containing %2 is not re-substituted", () => {
  assert.equal(I18n.t("%1 · %2", "en", ["Press %2", "3 × 10"]), "Press %2 · 3 × 10")
})

test("%10 resolves to the tenth argument when there are ten", () => {
  assert.equal(I18n.t("%10", "en", ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]), "j")
})

test("%10 is left untouched when there are only two arguments", () => {
  assert.equal(I18n.t("%10", "en", ["a", "b"]), "%10")
})

test("%0 and a bare % are left untouched", () => {
  assert.equal(I18n.t("%0 and %", "en", ["a"]), "%0 and %")
})

test("an out-of-range marker is left untouched", () => {
  assert.equal(I18n.t("%1 and %3", "en", ["a", "b"]), "a and %3")
})

test("a key that exists on Object.prototype is not a translation", () => {
  assert.equal(I18n.t("constructor", "es"), "constructor")
  assert.equal(I18n.t("toString", "es", ["x"]), "toString")
})

test("an empty translation is a translation, not a missing one", () => {
  I18n.STRINGS.es["Nothing to say"] = ""
  try {
    assert.equal(I18n.t("Nothing to say", "es"), "")
  } finally {
    delete I18n.STRINGS.es["Nothing to say"]
  }
})

// ---- coverage: STRINGS.es against the real .qml/.js files on disk

const fs = require("node:fs")
const path = require("node:path")

// Strips comments before the orphan scan below, so a key that's typed only
// into a comment (not real code) doesn't count as "used": whole-line `//`
// comments (lines whose first non-space characters are `//`), removed line
// by line, and `/* ... */` blocks, removed first since they can span lines.
//
// Deliberately NOT stripping a trailing `//` that follows real code on the
// same line: a `//` inside a string literal (for instance a URL, or plain
// text that happens to contain two slashes) would truncate real text
// mid-line and turn a genuine, used key into a false "orphan" failure. So
// this only catches a key hidden in a comment that owns its whole line or a
// block comment — not one appended after code on the same line — on purpose.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map(line => (/^\s*\/\//.test(line) ? "" : line))
    .join("\n")
}

test("every Spanish translation belongs to a text the code uses", () => {
  const dir = path.join(__dirname, "..")
  const sources = fs.readdirSync(dir)
    .filter(f => f.endsWith(".qml") || f.endsWith(".js"))
    .filter(f => f !== "I18n.js")
    .map(f => stripComments(fs.readFileSync(path.join(dir, f), "utf8")))
    .join("\n")
  for (const key of Object.keys(I18n.STRINGS.es))
    assert.ok(sources.includes(key), `orphan translation: ${key}`)
})

test("every Spanish translation keeps the same %N placeholders as its key", () => {
  // Order may change — the design doc allows a translation to put %2 before
  // %1 — so compare the two as sets, not as sequences. What must never
  // happen is a value that drops a placeholder the key has, or invents one
  // the key doesn't, since either leaves the user staring at a literal %2.
  for (const [key, value] of Object.entries(I18n.STRINGS.es)) {
    const keyMarkers = [...new Set(key.match(/%\d+/g) || [])].sort()
    const valueMarkers = [...new Set(value.match(/%\d+/g) || [])].sort()
    assert.deepEqual(valueMarkers, keyMarkers,
      `placeholder mismatch in "${key}": key has ${JSON.stringify(keyMarkers)}, ` +
      `value has ${JSON.stringify(valueMarkers)}`)
  }
})

test("every English string the code passes to a translator has a Spanish entry", () => {
  const dir = path.join(__dirname, "..")
  const files = fs.readdirSync(dir)
    .filter(f => (f.endsWith(".qml") || f.endsWith(".js")) && f !== "I18n.js")

  const found = new Set()

  // `t("...")` and `xxx.t("...")`: every view's local wrapper (see e.g.
  // Panel.qml, RoutineEditor.qml) and Service.qml call I18n.t this way, with
  // the English text written out right at the call site, so a plain regex
  // finds every one without knowing QML's grammar.
  const callRe = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g
  // BreakModel.js doesn't call I18n.t directly: its functions take a `t`
  // parameter and go through their own tr(t, "...") helper, same shape.
  const trRe = /\btr\(\s*t\s*,\s*"((?:[^"\\]|\\.)*)"/g
  for (const file of files) {
    const src = fs.readFileSync(path.join(dir, file), "utf8")
    for (const re of [callRe, trRe]) {
      let m
      while ((m = re.exec(src))) found.add(m[1])
    }
  }

  // Strings that reach a translator through a lookup table instead of a
  // literal call argument: BreakModel.js keeps DAY_NAMES, MODE_NAMES,
  // GROUP_NAMES, EQUIPMENT_NAMES and scheduleText's own day-abbreviation
  // table (`labels`) as English text that a key looks up before handing it
  // to tr(), so no call site anywhere has the string written out. Pulled
  // straight out of BreakModel.js's source instead of retyped here, so a new
  // day, mode, muscle group or piece of equipment is picked up on its own.
  const modelSrc = fs.readFileSync(path.join(dir, "BreakModel.js"), "utf8")

  const quotedStrings = block => {
    const out = []
    const strRe = /"((?:[^"\\]|\\.)*)"/g
    let sm
    while ((sm = strRe.exec(block))) out.push(sm[1])
    return out
  }

  // These four are the plugin's fixed vocabulary and are required: a rename
  // or a restructuring that the regex no longer matches must fail loudly
  // here, not have the scan quietly find nothing for that table and pass.
  for (const name of ["DAY_NAMES", "MODE_NAMES", "GROUP_NAMES", "EQUIPMENT_NAMES"]) {
    const match = new RegExp("\\bvar " + name + " = ([\\[{][\\s\\S]*?[\\]}])").exec(modelSrc)
    assert.ok(match, `table scan found no "${name}" declaration in BreakModel.js — renamed or restructured?`)
    const strings = quotedStrings(match[1])
    assert.ok(strings.length > 0, `table scan matched "${name}" but found no quoted strings inside it`)
    strings.forEach(s => found.add(s))
  }
  // scheduleText's own local day-abbreviation table: same idea, but it's not
  // one of the four fixed vocabularies above, so it isn't required to exist.
  const labelsMatch = /\bvar labels = ([\[{][\s\S]*?[\]}])/.exec(modelSrc)
  if (labelsMatch) quotedStrings(labelsMatch[1]).forEach(s => found.add(s))

  // deleteText's "plan"/"plans" line: the two branches of a ternary assigned
  // to a variable and only then passed to tr(t, template, ...); same reason.
  const templateRe = /var template = [\s\S]*?"((?:[^"\\]|\\.)*)"\s*\n\s*:\s*"((?:[^"\\]|\\.)*)"/
  const tm = templateRe.exec(modelSrc)
  if (tm) { found.add(tm[1]); found.add(tm[2]) }

  // Strings that reach a translator through a `label:` field in an
  // object-literal array declared straight in a .qml view, not through a
  // call site or a BreakModel.js table: the day-chip Repeaters in
  // SettingsView.qml and PlanTab.qml build their button text this way. Same
  // reasoning as the BreakModel.js tables above — pulled from source instead
  // of retyped here — and same loud failure if the property that holds the
  // array is renamed or restructured out from under this regex.
  const qmlLabelArrays = [
    { file: "SettingsView.qml", prop: "dayChips" },
    { file: "PlanTab.qml", prop: "dayChips" }
  ]
  for (const { file, prop } of qmlLabelArrays) {
    const qmlSrc = fs.readFileSync(path.join(dir, file), "utf8")
    const match = new RegExp("\\bproperty var " + prop + ":\\s*(\\[[\\s\\S]*?\\])").exec(qmlSrc)
    assert.ok(match, `table scan found no "${prop}" declaration in ${file} — renamed or restructured?`)
    const labels = [...match[1].matchAll(/\blabel:\s*"((?:[^"\\]|\\.)*)"/g)].map(m => m[1])
    assert.ok(labels.length > 0, `table scan matched "${prop}" in ${file} but found no label strings inside it`)
    labels.forEach(s => found.add(s))
  }

  // Strings held as a key and translated later at the binding, so no call
  // site has them written out: SettingsView.qml's two validation messages
  // live in `errorKey = "..."` precisely so the error retranslates when the
  // language changes while it is on screen. Same loud failure if they are
  // renamed away. The empty string is the cleared state, not a text.
  const settingsSrc = fs.readFileSync(path.join(dir, "SettingsView.qml"), "utf8")
  const errorKeys = [...settingsSrc.matchAll(/\berrorKey\s*=\s*"((?:[^"\\]|\\.)*)"/g)]
    .map(m => m[1])
    .filter(s => s !== "")
  assert.ok(errorKeys.length > 0,
    'scan found no errorKey assignments in SettingsView.qml — renamed or restructured?')
  errorKeys.forEach(s => found.add(s))

  // Deliberate exceptions: the Spanish reads the same as the English, so
  // I18n.js carries no entry for them (t() already returns the English text
  // when nothing is loaded — see the comment at the top of I18n.js). Kept
  // explicit and short on purpose: a real gap must still fail the test
  // instead of quietly matching "well, some strings read the same in both".
  const identicalInSpanish = new Set([
    "Reps",  // ExercisesTab.qml: gym Spanish uses the English word as-is
    "Core",  // BreakModel.js GROUP_NAMES: same, "core" is common gym Spanish
    "Rack"   // BreakModel.js EQUIPMENT_NAMES: same, for a squat rack
  ])

  const keys = new Set(Object.keys(I18n.STRINGS.es))
  for (const text of found) {
    if (identicalInSpanish.has(text)) continue
    assert.ok(keys.has(text), `missing Spanish translation: ${JSON.stringify(text)}`)
  }
})
