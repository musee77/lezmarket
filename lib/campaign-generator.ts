// lib/campaign-generator.ts
// AI-powered campaign post generation

import OpenAI from 'openai';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!_openai) {
        _openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return _openai;
}

interface AnalysisData {
    overall_score: number;
    principle_scores: Record<string, any>;
    generated_copy: {
        headlines: any[];
        ctas: any[];
        valueProps: any[];
        painPoints: any[];
        postDrafts: any[];
    };
}

interface GeneratedPost {
    content: string;
    platform: string;
    contentType: string;
}

const PLATFORM_LIMITS = {
    x: 280, // Standard limit for unverified accounts
    linkedin: 3000,
    facebook: 500,
    instagram: 2200,
};

const PLATFORM_STYLES = {
    x: 'concise and punchy, max 280 characters, absolutely no hashtags, conversational tone, use questions or bold statements to drive engagement',
    linkedin: 'professional, insightful, story-driven, use line breaks for readability, include relevant hashtags at the end',
    facebook: 'friendly, engaging, ask questions, encourage comments and shares',
    instagram: 'visual-focused caption, use emojis sparingly, 3-5 hashtags at end, storytelling approach',
};

export async function generateCampaignPosts({
    analysis,
    platforms,
    postsPerPlatform = 3,
    contentTypes = ['post'],
    websiteUrl,
    positioningFocus,
}: {
    analysis: AnalysisData;
    platforms: string[];
    postsPerPlatform?: number;
    contentTypes?: string[];
    websiteUrl?: string;
    positioningFocus?: string;
}): Promise<GeneratedPost[]> {
    const posts: GeneratedPost[] = [];

    // Log what data we're working with
    console.log('Generating posts with context:', {
        websiteUrl,
        positioningFocus,
        headlines: analysis.generated_copy?.headlines?.length,
        valueProps: analysis.generated_copy?.valueProps?.length,
        painPoints: analysis.generated_copy?.painPoints?.length,
    });

    for (const platform of platforms) {
        const limit = PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS] || 500;
        const style = PLATFORM_STYLES[platform as keyof typeof PLATFORM_STYLES] || 'professional';

        // Build context from available data
        const headlinesList = analysis.generated_copy?.headlines || [];
        const ctasList = analysis.generated_copy?.ctas || [];
        const valuePropsList = analysis.generated_copy?.valueProps || [];
        const painPointsList = analysis.generated_copy?.painPoints || [];

        const headlines = headlinesList
            .slice(0, 5)
            .map((h: any) => typeof h === 'string' ? h : h.copy)
            .filter(Boolean)
            .join(' | ');

        const ctas = ctasList
            .slice(0, 5)
            .map((c: any) => typeof c === 'string' ? c : c.copy)
            .filter(Boolean)
            .join(' | ');

        const valueProps = valuePropsList
            .slice(0, 5)
            .map((v: any) => typeof v === 'string' ? v : v.copy || v)
            .filter(Boolean)
            .join(' | ');

        const painPoints = painPointsList
            .slice(0, 5)
            .map((p: any) => typeof p === 'string' ? p : p.copy || p)
            .filter(Boolean)
            .join(' | ');

        const hasContext = headlines || ctas || valueProps;

        console.log(`[${platform}] Building prompt with focus: ${positioningFocus}`);

        const prompt = `You are a social media marketing expert creating posts for a specific business.

WEBSITE URL: ${websiteUrl || 'Unknown'}
${positioningFocus ? `\nPOSITIONING FOCUS: ${positioningFocus}` : ''}

${headlines ? `\nHEADLINES FROM THIS WEBSITE:\n${headlines}` : ''}
${ctas ? `\nCALL-TO-ACTIONS FROM THIS WEBSITE:\n${ctas}` : ''}
${valueProps ? `\nVALUE PROPOSITIONS:\n${valueProps}` : ''}
${painPoints ? `\nPAIN POINTS THIS BUSINESS SOLVES:\n${painPoints}` : ''}

YOUR TASK: Create ${postsPerPlatform} ${platform} posts that promote THIS SPECIFIC BUSINESS.

CRITICAL REQUIREMENTS:
3. DO NOT write generic content - reference specific features/benefits from the data above
4. Maximum ${limit} characters per post
5. Style: ${style}

Return JSON: {"posts": [{"content": "post text here"}]}`;

        try {
            const response = await getOpenAI().chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You create targeted social media posts for ${websiteUrl}. You MUST use the headlines and CTAs provided to create relevant, specific posts about this business. Never generate generic or unrelated content.`
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                response_format: { type: 'json_object' },
            });

            const content = response.choices[0]?.message?.content;
            if (content) {
                const parsed = JSON.parse(content);
                const generatedPosts = parsed.posts || parsed;

                if (Array.isArray(generatedPosts)) {
                    for (const post of generatedPosts) {
                        posts.push({
                            content: post.content || post,
                            platform,
                            contentType: 'post',
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error generating posts for ${platform}:`, error);
            // Re-throw the error so the API can return it to the client for debugging
            throw error;
        }
    }

    return posts;
}

export async function generateSinglePost({
    analysis,
    platform,
    topic,
}: {
    analysis: AnalysisData;
    platform: string;
    topic?: string;
}): Promise<string> {
    const limit = PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS] || 500;
    const style = PLATFORM_STYLES[platform as keyof typeof PLATFORM_STYLES] || 'professional';

    const prompt = `Generate a single ${platform} post.
Topic: ${topic || 'Promote the product/service'}
Max ${limit} characters.
Style: ${style}
Based on: ${analysis.generated_copy?.valueProps?.[0]?.copy || 'marketing content'}

Return only the post text, nothing else.`;

    const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 300,
    });

    return response.choices[0]?.message?.content || '';
}
