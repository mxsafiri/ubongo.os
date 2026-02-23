"""
Quick Answer Engine — instant responses without LLM.

Handles:
  - Math expressions (arithmetic, basic algebra)
  - Unit conversions
  - Common factual questions (capitals, definitions)
  - Time/date queries
"""

import re
import math
import datetime
from typing import Optional

# ── Math evaluator ────────────────────────────────────────────────────────

# Safe math functions available in expressions
_SAFE_MATH = {
    "abs": abs, "round": round, "min": min, "max": max,
    "sqrt": math.sqrt, "pow": pow, "log": math.log,
    "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "pi": math.pi, "e": math.e,
}

# Pattern to detect math-like input
_MATH_PATTERN = re.compile(
    r"^(?:what\s+is\s+|solve\s+|calculate\s+|compute\s+|eval(?:uate)?\s+)?"
    r"([\d\s\+\-\*\/\%\(\)\.\,\^]+)"
    r"(?:\s*[\?\=]?\s*)$",
    re.IGNORECASE,
)

# Also catch "X plus Y", "X times Y", etc.
_WORD_MATH_PATTERN = re.compile(
    r"^(?:what\s+is\s+|solve\s+|calculate\s+)?"
    r"(\d+(?:\.\d+)?)\s+"
    r"(plus|minus|times|multiplied\s+by|divided\s+by|over|mod|to\s+the\s+power\s+of)\s+"
    r"(\d+(?:\.\d+)?)"
    r"(?:\s*\??\s*)$",
    re.IGNORECASE,
)


def _try_math(text: str) -> Optional[str]:
    """Try to evaluate as a math expression."""
    clean = text.strip().rstrip("?").strip()

    # Word-based math: "5 plus 3", "10 divided by 2"
    wm = _WORD_MATH_PATTERN.match(clean)
    if wm:
        a, op, b = float(wm.group(1)), wm.group(2).lower(), float(wm.group(3))
        ops = {
            "plus": a + b, "minus": a - b, "times": a * b,
            "multiplied by": a * b, "divided by": a / b if b else None,
            "over": a / b if b else None, "mod": a % b if b else None,
            "to the power of": a ** b,
        }
        result = ops.get(op)
        if result is not None:
            # Format nicely: show int if whole number
            if isinstance(result, float) and result == int(result):
                result = int(result)
            return f"{result}"
        return None

    # Expression-based math: "5 + 3", "sqrt(16)", "2 ** 10"
    m = _MATH_PATTERN.match(clean)
    if not m:
        return None

    expr = m.group(1).strip()
    if not expr or not any(c.isdigit() for c in expr):
        return None

    # Normalize: replace ^ with **, remove commas
    expr = expr.replace("^", "**").replace(",", "")

    # Security: only allow digits, operators, parens, dots, spaces
    if not re.match(r"^[\d\s\+\-\*\/\%\(\)\.]+$", expr):
        return None

    try:
        result = eval(expr, {"__builtins__": {}}, _SAFE_MATH)
        if isinstance(result, float) and result == int(result):
            result = int(result)
        return f"{result}"
    except Exception:
        return None


# ── Factual knowledge base ────────────────────────────────────────────────

_CAPITALS = {
    "afghanistan": "Kabul", "albania": "Tirana", "algeria": "Algiers",
    "argentina": "Buenos Aires", "australia": "Canberra", "austria": "Vienna",
    "bangladesh": "Dhaka", "belgium": "Brussels", "brazil": "Brasilia",
    "canada": "Ottawa", "chile": "Santiago", "china": "Beijing",
    "colombia": "Bogota", "cuba": "Havana", "czech republic": "Prague",
    "denmark": "Copenhagen", "egypt": "Cairo", "ethiopia": "Addis Ababa",
    "finland": "Helsinki", "france": "Paris", "germany": "Berlin",
    "ghana": "Accra", "greece": "Athens", "india": "New Delhi",
    "indonesia": "Jakarta", "iran": "Tehran", "iraq": "Baghdad",
    "ireland": "Dublin", "israel": "Jerusalem", "italy": "Rome",
    "japan": "Tokyo", "kenya": "Nairobi", "malaysia": "Kuala Lumpur",
    "mexico": "Mexico City", "morocco": "Rabat", "netherlands": "Amsterdam",
    "new zealand": "Wellington", "nigeria": "Abuja", "north korea": "Pyongyang",
    "norway": "Oslo", "pakistan": "Islamabad", "peru": "Lima",
    "philippines": "Manila", "poland": "Warsaw", "portugal": "Lisbon",
    "romania": "Bucharest", "russia": "Moscow", "saudi arabia": "Riyadh",
    "south africa": "Pretoria", "south korea": "Seoul", "spain": "Madrid",
    "sweden": "Stockholm", "switzerland": "Bern", "tanzania": "Dodoma",
    "thailand": "Bangkok", "turkey": "Ankara", "uganda": "Kampala",
    "ukraine": "Kyiv", "united kingdom": "London", "uk": "London",
    "united states": "Washington, D.C.", "usa": "Washington, D.C.",
    "us": "Washington, D.C.", "vietnam": "Hanoi", "zimbabwe": "Harare",
    "rwanda": "Kigali", "senegal": "Dakar", "somalia": "Mogadishu",
    "sudan": "Khartoum", "tunisia": "Tunis", "zambia": "Lusaka",
    "congo": "Kinshasa", "cameroon": "Yaounde", "ivory coast": "Yamoussoukro",
    "mali": "Bamako", "mozambique": "Maputo", "madagascar": "Antananarivo",
    "angola": "Luanda", "botswana": "Gaborone", "namibia": "Windhoek",
    "libya": "Tripoli", "jordan": "Amman", "lebanon": "Beirut",
    "singapore": "Singapore", "nepal": "Kathmandu", "sri lanka": "Colombo",
}

