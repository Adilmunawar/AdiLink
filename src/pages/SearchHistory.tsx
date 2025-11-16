import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Search, Calendar, Users, Trash2, Eye, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface JobSearch {
  id: string;
  job_description: string;
  total_candidates: number;
  created_at: string;
}

export default function SearchHistory() {
  const [searches, setSearches] = useState<JobSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchSearchHistory();
    }
  }, [user]);

  const fetchSearchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("job_searches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setSearches(data || []);
    } catch (error) {
      console.error("Error fetching search history:", error);
      toast({
        title: "Error",
        description: "Failed to load search history",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSearch = async (searchId: string) => {
    try {
      const { error } = await supabase
        .from("job_searches")
        .delete()
        .eq("id", searchId);

      if (error) throw error;

      setSearches(searches.filter(s => s.id !== searchId));
      toast({
        title: "Success",
        description: "Search deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting search:", error);
      toast({
        title: "Error",
        description: "Failed to delete search",
        variant: "destructive",
      });
    }
  };

  const viewResults = (searchId: string) => {
    navigate(`/?search=${searchId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading search history...</p>
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
              Search History
            </h1>
            <p className="text-muted-foreground mt-1">
              {searches.length} {searches.length === 1 ? "search" : "searches"} performed
            </p>
          </div>
        </div>

        {searches.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Search className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No search history</h3>
              <p className="text-muted-foreground text-center mb-6">
                Perform your first candidate search to see results here
              </p>
              <Button onClick={() => navigate("/")}>
                Start Searching
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {searches.map((search) => (
              <Card key={search.id} className="hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">Search Results</CardTitle>
                      <CardDescription className="line-clamp-3">
                        {search.job_description}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => viewResults(search.id)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Search?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this search and all its results. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteSearch(search.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {search.total_candidates} candidates
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(search.created_at).toLocaleDateString()} at {new Date(search.created_at).toLocaleTimeString()}
                    </Badge>
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
