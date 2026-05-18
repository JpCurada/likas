"""
LIKAS training dataset builder.

Reads bundled protocol JSON files and emits training/eval JSONL in a chat
format compatible with Gemma's chat template. Every tool-result message
mirrors the exact runtime shape produced by aiAssistantService.ts so the
fine-tuned model sees the same distribution at inference time.

Usage:
    python build_dataset.py \\
        --protocols Likas/assets/protocols \\
        --out datasets/likas_assistant_v1 \\
        --seed 3407

Output:
    datasets/likas_assistant_v1/train.jsonl  (~90%)
    datasets/likas_assistant_v1/test.jsonl   (~10%)
    datasets/likas_assistant_v1/stats.json   (composition report)

Conventions (must match runtime):
- Conversation roles: "system" | "user" | "assistant" | "tool".
  The assistant role is what llama.rn receives; Gemma's chat template maps
  assistant -> model at template-application time. Apply the Gemma chat
  template via tokenizer.apply_chat_template() before tokenizing.
- Tool messages carry: json.dumps({"name": <tool>, "result": <plain text>}).
  The "result" is the same plain-text summary string the runtime tool
  handler returns in its `summary` field — never a structured object.
- Assistant tool calls carry: json.dumps({"action":"tool","name":<t>,"args":{...}}).
- Assistant speak turns carry: json.dumps({"action":"speak","text":"..."}).
- find_nearby categories must come from the runtime enum:
  hospital | evacuation_center | gymnasium | school | multi_purpose_hall | covered_court.
"""

from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# System prompt — kept deliberately concise. The runtime prompt in
# aiAssistantService.ts is longer and injects per-user profile data at
# inference. We train on a stable, profile-free skeleton so the model learns
# the contract (tools, JSON envelope, language rules) rather than memorizing
# a particular profile. The runtime's extra profile context still steers
# behavior because the rules in both prompts agree.
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are LIKAS, an offline disaster companion for the Philippines.

CRITICAL RULES — VIOLATING THESE PUTS LIVES AT RISK:
1. For ANY safety-critical question, you MUST call get_protocol first and quote its returned text verbatim. Never invent or paraphrase safety steps.
2. For ANY question about evacuation, where to go, or shelters, you MUST call route_to_nearest_evacuation.
3. If asked to find a hospital, school, gym, or other facility, call find_nearby.
4. If the user asks about their own profile (medical conditions, meeting points, emergency contacts) call get_user_profile.
5. PERSONALIZE every reply using the user profile context. Reference companions, pets, and meeting points when relevant.
6. If unsure, respond with: "I can't verify that protocol — contact NDRRMC at 911."
7. Refuse off-topic questions (entertainment, opinions, general knowledge) and redirect to disaster topics.
8. Respond in the same language the user used (English, Filipino, or Taglish). Keep replies concise.
9. NEVER send SMS, place calls, or take real-world actions — those are user-controlled only.

OUTPUT FORMAT — STRICT JSON, NO PROSE OUTSIDE JSON:
- To call a tool: {"action":"tool","name":"<tool_name>","args":{...}}
- To answer the user: {"action":"speak","text":"<your reply>"}
- Output exactly ONE JSON object per turn. After a tool result is returned, decide again.