_CAPITAL_PATTERN = re.compile(
    r"(?:what\s+is\s+the\s+capital\s+(?:of|city\s+of)\s+|capital\s+of\s+)(\w[\w\s]*)",
    re.IGNORECASE,
)


def _try_capital(text: str) -> Optional[str]:
    """Try to answer a capital city question."""
    m = _CAPITAL_PATTERN.search(text)
    if not m:
        return None
    country = m.group(1).strip().rstrip("?").strip().lower()
    capital = _CAPITALS.get(country)
    if capital:
        return f"The capital of {m.group(1).strip().rstrip('?').strip()} is **{capital}**."
    return None


# ── Date/Time ─────────────────────────────────────────────────────────────

_TIME_PATTERNS = [
    "what time", "what's the time", "current time", "time now",
    "what day", "what's the date", "today's date", "current date",
    "what is today", "what day is it",
]


def _try_datetime(text: str) -> Optional[str]:
    """Answer time/date questions."""
    lower = text.lower()
    if not any(p in lower for p in _TIME_PATTERNS):
        return None

    now = datetime.datetime.now()
    if "time" in lower:
        return f"It's **{now.strftime('%I:%M %p')}** right now."
    return f"Today is **{now.strftime('%A, %B %d, %Y')}**."


# ── Definitions / quick facts ─────────────────────────────────────────────

_QUICK_FACTS = {
    "speed of light": "The speed of light in a vacuum is approximately **299,792 km/s** (about 186,282 miles/s).",
    "speed of sound": "The speed of sound in air at 20°C is approximately **343 m/s** (1,235 km/h).",
    "boiling point of water": "Water boils at **100°C** (212°F) at standard atmospheric pressure.",
    "freezing point of water": "Water freezes at **0°C** (32°F) at standard atmospheric pressure.",
    "gravity": "Earth's gravitational acceleration is approximately **9.81 m/s²**.",
    "pi": f"Pi (π) is approximately **{math.pi:.10f}**... It's an irrational number that goes on forever.",
    "light year": "A light year is the distance light travels in one year — about **9.461 trillion km**.",
    "absolute zero": "Absolute zero is **-273.15°C** (0 Kelvin), the lowest possible temperature.",
    "earth age": "Earth is approximately **4.54 billion years** old.",
    "sun distance": "Earth is about **149.6 million km** (93 million miles) from the Sun on average.",
    "moon distance": "The Moon is about **384,400 km** (238,855 miles) from Earth on average.",
    "population": "World population is approximately **8 billion** people (as of 2024).",
    "largest ocean": "The **Pacific Ocean** is the largest ocean, covering about 165.25 million km².",
    "tallest mountain": "**Mount Everest** is the tallest mountain at **8,849 meters** (29,032 ft) above sea level.",
    "longest river": "The **Nile River** (6,650 km) and **Amazon River** (6,400 km) are the longest rivers.",
    "biggest country": "**Russia** is the largest country by area at 17.1 million km².",
    "smallest country": "**Vatican City** is the smallest country at just 0.44 km².",
}

_FACT_PATTERN = re.compile(
    r"(?:what\s+is\s+(?:the\s+)?|tell\s+me\s+about\s+(?:the\s+)?|how\s+(?:fast|far|old|big|tall|long)\s+is\s+(?:the\s+)?)",
    re.IGNORECASE,
)


def _try_quick_fact(text: str) -> Optional[str]:
    """Try to match a known quick fact."""
    lower = text.lower().rstrip("?").strip()
    for key, answer in _QUICK_FACTS.items():
        if key in lower:
            return answer
    return None


# ── Main entry point ──────────────────────────────────────────────────────

def quick_answer(text: str) -> Optional[str]:
    """
    Try to answer a question instantly without LLM.
    Returns None if no quick answer is available.
    """
    # Try each handler in order of likelihood
    for handler in [_try_math, _try_capital, _try_datetime, _try_quick_fact]:
        result = handler(text)
        if result:
            return result
    return None
