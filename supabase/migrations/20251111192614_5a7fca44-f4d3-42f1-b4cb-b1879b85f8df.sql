-- Create table for storing job search sessions
CREATE TABLE public.job_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  job_description TEXT NOT NULL,
  total_candidates INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for storing candidate match results
CREATE TABLE public.candidate_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_id UUID NOT NULL REFERENCES public.job_searches(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_phone TEXT,
  candidate_location TEXT,
  job_role TEXT,
  company TEXT,
  experience_years INTEGER,
  match_score INTEGER NOT NULL,
  reasoning TEXT NOT NULL,
  key_strengths TEXT[] NOT NULL DEFAULT '{}',
  potential_concerns TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_matches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_searches
CREATE POLICY "Users can view their own searches"
ON public.job_searches
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own searches"
ON public.job_searches
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own searches"
ON public.job_searches
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for candidate_matches
CREATE POLICY "Users can view matches from their searches"
ON public.candidate_matches
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.job_searches
    WHERE job_searches.id = candidate_matches.search_id
    AND job_searches.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create matches for their searches"
ON public.candidate_matches
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_searches
    WHERE job_searches.id = candidate_matches.search_id
    AND job_searches.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete matches from their searches"
ON public.candidate_matches
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.job_searches
    WHERE job_searches.id = candidate_matches.search_id
    AND job_searches.user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX idx_job_searches_user_id ON public.job_searches(user_id);
CREATE INDEX idx_job_searches_created_at ON public.job_searches(created_at DESC);
CREATE INDEX idx_candidate_matches_search_id ON public.candidate_matches(search_id);
CREATE INDEX idx_candidate_matches_match_score ON public.candidate_matches(match_score DESC);