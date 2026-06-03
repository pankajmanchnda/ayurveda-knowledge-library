const DEFAULT_KNOWLEDGE_BASE_URL = "https://pankajmanchnda.github.io/ayurveda-knowledge-library/";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_WHATSAPP_CHARS = 1450;

const DATA_FILES = {
  herbs: "data/herbs.json",
  herbsExtra: "data/herbs_extra.json",
  formulations: "data/formulations.json",
  formulationsExtra: "data/formulations_extra.json",
  contraindications: "data/contraindications.json",
  symptomMap: "data/symptom_map.json",
  sources: "data/sources.json"
};

const redFlags = [
  "chest pain",
  "severe breathlessness",
  "fainting",
  "blood in stool",
  "blood in urine",
  "severe abdominal pain",
  "high fever",
  "pregnancy complications",
  "sudden weakness",
  "confusion",
  "uncontrolled vomiting",
  "severe allergic reaction",
  "anaphylaxis",
  "shortness of breath",
  "black stool",
  "vomiting blood"
];

let knowledgeCache = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "ayurveda-whatsapp-worker" });
    }

    if (request.method === "GET" && url.pathname === "/webhook") {
      return verifyWebhook(url, env);
    }

    if (request.method === "POST" && url.pathname === "/ask") {
      const body = await request.json().catch(() => ({}));
      const knowledge = await loadKnowledge(env);
      const result = await answerQuestion(String(body.message || ""), env, knowledge);
      return json(result);
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      const payload = await request.json().catch(() => ({}));
      ctx.waitUntil(handleWhatsAppPayload(payload, env));
      return json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }
};

function verifyWebhook(url, env) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

async function handleWhatsAppPayload(payload, env) {
  const messages = extractIncomingTextMessages(payload);
  if (!messages.length) return;

  const knowledge = await loadKnowledge(env);
  for (const message of messages) {
    const result = await answerQuestion(message.text, env, knowledge);
    await sendWhatsAppText(message.from, result.answer, env);
  }
}

function extractIncomingTextMessages(payload) {
  const messages = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const message of value.messages || []) {
        if (message.type === "text" && message.text?.body && message.from) {
          messages.push({
            from: message.from,
            id: message.id,
            text: message.text.body
          });
        }
      }
    }
  }
  return messages;
}

