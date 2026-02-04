package com.skydoves.chatgpt.ui.test

// small data container for meaning
data class Def(val code: String, val short: String, val desc: String)

object SpecialCalculator {
  // mapping from your symbol to short/long text (use the Burmese labels you provided)
  // Replace or extend any definitions as needed.
  val definitions = mapOf(
    "d" to Def("d","ဒဲ့","ဒဲ့ ဂဏာန်း"),
    "a" to Def("a","အပူး","အပူး ဂဏာန်း"),
    "r" to Def("r","အာ","အာဂဏာန်း"),
    "f" to Def("f","ထိပ်","ထိပ်စည်း ဂဏာန်း"),
    "g" to Def("g","နောက်ပိတ်","နောက်ပိတ် ဂဏာန်း"),
    "p" to Def("p","ပါဝါ","ပါဝါ"),
    "n" to Def("n","နက္ခတ်","နက္ခတ်"),
    "b" to Def("b","ဘရိတ်","ဘရိတ်"),
    "t" to Def("t","ပတ်သီး","ပတ်သီး"),
    "s" to Def("s","စုံကပ်","စုံကပ် ဂဏာန်း"),
    "m" to Def("m","မကပ်","မကပ် ဂဏာန်း"),
    "k" to Def("k","အခွေ","အခွေ ဂဏာန်း"),
    "e" to Def("e","အခွေပူး","အခွေပူး ဂဏာန်း"),
    "z" to Def("z","ညီကို","ညီကို ဂဏာန်း"),
    "x" to Def("x","ကိုညီ","ကိုညီ ဂဏာန်း"),
    "င" to Def("င","စုံစုံ","စုံစုံ ဂဏာန်း"),
    "V" to Def("V","00","00 ဂဏာန်း မစုံ ဂဏာန်း"),
    "y" to Def("y","စုံမဲ","စုံမဲ ဂဏာန်း")
    // add u mapping if you define it later
  )

  // Primary entry function. Mode can be "Interpret", "Validate", "Batch"
  fun calculate(input: String, mode: String = "Interpret"): String {
    if (input.isBlank()) return "No input provided."

    val parts = input.split(',', ' ', ';').map { it.trim() }.filter { it.isNotEmpty() }

    // Interpret mode: describe each token
    if (mode == "Interpret") {
      val sb = StringBuilder()
      sb.append("Interpreting ${parts.size} token(s):\n\n")
      for (p in parts) {
        // if token is exactly a known symbol
        val key = p
        if (definitions.containsKey(key)) {
          val d = definitions[key]!!
          sb.append("${d.code} → ${d.desc}\n")
        } else {
          // try numeric checks (two-digit tokens)
          val numeric = p.filter { it.isDigit() }
          if (numeric.length == p.length && numeric.length in 1..3) {
            sb.append("$p → numeric token (raw). You can validate patterns using Validate mode.\n")
          } else {
            sb.append("$p → unknown token (no definition found)\n")
          }
        }
      }
      return sb.toString().trim()
    }

    // Validate mode: checks simple rules (example: two-digit format or symbol match)
    if (mode == "Validate") {
      val sb = StringBuilder()
      sb.append("Validation results:\n\n")
      for (p in parts) {
        if (definitions.containsKey(p)) {
          sb.append("$p is a special definition (${definitions[p]!!.short})\n")
        } else if (p.length == 2 && p.all { it.isDigit() }) {
          sb.append("$p is a 2-digit number — valid format.\n")
        } else {
          sb.append("$p — invalid or unknown format.\n")
        }
      }
      return sb.toString().trim()
    }

    // Batch: group tokens and return summary
    if (mode == "Batch") {
      val sb = StringBuilder()
      sb.append("Batch summary (${parts.size}):\n\n")
      val symbols = parts.filter { definitions.containsKey(it) }
      val numbers = parts.filter { it.length in 1..3 && it.all { c -> c.isDigit() } }
      sb.append("Symbols: ${symbols.joinToString(", ")}\n")
      sb.append("Numbers: ${numbers.joinToString(", ")}\n")
      return sb.toString().trim()
    }

    return "Unknown mode"
  }
}