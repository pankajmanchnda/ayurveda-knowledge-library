const state = {
  herbs: [],
  formulations: [],
  sources: [],
  contraindications: [],
  symptomMap: {},
  doshaSymptoms: {},
  saved: {
    favorites: [],
    compare: [],
    history: []
  }
};

const paths = {
  herbs: "data/herbs.json",
  formulations: "data/formulations.json",
  sources: "data/sources.json",
  contraindications: "data/contraindications.json",
  symptomMap: "data/symptom_map.json",
  doshaSymptoms: "data/dosha_symptoms.json"
};

const storageKey = "ayurvedaKnowledgeLibraryState";
const riskOrder = { low: 1, caution: 2, "physician-only": 3 };

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

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindNavigation();
  bindControls();
  loadSavedState();
  await loadData();
  renderAll();
}

function bindNavigation() {
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");
  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function bindControls() {
  ["herbSearch", "herbDoshaFilter", "herbRiskFilter", "herbSort"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderHerbs);
  });
  ["formulationSearch", "formulationDoshaFilter", "formulationRiskFilter", "formulationSort"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderFormulations);
  });

  document.addEventListener("click", handleActionClick);

  const form = document.getElementById("assessmentForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    runAssessment(new FormData(form));
  });
  form.addEventListener("reset", () => {
    document.getElementById("assessmentResult").innerHTML = "";
  });

  const consultantForm = document.getElementById("consultantForm");
  consultantForm.addEventListener("submit", (event) => {
    event.preventDefault();
    runConsultantGuide(document.getElementById("consultantMessage").value);
  });
  document.querySelectorAll("[data-consultant-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("consultantMessage").value = button.dataset.consultantPrompt;
      runConsultantGuide(button.dataset.consultantPrompt);
    });
  });
  document.getElementById("clearConsultant").addEventListener("click", () => {
    document.getElementById("consultantMessage").value = "";
    document.getElementById("consultantResponse").innerHTML = `<div class="empty-state">The guide will respond here. It checks red flags first, then safety rules, then possible dosha patterns.</div>`;
  });
  setupVoiceInput();
}