async function sendWhatsAppText(to, text, env) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("WhatsApp secrets missing; answer was not sent.");
    return;
  }

  const chunks = chunkText(text, MAX_WHATSAPP_CHARS);
  const version = env.WHATSAPP_GRAPH_VERSION || "v24.0";
  const endpoint = `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  for (const chunk of chunks) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: chunk }
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`WhatsApp send failed: ${response.status} ${errorText}`);
    }
  }
}

export async function answerQuestion(message, env = {}, knowledgeInput) {
  const knowledge = knowledgeInput || await loadKnowledge(env);
  const question = message.trim();
  if (!question) {
    return {
      answer: "Please send a brief Ayurveda research question. Include symptoms, medicines, allergies, pregnancy/lactation status, age context, and any known diagnosis when relevant.",
      redFlag: false,
      hardStop: false
    };
  }

  const normalized = normalize(question);
  const flags = redFlags.filter((flag) => hasAffirmedTerm(normalized, flag));
  if (flags.length) {
    return {
      answer: [
        "Seek medical care promptly.",
        `Your message mentions possible red-flag language: ${flags.join(", ")}.`,
        "I cannot suggest herbs or formulations for urgent or potentially serious symptoms. Please contact a qualified clinician or local medical services."
      ].join("\n\n"),
      redFlag: true,
      hardStop: true,
      matches: []
    };
  }

  const safety = detectSafety(normalized, knowledge.contraindications);
  const hardStop = hasHardStopSafety(safety);
  const matches = hardStop ? [] : retrieveGrounding(question, knowledge);
  const fallback = buildRuleAnswer(question, matches, safety, hardStop, knowledge);

  if (hardStop || !shouldUseAi(env)) {
    return { answer: fallback, redFlag: false, hardStop, matches, safety };
  }

  try {
    const aiAnswer = await generateGroundedAnswer(question, matches, safety, env, knowledge);
    return {
      answer: enforceAnswerPolicy(aiAnswer || fallback),
      redFlag: false,
      hardStop: false,
      matches,
      safety
    };
  } catch (error) {
    console.warn(`AI provider failed, using rule answer: ${error.message}`);
    return { answer: fallback, redFlag: false, hardStop: false, matches, safety };
  }
}

function shouldUseAi(env) {
  if (env.AI_PROVIDER === "openrouter") return Boolean(env.OPENROUTER_API_KEY);
  if (env.AI_PROVIDER === "hermes") return Boolean(env.HERMES_BASE_URL);
  return false;
}

async function generateGroundedAnswer(question, matches, safety, env, knowledge) {
  const messages = [
    {
      role: "system",
      content: systemPrompt()
    },
    {
      role: "user",
      content: [
        `User WhatsApp question:\n${question}`,
        `Safety context:\n${safety.length ? safety.map((item) => `${item.context}: ${item.rule || ""}`).join("\n") : "No safety trigger detected."}`,
        `Retrieved internal library entries:\n${formatMatchesForPrompt(matches)}`,
        `Source catalog:\n${knowledge.sources.slice(0, 10).map((source) => `${source.id || source.title}: ${source.title || source.name || ""}`).join("\n")}`
      ].join("\n\n")
    }
  ];

  if (env.AI_PROVIDER === "hermes") return callHermes(messages, env);
  return callOpenRouter(messages, env);
}

function systemPrompt() {
  return [
    "You are a purpose-built educational Ayurveda support assistant for the Ayurveda Knowledge Library.",
    "Answer only from the retrieved internal library entries and safety rules supplied in the prompt.",
    "Do not diagnose, prescribe, provide emergency treatment, claim treatment/prevention, or invent facts.",
    "Do not provide dosages. Do not recommend bhasma, rasaushadhi, pregnancy protocols, child protocols, or serious disease protocols.",
    "Use phrases such as 'traditionally used for', 'may support', and 'discuss with a qualified vaidya or physician'.",
    "If the provided library entries are insufficient, say the library does not contain enough grounded information.",
    "Keep the answer concise for WhatsApp: safety note, possible pattern lens, supportive options to discuss, sources."
  ].join(" ");
}

async function callOpenRouter(messages, env) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.SITE_URL || DEFAULT_KNOWLEDGE_BASE_URL,
      "X-Title": env.APP_TITLE || "Ayurveda Knowledge Library"
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || "nousresearch/hermes-3-llama-3.1-405b",
      messages,
      temperature: 0.2,
      max_tokens: 550
    })
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callHermes(messages, env) {
  const baseUrl = String(env.HERMES_BASE_URL || "").replace(/\/$/, "");
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (env.HERMES_API_KEY) headers.Authorization = `Bearer ${env.HERMES_API_KEY}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: env.HERMES_MODEL || "hermes",
      messages,
      temperature: 0.2,
      max_tokens: 550
    })
  });
  if (!response.ok) throw new Error(`Hermes ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function buildRuleAnswer(question, matches, safety, hardStop, knowledge) {
  if (hardStop) {
    return [
      "This needs qualified review before herb or formulation options.",
      `Safety context: ${safety.map((item) => item.context).join(", ")}.`,
      "Please consult a qualified physician or Ayurvedic practitioner. I will not suggest herbs or formulations for this context."
    ].join("\n\n");
  }

  const safetyLine = safety.length
    ? `Caution noted: ${safety.map((item) => item.context).join(", ")}. Discuss suitability with a qualified vaidya or physician.`
    : "No major safety trigger was detected from this message.";

  const options = matches.slice(0, 4).map((match) => {
    const item = match.item;
    const title = getTitle(item);
    const context = item.traditionalIndication || toSentence(item.traditionalUses);
    const sources = toSentence(item.sourceRefs);
    return `- ${title}: traditionally used for ${context}. Sources: ${sources || "library source"}.`;
  });

  return [
    "Educational Ayurveda library response, not a diagnosis or prescription.",
    safetyLine,
    options.length ? `Possible supportive options to discuss:\n${options.join("\n")}` : "The library does not contain enough grounded matching information for this question.",
    "No dosages are provided. For persistent, severe, unusual, or worsening symptoms, seek qualified medical review."
  ].join("\n\n");
}

function retrieveGrounding(question, knowledge) {
  const normalized = normalize(question);
  const queryTokens = tokenize(normalized);
  const supportiveNames = new Set();

  Object.entries(knowledge.symptomMap || {}).forEach(([symptom, config]) => {
    if (normalized.includes(normalize(symptom))) {
      (config.supportiveOptions || []).forEach((name) => supportiveNames.add(normalize(name)));
    }
  });

  return knowledge.referenceItems
    .map((item) => ({ item, score: scoreReferenceItem(item, normalized, queryTokens, supportiveNames) }))
    .filter((entry) => entry.score > 0 && entry.item.riskLevel !== "physician-only")
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function scoreReferenceItem(item, normalizedQuery, queryTokens, supportiveNames) {
  const title = normalize(getTitle(item));
  const aliases = [item.name, item.sanskritName, item.commonName].map(normalize).filter(Boolean);
  const content = normalize(JSON.stringify(item));
  let score = 0;

  if (supportiveNames.has(title) || aliases.some((alias) => supportiveNames.has(alias))) score += 20;
  aliases.forEach((alias) => {
    if (alias && normalizedQuery.includes(alias)) score += 10;
  });
  queryTokens.forEach((token) => {
    if (content.includes(token)) score += 1;
  });
  if (item.riskLevel === "low") score += 1;
  return score;
}

async function loadKnowledge(env = {}) {
  const now = Date.now();
  if (knowledgeCache && now - knowledgeCache.loadedAt < CACHE_TTL_MS) return knowledgeCache.value;

  const baseUrl = env.KNOWLEDGE_BASE_URL || DEFAULT_KNOWLEDGE_BASE_URL;
  const data = {};
  for (const [key, path] of Object.entries(DATA_FILES)) {
    const response = await fetch(new URL(path, baseUrl).toString());
    if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
    data[key] = await response.json();
  }

  const value = buildKnowledgeFromObjects(data);
  knowledgeCache = { loadedAt: now, value };
  return value;
}

export function buildKnowledgeFromObjects(data) {
  const herbs = uniqueByTitle([...(data.herbs || []), ...(data.herbsExtra || [])]);
  const formulations = uniqueByTitle([...(data.formulations || []), ...(data.formulationsExtra || [])]);
  return {
    herbs,
    formulations,
    referenceItems: [...herbs, ...formulations],
    contraindications: data.contraindications || [],
    symptomMap: data.symptomMap || {},
    sources: data.sources || []
  };
}

function uniqueByTitle(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalize(getTitle(item));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectSafety(text, rules) {
  return (rules || []).filter((rule) => (rule.triggers || []).some((trigger) => hasAffirmedTerm(text, trigger)));
}

function hasHardStopSafety(safety) {
  return safety.some((rule) => ["pregnancy", "children", "liver-disease", "kidney-disease"].includes(rule.key));
}

function hasAffirmedTerm(text, term) {
  const normalizedText = normalize(text);
  const normalizedTerm = normalize(term);
  let index = normalizedText.indexOf(normalizedTerm);
  while (index !== -1) {
    const before = normalizedText.slice(Math.max(0, index - 48), index);
    const negated = /\b(no|not|none|without|denies|deny|negative for|free of|never)\b[\w\s,;/-]{0,44}$/.test(before);
    if (!negated) return true;
    index = normalizedText.indexOf(normalizedTerm, index + normalizedTerm.length);
  }
  return false;
}

function formatMatchesForPrompt(matches) {
  if (!matches.length) return "No matching internal entries.";
  return matches.map(({ item }, index) => {
    const uses = item.traditionalIndication || toSentence(item.traditionalUses);
    return [
      `${index + 1}. ${getTitle(item)}`,
      `Risk: ${item.riskLevel || "unknown"}`,
      `Dosha: ${toSentence(item.doshaEffect || item.doshaRelevance)}`,
      `Traditional context: ${uses}`,
      `Cautions: ${toSentence(item.cautions)}`,
      `Contraindications: ${toSentence(item.contraindications)}`,
      `Sources: ${toSentence(item.sourceRefs)}`
    ].join("\n");
  }).join("\n\n");
}

function enforceAnswerPolicy(text) {
  return String(text || "")
    .replace(/\b(cure|cures|cured|curing)\b/gi, "support")
    .replace(/\b(treats|treated|treating)\b/gi, "supports")
    .replace(/\bprevents\b/gi, "is traditionally discussed for")
    .trim()
    .slice(0, 3900);
}

function chunkText(text, size) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > size) {
    const splitAt = Math.max(remaining.lastIndexOf("\n", size), remaining.lastIndexOf(" ", size));
    const index = splitAt > 400 ? splitAt : size;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function tokenize(text) {
  const stop = new Set(["the", "and", "for", "with", "have", "from", "this", "that", "what", "can", "help", "after"]);
  return normalize(text).split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !stop.has(token));
}

function getTitle(item) {
  return item.sanskritName || item.name || item.commonName || "Untitled";
}

function toSentence(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value || "");
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
