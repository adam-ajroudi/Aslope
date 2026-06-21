# Anchor Vision: Implementation Plan and Architecture

> Working title. This is a new project for the Berkeley AI Hackathon, conceptually descended from Anchor but built fresh during the event. Rename freely.

A camera-driven focus coach. It watches for two behaviors during a work session (slouching and phone-in-hand), and when one fires it instantly delivers a pre-generated nudge: an image, a short voice line, or a video. After each session, Claude analyzes what happened and personalizes the next session's nudges and tasks. Built with Claude Code, orchestrated by the Anthropic API, with Midjourney, Pika, Deepgram, Redis, Sentry, and Arize as the integrated layers.

---

## 1. Core design principle: the latency split

Everything in this architecture follows from one rule. Slow generation never sits in the real-time path.

Midjourney and Pika take tens of seconds to minutes. A nudge that arrives a minute after you slouch is useless. So the system runs in two clocks:

- **Slow clock (seconds to minutes):** asset generation and reasoning. Runs at session start and after a session ends. Claude, Midjourney, and Pika live here.
- **Fast clock (under ~300ms):** detection and reward delivery. Camera, computer vision, cache lookup, overlay, and voice playback live here. No slow API is ever called on this path.

The bridge between the two clocks is Redis. The slow clock fills a cache of ready-to-serve assets. The fast clock only ever reads from that cache.

Target latency budget for a trigger to its on-screen reward: under 300ms, with Deepgram audio following within ~1s.

---

## 2. System architecture

Three layers, mirroring the original Anchor split but with the ring replaced by the camera.

### Layer 1: Local client (Electron)

- **Main process (Node.js):** owns orchestration, all outbound API and MCP calls, Redis connection, IPC, and Sentry. This is the controller.
- **Renderer process (React):** owns the webcam feed, the computer vision pipeline, the session setup UI, the nudge overlay, and the dashboard.
- IPC carries two things: trigger events up from renderer to main, and nudge payloads down from main to renderer.

### Layer 2: Reasoning and generation (cloud, slow clock)

- **Anthropic Messages API** as the orchestration brain. It reads the user profile and session data, decides what to generate, and drives Midjourney and Pika through the MCP connector in a single API flow.
- **Midjourney MCP** for still images.
- **Pika MCP** for short video clips, including the personal-photo feature.
- **Deepgram** REST API for text-to-speech (this one is fast enough to call near real time, but we still pre-fetch where possible).

### Layer 3: State, memory, and observability

- **Redis** as both the fast-clock asset cache and the cross-session agent memory (with vector search for semantic recall of past nudges and wins).
- **Sentry** wrapping the long-running generation jobs, the CV loop, and all IPC and API calls.
- **Arize** instrumenting the generation and nudge pipeline so you can show measurable improvement. https://github.com/Arize-ai/arize-skills

### Diagram

```
                         SLOW CLOCK (session start / session end)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Electron Main ──> Anthropic Messages API ──(MCP connector)──┬─> Midjourney MCP
  │       │                    │                                 └─> Pika MCP
  │       │                    └─> quote pool + prompts + post-session plan
  │       │                                                              │
  │       └──< download assets <─────────────────────────────────────────┘
  │                    │
  │                    └─> write assets + quotes to Redis cache
  │                    └─> write/update agent memory (Redis vector)
  └──────────────────────────────────────────────────────────────────────┘
                                  │  (Redis bridges the two clocks)
                                  ▼
                         FAST CLOCK (during the session)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Webcam ─> Renderer CV (pose + phone) ─> Trigger Engine (debounce)      │
  │                                                │ IPC: trigger event     │
  │                                                ▼                        │
  │  Electron Main ─> read cached asset from Redis ─> IPC payload ─> Overlay│
  │                                                └─> Deepgram TTS ─> audio │
  │                                                └─> log event to Redis    │
  └──────────────────────────────────────────────────────────────────────┘

  Sentry wraps every box. Arize traces every slow-clock generation + every nudge.
```

---

## 3. End-to-end flow

### Phase 0: First-run profile (once per user)

A short form captures interests (topics, hobbies, aesthetic taste) and the motivation profile: does this user respond better to **consequence** framing (a stark image of long-term slouching damage) or **reward** framing (an aspirational image of focus and good posture)? Both modes are supported, and the user can keep both on and let the system mix. Stored in Redis under the profile key.

### Phase 1: Session prep (slow clock, runs once at session start)