async function loadData() {
  try {
    const entries = await Promise.all(
      Object.entries(paths).map(async ([key, path]) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Could not load ${path}`);
        return [key, await response.json()];
      })
    );
    entries.forEach(([key, value]) => {
      state[key] = value;
    });
  } catch (error) {
    if (window.AKL_DATA) {
      Object.assign(state, {
        herbs: window.AKL_DATA.herbs || [],
        formulations: window.AKL_DATA.formulations || [],
        sources: window.AKL_DATA.sources || [],
        contraindications: window.AKL_DATA.contraindications || [],
        symptomMap: window.AKL_DATA.symptomMap || {},
        doshaSymptoms: window.AKL_DATA.doshaSymptoms || {}
      });
      showToast("Loaded bundled data for this local preview.");
      return;
    }
    renderLoadError(error);
  }
}

function renderAll() {
  renderMetrics();
  renderHerbs();
  renderFormulations();
  renderSafetyRules();
  renderSources();
  renderWorkspace();
}

function renderLoadError(error) {
  const message = escapeHtml(error.message || "Data could not be loaded.");
  document.getElementById("herbGrid").innerHTML = `<div class="warning-box">The library data did not load. ${message}</div>`;
  document.getElementById("formulationGrid").innerHTML = `<div class="warning-box">The formulation data did not load. ${message}</div>`;
}

function renderMetrics() {
  document.getElementById("herbMetric").textContent = state.herbs.length;
  document.getElementById("formulationMetric").textContent = state.formulations.length;
  document.getElementById("safetyMetric").textContent = state.contraindications.length;
  document.getElementById("savedMetric").textContent = state.saved.favorites.length;
}

function renderHerbs() {
  const search = normalize(document.getElementById("herbSearch").value);
  const dosha = document.getElementById("herbDoshaFilter").value;
  const risk = document.getElementById("herbRiskFilter").value;
  const sort = document.getElementById("herbSort").value;
  const items = sortItems(state.herbs.filter((item) => matchesFilters(item, search, dosha, risk)), sort);
  document.getElementById("herbCount").textContent = `${items.length} reference item${items.length === 1 ? "" : "s"}`;
  document.getElementById("herbGrid").innerHTML = items.map((item) => renderReferenceCard(item, "herb")).join("");
}

function renderFormulations() {
  const search = normalize(document.getElementById("formulationSearch").value);
  const dosha = document.getElementById("formulationDoshaFilter").value;
  const risk = document.getElementById("formulationRiskFilter").value;
  const sort = document.getElementById("formulationSort").value;
  const items = sortItems(state.formulations.filter((item) => matchesFilters(item, search, dosha, risk)), sort);
  document.getElementById("formulationCount").textContent = `${items.length} formulation${items.length === 1 ? "" : "s"}`;
  document.getElementById("formulationGrid").innerHTML = items.map((item) => renderReferenceCard(item, "formulation")).join("");
}

function matchesFilters(item, search, dosha, risk) {
  const content = normalize(JSON.stringify(item));
  const doshaMatch = !dosha || content.includes(dosha);
  const riskMatch = !risk || item.riskLevel === risk;
  const searchMatch = !search || content.includes(search);
  return doshaMatch && riskMatch && searchMatch;
}

function sortItems(items, sort) {
  return [...items].sort((a, b) => {
    if (sort === "risk") return (riskOrder[a.riskLevel] || 99) - (riskOrder[b.riskLevel] || 99);
    if (sort === "dosha") return getDoshas(a).join(", ").localeCompare(getDoshas(b).join(", "));
    if (sort === "category") return (a.category || "").localeCompare(b.category || "");
    return getTitle(a).localeCompare(getTitle(b));
  });
}

function renderReferenceCard(item, type) {
  const id = itemId(type, item);
  const saved = state.saved.favorites.includes(id);
  const compared = state.saved.compare.includes(id);
  const subtitle = type === "herb"
    ? `${item.commonName} · ${item.botanicalName}`
    : item.category;
  const summary = type === "herb"
    ? item.traditionalUses.join("; ")
    : item.traditionalIndication;

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h3>${escapeHtml(getTitle(item))}</h3>
          <div class="card-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        ${riskBadge(item.riskLevel)}
      </div>
      <div class="badge-row">
        ${getDoshas(item).map((d) => `<span class="badge">${escapeHtml(d)}</span>`).join("")}
      </div>
      <div class="detail-list">
        ${type === "herb" ? `<div><strong>Part used:</strong> ${escapeHtml(item.partUsed)}</div>` : `<div><strong>Ingredients:</strong> ${escapeHtml(item.ingredients.join(", "))}</div>`}
        <div><strong>Traditional context:</strong> ${escapeHtml(summary)}</div>
        <div><strong>Cautions:</strong> ${escapeHtml(item.cautions.join("; "))}</div>
        <div><strong>Sources:</strong> ${escapeHtml(item.sourceRefs.join(", "))}</div>
      </div>
      <div class="card-actions">
        <button class="icon-button ${saved ? "active" : ""}" type="button" data-action="favorite" data-id="${escapeHtml(id)}">${saved ? "Saved" : "Save"}</button>
        <button class="icon-button ${compared ? "active" : ""}" type="button" data-action="compare" data-id="${escapeHtml(id)}">${compared ? "Comparing" : "Compare"}</button>
        <button class="icon-button" type="button" data-action="details" data-id="${escapeHtml(id)}">Details</button>
      </div>
    </article>
  `;
}

function renderSafetyRules() {
  document.getElementById("safetyGrid").innerHTML = state.contraindications
    .map((rule) => `
      <article class="card">
        <div class="card-header">
          <h3>${escapeHtml(rule.context)}</h3>
          ${riskBadge(rule.riskLevel)}
        </div>
        <p>${escapeHtml(rule.rule)}</p>
        <div class="detail-list">
          <div><strong>Common triggers:</strong> ${escapeHtml(rule.triggers.join(", "))}</div>
          <div><strong>Suggested app action:</strong> ${escapeHtml(rule.action)}</div>
        </div>
      </article>
    `)
    .join("");
}

function renderSources() {
  document.getElementById("sourceList").innerHTML = state.sources
    .map((source) => `
      <article class="source-item">
        <strong>${escapeHtml(source.id)} · ${escapeHtml(source.title)}</strong>
        <p>${escapeHtml(source.note)}</p>
      </article>
    `)
    .join("");
}

function renderWorkspace() {
  renderMetrics();
  renderFavorites();
  renderCompare();
  renderHistory();
}

function renderFavorites() {
  const items = state.saved.favorites.map(findItemById).filter(Boolean);
  document.getElementById("favoritesList").innerHTML = items.length
    ? items.map(({ id, item }) => `
        <article class="mini-item">
          <strong>${escapeHtml(getTitle(item))}</strong>
          <p>${escapeHtml(item.riskLevel)} · ${escapeHtml(getDoshas(item).join(", "))}</p>
          <div class="card-actions">
            <button class="text-button" type="button" data-action="details" data-id="${escapeHtml(id)}">Open</button>
            <button class="text-button" type="button" data-action="favorite" data-id="${escapeHtml(id)}">Remove</button>
          </div>
        </article>
      `).join("")
    : `<div class="empty-state">Saved items will appear here.</div>`;
}

function renderCompare() {
  const items = state.saved.compare.map(findItemById).filter(Boolean);
  document.getElementById("compareList").innerHTML = items.length
    ? items.map(({ id, item }) => `
        <article class="compare-item">
          <strong>${escapeHtml(getTitle(item))}</strong>
          ${riskBadge(item.riskLevel)}
          <p><strong>Dosha:</strong> ${escapeHtml(getDoshas(item).join(", "))}</p>
          <p><strong>Cautions:</strong> ${escapeHtml(item.cautions.join("; "))}</p>
          <p><strong>Contraindications:</strong> ${escapeHtml(item.contraindications.join("; "))}</p>
          <div class="card-actions">
            <button class="text-button" type="button" data-action="details" data-id="${escapeHtml(id)}">Details</button>
            <button class="text-button" type="button" data-action="compare" data-id="${escapeHtml(id)}">Remove</button>
          </div>
        </article>
      `).join("")
    : `<div class="empty-state">Choose Compare on up to four items to review them side by side.</div>`;
}

function renderHistory() {
  document.getElementById("historyList").innerHTML = state.saved.history.length
    ? state.saved.history.map((entry) => `
        <article class="mini-item">
          <strong>${escapeHtml(entry.dominant)} · ${escapeHtml(entry.confidence)}</strong>
          <p>${escapeHtml(entry.symptom || "No symptom text saved")}</p>
          <p>${escapeHtml(entry.createdAt)}</p>
        </article>
      `).join("")
    : `<div class="empty-state">Submitted educational assessments will appear here.</div>`;
}

function handleActionClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === "favorite" && id) toggleSaved("favorites", id, "Saved item", "Removed saved item");
  if (action === "compare" && id) toggleCompare(id);
  if (action === "details" && id) openDetails(id);
  if (action === "close-details") closeDetails();
  if (action === "clear-favorites") clearSaved("favorites", "Saved items cleared");
  if (action === "clear-compare") clearSaved("compare", "Compare list cleared");
  if (action === "clear-history") clearSaved("history", "Assessment history cleared");
}

function toggleSaved(key, id, addMessage, removeMessage) {
  const list = state.saved[key];
  const exists = list.includes(id);
  state.saved[key] = exists ? list.filter((item) => item !== id) : [...list, id];
  persistSavedState();
  renderHerbs();
  renderFormulations();
  renderWorkspace();
  showToast(exists ? removeMessage : addMessage);
}

function toggleCompare(id) {
  const exists = state.saved.compare.includes(id);
  if (exists) {
    state.saved.compare = state.saved.compare.filter((item) => item !== id);
    showToast("Removed from compare");
  } else if (state.saved.compare.length >= 4) {
    showToast("Compare is limited to four items.");
  } else {
    state.saved.compare = [...state.saved.compare, id];
    showToast("Added to compare");
  }
  persistSavedState();
  renderHerbs();
  renderFormulations();
  renderWorkspace();
}

function clearSaved(key, message) {
  state.saved[key] = [];
  persistSavedState();
  renderHerbs();
  renderFormulations();
  renderWorkspace();
  showToast(message);
}

function openDetails(id) {
  const found = findItemById(id);
  if (!found) return;
  const { item, type } = found;
  const drawer = document.getElementById("detailDrawer");
  document.getElementById("detailContent").innerHTML = renderDetailPanel(item, type, id);
  drawer.hidden = false;
}

function closeDetails() {
  document.getElementById("detailDrawer").hidden = true;
}

function renderDetailPanel(item, type, id) {
  const title = getTitle(item);
  const saved = state.saved.favorites.includes(id);
  const compared = state.saved.compare.includes(id);
  const isHerb = type === "herb";
  return `
    <div class="card-header">
      <div>
        <p class="eyebrow">${escapeHtml(isHerb ? "Herb detail" : "Formulation detail")}</p>
        <h2>${escapeHtml(title)}</h2>
        <p class="card-subtitle">${escapeHtml(isHerb ? `${item.commonName} · ${item.botanicalName}` : item.category)}</p>
      </div>
      ${riskBadge(item.riskLevel)}
    </div>
    <div class="badge-row">${getDoshas(item).map((d) => `<span class="badge">${escapeHtml(d)}</span>`).join("")}</div>
    <div class="card-actions">
      <button class="icon-button ${saved ? "active" : ""}" type="button" data-action="favorite" data-id="${escapeHtml(id)}">${saved ? "Saved" : "Save"}</button>
      <button class="icon-button ${compared ? "active" : ""}" type="button" data-action="compare" data-id="${escapeHtml(id)}">${compared ? "Comparing" : "Compare"}</button>
    </div>
    <div class="detail-list">
      ${isHerb ? `
        <div><strong>Sanskrit name:</strong> ${escapeHtml(item.sanskritName)}</div>
        <div><strong>Common name:</strong> ${escapeHtml(item.commonName)}</div>
        <div><strong>Botanical name:</strong> ${escapeHtml(item.botanicalName)}</div>
        <div><strong>Part used:</strong> ${escapeHtml(item.partUsed)}</div>
        <div><strong>Rasa:</strong> ${escapeHtml(item.rasa.join(", "))}</div>
        <div><strong>Guna:</strong> ${escapeHtml(item.guna.join(", "))}</div>
        <div><strong>Virya:</strong> ${escapeHtml(item.virya)}</div>
        <div><strong>Vipaka:</strong> ${escapeHtml(item.vipaka)}</div>
        <div><strong>Traditional uses:</strong> ${escapeHtml(item.traditionalUses.join("; "))}</div>
      ` : `
        <div><strong>Category:</strong> ${escapeHtml(item.category)}</div>
        <div><strong>Ingredients:</strong> ${escapeHtml(item.ingredients.join(", "))}</div>
        <div><strong>Traditional indication:</strong> ${escapeHtml(item.traditionalIndication)}</div>
        <div><strong>Anupana:</strong> ${escapeHtml(item.anupana || "Varies by context; practitioner guided")}</div>
      `}
      <div><strong>Cautions:</strong> ${escapeHtml(item.cautions.join("; "))}</div>
      <div><strong>Contraindications:</strong> ${escapeHtml(item.contraindications.join("; "))}</div>
      <div><strong>Sources:</strong> ${escapeHtml(item.sourceRefs.join(", "))}</div>
    </div>
    <div class="warning-box">
      This reference is for educational research only. Discuss suitability with a qualified physician or Ayurvedic practitioner.
    </div>
  `;
}

function runAssessment(formData) {
  const input = Object.fromEntries(formData.entries());
  const text = normalize([
    input.mainSymptom,
    input.medicines,
    input.allergies,
    input.diagnosis,
    input.pregnancy
  ].join(" "));

  const foundRedFlags = redFlags.filter((flag) => text.includes(flag));
  if (foundRedFlags.length || input.severity === "severe") {
    renderRedFlagResult(foundRedFlags, input.severity);
    saveAssessmentHistory({
      symptom: input.mainSymptom,
      dominant: "Safety escalation",
      confidence: input.severity === "severe" ? "high for safety escalation" : "moderate for safety escalation"
    });
    return;
  }

  const scores = scoreDoshas(input, text);
  const dominant = dominantDosha(scores);
  const agni = inferAgni(input);
  const safety = detectSafety(input, text);
  const options = chooseSupportOptions(dominant, text, safety);
  const confidence = confidenceLevel(input, scores);

  renderAssessment({ input, scores, dominant, agni, safety, options, confidence });
  saveAssessmentHistory({ symptom: input.mainSymptom, dominant, confidence });
}

function scoreDoshas(input, text) {
  const scores = { vata: 0, pitta: 0, kapha: 0 };

  Object.entries(state.doshaSymptoms).forEach(([dosha, terms]) => {
    terms.forEach((term) => {
      if (text.includes(normalize(term))) scores[dosha] += 2;
    });
  });

  const mapping = {
    digestion: { irregular: "vata", sharp: "pitta", slow: "kapha" },
    stool: { dry: "vata", loose: "pitta", sticky: "kapha" },
    sleep: { light: "vata", hot: "pitta", heavy: "kapha" },
    stress: { anxious: "vata", irritable: "pitta", withdrawn: "kapha" },
    temperature: { cold: "vata", hot: "pitta", damp: "kapha" }
  };

  Object.entries(mapping).forEach(([field, values]) => {
    const dosha = values[input[field]];
    if (dosha) scores[dosha] += 2;
  });

  if (input.duration === "chronic") scores.vata += 1;
  return scores;
}

function dominantDosha(scores) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === 0) return "mixed/unclear";
  if (sorted[0][1] === sorted[1][1]) return `${sorted[0][0]}-${sorted[1][0]} mixed`;
  return sorted[0][0];
}

