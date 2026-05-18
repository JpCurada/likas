---
license: gemma
base_model: google/gemma-4-e2b-it
library_name: peft
tags:
  - gemma
  - gemma-4
  - lora
  - peft
  - sft
  - tool-use
  - function-calling
  - on-device
  - disaster-response
  - philippines
  - filipino
  - tagalog
  - taglish
  - unsloth
  - gguf
language:
  - en
  - tl
pipeline_tag: text-generation
datasets:
  - jeypiic/likas-ai-datasets
---

# LIKAS — Gemma 4 E2B-IT (Disaster Companion for the Philippines)

LoRA fine-tune of `google/gemma-4-e2b-it` that turns the base model into **LIKAS**, an offline disaster-response assistant for the Philippines. The model emits a strict JSON envelope for every turn — either a tool call or a user-facing reply — so it can be safely run on-device inside a React Native app via `llama.rn`.

This is the model that powers [LIKAS](https://github.com/JpCurada/likas), an offline-first mobile app for earthquake / typhoon / volcanic-eruption preparedness, evacuation routing, and POI search across Metro Manila.

> ⚠️ This is a **fine-tune for a specific app**, not a general-purpose chatbot. It only emits structured JSON and is grounded in NDRRMC / PAGASA / PHIVOLCS protocols. Use it inside the dispatch loop described below or it will produce JSON your client must parse.

## Repository variants

This repository hosts the LoRA adapter. The full pipeline produces three artifacts:

| Repo | Contents | Use when |
|---|---|---|
| `jpcurada/likas-gemma4-e2b-lora` | LoRA adapters (~110 MB) | You have base Gemma 4 E2B-IT loaded and want to attach the adapter at runtime |
| `jpcurada/likas-gemma4-e2b-fp16` | Merged fp16 HF checkpoint (~10 GB) | You want a standalone HF model for further fine-tuning or vLLM serving |
| `jpcurada/likas-gemma4-e2b-gguf` | `likas-q4_k_m.gguf` (~1.8 GB) | You want to run on mobile / CPU via `llama.cpp` / `llama.rn` (the production target) |

## Intended use

**In scope:**
- Disaster preparedness, response, and recovery Q&A for earthquake, typhoon, and volcanic eruption in the Philippines
- Quoting NDRRMC / PAGASA / PHIVOLCS protocols verbatim via a `get_protocol` tool
- Ranking the nearest evacuation centers via a `route_to_nearest_evacuation` tool (returns a polyline the UI draws on a MapLibre map)
- Finding nearby hospitals, schools, gymnasiums, multi-purpose halls, covered courts via `find_nearby`
- Personalizing replies from on-device user profile data via `get_user_profile`
- Multilingual replies in **English, Filipino, and Taglish** (replies in the user's language)
- Polite refusal of off-topic queries (entertainment, opinions, general knowledge)

**Out of scope:**
- Any non-disaster topic — the model refuses by design (Rule 7)
- Calling, SMS, or any real-world action — the model never claims to do these (Rule 9)
- Medical diagnosis — the model can reference profile-stored conditions but does not diagnose
- Domains outside the Philippines (NDRRMC/PAGASA/PHIVOLCS guidance is country-specific)
- Use as a free-form chatbot — the output grammar is constrained to a JSON envelope

## Output contract

Every turn the model produces **exactly one JSON object** on a single line. There is no prose outside the JSON. Two shapes:

```json
{"action": "tool", "name": "<tool_name>", "args": {...}}
```

```json
{"action": "speak", "text": "<reply to user>"}
```

After the host runs the tool and injects the result, the model decides again — either another tool call or a final speak turn. The host typically caps the tool-dispatch loop at 3 iterations per user query.

### Tools

| Tool | Args | Purpose |
|---|---|---|
| `get_protocol` | `disaster: "earthquake"\|"typhoon"\|"volcano"`, `phase: "before"\|"during"\|"after"` | Returns the official authority protocol text for the requested combination. The model must quote it verbatim in its speak turn. |
| `route_to_nearest_evacuation` | `profile_aware?: boolean` | Returns the top-3 nearest evacuation centers and (if the pedestrian graph is installed) a walkable polyline + ETA. |
| `find_nearby` | `category: "hospital"\|"evacuation_center"\|"gymnasium"\|"school"\|"multi_purpose_hall"\|"covered_court"` | Returns the 3 nearest POIs of the given category with distances. |
| `get_user_profile` | `{}` | Returns medical conditions, companions, meeting points, emergency contacts — only when the user asks about themselves. |

### Example exchange (Tagalog)

```
user:     Bagyo na, kailangan kong lumikas
assistant {"action":"tool","name":"get_protocol","args":{"disaster":"typhoon","phase":"during"}}
tool      {"name":"get_protocol","result":"PAGASA and NDRRMC guidance: Stay indoors..."}
assistant {"action":"speak","text":"Mga puntos mula sa PAGASA: Stay indoors away from windows..."}
user:     Saan ako lilikas?
assistant {"action":"tool","name":"route_to_nearest_evacuation","args":{"profile_aware":true}}
tool      {"name":"route_to_nearest_evacuation","result":"Top evacuation options: 1. Manila High School..."}
assistant {"action":"speak","text":"Pinakamalapit: Manila High School (0.8 km, ~11 min lakad). Naka-plot na sa mapa ang ruta..."}
```

## Training data

Trained on [`jeypiic/likas-ai-datasets`](https://huggingface.co/datasets/jeypiic/likas-ai-datasets) (v4) — **691 conversations** stratified across 10 task categories, with assistant-output uniqueness of ~80% on speak turns (compared to 30% on v3, which overfit).

| Section | Train+Test | Purpose |
|---|---|---|
| protocol_qa | 162 | Quote NDRRMC / PAGASA / PHIVOLCS protocols across 4 styles × 3 languages × shuffled rule orderings |
| evacuation | 180 | Route to nearest evacuation center; teaches all 3 runtime tail variants (route resolved / graph missing / snap failed) |
| nearby_poi | 153 | find_nearby across all 6 categories using real OpenStreetMap POIs inside the pedestrian-graph bbox |
| profile_aware | 80 | get_user_profile → personalized go-bag / meds / meeting-point answers |
| multi_tool | 40 | Protocol → user follow-up → evacuation in one conversation |
| multi_turn | 40 | Follow-up corrections: switch tool, switch phase, ask about constraints |
| refusal | 15 | Rule 7 — politely refuse off-topic queries and redirect |
| direct_speak | 10 | Greetings and meta-questions that don't need a tool |
| clarification | 8 | Ambiguous user input ("it's bad", "help") — model asks what's wrong first |
| tool_error | 3 | Graceful degradation when a tool returns "unknown category" / "no protocol on file" |

User origins are sampled from 20 Metro Manila barangay centroids; POIs are loaded from OSM extracts (59 hospitals, 75 schools, etc.) inside `bbox=(120.85, 14.25, 121.30, 14.90)`. Distances and walking ETAs are computed via haversine + a 4.2 km/h pace, matching the production `routingService` exactly.

The runtime tool result strings are 1:1 with what `Likas/src/services/aiTools.ts` produces, so the model sees the same distribution at inference time as during training.

## Training procedure

- **Base model:** `unsloth/gemma-4-E2B-it` (4-bit quantized for training)
- **Method:** PEFT LoRA SFT via [Unsloth](https://github.com/unslothai/unsloth)
- **Library:** `transformers==5.5.0`, `trl` (Unsloth pin), `peft`, `bitsandbytes`, `unsloth_zoo`
- **Compute:** Kaggle T4 (single GPU)
- **Hyperparameters:**
  - LoRA `r=32`, `alpha=32`, `dropout=0`
  - Target modules: `q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj`
  - Optimizer: `adamw_8bit`, learning rate `2e-4`, cosine schedule, warmup ratio `0.03`
  - Batch size 2 × grad accumulation 4 (effective batch 8)
  - Max sequence length 4096 (system prompt is long; tool turns add up)
  - 3 epochs (~233 optimizer steps total on 622 train rows)
  - Loss computed over the full formatted sequence (full-sequence SFT)
  - Gradient checkpointing via Unsloth, `max_grad_norm=0.3`, `weight_decay=0.001`
  - Seed `3407`

Per-step train and validation loss were logged to [Weights & Biases](https://wandb.ai/). The full notebook is at [`Likas_Gemma4_E2B_Finetune.ipynb`](https://github.com/JpCurada/likas/blob/main/Likas_Gemma4_E2B_Finetune.ipynb).

## How to use

### As LoRA on top of base Gemma 4 E2B-IT (Python)

```python
from unsloth import FastLanguageModel
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="jpcurada/likas-gemma4-e2b-lora",
    max_seq_length=4096,
    load_in_4bit=True,
)
FastLanguageModel.for_inference(model)

SYSTEM_PROMPT = """..."""  # see README of the dataset for the exact prompt
messages = [
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user",   "content": "May lindol! Ano gagawin ko?"},
]
prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
out = model.generate(**inputs, max_new_tokens=256, temperature=1.0, top_p=0.95, top_k=64)
print(tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

### On mobile via llama.rn (production)

Download `likas-q4_k_m.gguf` from `jpcurada/likas-gemma4-e2b-gguf` and load via `llama.rn`. The LIKAS app constrains generation with a GBNF grammar (`Likas/src/services/aiGrammar.ts`) so the model is forced to emit valid JSON envelopes even at temperature `1.0`.

## Evaluation

Loss curves are logged to wandb during training. We do **not** publish a benchmark score because the model is task-specific (Filipino disaster-response tool-calling); no standard benchmark covers this distribution.

Manual evaluation rubric used in development:
1. **JSON validity** — every generated string parses as a single JSON object
2. **Tool selection** — `get_protocol` for safety-critical, `route_to_nearest_evacuation` for evacuation, `find_nearby` for POI, `get_user_profile` for self-queries
3. **Rule coverage** — speak turns include every rule from the protocol tool result (no silent drops)
4. **Language match** — Rule 8 — reply in the user's language
5. **Refusal handling** — Rule 7 — politely redirect off-topic queries
6. **Map awareness** — when `route_state == "route_ok"`, the speak turn references the polyline drawn on the map

## Limitations & risks

- **Geographic scope:** Trained only on Metro Manila POIs and origins. Behavior outside the pedestrian-graph bbox `(120.85, 14.25, 121.30, 14.90)` is undefined.
- **Authority drift:** Protocol texts are a snapshot of NDRRMC / PAGASA / PHIVOLCS guidance at training time. If authorities update guidance, the model will quote the older text until re-fine-tuned. Always defer to live authority broadcasts in an actual emergency.
- **Not a substitute for emergency services:** This is a preparedness companion, not a replacement for calling **911** (NDRRMC) or **117** (BFP fire emergencies).
- **JSON envelope:** The model emits a strict JSON envelope. If you call it without a JSON parser / GBNF grammar / system prompt that matches the training distribution, output may not be what you expect.
- **No real-world actions:** The model never sends SMS, places calls, or takes actions outside its host app. Any tool call shown in this README is mediated by the host application.
- **Small model:** ~5B params at fp16. Capable for structured tool-use over a narrow domain, not a general assistant.

## License

Distributed under the **Gemma Terms of Use** (inherited from the base model). You must accept Google's Gemma license before using this adapter. Training data is the author's own work (`jeypiic/likas-ai-datasets`) and is governed by that dataset's license.

## Citation

```bibtex
@misc{likas-gemma4-e2b-2026,
  author = {John Paul Curada},
  title  = {LIKAS — Gemma 4 E2B-IT fine-tune for offline disaster response in the Philippines},
  year   = {2026},
  url    = {https://huggingface.co/jpcurada/likas-gemma4-e2b-lora},
}
```

## Acknowledgments

- **Google** for Gemma 4
- **Unsloth** for the fast LoRA SFT pipeline
- **NDRRMC, PAGASA, PHIVOLCS** for the authoritative protocols this model is grounded in
- **OpenStreetMap contributors** (via Geofabrik Philippines extract) for the POIs and pedestrian graph
