// Shared by the side panel and the Settings page: settings and their defaults, platform keys, the developer
// contact, commands that run in the extension's folder, the update check, and the AI requests (sent through the
// chat you're signed in to in this browser, see webchat.js).

// The chats the AI can use. No API key: you sign in to the site in this browser once.
const AI_CHATS = {
  claude:  { label: "Claude", site: "claude.ai" },
  chatgpt: { label: "ChatGPT", site: "chatgpt.com" },
  gemini:  { label: "Gemini", site: "gemini.google.com" }
};
// Settings from before 1.36 that held API keys and models: removed from storage on update (background.js).
const OLD_AI_SETTINGS = ["provider", "anthropicKey", "openaiKey", "geminiKey", "localBaseUrl", "localApiKey", "models", "speed", "apiKey", "model"];

const DEFAULTS = {
  aiEnabled: true,      // off: the brief comes from patterns in the ticket (no AI); NetBox, BMC, ping and parts still work
  aiChat: "claude",    // claude | chatgpt | gemini: the chat you're signed in to that answers (AI_CHATS)
  jiraHosts: [],       // extra self-hosted Jira hostnames, e.g. ["jira.example.com"]
  privacyMode: false,  // swap sensitive values for placeholders before sending anything to the AI
  privacyHide: { people: true, contact: true, network: true, serials: true },
  privacyWords: "",    // extra words to hide (customer names, project codes), one per line
  autoRun: true,       // analyze automatically when a Jira issue opens
  serverField: "",     // optional Jira field name/id holding the server name
  locationField: "",   // optional Jira field name/id holding the location
  teamContext: "",     // runbooks / team notes appended to the prompt
  customInstructions: "", // extra free-form instructions added to every prompt
  pingAuto: true,      // ping the server's IP addresses automatically when a brief is shown
  bmcUrl: "https://{ip}", // how to open a BMC web UI; {ip} is replaced
  bmcUser: "ADMIN",    // username for the BMC login (the password is pasted in the panel)
  netboxEnabled: true,
  netboxUrl: "https://netbox.prod.lambdalabs.cloud",
  netboxToken: "",     // optional; by default your NetBox browser login is used
  podcrawlerUrl: "https://podcrawler.aws.lambdalabs.cloud/#/racking",
  podcrawlerStep: true, // add a "rescan in Podcrawler" step to replacement tickets
  // Lambda parts catalog (Google Sheet shared by link): Lambda P/N ↔ manufacturer P/N ↔ description
  catalogUrl: "https://docs.google.com/spreadsheets/d/1HkdgvcwHJ-HuDR90mmsVTNbuUqEtjRmYWpKF5hgCDAY/edit#gid=613788530",
  slackIn: "browser",  // clicking a name opens the chat in Slack in Chrome ("browser") or just opens the desktop app ("app")
  // Appearance (Settings → Appearance; applied right away, see applyLook)
  theme: "system",     // system | light | dark
  accent: "lambda",    // lambda | blue | teal | green | orange | pink | graphite
  sectionColors: "colorful", // colorful (each section its own colour) | plain (all in the accent colour)
  layout: "glance",    // glance (At a glance + details folded) | open (everything open) | classic (no At a glance, everything open)
  density: "comfortable", // comfortable | compact
  textSize: "normal",  // small | normal | large
  jumpBar: true        // the row of section chips under the header
};

// ---------- Appearance ----------
// Theme, colours and layout as data-* attributes on <html> (styles.css → Appearance). Also kept in localStorage
// so the page starts in the right theme before chrome.storage answers, and re-applied when Settings change.
const LOOK_KEYS = ["theme", "accent", "sectionColors", "layout", "density", "textSize", "jumpBar"];

function applyLook(s) {
  const d = document.documentElement.dataset;
  const set = (k, v) => (v ? (d[k] = v) : delete d[k]);
  set("theme", s.theme === "system" ? "" : s.theme);
  set("accent", s.accent === "lambda" ? "" : s.accent);
  set("sections", s.sectionColors === "plain" ? "plain" : "");
  set("layout", s.layout);
  set("density", s.density === "compact" ? "compact" : "");
  set("text", s.textSize === "normal" ? "" : s.textSize);
  set("jump", s.jumpBar === false ? "off" : "");
  try { localStorage.setItem("look", JSON.stringify(Object.fromEntries(LOOK_KEYS.map((k) => [k, s[k]])))); } catch {}
  if (["open", "classic"].includes(s.layout)) document.querySelectorAll("#result details.fold").forEach((x) => (x.open = true));
}

