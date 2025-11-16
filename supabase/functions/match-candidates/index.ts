import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobDescription } = await req.json();

    if (!jobDescription) {
      return new Response(
        JSON.stringify({ error: 'Job description is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting candidate matching...');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Fetch profiles
    const { data: profiles, error: fetchError } = await supabaseClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profiles' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ 
          matches: [],
          message: 'No candidates found in database'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${profiles.length} candidates in batches...`);

    // Process in batches of 50 candidates
    const BATCH_SIZE = 50;
    const BATCH_DELAY_MS = 5000; // 5 seconds between batches to respect rate limits
    const allRankedCandidates: any[] = [];
    
    for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
      const batchProfiles = profiles.slice(i, Math.min(i + BATCH_SIZE, profiles.length));
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(profiles.length / BATCH_SIZE);
      
      console.log(`Processing batch ${batchNum}/${totalBatches} (${batchProfiles.length} candidates)...`);
      
      // Prepare candidate summaries
      const candidateSummaries = batchProfiles.map((profile, index) => {
        const text = (profile.resume_text || '').toString();
        const snippet = text.length > 1000 ? text.slice(0, 1000) + '...' : text;
        return {
          index: i + index,
          resume: snippet
        };
      });

      // Process batch with Gemini Flash
      let batchRanked: any[] = [];
      const maxRetries = 3;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `You are an expert recruiter. Analyze these candidates against the job description and return ONLY a valid JSON object with a "candidates" array.

Job Description:
${jobDescription}

Candidates:
${candidateSummaries.map((c, idx) => `Candidate ${c.index}:\n${c.resume}`).join('\n\n---\n\n')}

Return a JSON object with this structure:
{
  "candidates": [
    {
      "candidateIndex": number,
      "fullName": "string",
      "email": "string or null",
      "phone": "string or null",
      "location": "string or null",
      "jobTitle": "string or null",
      "yearsOfExperience": number or null,
      "matchScore": number (0-100),
      "reasoning": "string (max 150 chars)",
      "strengths": ["array of strings"],
      "concerns": ["array of strings"]
    }
  ]
}`
                  }]
                }],
                generationConfig: {
                  temperature: 0.3,
                  maxOutputTokens: 4000,
                  responseMimeType: "application/json"
                }
              })
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Gemini API error (attempt ${attempt + 1}):`, response.status, errorText);
            
            if (response.status === 429 && attempt < maxRetries - 1) {
              let retryDelay = 60000; // Default 60 second wait
              try {
                const errorData = JSON.parse(errorText);
                if (errorData.error?.details?.[0]?.metadata?.retryDelay) {
                  retryDelay = parseInt(errorData.error.details[0].metadata.retryDelay.replace('s', '')) * 1000;
                }
              } catch (e) {
                console.log('Could not parse retry delay, using default');
              }
              console.log(`Rate limited, waiting ${retryDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            }
            
            throw new Error(`Gemini API error: ${response.status}`);
          }

          const data = await response.json();
          const content = data.candidates[0].content.parts[0].text;
          const parsed = JSON.parse(content);
          
          const candidates = parsed.candidates || [];
          
          batchRanked = candidates.map((candidate: any) => ({
            candidateIndex: candidate.candidateIndex,
            fullName: candidate.fullName || 'Not extracted',
            email: candidate.email || null,
            phone: candidate.phone || null,
            location: candidate.location || null,
            jobTitle: candidate.jobTitle || null,
            yearsOfExperience: candidate.yearsOfExperience || null,
            matchScore: candidate.matchScore || 50,
            reasoning: candidate.reasoning || 'Analyzed',
            strengths: candidate.strengths || [],
            concerns: candidate.concerns || []
          }));
          
          console.log(`Successfully processed batch ${batchNum} (${batchRanked.length} candidates)`);
          break;
          
        } catch (error) {
          console.error(`Batch ${batchNum} attempt ${attempt + 1} failed:`, error);
          
          if (attempt === maxRetries - 1) {
            console.log(`Creating fallback results for batch ${batchNum}`);
            batchRanked = candidateSummaries.map(c => ({
              candidateIndex: c.index,
              fullName: `Candidate ${c.index + 1}`,
              email: null,
              phone: null,
              location: null,
              jobTitle: null,
              yearsOfExperience: null,
              matchScore: 0,
              reasoning: 'Analysis failed - manual review needed',
              strengths: [],
              concerns: ['Automated analysis unavailable']
            }));
          } else {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));
          }
        }
      }
      
      allRankedCandidates.push(...batchRanked);
      
      if (i + BATCH_SIZE < profiles.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(`All batches processed. Total candidates: ${allRankedCandidates.length}`);

    allRankedCandidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    // Merge with profile data and update database
    const matches = await Promise.all(allRankedCandidates.map(async (ranked: any) => {
      const profile = profiles[ranked.candidateIndex];
      
      if (!profile) {
        console.error(`Profile not found for index ${ranked.candidateIndex}`);
        return null;
      }
      
      const isFallback = ranked.reasoning === 'Analysis failed - manual review needed';
      
      if (!isFallback && ranked.fullName && ranked.fullName !== 'Not extracted') {
        const updateData: any = {};
        
        if (ranked.fullName) updateData.full_name = ranked.fullName;
        if (ranked.email) updateData.email = ranked.email;
        if (ranked.phone) updateData.phone_number = ranked.phone;
        if (ranked.location) updateData.location = ranked.location;
        if (ranked.jobTitle) updateData.job_title = ranked.jobTitle;
        if (ranked.yearsOfExperience) updateData.years_of_experience = ranked.yearsOfExperience;
        
        if (Object.keys(updateData).length > 0) {
          await supabaseClient
            .from('profiles')
            .update(updateData)
            .eq('id', profile.id);
        }
      }
      
      return {
        id: profile.id,
        resume_file_url: profile.resume_file_url,
        resume_text: profile.resume_text,
        created_at: profile.created_at,
        full_name: ranked.fullName || 'Not extracted',
        email: ranked.email || null,
        phone_number: ranked.phone || null,
        location: ranked.location || null,
        job_title: ranked.jobTitle || null,
        years_of_experience: ranked.yearsOfExperience || null,
        matchScore: isFallback ? 0 : ranked.matchScore,
        reasoning: ranked.reasoning,
        strengths: ranked.strengths || [],
        concerns: ranked.concerns || [],
        isFallback
      };
    }));

    const validMatches = matches.filter(m => m !== null);
    const fallbackCount = validMatches.filter(m => m.isFallback).length;
    const successCount = validMatches.length - fallbackCount;
    
    console.log(`Successfully matched ${successCount} candidates, ${fallbackCount} fallback`);

    return new Response(
      JSON.stringify({ 
        matches: validMatches.filter(m => !m.isFallback),
        total: profiles.length,
        message: `Successfully matched ${successCount} candidates`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in match-candidates function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