function inferAgni(input) {
  if (input.digestion === "irregular") return "Vishama agni pattern may be considered when appetite is irregular with gas or bloating.";
  if (input.digestion === "sharp") return "Tikshna agni pattern may be considered when strong hunger, acidity, or burning are prominent.";
  if (input.digestion === "slow") return "Manda agni or ama tendency may be considered when appetite is slow with heaviness.";
  return "Agni/ama pattern is not clear from the provided answers.";
}

function detectSafety(input, text) {
  const hits = [];
  const age = Number(input.age || 0);
  if (input.pregnancy === "pregnant" || input.pregnancy === "trying") hits.push("pregnancy");
  if (input.pregnancy === "lactating") hits.push("lactation");
  if (age && age < 16) hits.push("children");
  if (age >= 70) hits.push("elderly");

  state.contraindications.forEach((rule) => {
    if (rule.triggers.some((trigger) => text.includes(normalize(trigger)))) hits.push(rule.key);
  });

  return [...new Set(hits)];
}

function chooseSupportOptions(dominant, text, safety) {
  const seriousReview = [
    "pregnancy",
    "lactation",
    "children",
    "liver-disease",
    "kidney-disease",
    "blood-thinners",
    "diabetes-medication",
    "thyroid-medication"
  ];
  if (safety.some((key) => seriousReview.includes(key))) return [];

  const matches = [];
  Object.entries(state.symptomMap).forEach(([symptom, config]) => {
    if (text.includes(normalize(symptom))) matches.push(...config.supportiveOptions);
  });

  if (!matches.length) {
    if (dominant.includes("vata")) matches.push("Triphala", "Dashmool", "Ashwagandha");
    if (dominant.includes("pitta")) matches.push("Amalaki", "Guduchi", "Shatavari");
    if (dominant.includes("kapha")) matches.push("Trikatu", "Punarnava", "Hingvastak");
  }

  const allReferenceItems = [...state.herbs, ...state.formulations];
  return [...new Set(matches)]
    .map((name) => allReferenceItems.find((item) => item.name === name || item.sanskritName === name || item.commonName === name))
    .filter(Boolean)
    .filter((item) => item.riskLevel !== "physician-only")
    .slice(0, 5);
}