if (typeof document !== "undefined") {
  try { applyLook({ ...DEFAULTS, ...JSON.parse(localStorage.getItem("look") || "{}") }); } catch {}
  const load = () => chrome.storage.local.get(LOOK_KEYS).then((st) => applyLook({ ...DEFAULTS, ...st }));
  load();
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && LOOK_KEYS.some((k) => k in ch)) load(); });
}

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const s = { ...DEFAULTS, ...stored, privacyHide: { ...DEFAULTS.privacyHide, ...(stored.privacyHide || {}) } };
  if (!AI_CHATS[s.aiChat]) s.aiChat = DEFAULTS.aiChat;
  return s;
}

// "Claude", "ChatGPT" or "Gemini": the chat that answers.
function aiChatName(s) {
  return (AI_CHATS[s.aiChat] || AI_CHATS.claude).label;
}

// Nothing to set up any more (no key): the AI is used whenever it's switched on. Kept for older callers.
function missingConfig() {
  return "";
}

const aiActive = (s) => s.aiEnabled !== false;

// Keyboard shortcuts as shown in hints (Mac vs Windows/Linux).
const IS_MAC = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || "");
const IS_WIN = /win/i.test(navigator.userAgentData?.platform || navigator.platform || "");
// Installed from the Chrome Web Store (Chrome adds update_url): the store updates it, and its files live in the profile.
const IS_STORE = "update_url" in chrome.runtime.getManifest();
const KEYS = IS_MAC
  ? { paste: "⌘V", quickAccess: "⌘⇧Space", slackSearch: "⌘K" }
  : { paste: "Ctrl+V", quickAccess: "Ctrl+Shift+Space", slackSearch: "Ctrl+K" };

// ---------- Developer contact ----------
// The extension's developer: help, bugs and feature ideas. Linked at the bottom of the panel and of Settings.
const DEVELOPER = { name: "Hadi Khodja", slack: "https://lambda.slack.com/team/U0AAMLCUCUA" };
function fillDevContact() {
  for (const el of document.querySelectorAll(".dev-contact")) {
    const a = Object.assign(document.createElement("a"), { href: DEVELOPER.slack, target: "_blank", rel: "noopener", textContent: `${DEVELOPER.name} on Slack` });
    el.replaceChildren("💬 Help, bugs or feature ideas? Message ", a);
  }
}

// ---------- Commands that run in the extension's folder ----------
// They find the lambda-rackside folder themselves, wherever it was unzipped (Desktop, Downloads…): the browser
// records the folder of an unpacked extension, by extension ID, in each profile's preferences.
function browserDataDir() {
  const edge = /\bEdg\//.test(navigator.userAgent), brave = !!navigator.brave;
  if (IS_WIN) return `$env:LOCALAPPDATA\\${edge ? "Microsoft\\Edge" : brave ? "BraveSoftware\\Brave-Browser" : "Google\\Chrome"}\\User Data`;
  return `~/Library/Application\\ Support/${edge ? "Microsoft\\ Edge" : brave ? "BraveSoftware/Brave-Browser" : "Google/Chrome"}`;
}

// mac / win: the command to run once the folder is found, as "$d" (Terminal on a Mac, PowerShell on Windows).
function folderCommand(mac, win) {
  const id = chrome.runtime.id, dir = browserDataDir();
  if (IS_STORE) {
    // A store install is unpacked by Chrome into <profile>/Extensions/<id>/<version>_0.
    const ver = chrome.runtime.getManifest().version;
    if (IS_WIN) {
      return `$id='${id}'; $d = Resolve-Path "${dir}\\*\\Extensions\\${id}\\${ver}_*" -ErrorAction SilentlyContinue | Select-Object -Last 1 | % { $_.Path }; ` +
        `if ($d) { ${win} } else { 'Lambda Rackside folder not found: see Settings' }`;
    }
    const base = IS_MAC ? dir : "~/.config/google-chrome";
    return `d=$(ls -d ${base}/*/Extensions/${id}/${ver}_* 2>/dev/null | tail -1); ` +
      `if [ -n "$d" ]; then ${mac}; else echo "Lambda Rackside folder not found: see Settings"; fi`;
  }
  if (IS_WIN) {
    return `$id='${id}'; $d = Get-ChildItem "${dir}\\*\\Secure Preferences","${dir}\\*\\Preferences" -ErrorAction SilentlyContinue | ` +
      `% { if ((Get-Content -Raw $_.FullName) -match ('"' + $id + '":\\{.*?"path":"([^"]*)"')) { [regex]::Unescape($Matches[1]) } } | Select-Object -First 1; ` +
      `if ($d) { ${win} } else { 'lambda-rackside folder not found: see Settings' }`;
  }
  if (!IS_MAC) return `d=~/Desktop/lambda-rackside; ${mac}`; // Linux: adjust the path
  return `for f in ${dir}/*/Secure\\ Preferences ${dir}/*/Preferences; do d=$(plutil -extract extensions.settings.${id}.path raw -o - "$f" 2>/dev/null) && break; done; ` +
    `if [ -n "$d" ]; then ${mac}; else echo "lambda-rackside folder not found: see Settings"; fi`;
}

