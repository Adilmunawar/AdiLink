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

    console.log('Matching candidates for job description...');

    // Use service role key to read all profiles
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch all profiles
    const { data: profiles, error: fetchError } = await supabaseClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

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

    console.log(`Found ${profiles.length} profiles, sending to AI for ranking...`);

    // Prepare candidate summaries for AI using raw resume text only
    const candidateSummaries = profiles.map((profile, index) => {
      const text = (profile.resume_text || '').toString();
      const snippet = text.length > 4000 ? text.slice(0, 4000) : text;
      return {
        id: profile.id,
        index,
        summary: `Candidate ${index + 1} Resume Text:\n${snippet}`.trim()
      };
    });

    // Use Gemini 2.5 Flash with tool calling for structured extraction
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    let aiResponse: Response | null = null;
    let lastError = '';
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are an expert technical recruiter. Analyze each candidate's resume text and extract their details while ranking them against the job description.

For EACH candidate, extract:
1. Full name (look for name at the top of resume)
2. Email address
3. Phone number
4. Location/Address
5. Job title or current role
6. Years of experience (estimate from work history)
7. Match score (0-100) based on job requirements
8. Key strengths that match the job
9. Potential concerns or gaps

Job Description:
${jobDescription}

Candidates:
${candidateSummaries.map(c => c.summary).join('\n\n---\n\n')}`
              }]
            }],
            tools: [{
              function_declarations: [{
                name: "rank_candidates",
                description: "Rank and extract details from candidate resumes",
                parameters: {
                  type: "object",
                  properties: {
                    candidates: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          candidateIndex: { type: "number", description: "Index of the candidate (0-based)" },
                          fullName: { type: "string", description: "Candidate's full name extracted from resume" },
                          email: { type: "string", description: "Email address" },
                          phone: { type: "string", description: "Phone number" },
                          location: { type: "string", description: "City, state or full address" },
                          jobTitle: { type: "string", description: "Current or most recent job title" },
                          yearsOfExperience: { type: "number", description: "Estimated years of experience" },
                          matchScore: { type: "number", description: "Match score 0-100" },
                          reasoning: { type: "string", description: "Brief explanation of the match" },
                          strengths: { type: "array", items: { type: "string" }, description: "Key strengths matching the job" },
                          concerns: { type: "array", items: { type: "string" }, description: "Potential concerns or gaps" }
                        },
                        required: ["candidateIndex", "fullName", "matchScore", "reasoning", "strengths"]
                      }
                    }
                  },
                  required: ["candidates"]
                }
              }]
            }],
            tool_config: {
              function_calling_config: {
                mode: "ANY",
                allowed_function_names: ["rank_candidates"]
              }
            }
          })
        });

        if (aiResponse.ok) {
          console.log('Gemini API success on attempt', attempt + 1);
          break;
        }

        lastError = await aiResponse.text();
        
        if (aiResponse.status === 429 || aiResponse.status === 503) {
          const retryAfter = aiResponse.headers.get('retry-after');
          const baseDelay = Math.pow(2, attempt + 1) * 1000;
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay;
          
          console.log(`Gemini API ${aiResponse.status} error, attempt ${attempt + 1}/${maxRetries}. Waiting ${waitTime}ms before retry...`);
          
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        console.error('Gemini API error:', aiResponse.status, lastError);
        break;

      } catch (retryError) {
        console.error('Error during attempt', attempt + 1, ':', retryError);
        lastError = retryError instanceof Error ? retryError.message : 'Unknown error';
        if (attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt + 1) * 1000;
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      console.error('All Gemini API retry attempts failed:', lastError);
      
      if (aiResponse?.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Return all candidates with default scores as fallback
      console.log('Returning fallback results with default scores');
      const fallbackMatches = profiles.map((profile, index) => ({
        ...profile,
        matchScore: 50,
        reasoning: 'AI ranking temporarily unavailable - showing all candidates',
        strengths: profile.skills?.slice(0, 3) || [],
        concerns: []
      }));
      
      return new Response(
        JSON.stringify({ 
          matches: fallbackMatches,
          total: profiles.length,
          message: `Showing ${fallbackMatches.length} candidates (AI ranking unavailable)`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    let rankedCandidates;
    
    try {
      // Extract function call response
      const functionCall = aiData.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      
      if (!functionCall || functionCall.name !== 'rank_candidates') {
        throw new Error('No valid function call in response');
      }

      const extractedData = functionCall.args?.candidates || [];
      console.log(`Gemini extracted ${extractedData.length} candidates with details`);
      
      // Sort by match score descending - return ALL candidates
      rankedCandidates = extractedData
        .sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));
        
      console.log(`Successfully ranked ${rankedCandidates.length} candidates`);
    } catch (e) {
      console.error('Failed to parse Gemini ranking response:', e);
      console.error('Full AI response:', JSON.stringify(aiData, null, 2));
      
      // Fallback: return ALL candidates with default scores and attempt basic extraction
      rankedCandidates = profiles.map((profile, index) => {
        const text = profile.resume_text || '';
        const lines = text.split('\n').filter((l: string) => l.trim());
        
        return {
          candidateIndex: index,
          fullName: lines[0]?.substring(0, 50) || `Candidate ${index + 1}`,
          email: text.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || 'Not found',
          phone: text.match(/[\d\s+()-]{10,}/)?.[0] || 'Not found',
          location: 'Not extracted',
          jobTitle: lines[1]?.substring(0, 50) || 'Not specified',
          yearsOfExperience: null,
          matchScore: 50,
          reasoning: 'AI extraction failed - showing basic info',
          strengths: [],
          concerns: ['AI analysis unavailable']
        };
      });
    }

    // Merge AI rankings with full profile data
    const matches = rankedCandidates.map((ranked: any) => {
      const profile = profiles[ranked.candidateIndex];
      return {
        id: profile.id,
        resume_file_url: profile.resume_file_url,
        resume_text: profile.resume_text,
        created_at: profile.created_at,
        // Extracted candidate details
        full_name: ranked.fullName || 'Not extracted',
        email: ranked.email || null,
        phone_number: ranked.phone || null,
        location: ranked.location || null,
        job_title: ranked.jobTitle || null,
        years_of_experience: ranked.yearsOfExperience || null,
        // Ranking details
        matchScore: ranked.matchScore,
        reasoning: ranked.reasoning,
        strengths: ranked.strengths || [],
        concerns: ranked.concerns || []
      };
    });

    console.log(`Successfully ranked ${matches.length} candidates`);

    return new Response(
      JSON.stringify({ 
        matches,
        total: profiles.length,
        message: `Found ${matches.length} matching candidates`
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