function confidenceLevel(input, scores) {
  const answered = ["digestion", "stool", "sleep", "stress", "temperature"].filter((key) => input[key]).length;
  const top = Math.max(...Object.values(scores));
  if (answered >= 4 && top >= 6) return "moderate";
  if (answered >= 3 && top >= 4) return "low to moderate";
  return "low";
}

function renderRedFlagResult(flags, severity) {
  const listed = flags.length ? flags.join(", ") : "severe symptom severity";
  document.getElementById("assessmentResult").innerHTML = `
    <div class="assessment-panel">
      <div class="warning-box">
        <strong>Seek medical care promptly.</strong>
        The assessment detected: ${escapeHtml(listed)}. Herb and formulation suggestions are suppressed because qualified medical review is important.
      </div>
      <div class="result-block">
        <h3>Educational note</h3>
        <p>This tool does not provide emergency treatment or definitive diagnosis. Contact local medical services or a qualified clinician for urgent symptoms.</p>
      </div>
      <div class="result-block">
        <h3>Confidence level</h3>
        <p>${severity === "severe" ? "high for safety escalation" : "moderate for safety escalation"}</p>
      </div>
    </div>
  `;
}

function renderAssessment(result) {
  const safetyText = result.safety.length
    ? result.safety.map((key) => readableSafety(key)).join(", ")
    : "No major safety trigger detected from the provided fields.";
  const optionList = result.options.length
    ? result.options.map((item) => `<li>${escapeHtml(getTitle(item))}: traditionally used for ${escapeHtml((item.traditionalIndication || item.traditionalUses || []).toString())}. Discuss with a qualified vaidya before use.</li>`).join("")
    : "<li>No herb or formulation suggestions shown because practitioner review is preferred for this safety context or the pattern is unclear.</li>";

  document.getElementById("assessmentResult").innerHTML = `
    <div class="assessment-panel">
      <div class="info-box">
        <strong>Educational assessment only.</strong>
        This is a rule-based pattern summary, not a definitive diagnosis or prescription.
      </div>
      <div class="result-grid">
        <div class="result-block">
          <h3>Possible Ayurvedic interpretation</h3>
          <p>The answers suggest a ${escapeHtml(result.dominant)} tendency. Interpret this cautiously and discuss it with a qualified vaidya.</p>
        </div>
        <div class="result-block">
          <h3>Dominant dosha tendency</h3>
          <p>${escapeHtml(result.dominant)} · Vata ${result.scores.vata}, Pitta ${result.scores.pitta}, Kapha ${result.scores.kapha}</p>
        </div>
        <div class="result-block">
          <h3>Agni/ama notes</h3>
          <p>${escapeHtml(result.agni)}</p>
        </div>
        <div class="result-block">
          <h3>Confidence level</h3>
          <p>${escapeHtml(result.confidence)}</p>
        </div>
      </div>
      <div class="result-grid">
        <div class="result-block">
          <h3>Low-risk lifestyle support</h3>
          <ul>${lifestyleSupport(result.dominant).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
        <div class="result-block">
          <h3>Herbs/formulations to discuss with vaidya</h3>
          <ul>${optionList}</ul>
        </div>
      </div>
      <div class="result-block">
        <h3>Avoid/caution list</h3>
        <p>${escapeHtml(safetyText)}</p>
        <p>Avoid self-directed use for pregnancy, children, serious chronic disease, multiple medicines, or known allergies.</p>
      </div>
      <div class="result-block">
        <h3>Source references</h3>
        <p>Charaka Samhita, Ashtanga Hridaya, Ayurvedic Pharmacopoeia of India, Ayurvedic Formulary of India, CCRAS/AYUSH sources, and WHO herbal medicine safety guidance.</p>
      </div>
    </div>
  `;
}

