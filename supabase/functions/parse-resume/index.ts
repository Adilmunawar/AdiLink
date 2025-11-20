import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import JSZip from "https://esm.sh/jszip@3.10.1";

// Extract text from DOCX files (which are ZIP files containing XML)
async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file('word/document.xml')?.async('text');
    
    if (!documentXml) {
      throw new Error('Could not find document.xml in DOCX file');
    }
    
    // Extract text from XML tags - simple approach
    let text = documentXml
      .replace(/<w:p[^>]*>/g, '\n') // Paragraphs
      .replace(/<w:br[^>]*\/>/g, '\n') // Line breaks
      .replace(/<w:tab[^>]*\/>/g, '\t') // Tabs
      .replace(/<[^>]+>/g, '') // Remove all XML tags
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .trim();
    
    return text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to extract text from DOCX: ${errorMessage}`);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Utility functions
function sanitizeString(input: unknown, maxLen = 120_000): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
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
  const seen = new Set<string>();
  return arr.filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
}

function coerceInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && !isNaN(n) ? Math.floor(n) : null;
}

function safeJsonParse(text: string): any | null {
  if (!text || typeof text !== 'string') return null;
  let s = text.replace(/^```json\n?|```$/gim, '').trim();
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  try { return JSON.parse(s); } catch (_e) {}
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

  // Parse formData first
  let formData: FormData;
  let file: File;
  let fileName: string;
  
  try {
    formData = await req.formData();
    file = formData.get('file') as File;
    fileName = String(formData.get('fileName') || 'resume');
    
    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        sendEvent('log', { level: 'info', message: `Processing file: ${fileName}` });
        console.log('Processing file:', fileName);

        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        sendEvent('progress', { current: 1, total: 4, step: 'Uploading file...' });

        // Upload to storage with sanitized filename
        const fileExt = fileName.split('.').pop() || 'pdf';
        // Sanitize filename: replace non-ASCII characters with underscore, keep alphanumeric and basic punctuation
        const sanitizedFileName = fileName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
          .replace(/[^\x00-\x7F]/g, '_') // Replace non-ASCII with underscore
          .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
          .replace(/_+/g, '_'); // Replace multiple underscores with single
        const storagePath = `resumes/${Date.now()}_${sanitizedFileName}`;
        
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('resumes')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          sendEvent('error', { message: `Storage upload failed: ${uploadError.message}` });
          controller.close();
          return;
        }

        const { data: { publicUrl } } = supabaseClient.storage
          .from('resumes')
          .getPublicUrl(uploadData.path);

        sendEvent('log', { level: 'success', message: 'File uploaded successfully' });
        sendEvent('progress', { current: 2, total: 4, step: 'Extracting text...' });

        // Extract text from PDF
        const fileBytes = await file.arrayBuffer();
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
        
        if (!GEMINI_API_KEY) {
          sendEvent('error', { message: 'GEMINI_API_KEY not configured' });
          controller.close();
          return;
        }

        sendEvent('log', { level: 'info', message: 'Parsing resume with AI...' });
        sendEvent('progress', { current: 3, total: 4, step: 'Analyzing content...' });

        let extractedText = '';
        const fileType = file.type || '';
        const lowerFileName = fileName.toLowerCase();
        
        // Handle DOCX files separately - extract text first
        if (fileType.includes('wordprocessingml') || lowerFileName.endsWith('.docx')) {
          try {
            sendEvent('log', { level: 'info', message: 'Extracting text from DOCX...' });
            extractedText = await extractTextFromDocx(fileBytes);
            
            if (!extractedText || extractedText.trim().length === 0) {
              sendEvent('error', { message: 'Failed to extract text from DOCX file' });
              controller.close();
              return;
            }
            
            sendEvent('log', { level: 'success', message: 'Text extracted from DOCX successfully' });
          } catch (docxError) {
            const errorMsg = docxError instanceof Error ? docxError.message : 'Unknown error';
            console.error('DOCX extraction error:', docxError);
            sendEvent('error', { message: `Failed to process DOCX: ${errorMsg}` });
            controller.close();
            return;
          }
        }

        // For DOCX with extracted text, send as text to Gemini
        let geminiPayload;
        if (extractedText) {
          geminiPayload = {
            contents: [{
              parts: [{
                text: `Here is the text content from a resume:\n\n${extractedText}\n\nExtract all information and return a JSON object with these fields:\n{\n  "full_name": "string",\n  "email": "string",\n  "phone_number": "string",\n  "location": "string",\n  "job_title": "string",\n  "years_of_experience": number,\n  "sector": "string",\n  "skills": ["array", "of", "strings"],\n  "experience": "string (summary of work experience)",\n  "education": "string (summary of education)",\n  "resume_text": "string (full extracted text)"\n}\n\nReturn ONLY valid JSON, no markdown or explanations.`
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              topK: 32,
              topP: 0.9,
              maxOutputTokens: 4096,
            },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
          };
        } else {
          // For PDF and other files, send as binary
          const uint8Array = new Uint8Array(fileBytes);
          let base64 = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
            base64 += String.fromCharCode(...chunk);
          }
          const base64Data = btoa(base64);

          geminiPayload = {
            contents: [{
              parts: [
                {
                  inline_data: {
                    mime_type: fileType === 'text/plain' ? 'text/plain' : 'application/pdf',
                    data: base64Data
                  }
                },
                {
                  text: `Extract all information from this resume and return a JSON object with these fields:\n{\n  "full_name": "string",\n  "email": "string",\n  "phone_number": "string",\n  "location": "string",\n  "job_title": "string",\n  "years_of_experience": number,\n  "sector": "string",\n  "skills": ["array", "of", "strings"],\n  "experience": "string (summary of work experience)",\n  "education": "string (summary of education)",\n  "resume_text": "string (full extracted text)"\n}\n\nReturn ONLY valid JSON, no markdown or explanations.`
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              topK: 32,
              topP: 0.9,
              maxOutputTokens: 4096,
            },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
          };
        }

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 30000); // 30s timeout
        
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload),
            signal: abortController.signal
          }
        );
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gemini API error:', response.status, errorText);
          sendEvent('error', { message: `AI parsing failed: ${response.status} - ${errorText.substring(0, 200)}` });
          controller.close();
          return;
        }

        const result = await response.json();
        const aiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        if (!aiResponseText) {
          console.error('No text extracted from Gemini response:', JSON.stringify(result).substring(0, 500));
          sendEvent('error', { message: 'Failed to extract text - AI returned empty response' });
          controller.close();
          return;
        }

        sendEvent('log', { level: 'success', message: 'AI analysis complete' });
        sendEvent('progress', { current: 4, total: 4, step: 'Saving to database...' });

        // Get authenticated user ID from the JWT
        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token || '');
        
        if (userError || !user) {
          sendEvent('error', { message: 'Unable to authenticate user' });
          controller.close();
          return;
        }

        const parsed = safeJsonParse(aiResponseText);
        const normalizedProfile = normalizeProfile(parsed, aiResponseText, publicUrl);

        const { data: profile, error: dbError } = await supabaseClient
          .from('profiles')
          .insert([{ ...normalizedProfile, user_id: user.id }])
          .select()
          .single();

        if (dbError) {
          console.error('Database insert error:', dbError);
          sendEvent('error', { message: `Database error: ${dbError.message}` });
          controller.close();
          return;
        }

        sendEvent('log', { level: 'success', message: 'Resume processed successfully!' });
        sendEvent('complete', {
          success: true,
          profile_id: profile.id,
          message: 'Resume uploaded and parsed successfully'
        });

        controller.close();

      } catch (error) {
        console.error('Error parsing resume:', error);
        sendEvent('error', { message: error instanceof Error ? error.message : 'Unknown error' });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
});
