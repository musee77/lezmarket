// lib/openai.ts

import OpenAI from 'openai';

let _openai: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

export async function analyzeWebsiteContent(content: string) {
  const systemPrompt = `You are a world-class marketing psychologist and conversion copywriter.
Analyze the provided website content and evaluate it based on these 6 psychological conversion principles (score each 0-100):

1. Social Proof: testimonials, user counts, logos, case studies.
2. Loss Aversion: what the user loses by not using the product, costs of inaction.
3. Authority: credentials, certifications, years in business, awards.
4. Scarcity/Urgency: limited time offers, limited spots, stock levels (USE ONLY IF FOUND IN SOURCE).
5. Cognitive Ease: clarity of message, simple language, easy next steps.
6. Pricing Psychology: price framing, 3-tier structure, anchoring.

CRITICAL INSTRUCTIONS FOR CONTENT GENERATION:
- GROUNDING: Every piece of copy you generate MUST be based on the specific product or service described in the source text.
- NO GENERIC TROPES: Avoid generic marketing placeholders like "Limited spots left" or "247 spots left" unless they are literally in the source text.
- SUBSTANCE: Move beyond simple headlines. Provide content that has depth and business-specific value.

Generate the following:
1. Principle Scores: 0-100 score, explanation, examples from text, and what's missing.
2. Headlines: 5 variations, each tied to a different principle. Blend the principle with the SPECIFIC business value.
3. CTAs: 3 specific, action-oriented call-to-actions.
4. Value Propositions: 5 unique selling points discovered in the text.
5. Pain Points: 5 specific problems this business solves for its users.
6. Social Post Drafts: 3 short, punchy drafts (150-250 chars) for social media that sound like they were written by the business owner.

Return ONLY valid JSON with this exact structure:
{
  "overallScore": number,
  "principleScores": {
    "socialProof": { "name": "Social Proof", "score": number, "explanation": string, "examples": [string], "missing": [string] },
    "lossAversion": { "name": "Loss Aversion", "score": number, "explanation": string, "examples": [string], "missing": [string] },
    "authority": { "name": "Authority", "score": number, "explanation": string, "examples": [string], "missing": [string] },
    "scarcity": { "name": "Scarcity/Urgency", "score": number, "explanation": string, "examples": [string], "missing": [string] },
    "cognitiveEase": { "name": "Cognitive Ease", "score": number, "explanation": string, "examples": [string], "missing": [string] },
    "pricingPsychology": { "name": "Pricing Psychology", "score": number, "explanation": string, "examples": [string], "missing": [string] }
  },
  "generatedCopy": {
    "headlines": [{ "copy": string, "principle": string, "impactScore": number, "difficulty": "easy" | "medium" | "hard" }],
    "ctas": [{ "copy": string, "principle": string, "impactScore": number, "difficulty": "easy" | "medium" | "hard" }],
    "valueProps": [{ "copy": string, "description": string }],
    "painPoints": [{ "copy": string, "description": string }],
    "postDrafts": [{ "copy": string, "platform": "Twitter/LinkedIn/Facebook" }]
  },
  "recommendations": [{ "title": string, "description": string, "principle": string, "impactScore": number, "difficulty": "easy" | "medium" | "hard", "implementation": string }]
}`;

  const response = await getOpenAIClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze this website content:\n\n${content}` }
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' }
  });

  const result = response.choices[0].message.content;
  return JSON.parse(result || '{}');
}