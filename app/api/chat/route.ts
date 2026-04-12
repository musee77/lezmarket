// app/api/chat/route.ts

import { getOpenAIClient } from "@/lib/openai";
import { chatRateLimiter } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { principlesData } from "@/lib/principles-data";

export async function POST(req: Request) {
    try {
        const { messages, analysisId, principleSlug } = await req.json();

        // Get IP address for rate limiting
        const headerList = await headers();
        const forwardedFor = headerList.get("x-forwarded-for");
        const ip = forwardedFor ? forwardedFor.split(",")[0] : "anonymous";

        const { success, remaining } = chatRateLimiter.check(5, ip); // 5 requests per minute per IP

        if (!success) {
            return NextResponse.json(
                { error: "Too many requests. Please try again in a minute." },
                { status: 429, headers: { "X-RateLimit-Limit": "5", "X-RateLimit-Remaining": "0" } }
            );
        }

        // Fetch analysis context if provided
        let analysisContext = "";
        if (analysisId) {
            const supabase = await createClient();
            const { data: analysis } = await supabase
                .from('analyses')
                .select(`
          *,
          websites (url)
        `)
                .eq('id', analysisId)
                .single();

            if (analysis) {
                analysisContext = `
USER IS CURRENTLY VIEWING THIS ANALYSIS:
Website URL: ${analysis.websites?.url}
Overall Score: ${analysis.overall_score}

Psychological Principle Scores (0-100):
${Object.values(analysis.principle_scores).map((p: any) => `- ${p.name}: ${p.score} (${p.explanation})`).join('\n')}

Top Recommendations:
${analysis.recommendations.slice(0, 3).map((r: any) => `- ${r.title}: ${r.description}`).join('\n')}

Please use this data to answer questions about the specific website analysis the user is viewing.
`;
            }
        }

        // Fetch principle context if provided
        let principleContext = "";
        if (principleSlug && principlesData[principleSlug]) {
            const p = principlesData[principleSlug];
            principleContext = `
USER IS CURRENTLY VIEWING THIS PRINCIPLE:
Principle: ${p.name}
Description: ${p.description}
What is it: ${p.whatIs}
Impact: ${p.impactStat}

Best Practices:
${p.bestPractices.map(bp => `- ${bp}`).join('\n')}

${p.warning ? `Warning: ${p.warning.title} - ${p.warning.content}` : ''}

Please use this detailed information to explain how this principle works and how to apply it.
`;
        }

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json(
                { error: "Messages are required and must be an array" },
                { status: 400 }
            );
        }

        const systemPrompt = `You are the lez Market AI Assistant. Your goal is to help users understand and use the lez Market platform.

About lez Market:
- It's an AI-powered platform for website analysis and marketing copy generation.
- It analyzes websites using 6 marketing psychology principles: Social Proof, Loss Aversion, Authority, Scarcity/Urgency, Cognitive Ease, and Pricing Psychology.
- It generates headlines, CTAs, and actionable recommendations.
- It helps users create marketing campaigns and social media posts.
- Key features include: Website Analyzer, Campaign Generator, Social Media Scheduler, and Copy Optimizer.

Your tone:
- Professional, helpful, friendly, and expert.
- Concise but informative.
- If you don't know something about the user's specific data, ask them for details or guide them to the relevant section of the dashboard.

Guidelines:
- Don't make up features that don't exist.
- Focus on how lez Market improves conversion rates through psychology.
- If asked for technical support, guide them to contact support@lezmarket.ai.

${analysisContext}
${principleContext}`;

        const response = await getOpenAIClient().chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                ...messages
            ],
            temperature: 0.7,
        });

        const botMessage = response.choices[0].message;

        return NextResponse.json({ message: botMessage });
    } catch (error: any) {
        console.error("Chat API error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