// ---------- Updates ----------
// The latest version is read from the private GitHub repo with the user's own GitHub login in Chrome, so only
// people who can see the repo get it. Checked at most every 2 hours (in the background, and when the panel opens).
const UPDATE_REPO = "MarshallStunt/lambda-rackside";
const UPDATE_EVERY_MS = 2 * 60 * 60 * 1000;
const UPDATE_LINKS = {
  changes: `https://github.com/${UPDATE_REPO}/commits/main`,
  zip: `https://github.com/${UPDATE_REPO}/archive/refs/heads/main.zip`
};

function isNewerVersion(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// { ok, latest, current, available, error, at }
async function checkForUpdate(force = false) {
  const current = chrome.runtime.getManifest().version;
  if (IS_STORE) return { ok: true, store: true, latest: current, current, available: false, at: Date.now() };
  const { updateCheck } = await chrome.storage.local.get("updateCheck");
  let r = updateCheck;
  if (force || !r || Date.now() - r.at > UPDATE_EVERY_MS) {
    try {
      // Redirects to a short-lived raw.githubusercontent.com link when the GitHub login can see the repo.
      const res = await fetch(`https://github.com/${UPDATE_REPO}/raw/main/manifest.json`, { credentials: "include", cache: "no-store" });
      if (res.status === 404) throw new Error("sign in to GitHub in Chrome with an account that can see the lambda-rackside repo");
      if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}`);
      const latest = (await res.json().catch(() => ({}))).version;
      if (!latest) throw new Error("sign in to GitHub in Chrome with an account that can see the lambda-rackside repo");
      r = { ok: true, latest, at: Date.now() };
    } catch (e) {
      r = { ok: false, error: e.message, at: Date.now() };
    }
    await chrome.storage.local.set({ updateCheck: r });
  }
  return { ...r, current, available: !!r.ok && isNewerVersion(r.latest, current) };
}

// Red "NEW" badge on the toolbar icon while a newer version is waiting (not after "Later" for that version).
async function showUpdateBadge(u) {
  const { updateLater } = await chrome.storage.local.get("updateLater");
  const on = !!u.available && updateLater !== u.latest;
  await chrome.action.setBadgeText({ text: on ? "NEW" : "" });
  if (on) await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  await chrome.action.setTitle({ title: on ? `Lambda Rackside: version ${u.latest} is available` : "Lambda Rackside" });
}

// One click: download the new version with the GitHub login, then the helper puts it in the extension's folder
// (or runs git pull in a git copy) and updates itself. Returns the helper's answer.
async function updateNow() {
  const res = await fetch(UPDATE_LINKS.zip, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 404 ? "sign in to GitHub in Chrome with an account that can see the repo" : `GitHub answered HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await sendNative({ action: "self_update", zip: btoa(bin) });
  if (!r.ok && (/unknown action/i.test(r.error || "") || r.notInstalled)) {
    throw new Error("the helper on this computer is too old (or not installed) to update by itself: use “Update by hand” below once");
  }
  if (!r.ok) throw new Error(r.error);
  return r;
}

// The update steps (shared by the panel banner and Settings): Update now, or by hand.
function updateSteps() {
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(Boolean)); return e; };
  const status = el("span", { className: "muted" });
  const now = el("button", { type: "button", className: "primary", textContent: "⬇️ Update now" });
  now.onclick = async () => {
    now.disabled = true;
    status.style.color = "";
    status.textContent = "Downloading from GitHub and installing…";
    try {
      const r = await updateNow();
      status.textContent = `✓ Updated${r.method === "git" ? " (git pull)" : ` (${r.files} files)`}${r.helper ? `, helper ${r.helper}` : ""}. Reloading the extension: reopen this panel.`;
      setTimeout(() => chrome.runtime.reload(), 1500);
    } catch (e) {
      status.textContent = `Couldn't update: ${e.message}.`;
      status.style.color = "var(--err)";
      now.disabled = false;
    }
  };

  // By hand: git copies pull; ZIP copies get the new ZIP downloading and their folder opened.
  const zipNote = "Not a git copy: the new ZIP is downloading. Unzip it and copy its files into the folder that just opened, then reload the extension.";
  const cmd = folderCommand(
    `if [ -d "$d/.git" ]; then git -C "$d" pull; else open "${UPDATE_LINKS.zip}"; open "$d"; echo "${zipNote}"; fi`,
    `if (Test-Path "$d\\.git") { git -C "$d" pull } else { Start-Process '${UPDATE_LINKS.zip}'; explorer.exe $d; '${zipNote}' }`);
  const copy = el("button", { type: "button", className: "mini", textContent: "Copy" });
  copy.onclick = async () => { await navigator.clipboard.writeText(cmd); copy.textContent = "Copied ✓"; setTimeout(() => (copy.textContent = "Copy"), 1500); };
  const reload = el("button", { type: "button", className: "mini", textContent: "🔄 Reload extension" });
  reload.onclick = () => chrome.runtime.reload();
  return el("div", { className: "update-steps" },
    el("div", { className: "row update-now" }, now, status),
    el("details", {},
      el("summary", {}, "Update by hand"),
      el("ol", {},
        el("li", {}, "Paste this in ", IS_WIN ? "PowerShell" : "Terminal", ". It finds your lambda-rackside folder and pulls (git copy) or downloads the new ZIP and opens the folder (ZIP copy):",
          el("div", { className: "row" }, el("input", { type: "text", readOnly: true, className: "mono", value: cmd }), copy),
          "Or ", el("a", { href: UPDATE_LINKS.zip, target: "_blank", textContent: "download the ZIP" }), " and copy its files over your lambda-rackside folder."),
        el("li", {}, reload, " then reopen this panel."),
        el("li", { className: "muted" }, "If ping or BMC then says the helper is out of date, run the setup command again (Settings → Start)."))));
}

