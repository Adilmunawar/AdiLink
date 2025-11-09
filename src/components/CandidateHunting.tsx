import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, Sparkles, Award, MapPin, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface CandidateMatch {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  job_title: string | null;
  location: string | null;
  years_of_experience: number | null;
  resume_file_url?: string;
  matchScore: number;
  reasoning: string;
  strengths: string[];
  concerns: string[];
}

export const CandidateHunting = () => {
  const [jobDescription, setJobDescription] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<CandidateMatch[]>([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();
  
  const itemsPerPage = 10;

  const exportToCSV = () => {
    if (matches.length === 0) {
      toast({
        title: 'No Data to Export',
        description: 'Please search for candidates first',
        variant: 'destructive',
      });
      return;
    }

    // Create CSV headers
    const headers = [
      'Rank',
      'Full Name',
      'Email',
      'Phone Number',
      'Location',
      'Job Title',
      'Years of Experience',
      'Match %',
      'Key Strengths',
      'Potential Concerns',
      'Reasoning',
      'Resume URL'
    ];

    // Create CSV rows
    const rows = matches.map((candidate, index) => [
      index + 1,
      candidate.full_name || '',
      candidate.email || '',
      candidate.phone_number || '',
      candidate.location || '',
      candidate.job_title || '',
      candidate.years_of_experience || '',
      candidate.matchScore,
      candidate.strengths.join('; '),
      candidate.concerns.join('; '),
      candidate.reasoning || '',
      candidate.resume_file_url || ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape commas and quotes in cell content
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `candidate_matches_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'CSV Exported Successfully',
      description: `Exported ${matches.length} candidates to CSV`,
    });
  };

  const handleSearch = async () => {
    if (!jobDescription.trim()) {
      toast({
        title: 'Job Description Required',
        description: 'Please enter a job description to find matching candidates',
        variant: 'destructive',
      });
      return;
    }

    setSearching(true);

    try {
      const { data, error } = await supabase.functions.invoke('match-candidates', {
        body: { jobDescription },
      });

      if (error) {
        throw new Error(error.message || 'Failed to match candidates');
      }

      setMatches(data.matches || []);
      setTotalCandidates(data.total || 0);
      setCurrentPage(1); // Reset to first page on new search

      toast({
        title: 'Search Complete!',
        description: `Ranked ${data.matches?.length || 0} candidates from ${data.total || 0} total resumes`,
      });
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search Failed',
        description: error instanceof Error ? error.message : 'Failed to search candidates',
        variant: 'destructive',
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-card/90 to-secondary/10 backdrop-blur-sm border border-primary/20 shadow-[var(--shadow-elegant)]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-secondary/20 to-primary/20 rounded-lg ring-2 ring-secondary/30 shadow-[var(--shadow-glow)]">
              <Sparkles className="h-6 w-6 text-secondary animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">AI-Powered Candidate Matching</h3>
              <p className="text-sm text-muted-foreground">Describe your ideal candidate and let AI find the best matches</p>
            </div>
          </div>

          <Textarea
            placeholder="Enter job description including required skills, experience, qualifications, and any specific requirements..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            className="min-h-[150px] resize-none text-base"
          />

          <Button
            onClick={handleSearch}
            disabled={searching || !jobDescription.trim()}
            className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-[var(--shadow-elegant)] hover:shadow-[var(--shadow-premium)] hover:scale-105 transition-all duration-300"
          >
            {searching ? (
              <>
                <Search className="mr-2 h-5 w-5 animate-pulse" />
                Analyzing Candidates...
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                Find All Matching Candidates
              </>
            )}
          </Button>
        </div>
      </Card>

      {matches.length > 0 && (() => {
        const totalPages = Math.ceil(matches.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentMatches = matches.slice(startIndex, endIndex);
        
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Award className="h-6 w-6 text-primary" />
                Ranked Candidates ({matches.length} of {totalCandidates})
              </h3>
              <Button
                onClick={exportToCSV}
                variant="outline"
                className="flex items-center gap-2 bg-gradient-to-r from-primary/10 to-secondary/10 hover:from-primary/20 hover:to-secondary/20 border-primary/30"
              >
                <Download className="h-4 w-4" />
                Export to CSV
              </Button>
            </div>

            <div className="grid gap-4">
              {currentMatches.map((candidate, index) => {
                const globalIndex = startIndex + index;
                return (
                <Card key={candidate.id} className="p-6 hover:shadow-[var(--shadow-premium)] hover:scale-[1.02] transition-all duration-300 bg-card/90 backdrop-blur-sm border border-primary/20 animate-fade-in">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground font-bold text-xl shadow-lg">
                        #{globalIndex + 1}
                      </div>
                    <div>
                      <h4 className="text-xl font-bold text-foreground">{candidate.full_name}</h4>
                      {candidate.job_title && (
                        <p className="text-sm text-muted-foreground font-medium">{candidate.job_title}</p>
                      )}
                      {candidate.years_of_experience && (
                        <p className="text-xs text-muted-foreground">{candidate.years_of_experience} years experience</p>
                      )}
                    </div>
                  </div>
                  <Badge 
                    variant={candidate.matchScore >= 80 ? "default" : candidate.matchScore >= 60 ? "secondary" : "outline"}
                    className="text-lg px-4 py-2 font-bold"
                  >
                    {candidate.matchScore}% Match
                  </Badge>
                </div>

                {/* Contact Information - Highlighted Section */}
                {(candidate.email || candidate.phone_number || candidate.location) && (
                  <div className="mb-4 p-4 bg-gradient-to-br from-primary/5 to-secondary/5 rounded-lg border-2 border-primary/20">
                    <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                      📇 Contact Information
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {candidate.email && (
                        <div className="flex items-center gap-2">
                          <span className="text-base">📧</span>
                          <a href={`mailto:${candidate.email}`} className="text-primary hover:underline font-medium">
                            {candidate.email}
                          </a>
                        </div>
                      )}
                      {candidate.phone_number && (
                        <div className="flex items-center gap-2">
                          <span className="text-base">📞</span>
                          <a href={`tel:${candidate.phone_number}`} className="text-primary hover:underline font-medium">
                            {candidate.phone_number}
                          </a>
                        </div>
                      )}
                      {candidate.location && (
                        <div className="flex items-center gap-2 col-span-full">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground font-medium">{candidate.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-bold text-muted-foreground mb-2">Why This Match?</p>
                    <p className="text-sm bg-muted/50 p-3 rounded-lg leading-relaxed">{candidate.reasoning}</p>
                  </div>

                  {candidate.strengths.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-muted-foreground mb-2">Key Strengths</p>
                      <div className="flex flex-wrap gap-2">
                        {candidate.strengths.map((strength, i) => (
                          <Badge key={i} variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 font-medium">
                            ✓ {strength}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {candidate.concerns.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-muted-foreground mb-2">Potential Concerns</p>
                      <div className="flex flex-wrap gap-2">
                        {candidate.concerns.map((concern, i) => (
                          <Badge key={i} variant="outline" className="border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300 font-medium">
                            ⚠ {concern}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {candidate.resume_file_url && (
                    <div className="pt-4 border-t">
                      <a 
                        href={candidate.resume_file_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-2 font-medium"
                      >
                        📄 View Full Resume
                      </a>
                    </div>
                  )}
                </div>
              </Card>
            );
            })}
          </div>

          {totalPages > 1 && (
            <Pagination className="mt-6">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  // Show first page, last page, current page, and pages around current
                  const showPage = 
                    page === 1 || 
                    page === totalPages || 
                    (page >= currentPage - 1 && page <= currentPage + 1);
                  
                  const showEllipsisBefore = page === currentPage - 2 && currentPage > 3;
                  const showEllipsisAfter = page === currentPage + 2 && currentPage < totalPages - 2;
                  
                  if (showEllipsisBefore || showEllipsisAfter) {
                    return (
                      <PaginationItem key={page}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    );
                  }
                  
                  if (!showPage) return null;
                  
                  return (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      );
      })()}
    </div>
  );
};