function saveAssessmentHistory(entry) {
  state.saved.history = [
    {
      ...entry,
      createdAt: new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    },
    ...state.saved.history
  ].slice(0, 8);
  persistSavedState();
  renderWorkspace();
}

function lifestyleSupport(dominant) {
  if (dominant.includes("vata")) {
    return ["Regular meals and sleep timing", "Warm cooked foods if tolerated", "Gentle grounding routine and reduced overstimulation"];
  }
  if (dominant.includes("pitta")) {
    return ["Cooling routine and avoiding excess heat exposure", "Regular meals without long fasting", "Calm pacing during work and exercise"];
  }
  if (dominant.includes("kapha")) {
    return ["Light regular movement suited to capacity", "Avoid daytime oversleeping when possible", "Warm simple meals and mindful portions"];
  }
  return ["Track symptoms and triggers", "Prioritize rest, hydration, and regular meals", "Seek qualified review if symptoms persist or worsen"];
}



function setupVoiceInput() {
  const button = document.getElementById("voiceButton");
  const status = document.getElementById("voiceStatus");
  const textarea = document.getElementById("consultantMessage");
  if (!button || !status || !textarea) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    button.disabled = true;
    status.textContent = "Voice input is not supported in this browser. You can still type your note.";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  let listening = false;
  let finalTranscript = "";

  button.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    finalTranscript = textarea.value ? `${textarea.value.trim()} ` : "";
    recognition.start();
  });

  recognition.addEventListener("start", () => {
    listening = true;
    button.textContent = "Stop voice input";
    button.setAttribute("aria-pressed", "true");
    status.textContent = "Listening. Speak naturally, then stop when finished.";
    status.classList.add("listening");
  });

  recognition.addEventListener("result", (event) => {
    let interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += `${transcript.trim()} `;
      else interimTranscript += transcript;
    }
    textarea.value = `${finalTranscript}${interimTranscript}`.trim();
  });

  recognition.addEventListener("end", () => {
    listening = false;
    button.textContent = "Start voice input";
    button.setAttribute("aria-pressed", "false");
    status.textContent = textarea.value ? "Voice note captured. Review it, then generate the educational response." : "Voice input stopped.";
    status.classList.remove("listening");
  });

  recognition.addEventListener("error", (event) => {
    listening = false;
    button.textContent = "Start voice input";
    button.setAttribute("aria-pressed", "false");
    status.textContent = event.error === "not-allowed" ? "Microphone permission was blocked. Allow microphone access in the browser to use voice input." : "Voice input stopped. You can type instead.";
    status.classList.remove("listening");
  });
}

