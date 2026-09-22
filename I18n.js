// The user-visible text of Active Break, in English and Spanish. The key is
// the English string, so English costs nothing: a text with no translation
// comes back as it went in. `%1`, `%2`… take the values in `args`, and a
// translation can put them in a different order.
//
// No QML in here, so node can test it (tests/i18n.test.js); QML ignores the
// module.exports block at the end, the same trick as BreakModel.js.

var STRINGS = {
  es: {
    "Legs": "Piernas",
    "Next break %1 · %2": "Próximo descanso %1 · %2",
    "1 exercise": "1 ejercicio",
    "%1 exercises": "%1 ejercicios",

    // BreakModel.js
    "Sunday": "Domingo",
    "Monday": "Lunes",
    "Tuesday": "Martes",
    "Wednesday": "Miércoles",
    "Thursday": "Jueves",
    "Friday": "Viernes",
    "Saturday": "Sábado",
    "Weekly plan": "Plan semanal",
    "Muscle-group rotation": "Rotación por grupo muscular",
    "Random": "Aleatorio",
    "Push": "Empuje",
    "Hinge": "Bisagra",
    "Pull": "Tirón",
    "Dumbbells": "Mancuernas",
    "Kettlebell": "Pesa rusa",
    "Barbell": "Barra",
    "Bench": "Banco",
    "Pull-up bar": "Barra de dominadas",
    "%1 sets": "%1 series",
    "Bodyweight": "Peso corporal",
    "no plan": "sin plan",
    "Mon": "Lun",
    "Tue": "Mar",
    "Wed": "Mié",
    "Thu": "Jue",
    "Fri": "Vie",
    "Sat": "Sáb",
    "Sun": "Dom",
    "no days": "sin días",
    "no exercise": "sin ejercicio",
    "Go!": "¡Dale!",
    "Time to move! %1 · %2": "¡Hora de moverte! %1 · %2",
    "Time to move! %1": "¡Hora de moverte! %1",
    "Break until %1 · %2": "Descanso hasta %1 · %2",
    "Active Break paused · right click to resume": "Active Break en pausa · clic derecho para reanudar",
    "Active Break · outside work hours": "Active Break · fuera del horario laboral",
    "and": "y",
    "Delete %1?": "¿Borrar %1?",
    "Delete this exercise?": "¿Borrar este ejercicio?",
    "It's in the %1 plan; it will be removed from it.": "Está en el plan de %1; se va a quitar de ahí.",
    "It's in the %1 plans; it will be removed from them.": "Está en los planes de %1; se va a quitar de ellos.",
    "No exercises: skipped": "Sin ejercicios: se omite",
    "Add at least one exercise": "Agregá al menos un ejercicio",
    "An exercise needs a name": "Un ejercicio necesita un nombre",
    "Two exercises are called %1": "Hay dos ejercicios llamados %1",

    // Service.qml ("Next break %1 · %2" is already above, shared with BreakModel.js)
    "Time to move": "Hora de moverte",
    "Active Break · loading": "Active Break · cargando",
    "Get up and move for a bit": "Levantate y movete un rato",
    "Next break %1": "Próximo descanso %1",
    "Work hours are over for today": "El horario laboral terminó por hoy",
    "Break over": "Descanso terminado",
    "Back to work. %1": "De nuevo al trabajo. %1",
    "Could not create %1": "No se pudo crear %1",
    "config.json is not valid JSON: %1": "config.json no es JSON válido: %1",
    "routine.json is not valid JSON: %1": "routine.json no es JSON válido: %1",
    "routine.json has no valid exercises": "routine.json no tiene ejercicios válidos",
    "Could not read %1": "No se pudo leer %1",

    // SettingsView.qml ("Weekly plan" and "Random" are already above, shared with BreakModel.js)
    "Language": "Idioma",
    "Times go as HH:MM, for example 09:00.": "Los horarios van como HH:MM, por ejemplo 09:00.",
    "The start time must be before the end time.": "El horario de inicio tiene que ser antes que el de fin.",
    "Times (minutes)": "Tiempos (minutos)",
    "Work between breaks": "Trabajo entre descansos",
    "Break length": "Duración del descanso",
    "Remind again every": "Recordar de nuevo cada",
    "Snooze for": "Posponer por",
    "How to pick the exercise": "Cómo elegir el ejercicio",
    "Each day has a focus and its list is worked through in order": "Cada día tiene un foco y su lista se recorre en orden",
    "Rotation": "Rotación",
    "Legs → push → hinge → pull → core": "Piernas → empuje → bisagra → tirón → core",
    "Anything from the catalog, never the previous one": "Cualquiera del catálogo, nunca el anterior",
    "Work hours": "Horario laboral",
    "Mo": "Lu",
    "Tu": "Ma",
    "We": "Mi",
    "Th": "Ju",
    "Fr": "Vi",
    "Sa": "Sá",
    "Su": "Do",
    "From": "Desde",
    "to": "hasta",
    "Sound": "Sonido",
    "A chime with every notification": "Un sonido con cada notificación",
    "Routine": "Rutina",
    "Exercises, the weekly plan and the rotation order.": "Ejercicios, el plan semanal y el orden de rotación.",
    "Edit routine": "Editar rutina",
    "Cancel": "Cancelar",
    "Save": "Guardar",

    // BarWidget.qml ("Active Break · loading" is already above, shared with Service.qml)

    // Panel.qml ("Active Break" is the product name and is never translated)
    "Back without saving": "Volver sin guardar",
    "Settings": "Ajustes",
    "The Active Break service has not started yet.": "El servicio de Active Break todavía no arrancó.",

    // MainView.qml
    "Outside work hours": "Fuera del horario laboral",
    "Active %1. Change it in Settings.": "Activo %1. Cambialo en Ajustes.",
    "Working": "Trabajando",
    "Next break at %1 (in %2)": "Próximo descanso a las %1 (en %2)",
    "Time to move!": "¡Hora de moverte!",
    "Grab your gear and start. I'll remind you again every %1 min.": "Agarrá tus cosas y arrancá. Te voy a avisar de nuevo cada %1 min.",
    "Break": "Descanso",
    "Until %1. Then the work timer starts again.": "Hasta %1. Después arranca de nuevo el cronómetro de trabajo.",
    "Paused": "Pausado",
    "%1 of work left when you resume.": "Te quedan %1 de trabajo cuando reanudes.",
    "Start now": "Empezar ahora",
    "Pause": "Pausar",
    "Another exercise": "Otro ejercicio",
    "Start": "Empezar",
    "Snooze %1 min": "Posponer %1 min",
    "Skip": "Saltear",
    "Done": "Listo",
    "Resume": "Reanudar",
    "Now": "Ahora",
    "Your turn": "Tu turno",
    "Up next": "Próximo",

    // ExerciseCard.qml
    "The routine has no exercises": "La rutina no tiene ejercicios",
    "Moderate weight, stop short of failure: it's a break, not your workout of the day.": "Peso moderado, sin llegar al fallo: es un descanso, no tu entrenamiento del día.",

    // RoutineEditor.qml ("Routine", "Cancel", "Save", "Weekly plan" and "Rotation"
    // are already above, shared with the panel and BreakModel.js)
    "Exercises": "Ejercicios",
    "Delete": "Borrar",
    "Replace your routine with the original one? You can still cancel before saving.": "¿Reemplazar tu rutina por la original? Todavía podés cancelar antes de guardar.",
    "Replace": "Reemplazar",
    "Discard your changes to the routine?": "¿Descartar los cambios en la rutina?",
    "Keep editing": "Seguir editando",
    "Discard": "Descartar",
    "Restore defaults": "Restaurar original",
    "routine.json has an error; Save replaces it with this routine": "routine.json tiene un error; Guardar lo reemplaza con esta rutina",
    "Unsaved changes": "Cambios sin guardar",

    // ExercisesTab.qml ("Reps" reads the same in Spanish, so it is not loaded)
    "Search exercises": "Buscar ejercicios",
    "No exercises match.": "Ningún ejercicio coincide.",
    "New exercise": "Ejercicio nuevo",
    "+ New exercise": "+ Ejercicio nuevo",
    "Pick an exercise or add a new one.": "Elegí un ejercicio o agregá uno nuevo.",
    "Name": "Nombre",
    "e.g. Goblet squat": "por ej. Sentadilla goblet",
    "Group": "Grupo",
    "Equipment": "Equipo",
    "No equipment: bodyweight": "Sin equipo: peso corporal",
    "Sets": "Series",
    "10, 8/leg, max, 40 s": "10, 8/pierna, máx, 40 s",
    "Technique cue": "Indicación técnica",
    "One line to keep in mind while you lift": "Una línea para tener en cuenta mientras levantás",
    "Delete exercise": "Borrar ejercicio",

    // SettingsView.qml, the demo-images section
    "Demo images": "Imágenes de los ejercicios",
    "The panel can show a looping image of each exercise. The plugin ships none: they belong to whoever made them.": "El panel puede mostrar una imagen animada de cada ejercicio. El plugin no trae ninguna: son de quien las hizo.",
    "Ask their author for permission, download them yourself, and drop them in %1 — one file per exercise, named after its id.": "Pedile autorización a su autor, bajalas vos y dejalas en %1: un archivo por ejercicio, con el nombre de su id.",
    "Where to find them": "Dónde conseguirlas",

    // PlanTab.qml ("Mon"…"Sun", "New exercise" and "Search exercises" are
    // already above, shared with BreakModel.js and ExercisesTab.qml)
    "Outside your work hours": "Fuera de tu horario laboral",
    "Focus": "Foco",
    "e.g. Push": "por ej. Empuje",
    "Exercises, in order": "Ejercicios, en orden",
    "No plan: any exercise from the catalog.": "Sin plan: cualquier ejercicio del catálogo.",
    "Earlier": "Antes",
    "Later": "Después",
    "Remove from this day": "Quitar de este día",
    "Add exercise…": "Agregar ejercicio…",
    "Every exercise is already in this day": "Ya están todos los ejercicios en este día",

    // RotationTab.qml ("Earlier" and "Later" are already above, shared with PlanTab.qml)
    "In rotation mode each break takes the next group in this list and picks one of its exercises.":
      "En modo rotación, cada descanso toma el siguiente grupo de esta lista y elige uno de sus ejercicios.",
    "Rotation is empty: exercises are picked at random.": "La rotación está vacía: los ejercicios se eligen al azar."
  }
}

// text: the English string. lang: "en" or "es"; anything else is English.
// args: the values for %1, %2, … in order.
function t(text, lang, args) {
  var table = STRINGS[lang]
  // hasOwnProperty, not `table[text] || text`: a text like "constructor" would
  // otherwise find Object.prototype, and an empty translation would look like a
  // missing one.
  var out = (table && Object.prototype.hasOwnProperty.call(table, text)) ? table[text] : text
  // Single pass with replace(), not a loop that re-scans its own output: a
  // loop filling %1 first and then %2 would re-substitute a %2 that came in
  // as part of the %1 value, and would mangle %10 while filling %1. %0 and
  // an out-of-range index (no args, or fewer args than the marker asks for)
  // are left in the text untouched, and a % not followed by a digit is left
  // alone since the pattern simply doesn't match it.
  return out.replace(/%(\d+)/g, function(match, digits) {
    var n = Number(digits)
    if (n === 0 || !args || n > args.length) return match
    return String(args[n - 1])
  })
}

if (typeof module !== "undefined") {
  module.exports = { STRINGS: STRINGS, t: t }
}
