import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Utility: remove NULL bytes and other unsafe control chars while keeping tabs/newlines/carriage returns
function sanitizeString(input: unknown, maxLen = 120_000): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input);
  // Replace all control chars except TAB(0x09), LF(0x0A), CR(0x0D)
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  // Collapse excessive spaces
  s = s.replace(/\s{3,}/g, ' ');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  s = s.trim();
  return s.length ? s : null;
}

function sanitizeStringArray(value: unknown, maxItems = 128): string[] | null {
  if (!value) return null;
  let arr: string[] = [];
  if (Array.isArray(value)) {
    arr = value.map((v) => sanitizeString(v)).filter((v): v is string => !!v);
  } else if (typeof value === 'string') {
    arr = value.split(/[;,\n]/).map((v) => sanitizeString(v)).filter((v): v is string => !!v);
  }
  if (!arr.length) return null;
  if (arr.length > maxItems) arr = arr.slice(0, maxItems);
  // de-duplicate while preserving order
  const seen = new Set<string>();
  return arr.filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
}

function coerceInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  // Handle string or number input, remove any non-numeric characters except decimal point
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && !isNaN(n) ? Math.floor(n) : null;
}

function safeJsonParse(text: string): any | null {
  if (!text || typeof text !== 'string') return null;

  // Remove code fences if present
  let s = text.replace(/^```json\n?|```$/gim, '').trim();

  // Remove unsafe control chars
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');

  // Try direct parse
  try { return JSON.parse(s); } catch (_e) {}

  // Try to extract the largest {...} block
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = s.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (_e) {}
  }
  return null;
}

function normalizeProfile(parsed: any, fallbackResumeText: string | null, fileUrl: string | null) {
  return {
    full_name: sanitizeString(parsed?.full_name),
    email: sanitizeString(parsed?.email),
    phone_number: sanitizeString(parsed?.phone_number),
    location: sanitizeString(parsed?.location),
    job_title: sanitizeString(parsed?.job_title),
    years_of_experience: coerceInt(parsed?.years_of_experience),
    sector: sanitizeString(parsed?.sector),
    skills: sanitizeStringArray(parsed?.skills),
    experience: sanitizeString(parsed?.experience),
    education: sanitizeString(parsed?.education),
    resume_text: sanitizeString(parsed?.resume_text) ?? fallbackResumeText,
    resume_file_url: fileUrl,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileName = String(formData.get('fileName') || 'resume');

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing file:', fileName);

    // Upload to storage
    const fileExt = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
    const filePath = `${crypto.randomUUID()}.${fileExt}`;

    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('resumes')
      .upload(filePath, file);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build a signed URL (bucket is private). Fallback to public URL helper if necessary.
    let resumeUrl: string | null = null;
    try {
      const { data: signed } = await supabaseClient.storage
        .from('resumes')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year
      resumeUrl = signed?.signedUrl ?? null;
    } catch (e) {
      try {
        const { data: { publicUrl } } = supabaseClient.storage
          .from('resumes')
          .getPublicUrl(filePath);
        resumeUrl = publicUrl ?? null;
      } catch (_) {}
    }

    // Prepare file bytes for Gemini
    const buffer = await file.arrayBuffer();
    // Avoid spreading large arrays into fromCharCode (causes call stack overflow)
    const bytes = new Uint8Array(buffer);
    let binaryStr = '';
    const chunkSize = 0x8000; // 32KB chunks
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binaryStr += String.fromCharCode(...chunk);
    }
    const base64Data = btoa(binaryStr);

    // Determine if the file is text-like for safe fallback of resume_text
    const isTextLike = (file.type?.startsWith('text/') === true) || /\.(txt|md|csv|json|xml)$/i.test(fileName);

    // Try reading textual content only for text-like files, and SANITIZE it
    let fileContent: string | null = null;
    if (isTextLike) {
      try { fileContent = sanitizeString(await file.text()); } catch (_) { fileContent = null; }
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

    // Extract plain text via OCR-first strategy (no JSON parsing)
    let aiResp: Response | null = null;
    let lastError = '';
    const maxRetries = 5;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        aiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Extract ALL readable text from this resume using OCR if needed. Return ONLY plain UTF-8 text. Do not add explanations, Markdown, or JSON. Preserve natural order; remove obvious repeated headers/footers." },
                { inlineData: { data: base64Data, mimeType: file.type || `application/${fileExt}` } }
              ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "text/plain" }
          })
        });

        if (aiResp.ok) {
          console.log('Gemini OCR success on attempt', attempt + 1);
          break;
        }

        lastError = await aiResp.text();
        
        if (aiResp.status === 429 || aiResp.status === 503) {
          const retryAfter = aiResp.headers.get('retry-after');
          const baseDelay = Math.pow(2, attempt + 1) * 1000;
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay;
          
          console.log(`Gemini API ${aiResp.status} error, attempt ${attempt + 1}/${maxRetries}. Waiting ${waitTime}ms before retry...`);
          
          if (attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        console.error('Gemini OCR error:', aiResp.status, lastError);
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

    // Read plain text from model (or fallback to text-like file content)
    let extractedText: string | null = fileContent;
    if (aiResp && aiResp.ok) {
      try {
        const aiData = await aiResp.json();
        const parts = aiData?.candidates?.[0]?.content?.parts || [];
        let text = '';
        for (const p of parts) {
          if (typeof p?.text === 'string') text += p.text;
        }
        const cleaned = sanitizeString(text, 200_000);
        extractedText = cleaned ?? extractedText ?? null;
        console.log('Extracted text length:', extractedText?.length ?? 0);
      } catch (e) {
        console.error('Failed to read OCR text:', e);
      }
    } else {
      console.error('OCR request failed after retries:', lastError);
    }

    // Build minimal profile using only resume_text
    let parsedFromAI: any | null = null;

    const profileInsert = normalizeProfile(parsedFromAI ?? {}, extractedText, resumeUrl);

    // Ensure years_of_experience is a number, not a string
    if (profileInsert.years_of_experience !== null && typeof profileInsert.years_of_experience === 'string') {
      profileInsert.years_of_experience = coerceInt(profileInsert.years_of_experience);
    }

    console.log('Inserting profile with years_of_experience:', profileInsert.years_of_experience, 'type:', typeof profileInsert.years_of_experience);

    // Try to insert, if email exists, update the existing profile
    let profileData;
    let insertError;

    if (profileInsert.email) {
      // Check if profile with this email exists
      const { data: existingProfile } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('email', profileInsert.email)
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile
        console.log('Updating existing profile with id:', existingProfile.id);
        const { data: updatedData, error: updateError } = await supabaseClient
          .from('profiles')
          .update(profileInsert)
          .eq('id', existingProfile.id)
          .select()
          .maybeSingle();
        
        profileData = updatedData;
        insertError = updateError;
      } else {
        // Insert new profile
        const { data: insertedData, error: newInsertError } = await supabaseClient
          .from('profiles')
          .insert(profileInsert)
          .select()
          .maybeSingle();
        
        profileData = insertedData;
        insertError = newInsertError;
      }
    } else {
      // No email, just insert
      const { data: insertedData, error: newInsertError } = await supabaseClient
        .from('profiles')
        .insert(profileInsert)
        .select()
        .maybeSingle();
      
      profileData = insertedData;
      insertError = newInsertError;
    }

    if (insertError) {
      console.error('Database error:', insertError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to save profile',
          details: insertError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully created profile:', profileData?.id);

    return new Response(
      JSON.stringify({
        success: true,
        profile: profileData,
        message: 'Resume parsed and saved successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in parse-resume function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
