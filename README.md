# Ayurveda Knowledge Library

Ayurveda Knowledge Library is a free static GitHub Pages MVP for educational Ayurvedic herb and formulation research. It includes searchable reference cards, conservative safety rules, source labels, and a rule-based symptom assessment engine.

## Medical Disclaimer

This tool is for educational research only. It does not diagnose, treat, cure, or prevent disease. Consult a qualified physician or Ayurvedic practitioner before using herbs or formulations, especially if pregnant, breastfeeding, elderly, a child, taking medicines, or managing chronic illness.

## Features

- Static HTML, CSS, JavaScript, and JSON only
- No backend, API keys, paid services, build step, or external libraries
- Herb and formulation libraries with search, dosha filters, and risk filters
- Dynamic browser-only workspace with saved items, comparison, and assessment history
- Rule-based symptom assessment with red-flag suppression
- Contraindication rules for pregnancy, lactation, children, elderly users, medicines, chronic disease, and allergies
- Conservative educational language and source references
- Mobile responsive layout

## File Structure

```text
ayurveda-knowledge-library/
├── index.html
├── style.css
├── script.js
├── README.md
├── data/
│   ├── herbs.json
│   ├── formulations.json
│   ├── dosha_symptoms.json
│   ├── contraindications.json
│   ├── symptom_map.json
│   ├── sources.json
│   └── app-data.js
```

`app-data.js` mirrors the JSON data so the app can also run from a local `file://` preview. GitHub Pages still uses the JSON files directly.

## Run Locally

Because the app loads local JSON files, open it through a simple local web server rather than double-clicking `index.html`.

From this folder:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Deploy to GitHub Pages

This MVP is ready to run from the root folder of the `main` branch.

1. Create a GitHub repository.
2. Put `index.html`, `style.css`, `script.js`, `README.md`, and the `data/` folder at the repository root.
3. Commit and push to `main`.
4. In GitHub, open `Settings`.
5. Open `Pages`.
6. Under `Build and deployment`, choose `Deploy from a branch`.
7. Select branch `main`.
8. Select folder `/root`.
9. Save.

GitHub Pages will publish the static site after the first deployment finishes.

## Safety Design

The app remains fully free and static. Dynamic features use the browser only:

- Saved items are stored in `localStorage`
- Compare selections are stored in `localStorage`
- Assessment history is stored in `localStorage`
- No personal data is sent to a server
- No account, backend, API key, or paid service is used

The assessment engine:

- Checks red flags before any educational suggestions
- Checks contraindication rules second
- Suppresses herb suggestions for high-risk contexts
- Uses only rule-based scoring for Vata, Pitta, and Kapha tendencies
- Does not provide dosages
- Does not recommend emergency treatment
- Does not provide definitive diagnosis or prescriptions

Red flags include chest pain, severe breathlessness, fainting, blood in stool or urine, severe abdominal pain, high fever, pregnancy complications, sudden weakness, confusion, uncontrolled vomiting, and severe allergic reaction.

## Data Notes

The included data is intentionally conservative and designed as a starter reference set. Before using this for public education, have qualified Ayurvedic clinicians, physicians, and safety reviewers validate the content, wording, source mapping, and contraindication rules.
