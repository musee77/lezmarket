// app/api/cron/publish/test/route.ts
// Manual trigger for testing - bypasses auth for debugging only
// REMOVE OR PROTECT THIS IN PRODUCTION

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const now = new Date();
        const nowISO = now.toISOString();

        // Check for pending posts
        const { data: posts, error: postsError } = await supabase
            .from('campaign_posts')
            .select(`
                id,
                content,
                platform,
                status,
                scheduled_for,
                campaigns (
                    id,
                    name,
                    user_id,
                    status
                )
            `)
            .eq('status', 'pending')
            .order('scheduled_for', { ascending: true })
            .limit(20);

        if (postsError) {
            return NextResponse.json({ error: postsError.message }, { status: 500 });
        }

        // Check active campaigns
        const { data: campaigns, error: campaignsError } = await supabase
            .from('campaigns')
            .select('id, name, status, next_post_at')
            .eq('status', 'active');

        if (campaignsError) {
            return NextResponse.json({ error: campaignsError.message }, { status: 500 });
        }

        // Analyze which posts are due
        const duePosts = posts?.filter(p => new Date(p.scheduled_for) <= now) || [];
        const futurePosts = posts?.filter(p => new Date(p.scheduled_for) > now) || [];

        return NextResponse.json({
            currentTime: nowISO,
            activeCampaigns: campaigns?.length || 0,
            campaigns: campaigns,
            totalPendingPosts: posts?.length || 0,
            dueNow: duePosts.length,
            duePosts: duePosts.map(p => ({
                id: p.id,
                platform: p.platform,
                scheduledFor: p.scheduled_for,
                campaignName: p.campaigns?.name,
                content: p.content?.substring(0, 50) + '...',
            })),
            futurePostsCount: futurePosts.length,
            nextScheduled: futurePosts[0]?.scheduled_for || null,
        });
    } catch (error: any) {
        console.error('Test endpoint error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
