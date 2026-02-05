package com.skydoves.chatgpt.ui.test

data class Def(val code: String, val short: String, val desc: String)

object SpecialCalculator {
    val definitions = mapOf(
        "d" to Def("d", "ဒဲ့", "ဒဲ့ ဂဏာန်း"),
        "a" to Def("a", "အပူး", "အပူး ဂဏာန်း"),
        "r" to Def("r", "အာ", "အာဂဏာန်း (ရမ်)"),
        "p" to Def("p", "ပါဝါ", "ပါဝါ ဂဏာန်းများ (05, 16, 27, 38, 49)"),
        "n" to Def("n", "နက္ခတ်", "နက္ခတ် ဂဏာန်းများ (18, 24, 35, 07, 96)"),
        "z" to Def("z", "ညီကို", "ညီကို ဂဏာန်း (01, 12, 23, 34, 45, 56, 67, 78, 89, 90)"),
        "t" to Def("t", "ပတ်သီး", "ပတ်သီး (တစ်လုံးပတ်)"),
        "b" to Def("b", "ဘရိတ်", "ဘရိတ် (ပေါင်းခြင်းနောက်ပိတ်)")
    )

    fun calculate(input: String, mode: String = "Interpret"): String {
        if (input.isBlank()) return "No input provided."
        val parts = input.lowercase().split(',', ' ', ';').map { it.trim() }.filter { it.isNotEmpty() }
        
        val resultList = mutableListOf<String>()

        for (p in parts) {
            when {
                // Static mappings
                p == "a" -> (0..9).forEach { resultList.add("$it$it") }
                p == "p" -> listOf("05","50","16","61","27","72","38","83","49","94").forEach { resultList.add(it) }
                p == "n" -> listOf("18","81","24","42","35","53","07","70","96","69").forEach { resultList.add(it) }
                p == "z" -> listOf("01","10","12","21","23","32","34","43","45","54","56","65","67","76","78","87","89","98","90","09").forEach { resultList.add(it) }

                // Pat-Thee (e.g., "1t" -> 10, 11, ... 19, 01, 21 ... 91)
                p.endsWith("t") && p.length > 1 -> {
                    val digit = p.filter { it.isDigit() }.firstOrNull()?.toString()
                    if (digit != null) {
                        (0..99).map { String.format("%02d", it) }
                            .filter { it.contains(digit) }
                            .forEach { resultList.add(it) }
                    }
                }

                // Brake (e.g., "5b" -> sum of digits ends in 5)
                p.endsWith("b") && p.length > 1 -> {
                    val brakeDigit = p.filter { it.isDigit() }.lastOrNull()?.digitToInt()
                    if (brakeDigit != null) {
                        (0..99).map { String.format("%02d", it) }
                            .filter { ((it[0].digitToInt() + it[1].digitToInt()) % 10) == brakeDigit }
                            .forEach { resultList.add(it) }
                    }
                }

                // Raw numbers (Ensure 2-digit format)
                p.all { it.isDigit() } -> {
                    if (p.length == 1) resultList.add("0$p") else resultList.add(p)
                }
            }
        }

        val uniqueSorted = resultList.distinct().sorted()

        return when (mode) {
            "Interpret" -> "Expanded (${uniqueSorted.size} numbers):\n" + uniqueSorted.joinToString(", ")
            "Batch" -> "Summary: ${uniqueSorted.size} Items\nData: ${uniqueSorted.joinToString(" ")}"
            else -> uniqueSorted.joinToString(", ")
        }
    }
}