1. User states the task intent for the session ("writing my thesis intro").
2. Main process calls the Anthropic Messages API. In one orchestrated flow Claude:
   - writes the Midjourney prompts (themed to the user's interests and both modes),
   - writes the Pika prompts,
   - generates the quote pool (consequence quotes and reward quotes),
   - calls Midjourney MCP and Pika MCP through the connector to actually produce the assets.
3. Main downloads every returned asset to local disk and writes references into the Redis cache, keyed by trigger type and mode.
4. Deepgram pre-renders audio for the top quotes so the first few nudges play instantly.

When this phase finishes, the cache holds a ready library: slouch-consequence images, slouch-reward images, phone-consequence images, phone-reward images, a quote pool per mode, a couple of video clips, and pre-rendered audio.

### Phase 2: Monitoring (fast clock)

The renderer runs the webcam through two CV models continuously: pose estimation for posture, object detection for phone-in-hand. The trigger engine debounces so a nudge only fires after the behavior persists (for example, slouch held for 3+ seconds, phone visible for 2+ seconds), with a cooldown so the user is not spammed.

### Phase 3: Trigger to reward (fast clock)

On a confirmed trigger, the renderer sends an IPC event to main. Main reads a matching asset from the Redis cache (respecting the user's mode), sends the payload back to the renderer for an ambient non-intrusive overlay, and plays the Deepgram voice line. The event is logged to Redis. No slow API touched, so it stays snappy.

### Phase 4: Post-session orchestration (slow clock, the smart part)

When the focus block ends, main sends the full session log plus the profile plus prior memory to the Anthropic API. Here Claude does the heavy reasoning: it summarizes the session (slouch count, phone pickups, average recovery time, best streak), writes personalized next tasks and nudges tuned to what actually worked for this user, and produces the prompt set for the next session's assets. This is also where it can kick off fresh Midjourney and Pika generation so the next session is ready. This is the moment that most directly satisfies the Anthropic prize: Claude doing meaningful, aspirational orchestration, not just a single completion.

### Phase 5: Memory and dashboard

Session results are written to Redis as durable agent memory, with embeddings so future sessions can semantically recall past wins ("last time you beat a phone urge while writing, here is what got you back"). The React dashboard shows the Log of Wins and the focus score. Sentry monitors the long jobs.

### The personal-photo Pika feature

Separate from the behavior nudges, this is a celebration reward. The user picks one photo from their laptop. At prep time (or as a milestone reward after a strong session), main sends that image to Pika MCP to generate a fun or artistic short clip (the image becomes the seed for an image-to-video generation). It is cached like any other asset and shown as a milestone celebration in the Log of Wins. It is a personal, delightful payoff that makes the reward loop feel yours rather than generic, and it is a strong Pika demo moment.

---

## 4. Tool responsibility matrix

| Tool | Role in the system | Clock | Prize it targets |
|------|--------------------|-------|------------------|
| Claude Code | The tool you build the whole thing with | build time | Anthropic |
| Anthropic API (Messages) | Orchestration brain: prompts, quote pool, post-session reasoning, MCP driver | slow | Anthropic |
| Midjourney MCP | Still nudge images (consequence and reward, themed to interests) | slow | Midjourney |
| Pika MCP | Short video nudges + personal-photo celebration clip | slow | Pika |
| Deepgram | Voice coach: speaks the quote aloud on trigger | fast / pre-rendered | Deepgram |
| Redis | Fast-clock asset cache + cross-session vector memory | both | Redis |
| Sentry | Error logging for long-running jobs, CV loop, IPC, API calls | both | Sentry |
| Arize | Tracing and eval of the generation + nudge pipeline | slow | Arize |
| Computer vision (MediaPipe + TF.js) | Posture and phone detection | fast | core, no sponsor |

Grand prize track to enter: **Ddoski's Lab** (health and engineering). The spinal-health and attention-intervention angle for neurodivergent users is a genuine health application, not just a productivity tool.

---

## 5. Tech stack

- **Shell:** Electron, TypeScript.
- **UI:** React, with a lightweight state store (Zustand or plain context).
- **Pose estimation:** MediaPipe Tasks Vision (`@mediapipe/tasks-vision`, PoseLandmarker), runs in the renderer on WebGL.
- **Phone detection:** TensorFlow.js COCO-SSD (`@tensorflow-models/coco-ssd`), detects the `cell phone` class.
- **Cache and memory:** Redis (use `redis` or `ioredis`); use Redis vector search for semantic memory.
- **Anthropic:** `@anthropic-ai/sdk` (Messages API with the MCP connector).
- **Deepgram:** `@deepgram/sdk` or the REST `/v1/speak` endpoint.
- **Sentry:** `@sentry/electron`.
- **Arize:** OpenTelemetry tracing with OpenInference semantic conventions, or a small Python sidecar using the Arize SDK if the JS path is fiddly during the event. https://github.com/Arize-ai/arize-skills

---

## 6. Repository structure

```
anchor-vision/
  PLAN.md                      # this file, so Claude Code has the spec in-repo
  package.json
  .env                         # API keys (never commit)
  electron/
    main.ts                    # window, IPC wiring, controller
    preload.ts
    services/
      anthropic.ts             # Messages API + MCP connector client
      midjourney.ts            # thin helpers if calling MCP outside the connector
      pika.ts                  # Pika MCP + personal-photo flow
      deepgram.ts              # TTS
      redis.ts                 # cache + memory accessors
      arize.ts                 # tracing
      sentry.ts                # init + wrappers
    pipelines/
      sessionPrep.ts           # Phase 1 orchestration
      postSession.ts           # Phase 4 orchestration
      assetCache.ts            # download + Redis write
    ipc/
      channels.ts              # typed IPC channel names + payloads
  renderer/
    src/
      App.tsx
      components/
        ProfileForm.tsx        # Phase 0
        SessionSetup.tsx       # task intent input
        NudgeOverlay.tsx       # the ambient reward
        Dashboard.tsx          # Log of Wins + focus score
        MilestoneCelebration.tsx  # personal Pika clip
      vision/
        poseDetector.ts        # MediaPipe pose
        phoneDetector.ts       # COCO-SSD
        triggerEngine.ts       # debounce, cooldown, mode selection
        calibration.ts         # capture the user's good-posture baseline
      state/
        store.ts
  shared/
    types.ts                   # shared event + payload + profile types
    schema.ts                  # Redis key builders
```

---

## 7. Data model

### Redis keys

```
profile:{userId}                         JSON   interests + motivation modes
session:{sessionId}                      JSON   task intent, startedAt, mode
assets:{userId}:{trigger}:{mode}         LIST   asset refs ready to serve
quotes:{userId}:{mode}                    LIST   pre-generated quote pool
audio:{userId}:{quoteHash}               STRING path to pre-rendered Deepgram audio
events:{userId}                          ZSET   event log, scored by timestamp
memory:{userId}                          JSON   rolling aggregates + streaks
memvec:{userId}                          VECTOR embeddings of past nudges/wins
milestone:{userId}                       LIST   personal Pika celebration clips
```

`{trigger}` is `slouch` or `phone`. `{mode}` is `consequence` or `reward`.

### Event schema

```ts
type FocusEvent = {
  eventId: string;
  userId: string;
  sessionId: string;
  timestamp: number;
  type: "slouch" | "phone" | "refocus";
  mode: "consequence" | "reward";
  recoveryMs: number | null;   // time from trigger to corrected behavior
  assetServed: string;          // ref to the image/video/quote shown
};
```

### Profile schema

```ts
type Profile = {
  userId: string;
  interests: string[];          // e.g. ["space", "minimalism", "running"]
  modes: ("consequence" | "reward")[];  // one or both
  voicePreference?: string;     // Deepgram voice id
};
```

---

## 8. Integration details

### 8.1 Claude orchestration through the MCP connector

The Anthropic Messages API can connect to remote MCP servers directly via the `mcp_servers` parameter, so a single API call lets Claude both reason and drive Midjourney and Pika. This is the spine of the slow clock and the centerpiece of the Anthropic submission.

Key facts to build against (verified against current Anthropic docs):

- Pass remote servers in `mcp_servers` (each entry has `type: "url"`, `name`, the `url`, and an `authorization_token` for OAuth servers like Midjourney and Pika).
- The current beta header is `anthropic-beta: mcp-client-2025-11-20`. Tool configuration now lives in the `tools` array as `mcp_toolset` entries (this supports allowlisting specific tools per server).
- The connector accesses MCP **tools** only (not resources or prompts), over public HTTPS with streamable HTTP or SSE.
- Responses come back as mixed content blocks. Parse by `type`: `text`, `mcp_tool_use`, and `mcp_tool_result`. Never index by position; filter by type.
- You obtain the OAuth access token for Midjourney/Pika yourself beforehand and pass it in; refresh as needed.

Sketch:

```ts
const res = await anthropic.beta.messages.create({
  model: "claude-sonnet-4-6",          // fast orchestration; use opus-4-8 for the richest post-session synthesis
  max_tokens: 4000,
  betas: ["mcp-client-2025-11-20"],
  system: PREP_SYSTEM_PROMPT,           // see section 9
  messages: [{ role: "user", content: prepInput }],
  mcp_servers: [
    { type: "url", name: "midjourney", url: MIDJOURNEY_MCP_URL, authorization_token: mjToken },
    { type: "url", name: "pika",       url: PIKA_MCP_URL,       authorization_token: pikaToken },
  ],
  tools: [
    { type: "mcp_toolset", mcp_server_name: "midjourney" },
    { type: "mcp_toolset", mcp_server_name: "pika" },
  ],
});

// extract generated asset URLs from mcp_tool_result blocks, then download + cache
const toolResults = res.content.filter(b => b.type === "mcp_tool_result");
```

Important caveat from the event itself: Midjourney's MCP is a prerelease server and hackers hit OAuth and Cloudflare issues with it. Treat the Midjourney connection as the riskiest integration. Build the asset cache so the app still demos with placeholder or pre-baked images if Midjourney generation is unavailable at runtime, and generate a stock of real Midjourney images early while the connection is healthy.

### 8.2 Midjourney MCP (images)

Midjourney has no public API, only the MCP server, so the connector path above is the only programmatic route. Generate a small, varied library during prep (4 to 6 images per trigger and mode is plenty for a demo). Pull images at the highest resolution the MCP returns and downscale locally for the overlay. Cache file paths in `assets:{userId}:{trigger}:{mode}`.

### 8.3 Pika MCP (video + personal photo)

Two uses:

1. **General video nudges:** a handful of short clips generated during prep, cached like images.
2. **Personal-photo celebration:** the user selects one local image; send it to Pika as the seed for an image-to-video generation with a fun or artistic prompt. Because this is image-conditioned, send the photo as base64 in the message content alongside the Pika toolset, and let Claude drive the Pika tool with the styling prompt. Cache the result under `milestone:{userId}` and surface it in the Log of Wins after a strong session.

Pika generation is the slowest step, so always run it on the slow clock and never block the UI on it.

### 8.4 Deepgram (voice coach)

Use text-to-speech to read the quote aloud when a nudge fires. Pre-render audio for the top quotes during prep so the first nudges are instant, and fall back to a live `/v1/speak` call for quotes that were not pre-rendered (still fast enough for a coach line). Store pre-rendered audio paths under `audio:{userId}:{quoteHash}`. Let the user pick a voice in the profile. This is your Deepgram prize hook: voice is essential to the coaching experience, not tacked on.

### 8.5 Redis (cache + memory)

Two distinct jobs. As the fast-clock cache it is just key reads on the trigger path, which is what keeps latency low. As agent memory it stores rolling aggregates and a vector index of past nudges and wins, so post-session reasoning can semantically recall what worked. The "beyond caching" framing (vector search and agent memory, not just a key-value store) is exactly what the Redis prize rewards, so lean into the memory use, not just the cache use.

### 8.6 Sentry (error logging)

Initialize `@sentry/electron` in both processes. Wrap, specifically: the prep and post-session pipelines (long-running, multi-step, the most failure-prone), the MCP generation calls (flaky third-party servers), the CV loop, and the IPC handlers. Add breadcrumbs at each pipeline step so a failed generation is traceable end to end. Reliability of long jobs is your stated reason for Sentry and it maps cleanly to their judging.

### 8.7 Arize (observability and eval)

Trace every slow-clock generation (prompt in, asset out, latency, model) and every nudge delivery (trigger type, mode, asset served, recovery time). Then build the improvement story their prize asks for: use recovery time as the proxy metric for nudge effectiveness, compare nudge styles or modes across sessions, and show that tuning the prompts or mode selection measurably reduced average recovery time. That is concrete before/after evidence that Arize drove an improvement. If the JS OpenTelemetry path is slow to wire up during the event, run a tiny Python sidecar with the Arize SDK and post traces to it over local HTTP.

### 8.8 Computer vision

Run both models in the renderer on the webcam `MediaStream`.

- **Posture:** MediaPipe PoseLandmarker. At session start, run a short calibration to capture the user's good-posture baseline (shoulder-to-ear vertical distance and forward-head offset). During the session, flag a slouch when the head drops or leans forward past a threshold relative to baseline and holds for 3+ seconds.
- **Phone:** COCO-SSD detecting the `cell phone` class above a confidence threshold, held for 2+ seconds.
- **Trigger engine:** debounce (require persistence), cooldown (no repeat nudge within N seconds), and mode selection (pick consequence or reward per the profile). Emit a typed IPC event on a confirmed trigger.
- **Recovery tracking:** after a nudge, watch for the behavior to correct and record `recoveryMs`. This single number feeds both the dashboard and the Arize eval.

---

## 9. Claude prompt designs

### Prep system prompt (Phase 1)

Instruct Claude that it is the session director. Given the task intent, the interest list, and the active modes, it must: produce N Midjourney prompts per trigger and mode (themed to interests), produce N Pika prompts, write a quote pool per mode (short, spoken-aloud friendly, never shaming even in consequence mode, framed as a bounce-back), then call the Midjourney and Pika tools to generate. Require it to keep consequence framing about long-term outcomes and never about personal failure, consistent with the anti-shame philosophy.

### Post-session system prompt (Phase 4)

Instruct Claude that it is the user's focus coach reviewing the session. Given the event log, the profile, and prior memory, it must: summarize the session honestly but kindly, identify which nudge mode or style correlated with faster recovery, recommend personalized next tasks and nudge adjustments, and emit the prompt set for the next session's assets. Output a structured JSON block the app can parse for the dashboard, plus a short human-readable coach note.

Specify JSON-only output for the parseable section (no markdown fences, no preamble), and parse defensively.

---

## 10. Build milestones

Ordered so that you always have a working, demoable app, and the riskiest core (computer vision) is proven first. Each milestone lists the prize it unlocks.

| # | Milestone | Result | Prize unlocked |
|---|-----------|--------|----------------|
| 0 | Electron + React skeleton, webcam visible, Sentry initialized | App runs, camera shows | Sentry (partial) |
| 1 | CV: pose + phone detection + trigger engine with debounce, logging to console | Triggers fire reliably | core |
| 2 | Static overlay on trigger with a hardcoded image and quote | End-to-end loop works with zero AI | demoable baseline |
| 3 | Redis cache; overlay reads from cache instead of hardcoded | Cache bridge in place | Redis (partial) |
| 4 | Anthropic API: quote pool + prompt generation (no MCP yet) | Claude orchestration live | Anthropic (partial) |
| 5 | Midjourney MCP via connector; populate image cache in prep | Real generated nudges | Midjourney |
| 6 | Deepgram voice on trigger (pre-rendered + live fallback) | Voice coach works | Deepgram |
| 7 | Post-session Claude analysis + dashboard + Redis memory/vector | The smart loop + Log of Wins | Anthropic, Redis (full) |
| 8 | Pika: general clips + personal-photo celebration | Video nudges + the delight moment | Pika |
| 9 | Arize tracing + the recovery-time improvement story | Measurable before/after | Arize |
| 10 | Polish, calibration UX, demo script, edge-case handling | Ship | all |

The dividing line for a safe demo is milestone 6. If the back half runs short, you still have a complete, voiced, AI-generated camera coach. Everything from 7 on is depth and additional prizes layered on a working core.

Prioritize by prize value against effort: the Anthropic, Midjourney, Deepgram, and Redis integrations are both high value and central to the product, so they come first. Sentry is nearly free. Arize and the Pika personal-photo feature are the highest-polish additions for the end.

---

## 11. Demo script (the 4-minute pitch)

1. Open on the problem in one line: productivity tools punish distraction, this one trains the bounce-back, and it works for posture and phone pull without you lifting a finger.
2. Start a session, state the task intent, show the quick calibration.
3. Slouch on camera. The overlay appears instantly and the voice coach speaks. Sit up; show the recovery being logged.
4. Pick up your phone. A different nudge fires.
5. End the session. Show Claude's post-session coach note and the Log of Wins on the dashboard.
6. Trigger the personal-photo Pika celebration as the payoff.
7. Close on the Arize chart: average recovery time dropping across sessions as the nudges tune to you.

That arc demonstrates every sponsor integration in a single continuous story, which is what wins multi-track submissions.

---

## 12. Risks and fallbacks

- **Midjourney MCP instability.** Documented OAuth and Cloudflare problems at this event. Mitigation: generate a real image stock early, and make the cache serve pre-baked images if live generation fails so the demo never depends on a live Midjourney call.
- **Pika latency.** Always slow clock, never blocking. If a clip is not ready, fall back to an image nudge.
- **CV false positives.** Calibration plus persistence thresholds plus cooldown. Tune thresholds on real bodies early, not at 4am.
- **Arize JS friction.** Python sidecar fallback.
- **Scope creep.** The milestone order is the contract. Do not start milestone N+1 until N demos cleanly.

---

## 13. First instructions to give Claude Code

Drop this file in the repo root, then start with: "Read PLAN.md. Scaffold the repo per section 6, implement milestone 0, and stop so I can verify the webcam and Sentry before we continue." Build milestone by milestone, verifying each before moving on. Keep the trigger path free of any slow API call at every step.
