const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

const FALLBACK_MESSAGE = 'AI summary unavailable, doctor can review symptoms manually';

const cleanJson = text => text.replace(/```json/gi, '').replace(/```/g, '').trim();

const validUrgency = value => ['Low', 'Medium', 'High'].includes(value) ? value : 'Unknown';

const preVisitFallback = () => ({
  urgency: 'Unknown',
  chiefComplaint: FALLBACK_MESSAGE,
  suggestedQuestions: [],
  rawOutput: FALLBACK_MESSAGE,
  provider: 'none',
  available: false
});

const postVisitFallback = notes => ({
  text: `${FALLBACK_MESSAGE}.\n\nClinical notes from your doctor:\n${notes}`,
  provider: 'none',
  available: false
});

const askGemini = async prompt => {
  if (process.env.LLM_ENABLED !== 'true' || !process.env.GEMINI_API_KEY) return null;
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
};

const askOpenAI = async (prompt, json = false) => {
  if (process.env.LLM_ENABLED !== 'true' || !process.env.OPENAI_API_KEY) return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    ...(json ? { response_format: { type: 'json_object' } } : {})
  });
  return response.choices[0]?.message?.content?.trim() || null;
};

const analyzeSymptoms = async symptoms => {
  const prompt = `Analyse these symptoms and return: urgency level Low/Medium/High, chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}\n\nReturn only JSON with keys urgency, chiefComplaint, and suggestedQuestions.`;

  for (const provider of ['gemini', 'openai']) {
    try {
      const text = provider === 'gemini' ? await askGemini(prompt) : await askOpenAI(prompt, true);
      if (!text) continue;
      const parsed = JSON.parse(cleanJson(text));
      if (!parsed.chiefComplaint || !Array.isArray(parsed.suggestedQuestions)) throw new Error('Unexpected AI response shape');
      return {
        urgency: validUrgency(parsed.urgency),
        chiefComplaint: String(parsed.chiefComplaint).slice(0, 500),
        suggestedQuestions: parsed.suggestedQuestions.slice(0, 3).map(String),
        rawOutput: text,
        provider,
        available: true
      };
    } catch (error) {
      console.warn(`[LLM] ${provider} pre-visit request failed: ${error.message}`);
    }
  }
  return preVisitFallback();
};

const generatePostVisitSummary = async notes => {
  const prompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notes}`;

  for (const provider of ['gemini', 'openai']) {
    try {
      const text = provider === 'gemini' ? await askGemini(prompt) : await askOpenAI(prompt);
      if (text) return { text, provider, available: true };
    } catch (error) {
      console.warn(`[LLM] ${provider} post-visit request failed: ${error.message}`);
    }
  }
  return postVisitFallback(notes);
};

module.exports = { FALLBACK_MESSAGE, analyzeSymptoms, generatePostVisitSummary };