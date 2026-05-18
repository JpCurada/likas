"""
LIKAS training dataset builder — v4.

Why v4 exists (in plain English):
  v3 generated 692 conversations but only ~30% of assistant turns were unique.
  The verbatim-quote rule for protocols meant 24 paraphrased user questions all
  mapped to the SAME 9 protocol texts. The model overfit on these as a lookup
  table (train loss 3.47 -> 0.31 in 24 steps; val loss barely moved).

What v4 changes:
  1. Protocol speak turns are paraphrased across template families that PRESERVE
     every rule from the source protocol but vary surface form (terse / numbered
     / urgent-action / reassuring). This is faithful, not free invention — the
     rule extractor in extract_rules() guarantees rule coverage.
  2. POIs come from the real scraped OSM data (datasets/../scraped/*.json) and
     user origins from real Metro Manila barangay centroids — so distances and
     walk times vary continuously instead of repeating fixed values.
  3. route_to_nearest_evacuation rows include all three runtime tail variants:
     route-resolved, graph-not-installed, snap-failed. The assistant references
     the polyline being drawn on the map when it exists.
  4. New categories: refusal (rule 7 off-topic), clarification (ambiguous user
     query), and language-fallback (user mixed languages weirdly).
  5. Per-category sample caps remove rare cells from dominating loss (e.g. no
     more 128 identical route_to_nearest_evacuation({}) calls).

Output layout matches v3:
  datasets/likas_assistant_v4/train.jsonl
  datasets/likas_assistant_v4/test.jsonl
  datasets/likas_assistant_v4/stats.json
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable


# ---------------------------------------------------------------------------
# System prompt — same as v3 for runtime compatibility.
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
# Conversation helpers — same contract as v3.
# ---------------------------------------------------------------------------

def turn(role: str, text: str) -> dict:
    return {"role": role, "content": text}

def speak(text: str) -> str:
    return json.dumps({"action": "speak", "text": text}, ensure_ascii=False)

def tool_call(name: str, args: dict) -> str:
    return json.dumps({"action": "tool", "name": name, "args": args}, ensure_ascii=False)

def tool_result(name: str, result_text: str) -> str:
    return json.dumps({"name": name, "result": result_text}, ensure_ascii=False)

def row(messages: list[dict]) -> dict:
    return {"messages": messages}


# ---------------------------------------------------------------------------
# Real Metro Manila origins — sampled barangay centroids from the bbox of the
# pedestrian graph (120.85, 14.25, 121.30, 14.90). These are plausible user
# locations, varied enough that distance/walk-time aren't repeatable constants.
# ---------------------------------------------------------------------------

# (lon, lat, area-label) — covers Manila, QC, Pasay, Mandaluyong, Makati, Pasig.
ORIGINS: list[tuple[float, float, str]] = [
    (120.9842, 14.5995, "Ermita, Manila"),
    (120.9762, 14.6116, "Tondo, Manila"),
    (120.9826, 14.6042, "Binondo, Manila"),
    (120.9890, 14.6018, "Quiapo, Manila"),
    (120.9854, 14.6092, "Sta. Cruz, Manila"),
    (120.9933, 14.5921, "Malate, Manila"),
    (120.9931, 14.5852, "Pasay, Metro Manila"),
    (120.9802, 14.6175, "Pandacan, Manila"),
    (120.9876, 14.6234, "Sampaloc, Manila"),
    (121.0192, 14.6760, "Diliman, Quezon City"),
    (121.0437, 14.6760, "Cubao, Quezon City"),
    (121.0070, 14.6535, "España, Manila"),
    (121.0244, 14.5547, "Makati CBD"),
    (121.0388, 14.5613, "Bonifacio Global City"),
    (121.0480, 14.5764, "Mandaluyong"),
    (121.0850, 14.5847, "Pasig City"),
    (120.9712, 14.5836, "Intramuros, Manila"),
    (121.0036, 14.6189, "Sta. Mesa, Manila"),
    (120.9879, 14.6308, "Sampaloc East, Manila"),
    (121.0290, 14.5240, "Parañaque"),
]


# ---------------------------------------------------------------------------
# Real POIs from scraped OSM. We only keep entries with a non-empty `name`
# and a coordinate inside the graph bbox; this gives us hundreds of distinct
# evacuation centers / hospitals / etc., so distance / address combinations
# can't be memorized.
# ---------------------------------------------------------------------------

GRAPH_BBOX = (120.85, 14.25, 121.30, 14.90)  # lon_min, lat_min, lon_max, lat_max

def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = a; lon2, lat2 = b
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lon2 - lon1)
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(h))

def walk_minutes(km: float) -> int:
    return max(1, math.ceil((km * 1000) / 1.167 / 60))  # 4.2 km/h, matches runtime

def in_bbox(lon: float, lat: float) -> bool:
    return (GRAPH_BBOX[0] <= lon <= GRAPH_BBOX[2]
            and GRAPH_BBOX[1] <= lat <= GRAPH_BBOX[3])

def load_scraped_pois(root: Path) -> dict[str, list[dict]]:
    """Load scraped POIs into the same category keys the runtime tool uses."""
    # Map scraped filename -> runtime category key
    file_to_cat = {
        "hospital.json": "hospital",
        "evacuation.json": "evacuation_center",
        "school.json": "school",
        "gymnasium.json": "gymnasium",
        "multi_purpose.json": "multi_purpose_hall",
        "covered_court.json": "covered_court",
    }
    out: dict[str, list[dict]] = {k: [] for k in file_to_cat.values()}
    for filename, cat in file_to_cat.items():
        path = root / filename
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        feats = data.get("features", data) if isinstance(data, dict) else data
        for entry in feats:
            try:
                lon = float(entry.get("lon"))
                lat = float(entry.get("lat"))
                name = (entry.get("name") or "").strip()
            except (TypeError, ValueError):
                continue
            if not name or not in_bbox(lon, lat):
                continue
            # Build a short address from `display_name` if present, else type+area.
            disp = entry.get("display_name") or ""
            addr = ", ".join(disp.split(",")[1:3]).strip() if disp else (entry.get("type") or "")
            out[cat].append({"name": name, "lon": lon, "lat": lat, "address": addr})
    return out


# ---------------------------------------------------------------------------
# Protocol rule extractor + paraphrase engine
#
# Goal: produce assistant speak turns that vary in surface form but cover every
# rule from the source protocol text. The runtime tool RESULT still returns the
# verbatim protocol (the model gets the truth via the tool), but the speak turn
# the model is trained to emit is a faithful, varied paraphrase.
# ---------------------------------------------------------------------------

def authority_for(disaster: str) -> str:
    return {"earthquake": "PHIVOLCS", "typhoon": "PAGASA", "volcano": "PHIVOLCS"}.get(
        disaster, "NDRRMC")

_AUTH_PREAMBLE = re.compile(
    r"^\s*(PHIVOLCS|PAGASA|NDRRMC|PAGASA and NDRRMC)\s+(guidance|preparedness)\s*:\s*",
    re.IGNORECASE,
)

def extract_rules(protocol_text: str) -> list[str]:
    """Split a protocol blob into atomic rules.

    Strategy:
      1. Strip leading "<authority> [guidance|preparedness]:" so the rules don't
         carry the authority prefix into every paraphrase.
      2. If the body is a numbered list (1) ... 2) ...), split on the markers.
      3. Otherwise split on sentence boundaries.
    """
    text = _AUTH_PREAMBLE.sub("", protocol_text.strip())
    # Numbered list: split on the boundary BEFORE each marker.
    if re.search(r"\b\d+\)\s", text) or re.search(r"\b\d+\.\s[A-Z]", text):
        parts = re.split(r"\s*\b\d+[\)\.]\s+", text)
        # First element is whatever came before "1)" — usually empty after preamble strip.
        rules = [p.strip().rstrip(".") for p in parts if len(p.strip()) > 10]
        if len(rules) >= 2:
            return rules
    # Sentence split fallback.
    parts = re.split(r"(?<=[.!])\s+", text)
    return [p.strip().rstrip(".") for p in parts if len(p.strip()) > 10]


def render_protocol_speak(
    rng: random.Random,
    lang: str,
    disaster: str,
    phase: str,
    rules: list[str],
    style: str,
) -> str:
    """One of 4 styles × 3 languages × shuffled rule orderings => high surface
    variance, 100% rule-faithful (we only paraphrase wrappers; the rules are
    quoted verbatim from extract_rules)."""
    auth = authority_for(disaster)
    pool = list(rules)
    # Shuffle order in all but 'numbered' style (where order matters semantically).
    if style != "numbered":
        rng.shuffle(pool)

    if style == "numbered":
        body = "; ".join(f"{i+1}) {r}" for i, r in enumerate(pool))
        intros = {
            "en":      [f"{auth} ({disaster}, {phase}): {body}.",
                        f"From {auth}, for {disaster} in the {phase} phase: {body}.",
                        f"{auth} steps: {body}."],
            "tl":      [f"Ayon sa {auth} (kapag {disaster}, {phase}): {body}.",
                        f"{auth} hakbang sa {phase} ng {disaster}: {body}.",
                        f"Mga gabay ng {auth}: {body}."],
            "taglish": [f"Per {auth} para sa {disaster} ({phase}): {body}.",
                        f"{auth} steps po: {body}."],
        }
        return rng.choice(intros[lang])

    if style == "terse":
        body = ". ".join(pool)
        intros = {
            "en":      [f"Key points from {auth}: {body}.",
                        f"{auth} says: {body}.",
                        f"From {auth}: {body}."],
            "tl":      [f"Mga puntos mula sa {auth}: {body}.",
                        f"Ayon sa {auth}: {body}.",
                        f"Mensahe ng {auth}: {body}."],
            "taglish": [f"Per {auth} po: {body}.",
                        f"Key points from {auth} po: {body}.",
                        f"{auth} guidance po: {body}."],
        }
        return rng.choice(intros[lang])

    if style == "urgent":
        first = pool[0]
        rest = ". ".join(pool[1:])
        intros = {
            "en":      [f"Right now: {first}. Then: {rest}. ({auth})",
                        f"First — {first}. After that: {rest}. Source: {auth}.",
                        f"Immediate action: {first}. Follow-up: {rest}. Per {auth}."],
            "tl":      [f"Ngayon mismo: {first}. Tapos: {rest}. (Pinagmulan: {auth})",
                        f"Una — {first}. Susunod: {rest}. Ayon sa {auth}.",
                        f"Agarang aksyon: {first}. Pagkatapos: {rest}. ({auth})"],
            "taglish": [f"Ngayon po: {first}. After that: {rest}. Source: {auth}.",
                        f"Una: {first}. Tapos: {rest}. Per {auth}."],
        }
        return rng.choice(intros[lang])

    # reassuring
    joined = " ".join(p + "." for p in pool)
    intros = {
        "en":      [f"Stay calm — {auth} says: {joined} You can do this.",
                    f"Take a breath. {auth} recommends: {joined} You're going to be okay.",
                    f"Don't panic. Per {auth}: {joined}"],
        "tl":      [f"Huwag mag-panic — sabi ng {auth}: {joined} Kaya mo 'to.",
                    f"Kalmado lang. Ayon sa {auth}: {joined}",
                    f"Magdasal at sundin: {joined} ({auth})"],
        "taglish": [f"Stay calm po — per {auth}: {joined}",
                    f"Wag mag-panic, kaya mo 'to. {auth} says: {joined}"],
    }
    return rng.choice(intros[lang])


# ---------------------------------------------------------------------------
# Diverse user-question pools (kept compact; variance comes from combining
# paraphrase × profile × style downstream).
# ---------------------------------------------------------------------------

PROTOCOL_QUERIES: dict[tuple[str, str], dict[str, list[str]]] = {
    ("earthquake", "before"): {
        "en": [
            "How do I prepare for an earthquake?",
            "Earthquake prep checklist please.",
            "What does PHIVOLCS recommend before a quake?",
            "Help my family get ready for an earthquake.",
            "Pre-earthquake actions?",
            "How can I make my home earthquake-ready?",
        ],
        "tl": [
            "Paano maghanda sa lindol?",
            "Ano ang dapat gawin bago mag-lindol?",
            "Earthquake prep tips po.",
            "Paano gawing safe ang bahay bago lumindol?",
            "Mga PHIVOLCS earthquake prep?",
        ],
        "taglish": [
            "Paano mag-prep for earthquake?",
            "What to do before lumindol?",
            "Earthquake-ready ba yung bahay namin?",
            "Mga PHIVOLCS tips bago lumindol?",
        ],
    },
    ("earthquake", "during"): {
        "en": [
            "What do I do during an earthquake?",
            "The ground is shaking right now!",
            "Building shaking — instructions please.",
            "Quake started, what now?",
            "How do I survive a strong earthquake?",
        ],
        "tl": [
            "Ano gagawin kapag lumilindol?",
            "Lumilindol, tulong!",
            "Yumayanig ang bahay, ano gagawin?",
            "May lindol ngayon, ano ngayon?",
        ],
        "taglish": [
            "Lumilindol, what to do?",
            "Yumayanig yung building, help!",
            "Quake happening — instructions?",
        ],
    },
    ("earthquake", "after"): {
        "en": [
            "Earthquake stopped, what now?",
            "Post-earthquake checklist?",
            "What do I check after a quake?",
            "After-shock prep?",
            "What's safe to do after the shaking?",
        ],
        "tl": [
            "Tapos na ang lindol, ano gagawin?",
            "Ano i-check matapos lumindol?",
            "Aftershock prep?",
            "Post-earthquake actions sa Tagalog?",
        ],
        "taglish": [
            "After the quake, what to do?",
            "Tapos na yung shaking, what to check?",
            "Mga aftershock prep?",
        ],
    },
    ("typhoon", "before"): {
        "en": [
            "How do I prepare for a typhoon?",
            "Typhoon coming, what should I do?",
            "Pre-typhoon checklist?",
            "How to typhoon-proof my home?",
            "PAGASA prep tips for a typhoon?",
        ],
        "tl": [
            "Paano maghanda sa bagyo?",
            "Paparating na bagyo, ano gagawin?",
            "Typhoon prep checklist po.",
            "Paano i-secure ang bahay bago bumagyo?",
        ],
        "taglish": [
            "Paano mag-prep for typhoon?",
            "Bagyo na, what to do bago dumating?",
            "Typhoon-proofing tips po.",
        ],
    },
    ("typhoon", "during"): {
        "en": [
            "Typhoon is hitting now, what do I do?",
            "Heavy rain and wind, instructions?",
            "It's flooding, what now?",
            "Storm hitting, what's safe to do?",
        ],
        "tl": [
            "Nandito na ang bagyo, ano ngayon?",
            "Malakas na ulan, ano dapat?",
            "Bumabaha na, ano gagawin?",
        ],
        "taglish": [
            "Bagyo na ngayon, what to do?",
            "Bumabaha, instructions po?",
            "Storm hit, what's next?",
        ],
    },
    ("typhoon", "after"): {
        "en": [
            "When can I return home post-typhoon?",
            "Typhoon over, what now?",
            "Post-typhoon checklist?",
            "Safe to go outside after storm?",
        ],
        "tl": [
            "Pwede na ba umuwi after ng bagyo?",
            "Tapos na ang bagyo, ano i-check?",
            "Post-typhoon actions po.",
        ],
        "taglish": [
            "Tapos na yung bagyo, what to check?",
            "Safe na ba lumabas after the storm?",
        ],
    },
    ("volcano", "before"): {
        "en": [
            "How do I prepare for a volcanic eruption?",
            "Volcano alert raised, what now?",
            "Pre-eruption checklist?",
            "Living near Taal, what should I prep?",
        ],
        "tl": [
            "Paano maghanda sa pagsabog ng bulkan?",
            "Alert level umakyat, ano gagawin?",
            "Volcano prep checklist po.",
        ],
        "taglish": [
            "Paano mag-prep for volcanic eruption?",
            "Alert raised, what to do agad?",
        ],
    },
    ("volcano", "during"): {
        "en": [
            "Ash falling, what do I do?",
            "Volcano erupting, what's the protocol?",
            "Eruption happening near us, instructions?",
        ],
        "tl": [
            "Bumagsak na abo, ano gagawin?",
            "Sumasabog ang bulkan, ano dapat?",
        ],
        "taglish": [
            "Ash fall, what to do?",
            "Volcano erupting na, instructions po?",
        ],
    },
    ("volcano", "after"): {
        "en": [
            "Eruption stopped, when can I clean up?",
            "Post-eruption ash cleanup?",
            "Safe to return after eruption?",
        ],
        "tl": [
            "Tapos na ang pagsabog, kelan pwede linis?",
            "Pwede na ba umuwi after eruption?",
        ],
        "taglish": [
            "Tapos na yung eruption, when to clean up?",
            "Pwede na ba umuwi po?",
        ],
    },
}


# ---------------------------------------------------------------------------
# Generator 1 — protocol Q&A
# ---------------------------------------------------------------------------

def build_protocol_rows(
    rng: random.Random,
    protocols: dict[str, dict],
    target_per_combo: int = 6,
) -> list[dict]:
    """Emit ~9 (disaster x phase) * 3 languages * 4 styles * target_per_combo
    rows ≈ 648 rows, but bounded by paraphrase availability."""
    rows: list[dict] = []
    styles = ["terse", "numbered", "urgent", "reassuring"]

    for (disaster, phase), lang_qs in PROTOCOL_QUERIES.items():
        protocol_doc = protocols.get(disaster, {})
        protocol_text = (protocol_doc.get("phases", {}) or {}).get(phase)
        if not protocol_text:
            continue
        rules = extract_rules(protocol_text)
        if not rules:
            continue

        for lang, qs in lang_qs.items():
            usage = defaultdict(int)
            for _ in range(target_per_combo):
                style = rng.choice(styles)
                # pick a question, avoid reusing the same one more than 2x in same combo
                tries = 0
                while tries < 10:
                    q = rng.choice(qs)
                    if usage[q] < 2:
                        usage[q] += 1
                        break
                    tries += 1
                else:
                    q = rng.choice(qs)

                speak_text = render_protocol_speak(rng, lang, disaster, phase, rules, style)
                conv = [
                    turn("system", SYSTEM_PROMPT),
                    turn("user", q),
                    turn("assistant", tool_call("get_protocol", {"disaster": disaster, "phase": phase})),
                    turn("tool", tool_result("get_protocol", protocol_text)),
                    turn("assistant", speak(speak_text)),
                ]
                rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 2 — route_to_nearest_evacuation, with realistic geometry
# ---------------------------------------------------------------------------

EVAC_QUERIES = [
    ("en", "Where's the nearest evacuation center?"),
    ("en", "I need to evacuate, where do I go?"),
    ("en", "Closest evac center please."),
    ("en", "Which evacuation centers are nearby?"),
    ("en", "Where can I take my family right now?"),
    ("en", "URGENT — I need an evacuation center NOW"),
    ("en", "My house is flooding, where should I go?"),
    ("en", "We can't stay here, what's our option?"),
    ("en", "Closest evac that allows pets"),
    ("en", "Nearest shelter that has PWD ramps"),
    ("en", "We were told to evacuate, where's the site?"),
    ("tl", "Saan ang pinakamalapit na evacuation center?"),
    ("tl", "Kailangan kong lumikas, saan ako pupunta?"),
    ("tl", "Saang lugar pwede lumikas ang pamilya namin?"),
    ("tl", "Saklolo, kailangan kong lumikas agad"),
    ("tl", "Bumabaha na sa amin, saan kami pupunta?"),
    ("tl", "Hindi na safe dito, saan kami pwede pumunta?"),
    ("tl", "May evac ba na pwede sa alaga?"),
    ("tl", "Evac center na may ramp para sa wheelchair"),
    ("taglish", "Where's the nearest evac center po?"),
    ("taglish", "I need to evacuate, saan ako pupunta?"),
    ("taglish", "Emergency — saan ang nearest evac?"),
    ("taglish", "May pet-friendly evac ba near me?"),
    ("taglish", "Bumabaha na, where do we go?"),
]

# Three realistic outcome variants matching aiTools.ts route_to_nearest_evacuation:
# - route_ok: pedestrian graph installed AND route snapped successfully
# - graph_missing: graph not yet installed (current production state)
# - snap_failed: graph installed but user point is too far from any walkable road
def render_evac_summary(picks: list[dict], route_state: str, best: dict) -> str:
    lines = []
    for i, c in enumerate(picks):
        best_tag = " [best match]" if i == 0 else ""
        lines.append(
            f"{i + 1}. {c['name']} — {c['km']:.1f} km (~{c['walk']} min walking){best_tag}"
        )
    body = "Top evacuation options:\n" + "\n".join(lines)
    if route_state == "route_ok":
        # Slight noise on the walkable distance vs the straight-line distance.
        walkable_km = best["km"] * (1.10 + 0.15 * (hash(best["name"]) % 100) / 100)
        return (body + f"\n\nRoute to {best['name']}: {walkable_km:.2f} km along "
                f"walkable roads, ~{walk_minutes(walkable_km)} min walking.")
    if route_state == "snap_failed":
        return body + "\n\n(Could not snap your location to a walkable road. Use the straight-line direction shown on the map.)"
    # graph_missing
    return body + "\n\n(Road-following route unavailable — pedestrian map data not installed.)"


def render_evac_speak(rng: random.Random, lang: str, picks: list[dict], route_state: str) -> str:
    best = picks[0]
    others = [p['name'] for p in picks[1:]]
    if route_state == "route_ok":
        # Mention the map polyline so the model learns the UI affordance.
        if lang == "en":
            choices = [
                f"Closest evacuation: {best['name']} ({best['km']:.1f} km, ~{best['walk']} min walk). I've drawn the walking route on the map. Backup options: {', '.join(others)}.",
                f"Go to {best['name']} — {best['km']:.1f} km away, about {best['walk']} minutes on foot. The route is plotted on your map. If unreachable, try {others[0]} or {others[1]}.",
                f"Best match: {best['name']} ({best['walk']} min walk). Route shown on the map. Alternatives: {', '.join(others)}.",
            ]
        elif lang == "tl":
            choices = [
                f"Pinakamalapit: {best['name']} ({best['km']:.1f} km, ~{best['walk']} min lakad). Naka-plot na sa mapa ang ruta. Alternatibo: {', '.join(others)}.",
                f"Pumunta sa {best['name']} — {best['km']:.1f} km, mga {best['walk']} minuto. Nasa mapa na ang ruta. Kung hindi maabot, subukan ang {others[0]}.",
            ]
        else:
            choices = [
                f"Closest po: {best['name']} ({best['km']:.1f} km, ~{best['walk']} min walk). Naka-display na sa map yung route. Backup: {', '.join(others)}.",
                f"Best match: {best['name']} — {best['walk']} min walking. Plotted na sa mapa. Alternatives: {', '.join(others)}.",
            ]
    elif route_state == "snap_failed":
        if lang == "en":
            choices = [
                f"Nearest is {best['name']} ({best['km']:.1f} km away). Your location couldn't be snapped to a walkable road — use the straight-line direction shown on the map. Alternatives: {', '.join(others)}.",
                f"Closest: {best['name']} ({best['walk']} min straight-line walk). Walkable route unavailable for your spot; follow the map heading. Backups: {', '.join(others)}.",
            ]
        elif lang == "tl":
            choices = [
                f"Pinakamalapit: {best['name']} ({best['km']:.1f} km). Hindi ma-snap sa walkable na daan ang location mo — sundan ang direksiyon sa mapa. Alternatibo: {', '.join(others)}.",
            ]
        else:
            choices = [
                f"Nearest po: {best['name']} ({best['km']:.1f} km). Couldn't snap to walkable road, follow ang direction sa map. Backup: {', '.join(others)}.",
            ]
    else:  # graph_missing
        if lang == "en":
            choices = [
                f"Top 3 evacuation options: {best['name']} ({best['km']:.1f} km), {others[0]}, {others[1]}. Walkable routes aren't available offline yet — head toward {best['name']} using the map.",
                f"Closest: {best['name']} ({best['km']:.1f} km, ~{best['walk']} min). Pedestrian map data isn't installed, so the route shown is straight-line. Backups: {', '.join(others)}.",
            ]
        elif lang == "tl":
            choices = [
                f"Tatlong pinakamalapit: {best['name']} ({best['km']:.1f} km), {others[0]}, {others[1]}. Walang offline na walking route pa — sundan ang mapa papuntang {best['name']}.",
            ]
        else:
            choices = [
                f"Top 3 evac: {best['name']} ({best['km']:.1f} km), {others[0]}, {others[1]}. Walkable map data hindi pa installed; follow straight-line route sa map.",
            ]
    return rng.choice(choices)


def build_evac_rows(rng: random.Random, pois: dict[str, list[dict]], count: int) -> list[dict]:
    rows = []
    centers = pois.get("evacuation_center", [])
    if len(centers) < 3:
        return rows

    attempts = 0
    while len(rows) < count and attempts < count * 5:
        attempts += 1
        lang, q = rng.choice(EVAC_QUERIES)
        origin = rng.choice(ORIGINS)
        # Rank evac centers by haversine from origin; take top 3.
        scored = [
            {**c, "km": haversine_km((origin[0], origin[1]), (c["lon"], c["lat"]))}
            for c in centers
        ]
        scored.sort(key=lambda c: c["km"])
        picks = scored[:3]
        for p in picks:
            p["walk"] = walk_minutes(p["km"])
        # Drop conversations where best is unreasonably far (>10km) — unrealistic
        if picks[0]["km"] > 10:
            continue

        # 3 outcomes weighted by realism: 30% route_ok (future), 60% graph_missing
        # (current production), 10% snap_failed (edge case).
        route_state = rng.choices(
            ["route_ok", "graph_missing", "snap_failed"], weights=[0.30, 0.60, 0.10]
        )[0]

        summary = render_evac_summary(picks, route_state, picks[0])
        speak_text = render_evac_speak(rng, lang, picks, route_state)

        # 60% no args, 30% profile_aware=true, 10% profile_aware=false
        roll = rng.random()
        if roll < 0.6:
            args = {}
        elif roll < 0.9:
            args = {"profile_aware": True}
        else:
            args = {"profile_aware": False}

        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", q),
            turn("assistant", tool_call("route_to_nearest_evacuation", args)),
            turn("tool", tool_result("route_to_nearest_evacuation", summary)),
            turn("assistant", speak(speak_text)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 3 — find_nearby with real POI data
# ---------------------------------------------------------------------------

CATEGORIES = [
    "hospital", "evacuation_center", "school",
    "gymnasium", "multi_purpose_hall", "covered_court",
]

CATEGORY_USER_QUERIES: dict[str, list[tuple[str, str]]] = {
    "hospital": [
        ("en", "Where's the nearest hospital?"),
        ("en", "Someone's hurt — closest hospital?"),
        ("en", "Need urgent medical care, where?"),
        ("tl", "Saan ang pinakamalapit na ospital?"),
        ("tl", "May nasaktan, saan ang ospital?"),
        ("taglish", "Where's the closest hospital po?"),
        ("taglish", "May injured, saan ang nearest hospital?"),
    ],
    "evacuation_center": [
        ("en", "Find me evacuation centers near here."),
        ("en", "List nearby shelters."),
        ("tl", "Mga evacuation center sa malapit?"),
        ("taglish", "List evac centers sa area ko po."),
    ],
    "school": [
        ("en", "Where's the nearest school?"),
        ("en", "Closest school I can shelter in?"),
        ("tl", "Saan ang pinakamalapit na paaralan?"),
        ("taglish", "Where's the closest school po?"),
    ],
    "gymnasium": [
        ("en", "Find me a gymnasium nearby."),
        ("en", "Sports complex near me?"),
        ("tl", "Saan ang malapit na gymnasium?"),
        ("taglish", "Saan yung nearest gymnasium?"),
    ],
    "multi_purpose_hall": [
        ("en", "Where's the nearest multi-purpose hall?"),
        ("en", "Closest barangay hall?"),
        ("tl", "Saan ang pinakamalapit na multi-purpose hall?"),
        ("taglish", "Where's the nearest multi-purpose hall po?"),
    ],
    "covered_court": [
        ("en", "Where's the nearest covered court?"),
        ("en", "Closest covered basketball court?"),
        ("tl", "Saan ang malapit na covered court?"),
        ("taglish", "Where's the closest covered court?"),
    ],
}

CAT_LABEL = {
    "hospital": ("hospital", "ospital"),
    "evacuation_center": ("evacuation center", "evacuation center"),
    "school": ("school", "paaralan"),
    "gymnasium": ("gymnasium", "gymnasium"),
    "multi_purpose_hall": ("multi-purpose hall", "multi-purpose hall"),
    "covered_court": ("covered court", "covered court"),
}

def render_nearby_summary(category: str, picks: list[dict]) -> str:
    label_en = category.replace("_", " ")
    lines = []
    for i, p in enumerate(picks):
        addr = f" · {p['address']}" if p.get("address") else ""
        lines.append(f"{i + 1}. {p['name']} — {p['km']:.1f} km{addr}")
    return f"Nearest {label_en}s:\n" + "\n".join(lines)

def render_nearby_speak(rng: random.Random, lang: str, category: str, picks: list[dict]) -> str:
    en, tl = CAT_LABEL[category]
    best = picks[0]
    others_names = ", ".join(p["name"] for p in picks[1:])
    if lang == "en":
        choices = [
            f"Closest {en}: {best['name']} ({best['km']:.1f} km). Others nearby: {others_names}.",
            f"Top 3 nearest {en}s: {best['name']} ({best['km']:.1f} km), {picks[1]['name']} ({picks[1]['km']:.1f} km), {picks[2]['name']} ({picks[2]['km']:.1f} km).",
            f"Nearest is {best['name']}, ~{best['km']:.1f} km away. Backup: {others_names}.",
        ]
    elif lang == "tl":
        choices = [
            f"Pinakamalapit na {tl}: {best['name']} ({best['km']:.1f} km). Iba pa: {others_names}.",
            f"Tatlong pinakamalapit na {tl}: {best['name']}, {picks[1]['name']}, {picks[2]['name']}.",
        ]
    else:
        choices = [
            f"Closest {en} po: {best['name']} ({best['km']:.1f} km). Iba: {others_names}.",
            f"Top 3 {en}s na malapit: {best['name']} ({best['km']:.1f} km), {picks[1]['name']}, {picks[2]['name']}.",
        ]
    return rng.choice(choices)

def build_nearby_rows(rng: random.Random, pois: dict[str, list[dict]], per_category: int) -> list[dict]:
    rows = []
    for cat in CATEGORIES:
        if cat not in pois or len(pois[cat]) < 3 or cat not in CATEGORY_USER_QUERIES:
            continue
        attempts = 0
        produced = 0
        while produced < per_category and attempts < per_category * 5:
            attempts += 1
            lang, q = rng.choice(CATEGORY_USER_QUERIES[cat])
            origin = rng.choice(ORIGINS)
            scored = [
                {**p, "km": haversine_km((origin[0], origin[1]), (p["lon"], p["lat"]))}
                for p in pois[cat]
            ]
            scored.sort(key=lambda p: p["km"])
            picks = scored[:3]
            if picks[0]["km"] > 8:  # filter out unrealistic origins for the category
                continue
            summary = render_nearby_summary(cat, picks)
            speak_text = render_nearby_speak(rng, lang, cat, picks)
            conv = [
                turn("system", SYSTEM_PROMPT),
                turn("user", q),
                turn("assistant", tool_call("find_nearby", {"category": cat})),
                turn("tool", tool_result("find_nearby", summary)),
                turn("assistant", speak(speak_text)),
            ]
            rows.append(row(conv))
            produced += 1
    return rows


# ---------------------------------------------------------------------------
# Generator 4 — profile-aware Q&A with diverse fixtures + speak variance
# ---------------------------------------------------------------------------

PROFILE_FIXTURES = [
    {"name": "Maria Santos", "age": "adult", "companions": {"infants": 1, "children": 0, "elderly": 0, "pwd": 0},
     "pets": "none", "conditions": "asthma", "address": "Sampaloc, Manila",
     "primary": "Brgy. Hall", "secondary": "Lola's house", "contacts": "Juan +63917..."},
    {"name": "Carlos Reyes", "age": "elderly", "companions": {"infants": 0, "children": 0, "elderly": 1, "pwd": 1},
     "pets": "1 dog", "conditions": "hypertension", "address": "Tondo, Manila",
     "primary": "Tondo Sports Complex", "secondary": "Cousin's apartment", "contacts": "Ana +63918..."},
    {"name": "Jenny Cruz", "age": "adult", "companions": {"infants": 0, "children": 2, "elderly": 1, "pwd": 0},
     "pets": "2 cats", "conditions": "diabetes", "address": "Quiapo, Manila",
     "primary": "Quiapo MPH", "secondary": "Sister's place", "contacts": "Pedro +63919..."},
    {"name": "Mike Tan", "age": "adult", "companions": {"infants": 0, "children": 0, "elderly": 0, "pwd": 0},
     "pets": "none", "conditions": "none", "address": "Makati CBD",
     "primary": "Office", "secondary": "Parents' house", "contacts": "Liza +63920..."},
    {"name": "Rosa Lim", "age": "adult", "companions": {"infants": 0, "children": 1, "elderly": 0, "pwd": 0},
     "pets": "1 dog", "conditions": "asthma", "address": "Pasay, Metro Manila",
     "primary": "Pasay City Hall", "secondary": "Aunt's house", "contacts": "Ben +63921..."},
    {"name": "Ramon Dela Cruz", "age": "elderly", "companions": {"infants": 0, "children": 0, "elderly": 1, "pwd": 0},
     "pets": "none", "conditions": "hypertension", "address": "Mandaluyong",
     "primary": "Brgy. Hall Mandaluyong", "secondary": "Daughter's condo", "contacts": "Mae +63922..."},
]

PROFILE_QUERIES = [
    ("en", "What's in my go-bag based on my profile?"),
    ("en", "Remind me of my saved medical info."),
    ("en", "What meds do I have on file?"),
    ("en", "Who are my emergency contacts?"),
    ("en", "Where's my primary meeting point?"),
    ("en", "What's my address on file?"),
    ("en", "My companions — who's in my profile?"),
    ("tl", "Ano ang nasa go-bag ko base sa profile ko?"),
    ("tl", "Ano ang medical info na naka-save sa akin?"),
    ("tl", "Saan ang primary meeting point ko?"),
    ("tl", "Sino ang mga emergency contacts ko?"),
    ("taglish", "Anong meds ko on file?"),
    ("taglish", "Saan yung primary meeting point ko po?"),
    ("taglish", "Who are my emergency contacts saved?"),
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

def render_profile_speak(rng: random.Random, lang: str, p: dict, query_kind: str) -> str:
    """query_kind: 'go_bag' | 'meds' | 'contacts' | 'meeting' | 'address' | 'companions'"""
    c = p["companions"]
    if query_kind == "go_bag":
        extras = []
        if c["infants"] > 0: extras.append("formula, diapers" if lang != "tl" else "formula, diaper")
        if c["elderly"] > 0: extras.append("maintenance meds")
        if c["pwd"] > 0: extras.append("mobility aids")
        if p["pets"] != "none": extras.append("pet food, leash, carrier")
        if p["conditions"] == "asthma": extras.append("inhaler, N95")
        elif p["conditions"] == "hypertension": extras.append("BP meds")
        elif p["conditions"] == "diabetes": extras.append("insulin/oral meds, glucose monitor")
        extras_str = ", ".join(extras) if extras else "no profile-specific extras"
        base = {"en": "Standard go-bag (NDRRMC): water 3L/person, food 3 days, flashlight, radio, first-aid, IDs, cash, whistle.",
                "tl": "Standard go-bag (NDRRMC): tubig 3L/tao, pagkain 3 araw, flashlight, radyo, first-aid, ID, pera, whistle.",
                "taglish": "Standard go-bag po (NDRRMC): water, food, flashlight, radio, first-aid, IDs, cash, whistle."}[lang]
        tail = {"en": f"For your household, also: {extras_str}. Meeting point: {p['primary']}.",
                "tl": f"Para sa inyo, isama rin: {extras_str}. Meeting point: {p['primary']}.",
                "taglish": f"Sa household mo, isama rin: {extras_str}. Meeting point: {p['primary']}."}[lang]
        return f"{base} {tail}"

    if query_kind == "meds":
        cond = p["conditions"]
        if cond == "none":
            return {"en": "Your profile shows no medical conditions on file.",
                    "tl": "Walang nakalistang medical condition sa profile mo.",
                    "taglish": "Wala kang medical conditions on file po."}[lang]
        return {"en": f"Your profile lists {cond}. Make sure your meds for {cond} are in the go-bag.",
                "tl": f"Naka-list sa profile mo: {cond}. Siguraduhing nasa go-bag ang gamot para sa {cond}.",
                "taglish": f"Profile mo: {cond}. Make sure nasa go-bag yung meds for {cond}."}[lang]

    if query_kind == "contacts":
        return {"en": f"Emergency contacts on file: {p['contacts']}.",
                "tl": f"Mga emergency contacts mo: {p['contacts']}.",
                "taglish": f"Emergency contacts po: {p['contacts']}."}[lang]

    if query_kind == "meeting":
        return {"en": f"Primary: {p['primary']}. Secondary: {p['secondary']}.",
                "tl": f"Primary: {p['primary']}. Secondary: {p['secondary']}.",
                "taglish": f"Primary po: {p['primary']}. Secondary: {p['secondary']}."}[lang]

    if query_kind == "address":
        return {"en": f"Address on file: {p['address']}.",
                "tl": f"Address mo: {p['address']}.",
                "taglish": f"Address po: {p['address']}."}[lang]

    # companions
    parts = []
    if c["infants"]: parts.append(f"{c['infants']} infant(s)")
    if c["children"]: parts.append(f"{c['children']} child(ren)")
    if c["elderly"]: parts.append(f"{c['elderly']} elderly")
    if c["pwd"]: parts.append(f"{c['pwd']} PWD")
    if p["pets"] != "none": parts.append(f"pets: {p['pets']}")
    if not parts:
        return {"en": "Your profile shows no companions or pets.",
                "tl": "Walang companions o alaga sa profile mo.",
                "taglish": "Wala kang companions o pets po."}[lang]
    return {"en": f"Your household: {', '.join(parts)}.",
            "tl": f"Inyong household: {', '.join(parts)}.",
            "taglish": f"Household mo po: {', '.join(parts)}."}[lang]

def classify_profile_query(q: str) -> str:
    ql = q.lower()
    if "go-bag" in ql or "go bag" in ql: return "go_bag"
    if "med" in ql or "gamot" in ql: return "meds"
    if "contact" in ql: return "contacts"
    if "meeting" in ql: return "meeting"
    if "address" in ql: return "address"
    return "companions"

def build_profile_rows(rng: random.Random, count: int) -> list[dict]:
    rows = []
    attempts = 0
    while len(rows) < count and attempts < count * 5:
        attempts += 1
        lang, q = rng.choice(PROFILE_QUERIES)
        profile = rng.choice(PROFILE_FIXTURES)
        kind = classify_profile_query(q)
        summary = render_profile_summary(profile)
        speak_text = render_profile_speak(rng, lang, profile, kind)
        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", q),
            turn("assistant", tool_call("get_user_profile", {})),
            turn("tool", tool_result("get_user_profile", summary)),
            turn("assistant", speak(speak_text)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 5 — direct-speak (greetings & disaster meta-questions, no tool)
# ---------------------------------------------------------------------------

DIRECT_SPEAK = [
    ("en", "Hello", "Hi! I'm LIKAS, your offline disaster companion. Ask me about preparedness, evacuation, or what to do during typhoons, earthquakes, or eruptions."),
    ("en", "Hi there", "Hello! I can help with disaster prep, evacuation routing, and finding nearby hospitals or shelters. What's the situation?"),
    ("en", "What can you do?", "I'm LIKAS — an offline disaster assistant for the Philippines. I can quote PHIVOLCS/PAGASA/NDRRMC protocols, route you to evacuation centers, find nearby hospitals or shelters, and personalize advice based on your profile."),
    ("en", "Who are you?", "I'm LIKAS, your offline disaster companion. I work without internet and follow official Philippine disaster protocols."),
    ("en", "What languages do you speak?", "English, Filipino, and Taglish. I'll respond in whichever language you use."),
    ("tl", "Kamusta", "Kamusta! Ako si LIKAS, ang offline na disaster companion mo. Magtanong ka tungkol sa lindol, bagyo, o bulkan."),
    ("tl", "Sino ka?", "Ako si LIKAS — offline na disaster assistant para sa Pilipinas. Sumusunod ako sa opisyal na protocols ng NDRRMC, PAGASA, at PHIVOLCS."),
    ("tl", "Ano kayang magagawa mo?", "Pwede akong magbigay ng safety guidance, mag-route sa evacuation center, at maghanap ng ospital o shelter sa malapit."),
    ("taglish", "Hi po", "Hello po! Ako si LIKAS, your offline disaster companion. Anong maitutulong ko?"),
    ("taglish", "What can you do po?", "I can help with disaster prep, evacuation routing, at finding nearby places like hospitals or shelters."),
]

def build_direct_speak_rows() -> list[dict]:
    return [
        row([turn("system", SYSTEM_PROMPT), turn("user", q), turn("assistant", speak(a))])
        for _, q, a in DIRECT_SPEAK
    ]


# ---------------------------------------------------------------------------
# Generator 6 — REFUSAL (rule 7): off-topic queries get redirected.
# ---------------------------------------------------------------------------

REFUSAL_CASES = [
    ("en", "Who won the basketball game last night?",
     "I can't help with sports or entertainment — I'm built for disaster preparedness and safety. Ask me about evacuation, weather protocols, or nearby shelters."),
    ("en", "Tell me a joke",
     "I'm focused on safety topics — earthquakes, typhoons, volcanic eruptions, and evacuation. What can I help you prepare for?"),
    ("en", "What's the capital of France?",
     "I only cover disaster-related questions for the Philippines. Ask me about preparedness or where to evacuate."),
    ("en", "Write me a poem",
     "I can't help with creative writing — I'm a disaster companion. Ask me about safety protocols or nearby evacuation centers instead."),
    ("en", "Can you order me food?",
     "I can't place orders or take real-world actions. I can help you find safe places or quote disaster protocols."),
    ("en", "What's the best movie this year?",
     "Movies aren't in my scope — I help with disaster preparedness. Want to know what to do for the next typhoon?"),
    ("en", "Recommend a restaurant",
     "I don't recommend restaurants — only safety-relevant places like hospitals, shelters, or evacuation centers. What do you need?"),
    ("tl", "Sino nanalo sa basketball kahapon?",
     "Hindi ko pwedeng sagutin ang sports — para ako sa disaster preparedness at kaligtasan. Magtanong ka tungkol sa evacuation o protocols."),
    ("tl", "Magkwento ka ng joke",
     "Hindi ako para sa entertainment — focused ako sa disaster topics. Anong kailangan mong i-prepare?"),
    ("tl", "Ano ang kabisera ng France?",
     "Disaster-related lang ang kayang sagutin ko para sa Pilipinas. Tanungin mo ako tungkol sa lindol o bagyo."),
    ("tl", "Mag-order ka ng pagkain",
     "Hindi ako pwede mag-order o gumawa ng aksyon sa labas ng app. Pwede kitang tulungan sa safety information."),
    ("taglish", "Sino MVP this season?",
     "I can't help with sports po — disaster preparedness lang. Ano pwede kong i-help?"),
    ("taglish", "Joke time?",
     "Sorry po, hindi ako para sa jokes — disaster companion lang ako. Ask me about safety protocols."),
    ("taglish", "Recommend a movie",
     "Hindi po movies ang scope ko — disaster-related lang. Want to check evacuation centers near you?"),
    # Edge cases: questions that LOOK off-topic but are legitimate "is this disaster-related"
    ("en", "Is climate change real?",
     "Yes — and it intensifies typhoons and flooding in the Philippines, which is why preparedness matters. Want PAGASA's typhoon protocols?"),
]

def build_refusal_rows() -> list[dict]:
    return [
        row([turn("system", SYSTEM_PROMPT), turn("user", q), turn("assistant", speak(a))])
        for _, q, a in REFUSAL_CASES
    ]


# ---------------------------------------------------------------------------
# Generator 7 — CLARIFICATION: ambiguous user query needs follow-up.
# ---------------------------------------------------------------------------

CLARIFICATION_CASES = [
    ("en", "It's bad",
     "I want to help — can you tell me what's happening? Is there shaking, flooding, ash fall, or something else? Or are you preparing for a possible event?"),
    ("en", "What should I do?",
     "Happy to help — what's the situation? Earthquake, typhoon, volcanic activity, or general preparedness? And are you preparing, mid-event, or after?"),
    ("en", "I'm scared",
     "I'm here. What's making you feel unsafe right now — shaking, flooding, ash, or something else? Once I know, I can pull up the right protocol."),
    ("en", "Help",
     "I'm listening — what kind of help do you need? Disaster protocols, evacuation routing, or finding the nearest hospital or shelter?"),
    ("tl", "May problema",
     "Pwede mo bang sabihin kung ano ang nangyayari? Lindol, baha, abo, o naghahanda lang? Saka tutulungan kita."),
    ("tl", "Saklolo",
     "Anong klaseng tulong ang kailangan mo — safety protocol, evacuation center, o ospital na malapit?"),
    ("taglish", "Hindi ko alam gagawin",
     "Sabihin mo lang kung ano nangyayari — lindol, bagyo, eruption, o prep lang. Tutulungan kita sa tamang protocol."),
    ("taglish", "Need help po",
     "Anong kailangan po — disaster prep, evacuation route, o nearest hospital/shelter?"),
]

def build_clarification_rows() -> list[dict]:
    return [
        row([turn("system", SYSTEM_PROMPT), turn("user", q), turn("assistant", speak(a))])
        for _, q, a in CLARIFICATION_CASES
    ]


# ---------------------------------------------------------------------------
# Generator 8 — MULTI-TOOL: protocol + evacuation in one conversation.
# ---------------------------------------------------------------------------

MULTI_TOOL_TEMPLATES = [
    ("en", "Typhoon is here and I need to evacuate", "typhoon", "during"),
    ("en", "Earthquake just happened and we need a safer place", "earthquake", "after"),
    ("en", "Ash is falling, where should I go?", "volcano", "during"),
    ("tl", "Bagyo na, kailangan kong lumikas", "typhoon", "during"),
    ("tl", "Lumindol na, saan kami ligtas?", "earthquake", "after"),
    ("tl", "Bumagsak ang abo, saan kami pupunta?", "volcano", "during"),
    ("taglish", "Bagyo na, saan ako pwede lumikas?", "typhoon", "during"),
    ("taglish", "Lumindol, where to evacuate?", "earthquake", "after"),
]

def build_multi_tool_rows(rng: random.Random, pois: dict[str, list[dict]],
                          protocols: dict[str, dict], count: int) -> list[dict]:
    rows = []
    centers = pois.get("evacuation_center", [])
    if len(centers) < 3:
        return rows
    attempts = 0
    while len(rows) < count and attempts < count * 5:
        attempts += 1
        lang, q, disaster, phase = rng.choice(MULTI_TOOL_TEMPLATES)
        ptext = (protocols.get(disaster, {}).get("phases", {}) or {}).get(phase)
        if not ptext:
            continue
        rules = extract_rules(ptext)
        origin = rng.choice(ORIGINS)
        scored = [
            {**c, "km": haversine_km((origin[0], origin[1]), (c["lon"], c["lat"]))}
            for c in centers
        ]
        scored.sort(key=lambda c: c["km"])
        picks = scored[:3]
        for p in picks: p["walk"] = walk_minutes(p["km"])
        if picks[0]["km"] > 10:
            continue
        route_state = rng.choices(
            ["route_ok", "graph_missing"], weights=[0.4, 0.6]
        )[0]
        evac_summary = render_evac_summary(picks, route_state, picks[0])

        # First speak: short acknowledgement + protocol summary
        protocol_speak = render_protocol_speak(rng, lang, disaster, phase, rules, "urgent")
        # Second speak: route info
        route_speak = render_evac_speak(rng, lang, picks, route_state)

        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", q),
            turn("assistant", tool_call("get_protocol", {"disaster": disaster, "phase": phase})),
            turn("tool", tool_result("get_protocol", ptext)),
            turn("assistant", speak(protocol_speak)),
            turn("user", "Where do I evacuate?" if lang == "en" else (
                "Saan ako lilikas?" if lang == "tl" else "Saan ako pwede lumikas po?")),
            turn("assistant", tool_call("route_to_nearest_evacuation", {"profile_aware": True})),
            turn("tool", tool_result("route_to_nearest_evacuation", evac_summary)),
            turn("assistant", speak(route_speak)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Generator 9 — MULTI-TURN follow-ups (correction, refinement)
# ---------------------------------------------------------------------------

FOLLOWUP_TEMPLATES = [
    # (lang, q1, tool, args, q2_followup, kind)
    ("en", "Where's the nearest hospital?", "find_nearby", {"category": "hospital"},
     "Actually I need an evacuation center, not a hospital", "switch_evac"),
    ("en", "What do I do during an earthquake?", "get_protocol", {"disaster": "earthquake", "phase": "during"},
     "What about after?", "switch_phase_after"),
    ("en", "Find me a school", "find_nearby", {"category": "school"},
     "Is there one with PWD access?", "constraint"),
    ("tl", "Saan ang pinakamalapit na ospital?", "find_nearby", {"category": "hospital"},
     "Mali pala — evacuation center ang kailangan", "switch_evac"),
    ("tl", "Ano gagawin habang lumilindol?", "get_protocol", {"disaster": "earthquake", "phase": "during"},
     "Pag tapos na, ano?", "switch_phase_after"),
    ("taglish", "Find evac centers", "find_nearby", {"category": "evacuation_center"},
     "May pet-friendly ba?", "constraint"),
]

def build_multiturn_rows(rng: random.Random, pois: dict[str, list[dict]],
                         protocols: dict[str, dict], count: int) -> list[dict]:
    rows = []
    attempts = 0
    while len(rows) < count and attempts < count * 5:
        attempts += 1
        lang, q1, tool, args, q2, kind = rng.choice(FOLLOWUP_TEMPLATES)
        origin = rng.choice(ORIGINS)

        # Build turn 1 (tool + tool result + speak)
        if tool == "find_nearby":
            cat = args["category"]
            cat_pois = pois.get(cat, [])
            if len(cat_pois) < 3: continue
            scored = sorted(
                [{**p, "km": haversine_km((origin[0], origin[1]), (p["lon"], p["lat"]))} for p in cat_pois],
                key=lambda p: p["km"]
            )
            picks1 = scored[:3]
            if picks1[0]["km"] > 8: continue
            summary1 = render_nearby_summary(cat, picks1)
            speak1 = render_nearby_speak(rng, lang, cat, picks1)
        else:  # get_protocol
            d, ph = args["disaster"], args["phase"]
            ptext = protocols.get(d, {}).get("phases", {}).get(ph)
            if not ptext: continue
            summary1 = ptext
            speak1 = render_protocol_speak(rng, lang, d, ph, extract_rules(ptext), rng.choice(["terse", "numbered"]))

        msgs = [
            turn("system", SYSTEM_PROMPT),
            turn("user", q1),
            turn("assistant", tool_call(tool, args)),
            turn("tool", tool_result(tool, summary1)),
            turn("assistant", speak(speak1)),
            turn("user", q2),
        ]

        # Build follow-up turn
        if kind == "switch_evac":
            centers = pois.get("evacuation_center", [])
            scored = sorted(
                [{**c, "km": haversine_km((origin[0], origin[1]), (c["lon"], c["lat"]))} for c in centers],
                key=lambda p: p["km"]
            )
            picks = scored[:3]
            for p in picks: p["walk"] = walk_minutes(p["km"])
            if not picks or picks[0]["km"] > 10: continue
            state = rng.choice(["route_ok", "graph_missing"])
            summary2 = render_evac_summary(picks, state, picks[0])
            speak2 = render_evac_speak(rng, lang, picks, state)
            msgs += [
                turn("assistant", tool_call("route_to_nearest_evacuation", {"profile_aware": True})),
                turn("tool", tool_result("route_to_nearest_evacuation", summary2)),
                turn("assistant", speak(speak2)),
            ]
        elif kind == "switch_phase_after":
            d = args["disaster"]
            ptext2 = protocols.get(d, {}).get("phases", {}).get("after")
            if not ptext2: continue
            speak2 = render_protocol_speak(rng, lang, d, "after", extract_rules(ptext2), "terse")
            msgs += [
                turn("assistant", tool_call("get_protocol", {"disaster": d, "phase": "after"})),
                turn("tool", tool_result("get_protocol", ptext2)),
                turn("assistant", speak(speak2)),
            ]
        elif kind == "constraint":
            # Constraint follow-up answers from the prior tool result — no new tool call.
            top_name = picks1[0]["name"] if tool == "find_nearby" else "the closest option"
            en_variants = [
                f"The find_nearby data shows distances only — pet-friendliness and PWD access aren't in the basic search. Call the barangay covering {top_name} to confirm, or check the map markers.",
                f"That detail isn't in the find_nearby result. For {top_name}, call your barangay directly or scan the on-screen markers for the wheelchair / paw icons.",
                f"I only get name, distance, and address from find_nearby. To check accessibility at {top_name}, the barangay hotline is your fastest route.",
            ]
            tl_variants = [
                f"Sa find_nearby, distance lang nakikita ko — pet-friendly o PWD access ay wala sa basic search. Tawagan ang barangay ng {top_name} para kumpirmahin.",
                f"Hindi nasa data ko 'yan. Para sa {top_name}, tumawag sa barangay o tingnan ang marker icons sa mapa.",
            ]
            tglsh_variants = [
                f"Sa find_nearby po, name + distance + address lang available — pet-friendly/PWD access hindi nakatala. Confirm po sa barangay ng {top_name}.",
                f"That info isn't sa search results po. Tawagan po ang barangay covering {top_name}.",
            ]
            ans = rng.choice({"en": en_variants, "tl": tl_variants, "taglish": tglsh_variants}[lang])
            msgs += [turn("assistant", speak(ans))]
        else:
            continue

        rows.append(row(msgs))
    return rows


# ---------------------------------------------------------------------------
# Generator 10 — TOOL ERROR: protocol/POI missing, model gracefully degrades.
# ---------------------------------------------------------------------------

TOOL_ERROR_CASES = [
    ("en", "How do I prepare for a tsunami?", "get_protocol", {"disaster": "tsunami", "phase": "before"},
     'No protocol on file for "tsunami". Contact NDRRMC at 911.',
     "I don't have a verified tsunami protocol on file. Call NDRRMC at 911 for guidance. For earthquakes (which can trigger tsunamis), I can pull PHIVOLCS protocols if helpful."),
    ("en", "Where's the nearest fire station?", "find_nearby", {"category": "fire_station"},
     "Unknown category: fire_station.",
     "Fire stations aren't in my search categories. I can find hospitals, evacuation centers, schools, gymnasiums, multi-purpose halls, or covered courts. For fire emergencies, call BFP at 117."),
    ("tl", "Paano maghanda sa tsunami?", "get_protocol", {"disaster": "tsunami", "phase": "before"},
     'No protocol on file for "tsunami". Contact NDRRMC at 911.',
     "Wala akong protocol sa file para sa tsunami. Tumawag sa NDRRMC sa 911. May earthquake protocols ako kung gusto mo."),
]

def build_tool_error_rows() -> list[dict]:
    rows = []
    for lang, q, tool, args, err_summary, reply in TOOL_ERROR_CASES:
        conv = [
            turn("system", SYSTEM_PROMPT),
            turn("user", q),
            turn("assistant", tool_call(tool, args)),
            turn("tool", tool_result(tool, err_summary)),
            turn("assistant", speak(reply)),
        ]
        rows.append(row(conv))
    return rows


# ---------------------------------------------------------------------------
# Assemble + split + write
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--protocols", default="Likas/assets/protocols",
                    help="Directory with earthquake.json, typhoon.json, volcano.json")
    ap.add_argument("--scraped", default="Likas/src/data/scraped",
                    help="Directory with hospital.json, evacuation.json, etc.")
    ap.add_argument("--out", default="datasets/likas_assistant_v4")
    ap.add_argument("--seed", type=int, default=3407)
    args = ap.parse_args()

    rng = random.Random(args.seed)

    # Load protocols
    protocols: dict[str, dict] = {}
    for name in ["earthquake", "typhoon", "volcano"]:
        path = Path(args.protocols) / f"{name}.json"
        if path.exists():
            with path.open("r", encoding="utf-8") as f:
                protocols[name] = json.load(f)

    # Load real POIs
    pois = load_scraped_pois(Path(args.scraped))
    print("POI counts:", {k: len(v) for k, v in pois.items()})

    # Generate per category. Targets aim for balance:
    sections: dict[str, list[dict]] = {}
    sections["protocol_qa"]   = build_protocol_rows(rng, protocols, target_per_combo=6)
    sections["evacuation"]    = build_evac_rows(rng, pois, count=180)
    sections["nearby_poi"]    = build_nearby_rows(rng, pois, per_category=28)  # 6 cats * 28 = 168
    sections["profile_aware"] = build_profile_rows(rng, count=80)
    sections["direct_speak"]  = build_direct_speak_rows()
    sections["refusal"]       = build_refusal_rows()
    sections["clarification"] = build_clarification_rows()
    sections["multi_tool"]    = build_multi_tool_rows(rng, pois, protocols, count=40)
    sections["multi_turn"]    = build_multiturn_rows(rng, pois, protocols, count=40)
    sections["tool_error"]    = build_tool_error_rows()

    all_rows: list[dict] = []
    by_section_counts: dict[str, int] = {}
    for section, rs in sections.items():
        # Tag rows with their section so we can stratify the split
        for r in rs:
            r["_section"] = section
        all_rows.extend(rs)
        by_section_counts[section] = len(rs)

    # Stratified 90/10 split
    train_rows, test_rows = [], []
    by_section: dict[str, list[dict]] = defaultdict(list)
    for r in all_rows:
        by_section[r["_section"]].append(r)
    for section, rs in by_section.items():
        rng.shuffle(rs)
        cut = max(1, int(len(rs) * 0.1))
        test_rows.extend(rs[:cut])
        train_rows.extend(rs[cut:])
    rng.shuffle(train_rows); rng.shuffle(test_rows)

    # Strip the _section tag before writing (it's not part of the runtime schema)
    def strip_tag(r): r = dict(r); r.pop("_section", None); return r
    train_rows = [strip_tag(r) for r in train_rows]
    test_rows = [strip_tag(r) for r in test_rows]

    # Diagnostics: unique assistant outputs (the metric v3 failed on)
    def assistant_uniqueness(rows):
        outs = []
        for r in rows:
            for m in r["messages"]:
                if m["role"] == "assistant":
                    outs.append(m["content"])
        return len(set(outs)), len(outs)
    train_uniq, train_total = assistant_uniqueness(train_rows)

    # Write
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with (out / "train.jsonl").open("w", encoding="utf-8") as f:
        for r in train_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with (out / "test.jsonl").open("w", encoding="utf-8") as f:
        for r in test_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    stats = {
        "version": "v4",
        "total": len(train_rows) + len(test_rows),
        "train": len(train_rows),
        "test": len(test_rows),
        "by_section": by_section_counts,
        "assistant_uniqueness_train": {
            "unique": train_uniq,
            "total": train_total,
            "ratio": round(train_uniq / max(1, train_total), 3),
        },
    }
    with (out / "stats.json").open("w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
