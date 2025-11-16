import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Bookmark, Mail, Phone, MapPin, Briefcase, Building2, Calendar, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface BookmarkedCandidate {
  id: string;
  candidate_id: string;
  created_at: string;
  profiles: {
    full_name: string;
    email: string;
    phone_number: string;
    location: string;
    job_title: string;
    sector: string;
    years_of_experience: number;
    skills: string[];
  };
  match_score?: number;
  reasoning?: string;
  key_strengths?: string[];
  potential_concerns?: string[];
}

export default function Bookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkedCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchBookmarks();
    }
  }, [user]);

  const fetchBookmarks = async () => {
    try {
      const { data: bookmarksData, error: bookmarksError } = await supabase
        .from("candidate_bookmarks")
        .select(`
          id,
          candidate_id,
          created_at,
          profiles!inner (
            full_name,
            email,
            phone_number,
            location,
            job_title,
            sector,
            years_of_experience,
            skills
          )
        `)
        .order("created_at", { ascending: false });

      if (bookmarksError) throw bookmarksError;

      // Fetch match scores for each bookmarked candidate
      const bookmarksWithScores = await Promise.all(
        (bookmarksData || []).map(async (bookmark) => {
          const { data: matchData } = await supabase
            .from("candidate_matches")
            .select("match_score, reasoning, key_strengths, potential_concerns")
            .eq("candidate_id", bookmark.candidate_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          return {
            ...bookmark,
            match_score: matchData?.match_score,
            reasoning: matchData?.reasoning,
            key_strengths: matchData?.key_strengths,
            potential_concerns: matchData?.potential_concerns,
          };
        })
      );

      setBookmarks(bookmarksWithScores);
    } catch (error) {
      console.error("Error fetching bookmarks:", error);
      toast({
        title: "Error",
        description: "Failed to load bookmarked candidates",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const removeBookmark = async (bookmarkId: string) => {
    try {
      const { error } = await supabase
        .from("candidate_bookmarks")
        .delete()
        .eq("id", bookmarkId);

      if (error) throw error;

      setBookmarks(bookmarks.filter(b => b.id !== bookmarkId));
      toast({
        title: "Success",
        description: "Candidate removed from bookmarks",
      });
    } catch (error) {
      console.error("Error removing bookmark:", error);
      toast({
        title: "Error",
        description: "Failed to remove bookmark",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading bookmarks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="hover:bg-primary/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Bookmarked Candidates
            </h1>
            <p className="text-muted-foreground mt-1">
              {bookmarks.length} {bookmarks.length === 1 ? "candidate" : "candidates"} saved
            </p>
          </div>
        </div>

        {bookmarks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Bookmark className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No bookmarks yet</h3>
              <p className="text-muted-foreground text-center mb-6">
                Start searching for candidates and bookmark your favorites for quick access
              </p>
              <Button onClick={() => navigate("/")}>
                Go to Search
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {bookmarks.map((bookmark) => (
              <Card key={bookmark.id} className="hover:shadow-lg transition-all duration-300 border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-2xl flex items-center gap-2 flex-wrap">
                        {bookmark.profiles.full_name || "Name not available"}
                        <Badge variant="secondary" className="ml-2">
                          <Bookmark className="h-3 w-3 mr-1" />
                          Bookmarked
                        </Badge>
                        {bookmark.match_score !== undefined && (
                          <Badge 
                            variant={bookmark.match_score >= 80 ? "default" : bookmark.match_score >= 60 ? "secondary" : "outline"}
                            className="text-sm"
                          >
                            {bookmark.match_score}% Match
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-2">
                        <Briefcase className="h-4 w-4" />
                        {bookmark.profiles.job_title || "No title specified"}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeBookmark(bookmark.id)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Mail className="h-4 w-4 text-primary" />
                      <span className="text-sm">{bookmark.profiles.email}</span>
                    </div>
                    {bookmark.profiles.phone_number && (
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <Phone className="h-4 w-4 text-primary" />
                        <span className="text-sm">{bookmark.profiles.phone_number}</span>
                      </div>
                    )}
                    {bookmark.profiles.location && (
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <MapPin className="h-4 w-4 text-primary" />
                        <span className="text-sm">{bookmark.profiles.location}</span>
                      </div>
                    )}
                    {bookmark.profiles.sector && (
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span className="text-sm">{bookmark.profiles.sector}</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    {bookmark.match_score !== undefined && bookmark.reasoning && (
                      <div className="bg-muted/50 p-4 rounded-lg">
                        <h4 className="font-semibold text-sm mb-2">Match Reasoning</h4>
                        <p className="text-sm text-muted-foreground">{bookmark.reasoning}</p>
                      </div>
                    )}
                    
                    {bookmark.profiles.years_of_experience && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {bookmark.profiles.years_of_experience} years experience
                        </Badge>
                      </div>
                    )}
                    
                    {bookmark.key_strengths && bookmark.key_strengths.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 text-primary">Key Strengths</h4>
                        <div className="flex flex-wrap gap-2">
                          {bookmark.key_strengths.map((strength, index) => (
                            <Badge key={index} variant="default" className="text-xs">
                              {strength}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {bookmark.potential_concerns && bookmark.potential_concerns.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 text-orange-600">Potential Concerns</h4>
                        <div className="flex flex-wrap gap-2">
                          {bookmark.potential_concerns.map((concern, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {concern}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {bookmark.profiles.skills && bookmark.profiles.skills.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Skills</h4>
                        <div className="flex flex-wrap gap-2">
                          {bookmark.profiles.skills.map((skill, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Bookmarked on {new Date(bookmark.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