function runConsultantGuide(message) {
  const cleanMessage = message.trim();
  const response = document.getElementById("consultantResponse");
  if (!cleanMessage) {
    response.innerHTML = `<div class="empty-state">Write a short note first. Include symptoms, medicines, allergies, pregnancy/lactation status, and known diagnoses if relevant.</div>`;
    return;
  }

  const text = normalize(cleanMessage);
  const flags = redFlags.filter((flag) => text.includes(flag));
  if (flags.length) {
    response.innerHTML = `
      <div class="consultant-message">
        <div class="warning-box">
          <strong>Seek medical care promptly.</strong> I noticed possible red-flag language: ${escapeHtml(flags.join(", "))}. I will not suggest herbs or formulations for this situation.
        </div>
        <p>This educational guide is not for urgent care, diagnosis, or emergency treatment. Please contact a qualified clinician or local medical services.</p>
      </div>
    `;
    return;
  }

  const input = inferConsultantInput(text);
  const scores = scoreDoshas(input, text);
  const dominant = dominantDosha(scores);
  const agni = inferAgni(input);
  const safety = detectSafety(input, text);
  const options = chooseSupportOptions(dominant, text, safety);
  const safetyText = safety.length ? safety.map(readableSafety).join(", ") : "No major safety trigger detected from this short note.";

  response.innerHTML = `
    <div class="consultant-message">
      <div class="info-box">
        <strong>Vaidya-style educational guide:</strong> I can help organize your note into Ayurveda research patterns, but I cannot diagnose, prescribe, or replace a qualified physician or vaidya.
      </div>
      <h3>What I would clarify first</h3>
      <ul>
        ${consultantQuestions(text).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      <h3>Possible pattern lens</h3>
      <p>Your note leans toward <strong>${escapeHtml(dominant)}</strong>. ${escapeHtml(agni)}</p>
      <h3>Safety screen</h3>
      <p>${escapeHtml(safetyText)}</p>
      <h3>Supportive options to discuss</h3>
      <ul>
        ${renderConsultantOptions(options)}
      </ul>
      <h3>Low-risk next steps</h3>
      <ul>
        ${lifestyleSupport(dominant).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function inferConsultantInput(text) {
  return {
    mainSymptom: text,
    medicines: text,
    allergies: text,
    diagnosis: text,
    pregnancy: text.includes("pregnant") || text.includes("pregnancy") ? "pregnant" : text.includes("breastfeeding") || text.includes("lactating") ? "lactating" : "none",
    duration: text.includes("months") || text.includes("years") || text.includes("chronic") ? "chronic" : "subacute",
    severity: "moderate",
    digestion: text.includes("gas") || text.includes("bloating") || text.includes("irregular appetite") ? "irregular" : text.includes("acidity") || text.includes("burning") || text.includes("strong hunger") ? "sharp" : text.includes("low appetite") || text.includes("heaviness") || text.includes("sluggish") ? "slow" : "",
    stool: text.includes("constipation") || text.includes("hard stool") || text.includes("dry stool") ? "dry" : text.includes("loose stool") || text.includes("diarrhea") ? "loose" : text.includes("sticky stool") ? "sticky" : "",
    sleep: text.includes("insomnia") || text.includes("light sleep") || text.includes("poor sleep") ? "light" : text.includes("sleepy") || text.includes("heavy sleep") ? "heavy" : "",
    stress: text.includes("anxiety") || text.includes("anxious") || text.includes("restless") ? "anxious" : text.includes("irritable") || text.includes("anger") ? "irritable" : text.includes("dull") || text.includes("low motivation") ? "withdrawn" : "",
    temperature: text.includes("cold") || text.includes("dry") ? "cold" : text.includes("hot") || text.includes("heat") || text.includes("burning") ? "hot" : text.includes("damp") || text.includes("mucus") ? "damp" : ""
  };
}

function consultantQuestions(text) {
  const questions = [];
  if (!text.includes("medicine") && !text.includes("medication") && !text.includes("tablet")) questions.push("Are you taking any medicines, supplements, blood thinners, thyroid medicines, diabetes medicines, sedatives, or blood pressure medicines?");
  if (!text.includes("pregnant") && !text.includes("breastfeeding") && !text.includes("lactating")) questions.push("Is there any pregnancy, breastfeeding, child, elderly, liver, kidney, autoimmune, heart, or chronic disease context?");
  if (!text.includes("allerg")) questions.push("Any known allergy to herbs, spices, foods, medicines, or plant families?");
  if (!text.includes("duration") && !text.includes("days") && !text.includes("weeks") && !text.includes("months")) questions.push("How long has this been happening, and is it getting better, worse, or recurring?");
  return questions.slice(0, 4);
}

function renderConsultantOptions(options) {
  if (!options.length) {
    return `<li>I would not list herbs from this note alone. The safety context or pattern needs qualified review first.</li>`;
  }
  return options
    .map((item) => `<li><strong>${escapeHtml(getTitle(item))}</strong> may be worth discussing with a qualified vaidya. Traditional context: ${escapeHtml((item.traditionalIndication || item.traditionalUses || []).toString())}</li>`)
    .join("");
}

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    state.saved = {
      favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
      compare: Array.isArray(saved.compare) ? saved.compare : [],
      history: Array.isArray(saved.history) ? saved.history : []
    };
  } catch {
    state.saved = { favorites: [], compare: [], history: [] };
  }
}

function persistSavedState() {
  localStorage.setItem(storageKey, JSON.stringify(state.saved));
}

function findItemById(id) {
  const [type, ...rest] = String(id).split(":");
  const slug = rest.join(":");
  const collection = type === "herb" ? state.herbs : state.formulations;
  const item = collection.find((candidate) => slugify(getTitle(candidate)) === slug);
  return item ? { id, type, item } : null;
}

function itemId(type, item) {
  return `${type}:${slugify(getTitle(item))}`;
}

function getTitle(item) {
  return item.sanskritName || item.name;
}

function getDoshas(item) {
  return item.doshaEffect || item.doshaRelevance || [];
}

function readableSafety(key) {
  const rule = state.contraindications.find((item) => item.key === key);
  return rule ? rule.context : key.replaceAll("-", " ");
}

function riskBadge(risk) {
  return `<span class="badge risk-${escapeHtml(risk)}">${escapeHtml(risk)}</span>`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