AVAILABLE TOOLS:
- get_protocol(disaster: "earthquake"|"typhoon"|"volcano", phase: "before"|"during"|"after")
- route_to_nearest_evacuation(profile_aware?: boolean)
- find_nearby(category: "hospital"|"evacuation_center"|"gymnasium"|"school"|"multi_purpose_hall"|"covered_court")
- get_user_profile()"""


# ---------------------------------------------------------------------------
# Conversation helpers
# ---------------------------------------------------------------------------

def turn(role: str, text: str) -> dict:
    """Build one conversation turn. Role is one of system|user|assistant|tool."""
    return {"role": role, "content": text}


def speak(text: str) -> str:
    return json.dumps({"action": "speak", "text": text}, ensure_ascii=False)


def tool_call(name: str, args: dict) -> str:
    return json.dumps({"action": "tool", "name": name, "args": args}, ensure_ascii=False)


def tool_result(name: str, result_text: str) -> str:
    """Match runtime: aiAssistantService injects {name, result: <summary string>}."""
    return json.dumps({"name": name, "result": result_text}, ensure_ascii=False)


def row(messages: list[dict]) -> dict:
    return {"messages": messages}


# ---------------------------------------------------------------------------
# Paraphrase banks
# ---------------------------------------------------------------------------

PARAPHRASES: dict[tuple[str, str], dict[str, list[str]]] = {
    ("earthquake", "before"): {
        "en": [
            "How do I prepare for an earthquake?",
            "What should I do to get ready for an earthquake?",
            "Earthquake preparedness tips please.",
            "How do I make my home safer before a quake?",
            "What earthquake prep does PHIVOLCS recommend?",
            "Help me prepare for a possible earthquake.",
            "What should our family do to be ready for an earthquake?",
            "Give me a checklist for earthquake readiness.",
        ],
        "tl": [
            "Paano maghanda sa lindol?",
            "Ano ang dapat gawin bago mag-lindol?",
            "Mga tips po sa earthquake preparedness.",
            "Paano gawing mas ligtas ang bahay bago lumindol?",
            "Ano ang inirerekomenda ng PHIVOLCS bago lumindol?",
            "Tulungan mo ako maghanda kung sakaling lumindol.",
            "Ano dapat gawin ng pamilya bago mag-lindol?",
            "Pwede po bang checklist para sa earthquake?",
        ],
        "taglish": [
            "Paano mag-prepare for earthquake?",
            "Ano dapat gawin before an earthquake?",
            "Mga prep tips para sa lindol please.",
            "How do I make the house safer bago lumindol?",
            "Anong earthquake prep ng PHIVOLCS?",
            "Help me get ready in case of lindol.",
        ],
    },
    ("earthquake", "during"): {
        "en": [
            "What do I do during an earthquake?",
            "The ground is shaking right now, help!",
            "There's a quake happening, what should I do?",
            "An earthquake just started, what now?",
            "How do I survive a strong earthquake?",
            "Building is shaking, what do I do?",
            "I'm inside during an earthquake, instructions please.",
            "Quick — earthquake happening, what to do!",
        ],
        "tl": [
            "Ano gagawin ko kapag lumilindol?",
            "Lumilindol na, tulong!",
            "May lindol ngayon, ano gagawin?",
            "Nagsimula na ang lindol, ano ngayon?",
            "Paano makaligtas sa malakas na lindol?",
            "Yumayanig ang building, ano gagawin?",
            "Nasa loob ako habang lumilindol, ano dapat gawin?",
            "Bilisan! Lumilindol, ano gagawin!",
        ],
        "taglish": [
            "What do I do habang lumilindol?",
            "Lumilindol na po, help!",
            "May quake ngayon, ano dapat?",
            "How to survive a strong lindol?",
            "Yumayanig yung building, what to do?",
        ],
    },
    ("earthquake", "after"): {
        "en": [
            "The shaking stopped, what should I do now?",
            "Earthquake just ended, what do I check?",
            "What do I do after an earthquake?",
            "Post-earthquake actions please.",
            "Quake is over, now what?",
            "What's the safest thing to do after the shaking stops?",
            "After-earthquake checklist?",
            "How do I check my home after an earthquake?",
        ],
        "tl": [
            "Tumigil na ang lindol, ano gagawin?",
            "Tapos na ang lindol, ano dapat i-check?",
            "Ano gagawin pagkatapos lumindol?",
            "Mga dapat gawin matapos ang lindol?",
            "Tapos na ang yanig, ano ngayon?",
            "Ano ang pinakaligtas matapos lumindol?",
            "Checklist matapos ang lindol?",
            "Paano i-check ang bahay matapos lumindol?",
        ],
        "taglish": [
            "Tapos na yung shaking, what now?",
            "Earthquake just ended, ano i-check?",
            "What to do after lumindol?",
            "Mga post-quake actions?",
            "Tapos na yung lindol, what's next?",
        ],
    },
    ("typhoon", "before"): {
        "en": [
            "How do I prepare for a typhoon?",
            "Typhoon is coming, what should I do?",
            "How do I get ready for an incoming typhoon?",
            "PAGASA says Signal 3, what should I prepare?",
            "Bagyo prep checklist?",
            "What goes in a typhoon go-bag?",
            "How do I storm-proof the house?",
            "What does PAGASA recommend before a typhoon?",
        ],
        "tl": [
            "Paano maghanda sa bagyo?",
            "May parating na bagyo, ano gagawin?",
            "Paano mag-prepare sa darating na bagyo?",
            "Sabi ng PAGASA Signal No. 3, ano dapat ihanda?",
            "Ano dapat ilagay sa go-bag para sa bagyo?",
            "Paano patibayin ang bahay bago dumating ang bagyo?",
            "Ano ang inirerekomenda ng PAGASA bago ang bagyo?",
            "Mga dapat ihanda kapag may parating na bagyo?",
        ],
        "taglish": [
            "How to prep for bagyo?",
            "May incoming typhoon, what to do?",
            "Ano i-pack sa go-bag for bagyo?",
            "How to storm-proof the bahay?",
            "PAGASA Signal 2 na, what to prep?",
        ],
    },
    ("typhoon", "during"): {
        "en": [
            "What do I do during a typhoon?",
            "The typhoon is here, what now?",
            "Strong winds and rain, what should I do?",
            "We're in the middle of a typhoon, help!",
            "Flooding outside, what should I do?",
            "Power is out and the typhoon is raging, help!",
            "Should I leave the house during a typhoon?",
            "Storm surge warning, what now?",
        ],
        "tl": [
            "Ano gagawin habang may bagyo?",
            "Nandito na ang bagyo, ano ngayon?",
            "Malakas na hangin at ulan, ano gagawin?",
            "Nasa gitna kami ng bagyo, tulong!",
            "May baha sa labas, ano gagawin?",
            "Walang kuryente at malakas ang bagyo, tulong!",
            "Lalabas ba ako ng bahay habang may bagyo?",
            "May storm surge warning, ano ngayon?",
        ],
        "taglish": [
            "What to do during sa bagyo?",
            "Nasa gitna kami ng typhoon, tulong!",
            "May baha na, what should I do?",
            "Walang kuryente during typhoon, help!",
            "Storm surge warning na, what to do?",
        ],
    },
    ("typhoon", "after"): {
        "en": [
            "Typhoon is over, what do I check?",
            "What to do after a typhoon?",
            "Post-typhoon safety checklist?",
            "Can I go back home after the typhoon?",
            "How do I check for damage after a typhoon?",
            "Is the water safe to drink after a typhoon?",
            "What should I watch out for after a typhoon?",
            "When can I return home post-typhoon?",
        ],
        "tl": [
            "Tapos na ang bagyo, ano i-check?",
            "Ano gagawin matapos ang bagyo?",
            "Pwede na ba akong umuwi pagkatapos ng bagyo?",
            "Paano i-check ang damage matapos ang bagyo?",
            "Ligtas ba inumin ang tubig pagkatapos ng bagyo?",
            "Ano ang dapat bantayan matapos ang bagyo?",
            "Kailan pwede umuwi pagkatapos ng bagyo?",
            "Post-bagyo na, ano ang dapat unahing gawin?",
        ],
        "taglish": [
            "Tapos na yung bagyo, what to check?",
            "Post-typhoon, ano gagawin?",
            "Pwede na ba umuwi after the bagyo?",
            "Safe ba ang tubig after typhoon?",
            "What to watch out for matapos ang bagyo?",
        ],
    },
    ("volcano", "before"): {
        "en": [
            "How do I prepare for a volcanic eruption?",
            "Volcano alert level rising, what should I do?",
            "PHIVOLCS raised the alert level, how do I prepare?",
            "What goes in a go-bag for ashfall?",
            "How do I know if I'm in the Permanent Danger Zone?",
            "Alert Level 3 — what should I do?",
            "How do I prep for a possible eruption?",
            "Volcano prep checklist please?",
        ],
        "tl": [
            "Paano maghanda sa pagputok ng bulkan?",
            "Tumataas na ang alert level ng bulkan, ano gagawin?",
            "Tumaas ang alert level ng PHIVOLCS, paano maghanda?",
            "Ano ilalagay sa go-bag para sa ashfall?",
            "Paano malalaman kung nasa Permanent Danger Zone ako?",
            "Alert Level 3 na, ano gagawin?",
            "Paano maghanda para sa posibleng pagputok?",
            "Mga dapat ihanda bago pumutok ang bulkan?",
        ],
        "taglish": [
            "How to prep for volcanic eruption?",
            "Alert Level 3 na, what to do?",
            "PHIVOLCS raised level, paano maghanda?",
            "Ano i-pack para sa ashfall?",
            "Nasa Permanent Danger Zone ba ako?",
        ],
    },
    ("volcano", "during"): {
        "en": [
            "The volcano is erupting, what do I do?",
            "Ash is falling, what should I do?",
            "There's an eruption happening, help!",
            "How do I protect my breathing from ashfall?",
            "Should I evacuate now during an eruption?",
            "What if I'm stuck indoors during an eruption?",
            "Mandatory evacuation order, what now?",
            "Lahar warning, what should I do?",
        ],
        "tl": [
            "Pumuputok ang bulkan, ano gagawin?",
            "May bumabagsak na abo, ano dapat gawin?",
            "May pagputok na, tulong!",
            "Paano protektahan ang paghinga sa ashfall?",
            "Lilikas ba ako ngayon habang pumuputok?",
            "Paano kung naipit ako sa loob ng bahay habang pumuputok?",
            "May mandatory evacuation order, ano ngayon?",
            "May lahar warning, ano dapat gawin?",
        ],
        "taglish": [
            "Pumuputok yung bulkan, what to do?",
            "May ashfall, what should I do?",
            "There's an eruption, tulong!",
            "Paano protektahan paghinga from ashfall?",
            "Lahar warning, what to do?",
        ],
    },
    ("volcano", "after"): {
        "en": [
            "Eruption is over, what now?",
            "Volcano stopped erupting, what do I do next?",
            "How do I clean ash safely?",
            "When can I return home after an eruption?",
            "Is the water safe after an eruption?",
            "Should I still wear a mask after the eruption?",
            "How long does lahar risk last after an eruption?",
            "Post-eruption cleanup checklist?",
        ],
        "tl": [
            "Tapos na ang pagputok, ano ngayon?",
            "Paano linisin ang abo nang ligtas?",
            "Kailan pwede umuwi pagkatapos ng pagputok?",
            "Ligtas ba ang tubig pagkatapos ng pagputok?",
            "Magsuot pa rin ba ng mask pagkatapos ng pagputok?",
            "Gaano katagal ang panganib ng lahar pagkatapos ng pagputok?",
            "Post-eruption checklist?",
            "Ano dapat gawin matapos ang pagputok?",
        ],
        "taglish": [
            "Tapos na yung eruption, what next?",
            "How to clean ash safely?",
            "Pwede na ba umuwi after eruption?",
            "Mag-mask pa rin ba after?",
            "Lahar risk gaano katagal after eruption?",
        ],
    },
}


# ---------------------------------------------------------------------------
# Generator 1: Protocol Q&A
# ---------------------------------------------------------------------------
#
# Runtime contract (aiTools.ts get_protocol handler):
#   protocol.phases[phase] is a STRING (not a list of entries).
#   The handler returns {summary: text} where summary is the protocol text
#   verbatim. The (Source: ...) attribution is NOT appended by the handler —
#   it lives in protocol.source on the side. The model is told to "quote
#   verbatim" and attribute to NDRRMC/PAGASA/PHIVOLCS in its speak reply.

def authority_from_source(source: str, disaster: str) -> str:
    """Pick the leading authority name to attribute in the speak turn."""
    if "PHIVOLCS" in source:
        return "PHIVOLCS"
    if "PAGASA" in source:
        return "PAGASA"
    if "NDRRMC" in source:
        return "NDRRMC"
    return "NDRRMC"


def build_protocol_rows(protocols: dict[str, dict]) -> list[dict]:
    rows: list[dict] = []

    for disaster, doc in protocols.items():
        source = doc.get("source", "NDRRMC")
        authority = authority_from_source(source, disaster)
        phases = doc.get("phases", {})
        if not isinstance(phases, dict):
            continue

        for phase, protocol_text in phases.items():
            if not isinstance(protocol_text, str) or not protocol_text:
                continue

            paraphrase_set = PARAPHRASES.get((disaster, phase), {})
            questions: list[tuple[str, str]] = []
            for lang, qs in paraphrase_set.items():
                questions.extend((lang, q) for q in qs)

            for lang, user_question in questions:
                # Speak turn: quote the protocol verbatim. Attribution prefix
                # is translated for tl/taglish; the protocol body itself stays
                # in its authored language (English). This matches Rule 1
                # (verbatim quote) taking priority over Rule 8 (match user
                # language) — protocol text is never paraphrased.
                if lang in ("tl", "taglish"):
                    final_text = f"{protocol_text} (Pinagmulan: {authority})"
                else:
                    final_text = f"{protocol_text} (Source: {authority})"

                conv = [
                    turn("system", SYSTEM_PROMPT),
                    turn("user", user_question),
                    turn("assistant", tool_call("get_protocol", {
                        "disaster": disaster,
                        "phase": phase,
                    })),
                    # Runtime injects {name, result: <summary string>}.
                    # The summary IS the protocol text — no attribution suffix.
                    turn("tool", tool_result("get_protocol", protocol_text)),
                    turn("assistant", speak(final_text)),
                ]
                rows.append(row(conv))

    return rows


# ---------------------------------------------------------------------------
# Generator 2: route_to_nearest_evacuation
# ---------------------------------------------------------------------------
#
# Runtime summary shape (aiTools.ts route_to_nearest_evacuation):
#   "Top evacuation options:\n
#    1. <name> — <km> km (~<min> min walking)[ [best match]]\n
#    ...\n
#    (optional) \n\nRoute to <name>: <km> km along walkable roads, ~<min> min walking.\n
#    OR (optional) \n\n(Road-following route unavailable — pedestrian map data not installed.)"
#
# We train the model on the variant WITHOUT the road-following note (the
# runtime soft-fails when no graph is loaded, which is the current state).

EVAC_USER_QUERIES = [
    # Direct
    ("en", "Where's the nearest evacuation center?"),
    ("en", "Find me an evacuation center."),
    ("en", "I need to evacuate, where do I go?"),
    ("en", "Closest evac center please."),
    ("en", "Which evacuation centers are nearby?"),
    ("en", "Where's the nearest shelter?"),
    ("en", "Send me to the nearest evacuation site."),
    ("en", "Show me evac centers."),
    ("en", "List the nearest shelters."),
    ("en", "What's the closest place to evacuate to?"),
    ("en", "Give me evac options near my location."),
    ("en", "Where can I take my family right now?"),
    # Urgency-marked
    ("en", "URGENT — I need an evacuation center NOW"),
    ("en", "Please help, I have to evacuate"),
    ("en", "Emergency — where do I go to be safe?"),
    ("en", "We need to leave immediately, where to?"),
    # Indirect / contextual
    ("en", "My house is flooding, where should I go?"),
    ("en", "We can't stay here, what's our option?"),
    ("en", "The roof is leaking and we need to leave."),
    ("en", "It's not safe at home anymore, what now?"),
    ("en", "We were told to evacuate, where's the site?"),
    # Constraint-bearing
    ("en", "Closest evac that allows pets"),
    ("en", "Nearest shelter that has PWD ramps"),
    ("en", "Find an evac center with PWD access"),
    ("en", "Need a pet-friendly evacuation center"),

    # Filipino — direct
    ("tl", "Saan ang pinakamalapit na evacuation center?"),
    ("tl", "Saan ako pwede mag-evacuate?"),
    ("tl", "Kailangan kong lumikas, saan ako pupunta?"),
    ("tl", "Saan ang malapit na evac center?"),
    ("tl", "Saan ang pinakamalapit na shelter?"),
    ("tl", "Hanapan mo ako ng evacuation center."),
    ("tl", "Ipakita mo ang mga evacuation center."),
    ("tl", "Saan ang pinakaligtas na pwedeng puntahan?"),
    ("tl", "Saang lugar pwede lumikas ang pamilya namin?"),
    # Urgency
    ("tl", "Saklolo, kailangan kong lumikas agad"),
    ("tl", "Bilisan! Saan kami pwede pumunta?"),
    ("tl", "Emergency po, saan ang ligtas?"),
    # Indirect
    ("tl", "Bumabaha na sa amin, saan kami pupunta?"),
    ("tl", "Hindi na safe dito, saan kami pwede pumunta?"),
    ("tl", "Inutusan kaming lumikas, saan ang sentro?"),
    ("tl", "Tumagas na ang bubong, saan kami pupunta?"),
    # Constraint-bearing
    ("tl", "Pinakamalapit na evac na may PWD access"),
    ("tl", "May evac ba na pwede sa alaga?"),
    ("tl", "Evac center na may ramp para sa wheelchair"),

    # Taglish
    ("taglish", "Where's the nearest evac center po?"),
    ("taglish", "Saan ang closest evacuation center?"),
    ("taglish", "I need to evacuate, saan ako pupunta?"),
    ("taglish", "Find me the nearest evac, please."),
    ("taglish", "Closest shelter po, saan?"),
    ("taglish", "Saan yung pinakamalapit na evac center po?"),
    ("taglish", "Emergency — saan ang nearest evac?"),
    ("taglish", "May pet-friendly evac ba near me?"),
    ("taglish", "Pwede ba mag-recommend ng nearest shelter?"),
    ("taglish", "Bumabaha na, where do we go?"),
]

# Synthetic centers. Field names match runtime EvacuationCenter (camelCase),
# but we never expose them to the model — we only render plain-text summaries.
SYNTHETIC_CENTERS = [
    {"name": "Brgy. San Jose Covered Court", "km": 0.4, "walk": 6, "isPwd": True, "isPet": False},
    {"name": "San Jose Elementary School", "km": 0.7, "walk": 9, "isPwd": False, "isPet": False},
    {"name": "Brgy. San Jose Hall", "km": 0.9, "walk": 12, "isPwd": True, "isPet": True},
    {"name": "Tondo Sports Complex", "km": 1.2, "walk": 16, "isPwd": True, "isPet": False},
    {"name": "Sampaloc Elementary School", "km": 0.5, "walk": 7, "isPwd": True, "isPet": False},
    {"name": "Manila High School", "km": 0.8, "walk": 11, "isPwd": False, "isPet": False},
    {"name": "Brgy. 12 Hall", "km": 0.3, "walk": 4, "isPwd": True, "isPet": True},
    {"name": "Quiapo Multi-Purpose Hall", "km": 1.1, "walk": 14, "isPwd": True, "isPet": False},
    {"name": "Tondo Covered Court", "km": 0.6, "walk": 8, "isPwd": False, "isPet": True},
    {"name": "Sta. Cruz Gymnasium", "km": 1.5, "walk": 19, "isPwd": True, "isPet": False},
    {"name": "Binondo Elementary", "km": 0.9, "walk": 12, "isPwd": False, "isPet": False},
    {"name": "Brgy. 7 Hall", "km": 1.0, "walk": 13, "isPwd": True, "isPet": True},
    {"name": "Ermita Multi-Purpose Hall", "km": 1.3, "walk": 17, "isPwd": True, "isPet": False},
    {"name": "Malate Covered Court", "km": 0.5, "walk": 7, "isPwd": False, "isPet": False},
    {"name": "Paco Sports Complex", "km": 1.4, "walk": 18, "isPwd": True, "isPet": True},
]


def render_evac_summary(picks: list[dict]) -> str:
    """Mirror aiTools.ts route_to_nearest_evacuation summary exactly."""
    lines = []
    for i, c in enumerate(picks):
        best = " [best match]" if i == 0 else ""
        lines.append(
            f"{i + 1}. {c['name']} — {c['km']:.1f} km (~{c['walk']} min walking){best}"
        )
    body = "\n".join(lines)
    note = "\n\n(Road-following route unavailable — pedestrian map data not installed.)"
    return f"Top evacuation options:\n{body}{note}"


def render_evac_speak(lang: str, picks: list[dict]) -> str:
    items = ", ".join(
        f"{c['name']} ({c['km']:.1f} km)" for c in picks
    )
    if lang == "en":
        return f"Top 3 evacuation options nearby: {items}. Closest match: {picks[0]['name']}."
    if lang == "tl":
        return f"Tatlong pinakamalapit na evacuation center: {items}. Pinakamalapit: {picks[0]['name']}."
    return f"Top 3 nearest evac centers: {items}. Closest: {picks[0]['name']}."


def build_evac_rows(rng: random.Random, count: int = 200, max_reuse_per_question: int = 4) -> list[dict]:
    rows = []
    usage: dict[str, int] = defaultdict(int)
    attempts = 0
    max_attempts = count * 20
    while len(rows) < count and attempts < max_attempts:
        attempts += 1
        lang, user_q = rng.choice(EVAC_USER_QUERIES)
        if usage[user_q] >= max_reuse_per_question:
            continue
        usage[user_q] += 1
        picks = rng.sample(SYNTHETIC_CENTERS, 3)
        picks.sort(key=lambda c: c["km"])

        summary = render_evac_summary(picks)
        speak_text = render_evac_speak(lang, picks)

        # Half of these omit the optional profile_aware arg; half include it.
        # Teaches the model both shapes are valid.
        args: dict = {} if rng.random() < 0.5 else {"profile_aware": True}

        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", user_q),
            turn("assistant", tool_call("route_to_nearest_evacuation", args)),
            turn("tool", tool_result("route_to_nearest_evacuation", summary)),
            turn("assistant", speak(speak_text)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 3: find_nearby
# ---------------------------------------------------------------------------
#
# Runtime summary (aiTools.ts findNearby):
#   "Nearest <category words>:\n
#    1. <name> — <km> km[ · <address>]\n
#    ..."

NEARBY_QUERIES: list[tuple[str, str, str]] = [
    # Hospital
    ("hospital", "en", "Where's the nearest hospital?"),
    ("hospital", "en", "I need a hospital, where's the closest one?"),
    ("hospital", "en", "Find me a hospital nearby."),
    ("hospital", "en", "Someone's hurt — closest hospital?"),
    ("hospital", "en", "Show me hospitals around here."),
    ("hospital", "en", "Which hospital is the fastest to reach?"),
    ("hospital", "en", "Need urgent medical care, where do I go?"),
    ("hospital", "en", "List hospitals near my location."),
    ("hospital", "tl", "Saan ang pinakamalapit na ospital?"),
    ("hospital", "tl", "Kailangan ko ng ospital, saan ang pinakamalapit?"),
    ("hospital", "tl", "May nasaktan, saan ang ospital?"),
    ("hospital", "tl", "Mga ospital sa malapit, pakikita."),
    ("hospital", "tl", "Saang ospital pinakamabilis marating?"),
    ("hospital", "tl", "Emergency, saan ang pinakamalapit na ospital?"),
    ("hospital", "taglish", "Where's the closest hospital po?"),
    ("hospital", "taglish", "Saan ang nearest hospital?"),
    ("hospital", "taglish", "May injured, saan ang nearest hospital?"),
    ("hospital", "taglish", "List hospitals na malapit dito."),

    # Evacuation center
    ("evacuation_center", "en", "Find me an evacuation center near here."),
    ("evacuation_center", "en", "Where are the evacuation centers around me?"),
    ("evacuation_center", "en", "List the evac centers in my area."),
    ("evacuation_center", "en", "Show me nearby shelters."),
    ("evacuation_center", "en", "Which evacuation sites are closest?"),
    ("evacuation_center", "en", "Need a place to evacuate to, options?"),
    ("evacuation_center", "tl", "Saan ang mga evacuation center sa malapit?"),
    ("evacuation_center", "tl", "Hanap ka ng evacuation center sa paligid."),
    ("evacuation_center", "tl", "Mga shelter sa lapit ko, ipakita."),
    ("evacuation_center", "tl", "Listahan ng evacuation site sa area ko?"),
    ("evacuation_center", "tl", "Saang evac pwede kaming pumunta?"),
    ("evacuation_center", "taglish", "Where are the nearby evacuation centers?"),
    ("evacuation_center", "taglish", "List evac centers sa area ko po."),
    ("evacuation_center", "taglish", "Saan yung pinakamalapit na evac sites?"),

    # School
    ("school", "en", "Where's the nearest school?"),
    ("school", "en", "Find me a school nearby."),
    ("school", "en", "Closest school I can shelter in?"),
    ("school", "en", "List the schools around me."),
    ("school", "en", "Which school is the closest?"),
    ("school", "en", "Need a school as shelter, what's near?"),
    ("school", "tl", "Saan ang pinakamalapit na paaralan?"),
    ("school", "tl", "May malapit ba na eskwelahan?"),
    ("school", "tl", "Listahan ng paaralan sa lapit."),
    ("school", "tl", "Saang eskwelahan pwede magshelter?"),
    ("school", "tl", "Pinakamalapit na paaralan, saan?"),
    ("school", "taglish", "Where's the closest school po?"),
    ("school", "taglish", "Find me a school na malapit."),
    ("school", "taglish", "List schools sa area namin."),

    # Gymnasium
    ("gymnasium", "en", "Find me a gymnasium nearby."),
    ("gymnasium", "en", "Where's the closest gym?"),
    ("gymnasium", "en", "List nearby gymnasiums."),
    ("gymnasium", "en", "Which gym is the closest?"),
    ("gymnasium", "en", "Sports complex near me?"),
    ("gymnasium", "tl", "Saan ang malapit na gymnasium?"),
    ("gymnasium", "tl", "May malapit ba na gym?"),
    ("gymnasium", "tl", "Listahan ng gym sa lapit."),
    ("gymnasium", "tl", "Sports complex sa malapit, saan?"),
    ("gymnasium", "taglish", "Saan yung nearest gymnasium?"),
    ("gymnasium", "taglish", "List gymnasiums na nearby."),
    ("gymnasium", "taglish", "Where's the closest sports complex po?"),

    # Multi-purpose hall
    ("multi_purpose_hall", "en", "Where's the nearest multi-purpose hall?"),
    ("multi_purpose_hall", "en", "Find a multi-purpose hall around here."),
    ("multi_purpose_hall", "en", "List multi-purpose halls in my area."),
    ("multi_purpose_hall", "en", "Closest barangay hall?"),
    ("multi_purpose_hall", "en", "Show MPH near me."),
    ("multi_purpose_hall", "tl", "Saan ang pinakamalapit na multi-purpose hall?"),
    ("multi_purpose_hall", "tl", "May malapit ba na multi-purpose hall?"),
    ("multi_purpose_hall", "tl", "Mga MPH sa lapit, ipakita."),
    ("multi_purpose_hall", "tl", "Pinakamalapit na barangay hall, saan?"),
    ("multi_purpose_hall", "taglish", "Where's the nearest multi-purpose hall po?"),
    ("multi_purpose_hall", "taglish", "List MPH sa area ko po."),
    ("multi_purpose_hall", "taglish", "Saan yung closest barangay hall?"),

    # Covered court
    ("covered_court", "en", "Where's the nearest covered court?"),
    ("covered_court", "en", "Find me a covered court nearby."),
    ("covered_court", "en", "List covered courts near me."),
    ("covered_court", "en", "Closest covered basketball court?"),
    ("covered_court", "en", "Which covered court is closest?"),
    ("covered_court", "tl", "Saan ang malapit na covered court?"),
    ("covered_court", "tl", "May malapit ba na covered court?"),
    ("covered_court", "tl", "Mga covered court sa lapit ko."),
    ("covered_court", "tl", "Pinakamalapit na covered basketball court?"),
    ("covered_court", "taglish", "Where's the closest covered court?"),
    ("covered_court", "taglish", "List covered courts na malapit."),
    ("covered_court", "taglish", "Saan yung nearest covered court po?"),
]

SYNTHETIC_POIS: dict[str, list[dict]] = {
    "hospital": [
        {"name": "Manila Doctors Hospital", "km": 1.2, "address": "United Nations Ave, Ermita"},
        {"name": "Ospital ng Maynila", "km": 0.8, "address": "Quirino Ave, Malate"},
        {"name": "Philippine General Hospital", "km": 1.5, "address": "Taft Ave, Ermita"},
        {"name": "Sta. Ana Hospital", "km": 2.1, "address": "Sta. Ana, Manila"},
        {"name": "Gat Andres Bonifacio Memorial Medical Center", "km": 1.8, "address": "Tondo, Manila"},
        {"name": "Justice Jose Abad Santos General Hospital", "km": 2.3, "address": "Binondo, Manila"},
        {"name": "Tondo Medical Center", "km": 1.4, "address": "Tondo, Manila"},
        {"name": "Manila Adventist Medical Center", "km": 2.0, "address": "San Andres Bukid, Manila"},
    ],
    "evacuation_center": [
        {"name": "Brgy. San Jose Covered Court", "km": 0.4, "address": "San Jose, Manila"},
        {"name": "Tondo Sports Complex", "km": 1.2, "address": "Tondo, Manila"},
        {"name": "Brgy. 12 Hall", "km": 0.3, "address": "Tondo, Manila"},
        {"name": "Sampaloc Elementary School", "km": 0.5, "address": "Sampaloc, Manila"},
        {"name": "Manila High School", "km": 0.8, "address": "Ermita, Manila"},
        {"name": "Quiapo Multi-Purpose Hall", "km": 1.1, "address": "Quiapo, Manila"},
    ],
    "school": [
        {"name": "Manila High School", "km": 0.4, "address": "Intramuros, Manila"},
        {"name": "Sampaloc Elementary School", "km": 0.5, "address": "Sampaloc, Manila"},
        {"name": "Tondo High School", "km": 0.7, "address": "Tondo, Manila"},
        {"name": "Manila Science High School", "km": 1.0, "address": "Padre Faura, Manila"},
        {"name": "Binondo Elementary", "km": 0.9, "address": "Binondo, Manila"},
        {"name": "Sta. Cruz Elementary School", "km": 1.2, "address": "Sta. Cruz, Manila"},
    ],
    "gymnasium": [
        {"name": "Tondo Sports Complex", "km": 1.2, "address": "Tondo, Manila"},
        {"name": "Manila Gymnasium", "km": 0.9, "address": "Sampaloc, Manila"},
        {"name": "Paco Sports Complex", "km": 1.4, "address": "Paco, Manila"},
        {"name": "Sta. Cruz Gymnasium", "km": 1.5, "address": "Sta. Cruz, Manila"},
        {"name": "Pandacan Gymnasium", "km": 2.0, "address": "Pandacan, Manila"},
    ],
    "multi_purpose_hall": [
        {"name": "Quiapo Multi-Purpose Hall", "km": 1.1, "address": "Quiapo, Manila"},
        {"name": "Ermita Multi-Purpose Hall", "km": 1.3, "address": "Ermita, Manila"},
        {"name": "Sampaloc Multi-Purpose Hall", "km": 0.7, "address": "Sampaloc, Manila"},
        {"name": "Tondo Multi-Purpose Hall", "km": 1.5, "address": "Tondo, Manila"},
        {"name": "Pandacan Multi-Purpose Hall", "km": 1.9, "address": "Pandacan, Manila"},
    ],
    "covered_court": [
        {"name": "Brgy. 12 Covered Court", "km": 0.4, "address": "Tondo, Manila"},
        {"name": "Brgy. San Jose Covered Court", "km": 0.4, "address": "San Jose, Manila"},
        {"name": "Tondo Covered Court", "km": 0.6, "address": "Tondo, Manila"},
        {"name": "Malate Covered Court", "km": 0.5, "address": "Malate, Manila"},
        {"name": "Paco Covered Court", "km": 1.2, "address": "Paco, Manila"},
        {"name": "Sta. Ana Covered Court", "km": 1.6, "address": "Sta. Ana, Manila"},
    ],
}

CATEGORY_TL = {
    "hospital": "ospital",
    "evacuation_center": "evacuation center",
    "school": "paaralan",
    "gymnasium": "gymnasium",
    "multi_purpose_hall": "multi-purpose hall",
    "covered_court": "covered court",
}


def render_nearby_summary(category: str, picks: list[dict]) -> str:
    cat_words = category.replace("_", " ")
    lines = []
    for i, p in enumerate(picks):
        addr = f" · {p['address']}" if p.get("address") else ""
        lines.append(f"{i + 1}. {p['name']} — {p['km']:.1f} km{addr}")
    return f"Nearest {cat_words}:\n" + "\n".join(lines)


def render_nearby_speak(lang: str, category: str, picks: list[dict]) -> str:
    items = ", ".join(f"{p['name']} ({p['km']:.1f} km)" for p in picks)
    if lang == "en":
        return f"Top 3 nearest {category.replace('_', ' ')}s: {items}."
    if lang == "tl":
        return f"Tatlong pinakamalapit na {CATEGORY_TL[category]}: {items}."
    return f"Top 3 nearest {category.replace('_', ' ')}: {items}."


def build_nearby_rows(rng: random.Random, count: int = 200, max_reuse_per_question: int = 4) -> list[dict]:
    rows = []
    usage: dict[str, int] = defaultdict(int)
    attempts = 0
    max_attempts = count * 20
    while len(rows) < count and attempts < max_attempts:
        attempts += 1
        category, lang, user_q = rng.choice(NEARBY_QUERIES)
        if usage[user_q] >= max_reuse_per_question:
            continue
        usage[user_q] += 1
        pool = SYNTHETIC_POIS[category]
        k = min(3, len(pool))
        picks = rng.sample(pool, k)
        picks.sort(key=lambda p: p["km"])

        summary = render_nearby_summary(category, picks)
        speak_text = render_nearby_speak(lang, category, picks)

        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", user_q),
            turn("assistant", tool_call("find_nearby", {"category": category})),
            turn("tool", tool_result("find_nearby", summary)),
            turn("assistant", speak(speak_text)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 4: get_user_profile
# ---------------------------------------------------------------------------
#
# Runtime summary (aiTools.ts getUserProfile) is a multi-line block:
#   Name: ...
#   Age group: ...
#   Companions: N infants, N children, N elderly, N PWD
#   Pets: ...
#   Medical conditions: ...
#   Address: ...
#   Primary meeting point: ...
#   Secondary meeting point: ...
#   Emergency contacts: ...

# De-identified fixtures. Names and phone numbers are deliberately left as
# "(unset)" / role labels — matching the runtime's `|| '(unset)'` fallback in
# aiTools.ts getUserProfile. Training on these teaches the model the FIELD
# STRUCTURE (which categories of companions exist, how to weight asthma vs.
# diabetes, how to reference meeting points) without memorizing literal names
# or phone numbers that could surface as hallucinations when the runtime
# returns a sparse profile. Barangay/city names (Sampaloc, Tondo, Malate,
# Quiapo) are public administrative regions, not PII.
PROFILE_FIXTURES = [
    {
        "name": "(unset)", "age": "adult",
        "companions": {"infants": 1, "children": 0, "elderly": 0, "pwd": 0},
        "pets": "none",
        "conditions": "asthma",
        "address": "(unset), Sampaloc, Manila",
        "primary": "Sampaloc Covered Court",
        "secondary": "Sampaloc Elementary School",
        "contacts": "spouse",
    },
    {
        "name": "(unset)", "age": "senior",
        "companions": {"infants": 0, "children": 0, "elderly": 1, "pwd": 0},
        "pets": "1 dog (medium)",
        "conditions": "hypertension",
        "address": "(unset), Tondo, Manila",
        "primary": "Tondo Sports Complex",
        "secondary": "Brgy. 12 Hall",
        "contacts": "daughter",
    },
    {
        "name": "(unset)", "age": "adult",
        "companions": {"infants": 0, "children": 0, "elderly": 0, "pwd": 1},
        "pets": "none",
        "conditions": "none reported",
        "address": "(unset), Malate, Manila",
        "primary": "Malate Covered Court",
        "secondary": "Manila High School",
        "contacts": "sibling",
    },
    {
        "name": "(unset)", "age": "adult",
        "companions": {"infants": 2, "children": 1, "elderly": 1, "pwd": 0},
        "pets": "2 cats (small)",
        "conditions": "diabetes",
        "address": "(unset), Quiapo, Manila",
        "primary": "Quiapo Multi-Purpose Hall",
        "secondary": "Binondo Elementary",
        "contacts": "spouse",
    },
]

PROFILE_QUERIES = [
    # English
    ("en", "Do I need anything special in my go-bag?"),
    ("en", "What should my family pack given who's with us?"),
    ("en", "What are my emergency contacts?"),
    ("en", "Where's our family meeting point?"),
    ("en", "What medical conditions did I list?"),
    ("en", "Pull up my profile."),
    ("en", "Who's in my household again?"),
    ("en", "What's my secondary meeting point?"),
    ("en", "Did I list any pets in my profile?"),
    ("en", "Remind me of my saved medical info."),
    ("en", "What's our designated meet-up spot?"),
    ("en", "Are there infants or elderly in my household?"),
    ("en", "Customize my go-bag based on my profile."),
    ("en", "What special items should we bring as a family?"),
    ("en", "Check my saved emergency contacts."),
    ("en", "Any disability needs I should plan for?"),
    # Filipino
    ("tl", "May special na kailangan ba ako sa go-bag ko?"),
    ("tl", "Ano dapat i-pack ng pamilya namin?"),
    ("tl", "Sino ang mga emergency contacts ko?"),
    ("tl", "Saan ang meeting point ng pamilya namin?"),
    ("tl", "Ano ang mga medical conditions na nilagay ko?"),
    ("tl", "Ipakita ang profile ko."),
    ("tl", "Sino-sino kasama ko sa bahay?"),
    ("tl", "Ano ang secondary meeting point ko?"),
    ("tl", "May alaga ba akong nilagay sa profile?"),
    ("tl", "Paalalahanan mo ako sa medical info ko."),
    ("tl", "Saan ang takdaang meeting point namin?"),
    ("tl", "May sanggol o matanda ba sa pamilya namin?"),
    ("tl", "I-customize ang go-bag base sa profile ko."),
    ("tl", "Ano special items dapat dalhin ng pamilya?"),
    ("tl", "Check mo ang saved emergency contacts ko."),
    ("tl", "May PWD ba ako sa household?"),
    # Taglish
    ("taglish", "Anong special sa go-bag ko po?"),
    ("taglish", "Sino emergency contacts ko?"),
    ("taglish", "Pull up profile ko po."),
    ("taglish", "Saan yung meeting point namin?"),
    ("taglish", "Anong medical conditions ko ulit?"),
    ("taglish", "May pets ba sa profile ko?"),
    ("taglish", "Customize go-bag based sa household ko."),
    ("taglish", "Any PWD needs na dapat planuhin?"),
]


def render_profile_summary(p: dict) -> str:
    c = p["companions"]
    return (
        f"Name: {p['name']}\n"
        f"Age group: {p['age']}\n"
        f"Companions: {c['infants']} infants, {c['children']} children, {c['elderly']} elderly, {c['pwd']} PWD\n"
        f"Pets: {p['pets']}\n"
        f"Medical conditions: {p['conditions']}\n"
        f"Address: {p['address']}\n"
        f"Primary meeting point: {p['primary']}\n"
        f"Secondary meeting point: {p['secondary']}\n"
        f"Emergency contacts: {p['contacts']}"
    )


def render_profile_speak(lang: str, p: dict, query_idx: int) -> str:
    """Produce a personalized speak reply that references the profile."""
    c = p["companions"]
    items_en: list[str] = []
    items_tl: list[str] = []
    if c["infants"] > 0:
        items_en.append("formula, diapers, baby blanket")
        items_tl.append("formula, diaper, kumot ng sanggol")
    if c["elderly"] > 0:
        items_en.append("maintenance medication, reading glasses")
        items_tl.append("maintenance gamot, salamin")
    if c["pwd"] > 0:
        items_en.append("mobility aids, prescriptions")
        items_tl.append("mobility aids, reseta")
    if p["pets"] != "none":
        items_en.append("pet food, leash, carrier")
        items_tl.append("pet food, leash, carrier")
    if p["conditions"] == "asthma":
        items_en.append("inhaler, N95 masks")
        items_tl.append("inhaler, N95 mask")
    elif p["conditions"] == "hypertension":
        items_en.append("BP medication")
        items_tl.append("gamot sa BP")
    elif p["conditions"] == "diabetes":
        items_en.append("insulin or oral diabetes meds, glucose monitor")
        items_tl.append("insulin o gamot sa diabetes, glucose monitor")

    base_en = "Standard NDRRMC go-bag: water (3L/person), food (3 days), flashlight, radio, first-aid kit, IDs, cash, whistle."
    base_tl = "Standard NDRRMC go-bag: tubig (3L/tao), pagkain (3 araw), flashlight, radyo, first-aid kit, ID, pera, whistle."

    # Speak text never interpolates name or phone — those vary per real user
    # and would invite memorization. Refer to "your household" generically;
    # the runtime adds the real name back in via the system prompt's profile
    # summary, which the model can copy from at inference time.
    if lang == "en":
        if items_en:
            return f"{base_en} Given your household, also include: {', '.join(items_en)}. Primary meeting point: {p['primary']}."
        return f"{base_en} Primary meeting point: {p['primary']}."
    if lang == "tl":
        if items_tl:
            return f"{base_tl} Para sa pamilya ninyo, isama rin: {', '.join(items_tl)}. Primary meeting point: {p['primary']}."
        return f"{base_tl} Primary meeting point: {p['primary']}."
    # taglish
    if items_en:
        return f"NDRRMC go-bag basics: water, food, flashlight, radyo, first-aid, IDs, cash. Sa household mo, isama rin: {', '.join(items_en)}. Meeting point: {p['primary']}."
    return f"NDRRMC go-bag basics: water, food, flashlight, radyo, first-aid, IDs, cash. Meeting point: {p['primary']}."


def build_profile_rows(rng: random.Random, count: int = 100, max_reuse_per_question: int = 4) -> list[dict]:
    rows = []
    usage: dict[str, int] = defaultdict(int)
    attempts = 0
    max_attempts = count * 20
    i = 0
    while len(rows) < count and attempts < max_attempts:
        attempts += 1
        lang, user_q = rng.choice(PROFILE_QUERIES)
        if usage[user_q] >= max_reuse_per_question:
            continue
        usage[user_q] += 1
        profile = rng.choice(PROFILE_FIXTURES)
        summary = render_profile_summary(profile)
        speak_text = render_profile_speak(lang, profile, i)
        i += 1

        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", user_q),
            turn("assistant", tool_call("get_user_profile", {})),
            turn("tool", tool_result("get_user_profile", summary)),
            turn("assistant", speak(speak_text)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 5: Direct speak (no tool) — reassurance, identity, off-topic
# ---------------------------------------------------------------------------

DIRECT_SPEAK = [
    ("en", "I'm scared.",
     "It's okay to be scared — that's a normal response. Take a slow breath. Tell me what disaster you're facing right now (earthquake, typhoon, or volcano) and I'll give you the next step from NDRRMC."),
    ("tl", "Natatakot ako.",
     "Normal lang matakot — huminga ka muna nang malalim. Sabihin mo kung anong disaster ang kinakaharap mo ngayon (lindol, bagyo, o bulkan) at ibibigay ko ang susunod na hakbang mula sa NDRRMC."),
    ("taglish", "Takot na takot na po ako.",
     "Normal lang matakot po — huminga muna kayo nang malalim. Anong disaster po ang hinaharap niyo ngayon (lindol, bagyo, o bulkan)? Ibibigay ko po ang susunod na step mula sa NDRRMC."),
    ("en", "Are you a real person?",
     "I'm LIKAS, an offline AI assistant on your phone. I work without internet so you can rely on me during disasters. How can I help?"),
    ("tl", "Tao ka ba?",
     "Ako si LIKAS, isang offline AI assistant sa cellphone mo. Gumagana ako kahit walang internet para matulungan kita sa oras ng sakuna. Paano kita matutulungan?"),
    ("en", "Thank you.",
     "You're welcome. Stay safe."),
    ("tl", "Salamat.",
     "Walang anuman. Mag-ingat ka."),
    ("taglish", "Salamat po.",
     "Walang anuman po. Mag-ingat kayo."),
    # Off-topic redirects
    ("en", "Who won the NBA finals last year?",
     "I'm specialized for disaster preparedness and emergency response in the Philippines. I can help with earthquake survival, typhoon prep, volcanic emergencies, evacuation routes, or first-aid. What would you like to know?"),
    ("en", "Write me a poem about love.",
     "I'm built for disaster response — earthquakes, typhoons, volcanic eruptions, evacuation, and first-aid. I'd be glad to help with any of those."),
    ("tl", "Sino ang pangulo ng Pilipinas?",
     "Specialized po ako para sa disaster preparedness at emergency response. Pwede po akong tumulong sa lindol, bagyo, bulkan, evacuation routes, o first-aid. Ano po ang gusto ninyong malaman?"),
    ("en", "What's the weather today?",
     "I don't have live weather data — I'm offline by design. For real-time forecasts, check PAGASA when you have signal. I can help you prepare based on the typhoon signal you've already heard, though — just tell me what it is."),
    ("tl", "Anong balita sa basketball?",
     "Hindi po ako para sa balita o sports. Para po sa disaster preparedness at emergency response ako — lindol, bagyo, bulkan, evacuation, first-aid. Ano po ang maitutulong ko?"),
    # Rule 6 fallback: unknown disaster
    ("en", "How do I prepare for a tsunami?",
     "I can't verify that protocol — contact NDRRMC at 911. My official protocols cover earthquake, typhoon, and volcano. PHIVOLCS does issue tsunami advisories following large undersea earthquakes — for those, move to high ground immediately and tune to local radio."),
    ("tl", "Paano maghanda sa tsunami?",
     "Hindi ko po ma-verify ang protocol na iyan — tumawag po sa NDRRMC sa 911. Ang opisyal na protocols ko ay para sa lindol, bagyo, at bulkan lamang. Kung may tsunami advisory mula sa PHIVOLCS, agad pong umakyat sa mataas na lugar at makinig sa radyo."),
    # No-action safety boundary
    ("en", "Can you text my emergency contact for me?",
     "I can't send SMS or place calls — those stay under your control. I can show you the number you saved. Open your phone's messaging app to send. Want me to pull up your emergency contacts?"),
]


def build_direct_speak_rows() -> list[dict]:
    rows = []
    for _, user_q, response in DIRECT_SPEAK:
        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", user_q),
            turn("assistant", speak(response)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 6: Multi-tool (profile-aware evac)
# ---------------------------------------------------------------------------

MULTI_TOOL_QUERIES = [
    ("en", "Find me an evacuation center that fits my family."),
    ("en", "Pick an evac center that works for our household."),
    ("en", "Recommend a shelter that suits the people I live with."),
    ("en", "Which evac center matches my household needs?"),
    ("en", "Best evacuation site for my family situation?"),
    ("en", "Choose a shelter that fits my profile."),
    ("tl", "Hanap ka ng evacuation center na bagay sa pamilya ko."),
    ("tl", "Pumili ka ng evac center na okay para sa pamilya namin."),
    ("tl", "Saang evac kami pwede base sa pamilya namin?"),
    ("tl", "Anong shelter bagay sa kalagayan ng pamilya namin?"),
    ("tl", "Pinaka-okay na evacuation site para sa profile namin?"),
    ("taglish", "Find an evac center na okay para sa family ko."),
    ("taglish", "Pick a shelter na bagay sa household ko."),
    ("taglish", "Recommend evac center base sa profile ko po."),
]


def build_multi_tool_rows(rng: random.Random, count: int = 30, max_reuse_per_question: int = 3) -> list[dict]:
    rows = []
    pwd_centers = [c for c in SYNTHETIC_CENTERS if c["isPwd"]]
    usage: dict[str, int] = defaultdict(int)
    attempts = 0
    max_attempts = count * 20

    while len(rows) < count and attempts < max_attempts:
        attempts += 1
        lang, user_q = rng.choice(MULTI_TOOL_QUERIES)
        if usage[user_q] >= max_reuse_per_question:
            continue
        usage[user_q] += 1
        profile = rng.choice([p for p in PROFILE_FIXTURES if p["companions"]["pwd"] > 0 or p["companions"]["elderly"] > 0])
        picks = rng.sample(pwd_centers, min(3, len(pwd_centers)))
        picks.sort(key=lambda c: c["km"])

        profile_summary = render_profile_summary(profile)
        evac_summary = render_evac_summary(picks)

        if lang == "en":
            speak_text = (
                f"Based on your household, the best match is {picks[0]['name']} "
                f"({picks[0]['km']:.1f} km, PWD-friendly). Alternates: "
                + ", ".join(f"{c['name']} ({c['km']:.1f} km)" for c in picks[1:])
                + f". Meeting point: {profile['primary']}."
            )
        elif lang == "tl":
            speak_text = (
                f"Base sa pamilya ninyo, pinakabagay ang {picks[0]['name']} "
                f"({picks[0]['km']:.1f} km, PWD-friendly). Iba pang option: "
                + ", ".join(f"{c['name']} ({c['km']:.1f} km)" for c in picks[1:])
                + f". Meeting point: {profile['primary']}."
            )
        else:
            speak_text = (
                f"Based sa household mo, best match ay {picks[0]['name']} "
                f"({picks[0]['km']:.1f} km, PWD-friendly). Other options: "
                + ", ".join(f"{c['name']} ({c['km']:.1f} km)" for c in picks[1:])
                + f". Meeting point: {profile['primary']}."
            )

        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", user_q),
            turn("assistant", tool_call("get_user_profile", {})),
            turn("tool", tool_result("get_user_profile", profile_summary)),
            turn("assistant", tool_call("route_to_nearest_evacuation", {"profile_aware": True})),
            turn("tool", tool_result("route_to_nearest_evacuation", evac_summary)),
            turn("assistant", speak(speak_text)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 7: Multi-turn — user references prior context
# ---------------------------------------------------------------------------

# Multi-turn seed questions are kept distinct from EVAC_USER_QUERIES so the
# first-turn user message never collides with a single-turn evacuation row.
MULTITURN_SEEDS = [
    "Can you list a few evac options near me?",
    "Show me three nearest evac centers.",
    "Give me a shortlist of evacuation sites.",
    "I want to compare a couple of shelters nearby.",
    "List the top evac centers around here.",
    "Pwede bang ipakita ang ilang malapit na evac?",
    "Pakilista ang tatlong pinakamalapit na evac.",
    "Bigyan mo ako ng shortlist ng evacuation sites.",
    "Gusto kong i-compare ilang shelter sa lapit.",
    "Show me ilang evac options near my place.",
]

MULTITURN_FOLLOWUPS = [
    "What about option 2, is it pet-friendly?",
    "How about #2 — pets allowed?",
    "Tell me more about the second one — pet-friendly ba?",
    "Yung pangalawa, pwede ba may alaga?",
    "Pwede ba sa pangalawa yung pet ko?",
]


def build_multiturn_rows(rng: random.Random, count: int = 40, max_reuse_per_question: int = 3) -> list[dict]:
    rows = []
    usage: dict[str, int] = defaultdict(int)
    attempts = 0
    max_attempts = count * 20

    while len(rows) < count and attempts < max_attempts:
        attempts += 1
        seed_q = rng.choice(MULTITURN_SEEDS)
        if usage[seed_q] >= max_reuse_per_question:
            continue
        usage[seed_q] += 1

        picks = rng.sample(SYNTHETIC_CENTERS, 3)
        picks.sort(key=lambda c: c["km"])
        summary = render_evac_summary(picks)
        listing_speak = render_evac_speak("en", picks)
        second = picks[1]
        followup = rng.choice(MULTITURN_FOLLOWUPS)
        answer = (
            f"Option 2 is {second['name']} ({second['km']:.1f} km). "
            + ("It's pet-friendly." if second["isPet"] else "It is not pet-friendly — option ranking is by distance, not pet access.")
        )

        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", seed_q),
            turn("assistant", tool_call("route_to_nearest_evacuation", {})),
            turn("tool", tool_result("route_to_nearest_evacuation", summary)),
            turn("assistant", speak(listing_speak)),
            turn("user", followup),
            turn("assistant", speak(answer)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 8: Tool error recovery
# ---------------------------------------------------------------------------
#
# When a tool handler throws, the runtime injects:
#   {"name": <tool>, "result": "Tool <tool> failed: <message>"}
# Train the model to recover gracefully rather than retry blindly.

TOOL_ERROR_CASES = [
    ("en", "Where's the nearest evac center?", "route_to_nearest_evacuation",
     "Tool route_to_nearest_evacuation failed: evacuation data unavailable",
     "I couldn't read the evacuation list right now. Contact NDRRMC at 911 or your barangay disaster office. If you're on foot, head toward higher ground or your nearest school, gymnasium, or covered court."),
    ("tl", "Saan ang pinakamalapit na evac?", "route_to_nearest_evacuation",
     "Tool route_to_nearest_evacuation failed: evacuation data unavailable",
     "Hindi ko po mabasa ang listahan ng evacuation ngayon. Tumawag po sa NDRRMC sa 911 o sa barangay disaster office. Kung naglalakad po kayo, lumipat sa mas mataas na lugar o sa pinakamalapit na paaralan, gymnasium, o covered court."),
    ("en", "Find me a hospital nearby.", "find_nearby",
     "Tool find_nearby failed: POI data not loaded",
     "I couldn't read the hospital list right now. Call 911 for emergency medical dispatch, or go to the nearest medical facility you know — Manila Doctors, Ospital ng Maynila, and PGH are common Metro Manila options."),
]


def build_tool_error_rows() -> list[dict]:
    rows = []
    for lang, user_q, tool_name, error_msg, recovery in TOOL_ERROR_CASES:
        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", user_q),
            turn("assistant", tool_call(tool_name, {} if tool_name == "route_to_nearest_evacuation" else {"category": "hospital"})),
            turn("tool", tool_result(tool_name, error_msg)),
            turn("assistant", speak(recovery)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

VALID_TOOLS = {"get_protocol", "route_to_nearest_evacuation", "find_nearby", "get_user_profile"}
VALID_ROLES = {"system", "user", "assistant", "tool"}
VALID_CATEGORIES = {
    "hospital", "evacuation_center", "gymnasium", "school",
    "multi_purpose_hall", "covered_court",
}
VALID_DISASTERS = {"earthquake", "typhoon", "volcano"}
VALID_PHASES = {"before", "during", "after"}


def validate_row(r: dict) -> tuple[bool, str]:
    msgs = r.get("messages", [])
    if len(msgs) < 3:
        return False, "conversation too short"
    if msgs[0]["role"] != "system":
        return False, "missing system turn"

    for i, m in enumerate(msgs):
        role = m.get("role")
        if role not in VALID_ROLES:
            return False, f"turn {i} invalid role: {role}"
        content = m.get("content")
        if not isinstance(content, str) or content == "":
            return False, f"turn {i} content not non-empty string"

        if role == "assistant":
            try:
                env = json.loads(content)
            except json.JSONDecodeError:
                return False, f"assistant turn {i} not valid JSON: {content[:80]}"
            action = env.get("action")
            if action == "speak":
                if not isinstance(env.get("text"), str) or not env["text"]:
                    return False, f"assistant turn {i} speak missing text"
            elif action == "tool":
                if env.get("name") not in VALID_TOOLS:
                    return False, f"assistant turn {i} unknown tool: {env.get('name')}"
                args = env.get("args")
                if not isinstance(args, dict):
                    return False, f"assistant turn {i} args not object"
                # Grammar-enforceable arg checks
                if env["name"] == "get_protocol":
                    if args.get("disaster") not in VALID_DISASTERS:
                        return False, f"assistant turn {i} get_protocol disaster invalid"
                    if args.get("phase") not in VALID_PHASES:
                        return False, f"assistant turn {i} get_protocol phase invalid"
                if env["name"] == "find_nearby":
                    if args.get("category") not in VALID_CATEGORIES:
                        return False, f"assistant turn {i} find_nearby category invalid: {args.get('category')}"
                if env["name"] == "route_to_nearest_evacuation":
                    if "profile_aware" in args and not isinstance(args["profile_aware"], bool):
                        return False, f"assistant turn {i} profile_aware not boolean"
            else:
                return False, f"assistant turn {i} unknown action: {action}"

        if role == "tool":
            try:
                payload = json.loads(content)
            except json.JSONDecodeError:
                return False, f"tool turn {i} not valid JSON"
            if payload.get("name") not in VALID_TOOLS:
                return False, f"tool turn {i} unknown tool name: {payload.get('name')}"
            if not isinstance(payload.get("result"), str) or not payload["result"]:
                return False, f"tool turn {i} result not non-empty string"

    return True, ""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def write_jsonl(path: Path, rows: Iterable[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            n += 1
    return n


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--protocols", type=Path, required=True,
                   help="Directory containing earthquake.json, typhoon.json, volcano.json")
    p.add_argument("--out", type=Path, required=True,
                   help="Output directory (will contain train.jsonl, test.jsonl, stats.json)")
    p.add_argument("--seed", type=int, default=3407)
    p.add_argument("--test-fraction", type=float, default=0.1)
    args = p.parse_args()

    rng = random.Random(args.seed)

    protocols = {}
    for disaster in ("earthquake", "typhoon", "volcano"):
        protocol_path = args.protocols / f"{disaster}.json"
        if not protocol_path.exists():
            raise FileNotFoundError(f"Missing {protocol_path}")
        protocols[disaster] = json.loads(protocol_path.read_text(encoding="utf-8"))

    categories = {
        "protocol_qa":     build_protocol_rows(protocols),
        "evacuation":      build_evac_rows(rng, count=200),
        "nearby_poi":      build_nearby_rows(rng, count=200),
        "profile_aware":   build_profile_rows(rng, count=100),
        "direct_speak":    build_direct_speak_rows(),
        "multi_tool":      build_multi_tool_rows(rng, count=30),
        "multi_turn":      build_multiturn_rows(rng, count=40),
        "tool_error":      build_tool_error_rows(),
    }

    all_rows = []
    stats = {}
    rejected = []
    for name, rows in categories.items():
        kept = []
        for r in rows:
            ok, reason = validate_row(r)
            if ok:
                kept.append(r)
            else:
                rejected.append({"category": name, "reason": reason})
        stats[name] = {"kept": len(kept), "rejected": len(rows) - len(kept)}
        all_rows.extend(kept)

    if rejected:
        print(f"WARNING: rejected {len(rejected)} invalid rows:")
        for r in rejected[:10]:
            print(f"  - [{r['category']}] {r['reason']}")

    rng.shuffle(all_rows)

    # Group rows by their first user message so every row that shares a
    # question lands in the same split. Splitting on rows alone leaks
    # questions across train/test (the same paraphrase appears with
    # different tool results in both halves), turning eval_loss into a
    # memorization metric instead of a generalization metric.
    by_question: dict[str, list[dict]] = defaultdict(list)
    for r in all_rows:
        msgs = r["messages"]
        first_user = next(m["content"] for m in msgs if m["role"] == "user")
        by_question[first_user].append(r)

    unique_questions = list(by_question.keys())
    rng.shuffle(unique_questions)

    n_test_questions = max(1, int(len(unique_questions) * args.test_fraction))
    test_questions = set(unique_questions[:n_test_questions])

    train_rows = [r for q, rs in by_question.items() if q not in test_questions for r in rs]
    test_rows = [r for q, rs in by_question.items() if q in test_questions for r in rs]

    train_qs = {next(m["content"] for m in r["messages"] if m["role"] == "user") for r in train_rows}
    test_qs = {next(m["content"] for m in r["messages"] if m["role"] == "user") for r in test_rows}
    overlap = train_qs & test_qs
    assert not overlap, f"Train/test question overlap — split is broken: {sorted(overlap)[:5]}"

    n_train = write_jsonl(args.out / "train.jsonl", train_rows)
    n_test_w = write_jsonl(args.out / "test.jsonl", test_rows)

    stats_out = {
        "total": len(all_rows),
        "train": n_train,
        "test": n_test_w,
        "unique_questions": len(unique_questions),
        "train_unique_questions": len(unique_questions) - n_test_questions,
        "test_unique_questions": n_test_questions,
        "by_category": stats,
        "rejected_count": len(rejected),
    }
    (args.out / "stats.json").write_text(json.dumps(stats_out, indent=2))

    print(f"\nDataset built: {args.out}")
    print(f"  unique questions: {len(unique_questions)} (train: {len(unique_questions) - n_test_questions}, test: {n_test_questions})")
    print(f"  train rows: {n_train}")
    print(f"  test rows:  {n_test_w}")
    print(f"  composition:")
    for cat, s in stats.items():
        print(f"    {cat:18s} {s['kept']:5d} rows")


if __name__ == "__main__":
    main()