// ---------- HTTP helpers ----------

// Best-effort parse of a JSON object that is still being streamed: closes open strings, arrays and
// objects, dropping a half-written key/value at the end. Returns null if nothing usable yet.
function parsePartialJson(text) {
  const t = String(text || "");
  let s = t.slice(Math.max(0, t.indexOf("{")));
  if (!s.startsWith("{")) return null;
  for (let tries = 0; tries < 8 && s; tries++) {
    const closers = [];
    let inStr = false, esc = false, cut = 1;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") { closers.push(c === "{" ? "}" : "]"); cut = i + 1; }
      else if (c === "}" || c === "]") closers.pop();
      else if (c === ",") cut = i;
    }
    const body = (inStr && !esc ? s + '"' : s).replace(/[\s,:]+$/, "");
    try {
      return JSON.parse(body + closers.reverse().join(""));
    } catch {
      s = s.slice(0, cut); // drop the incomplete tail and try again
    }
  }
  return null;
}

// Pull a JSON object out of model text (handles ```json fences and <think> blocks).
function parseJsonLoose(text) {
  let t = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1];
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The chat didn't answer in the expected format. Try Re-analyze.");
  return JSON.parse(t.slice(start, end + 1));
}

// ---------- AI requests (through the browser chat, webchat.js) ----------
// The panel shows progress and "sign in to Claude" messages through this hook (set by the side panel).
let aiNoteHook = null;

function aiModelLabel(s) {
  return `${aiChatName(s)} (your browser chat)`;
}

// A JSON answer: the schema goes in the request, the answer is read from the chat's code block.
// onPartial(obj) gets the partly written result while the chat writes. Returns { result, model }.
async function generateStructured(s, { system, user, schema, onPartial, signal }) {
  if (typeof LambdaWebChat === "undefined") throw new Error("The AI works in the side panel and Settings only.");
  let last = 0;
  const text = await LambdaWebChat.ask({
    site: s.aiChat, signal,
    system: `${system}\n\nAnswer with ONLY one JSON object in a single \`\`\`json code block written right in your reply (not in an artifact, canvas or file), no text before or after it. Do not use tools or web search. It must match this JSON Schema:\n${JSON.stringify(schema)}`,
    user,
    onNote: (t, needsYou) => aiNoteHook?.(t, needsYou),
    onText: (full) => {
      if (!onPartial || Date.now() - last < 150) return;
      last = Date.now();
      const obj = parsePartialJson(full.replace(/^[\s\S]*?```(?:json)?/i, ""));
      if (obj) onPartial(obj);
    }
  });
  if (!text) throw new Error(`${aiChatName(s)} returned an empty answer.`);
  return { result: parseJsonLoose(text), model: aiModelLabel(s) };
}

// Free text. messages: [{ role: "user" | "assistant", content }], the last one is the question.
// conversation: an id (a ticket's chat) so follow-ups continue the same chat. Returns { text, model }.
async function generateText(s, { system, messages, conversation, signal }) {
  if (typeof LambdaWebChat === "undefined") throw new Error("The AI works in the side panel and Settings only.");
  const history = messages.slice(0, -1), user = messages.at(-1)?.content || "";
  const text = (await LambdaWebChat.ask({ site: s.aiChat, system: `${system}\nWrite the answer right in your reply (no artifact, canvas or file).`, user, history, conversation, signal,
    onNote: (t, needsYou) => aiNoteHook?.(t, needsYou) })).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!text) throw new Error(`${aiChatName(s)} returned an empty answer.`);
  return { text, model: aiModelLabel(s) };
}
