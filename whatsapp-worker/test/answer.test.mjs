import assert from "node:assert/strict";
import { answerQuestion, buildKnowledgeFromObjects } from "../src/worker.js";

const knowledge = buildKnowledgeFromObjects({
  herbs: [
    {
      name: "Ajwain",
      sanskritName: "Yavani",
      commonName: "Carom seed",
      botanicalName: "Trachyspermum ammi",
      traditionalUses: ["gas", "bloating", "digestive support"],
      cautions: ["Heating; caution with acidity"],
      contraindications: ["Pregnancy without practitioner review"],
      sourceRefs: ["API", "CCRAS"],
      riskLevel: "caution",
      doshaEffect: ["vata", "kapha"]
    },
    {
      name: "Amalaki",
      sanskritName: "Amalaki",
      commonName: "Indian gooseberry",
      botanicalName: "Phyllanthus emblica",
      traditionalUses: ["pitta support", "rasayana"],
      cautions: ["Medicine review if chronic illness"],
      contraindications: ["Known allergy"],
      sourceRefs: ["API"],
      riskLevel: "low",
      doshaEffect: ["pitta"]
    }
  ],
  formulations: [
    {
      name: "Hingvastak Churna",
      category: "Digestive formulation",
      ingredients: ["Hingu", "Trikatu", "Ajwain"],
      traditionalIndication: "Traditionally used for gas and bloating",
      cautions: ["Heating; caution with acidity"],
      contraindications: ["Pregnancy without practitioner review"],
      sourceRefs: ["AFI"],
      riskLevel: "caution",
      doshaRelevance: ["vata", "kapha"]
    }
  ],
  contraindications: [
    {
      key: "pregnancy",
      context: "Pregnancy",
      triggers: ["pregnant", "pregnancy"],
      riskLevel: "physician-only"
    },
    {
      key: "known-allergies",
      context: "Known allergies",
      triggers: ["allergy", "allergic"],
      riskLevel: "caution"
    }
  ],
  symptomMap: {
    bloating: { dosha: "vata", supportiveOptions: ["Hingvastak", "Ajwain"] },
    acidity: { dosha: "pitta", supportiveOptions: ["Amalaki"] }
  },
  sources: [{ id: "API", title: "Ayurvedic Pharmacopoeia of India" }]
});

const noAllergy = await answerQuestion("I have bloating after meals and no allergies.", {}, knowledge);
assert.equal(noAllergy.redFlag, false);
assert.match(noAllergy.answer, /Hingvastak|Yavani|Ajwain/i);
assert.doesNotMatch(noAllergy.answer, /hard-stop/i);

const caution = await answerQuestion("I have bloating and an allergy to sesame.", {}, knowledge);
assert.equal(caution.redFlag, false);
assert.match(caution.answer, /caution/i);

const pregnancy = await answerQuestion("I am pregnant and have bloating.", {}, knowledge);
assert.equal(pregnancy.hardStop, true);
assert.doesNotMatch(pregnancy.answer, /Hingvastak|Yavani|Ajwain/i);

const redFlag = await answerQuestion("I have chest pain and severe breathlessness.", {}, knowledge);
assert.equal(redFlag.redFlag, true);
assert.match(redFlag.answer, /medical care promptly/i);

console.log("answer tests passed");
