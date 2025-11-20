import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, FileText, Mail, Phone, MapPin, Briefcase, ExternalLink, Trash2, Download, FileSpreadsheet } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import Footer from '@/components/Footer';
import * as XLSX from 'xlsx';

type Profile = Tables<'profiles'>;

export default function Candidates() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJobTitle, setSelectedJobTitle] = useState<string>('all');
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateIds, setDuplicateIds] = useState<string[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [experienceFilter, setExperienceFilter] = useState<string>('all');
  const [locations, setLocations] = useState<string[]>([]);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    filterProfiles();
  }, [profiles, searchTerm, selectedJobTitle, locationFilter, experienceFilter]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedCandidates(new Set());
  }, [searchTerm, selectedJobTitle, locationFilter, experienceFilter]);

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setProfiles(data || []);
      
      // Extract unique job titles for filter
      const uniqueTitles = Array.from(
        new Set(data?.map(p => p.job_title).filter(Boolean) as string[])
      );
      setJobTitles(uniqueTitles);
      
      // Extract unique locations for filter
      const uniqueLocations = Array.from(
        new Set(data?.map(p => p.location).filter(Boolean) as string[])
      );
      setLocations(uniqueLocations);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch candidates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterProfiles = () => {
    let filtered = profiles;

    // Filter by search term (searches across multiple fields)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(profile =>
        profile.full_name?.toLowerCase().includes(searchLower) ||
        profile.email?.toLowerCase().includes(searchLower) ||
        profile.phone_number?.toLowerCase().includes(searchLower) ||
        profile.job_title?.toLowerCase().includes(searchLower) ||
        profile.location?.toLowerCase().includes(searchLower) ||
        profile.sector?.toLowerCase().includes(searchLower) ||
        profile.skills?.some(skill => skill.toLowerCase().includes(searchLower))
      );
    }

    // Filter by job title
    if (selectedJobTitle !== 'all') {
      filtered = filtered.filter(profile => profile.job_title === selectedJobTitle);
    }

    // Filter by location
    if (locationFilter !== 'all') {
      filtered = filtered.filter(profile => profile.location === locationFilter);
    }

    // Filter by experience
    if (experienceFilter !== 'all') {
      filtered = filtered.filter(profile => {
        const years = profile.years_of_experience || 0;
        if (experienceFilter === '0-2') return years <= 2;
        if (experienceFilter === '3-5') return years >= 3 && years <= 5;
        if (experienceFilter === '6-10') return years >= 6 && years <= 10;
        if (experienceFilter === '10+') return years > 10;
        return true;
      });
    }

    setFilteredProfiles(filtered);
  };

  const handleViewResume = (resumeUrl: string | null) => {
    if (!resumeUrl) {
      toast({
        title: 'No Resume',
        description: 'This candidate does not have a resume file uploaded',
        variant: 'destructive',
      });
      return;
    }
    window.open(resumeUrl, '_blank');
  };

  const findDuplicates = () => {
    setCheckingDuplicates(true);
    
    // Find duplicates based on email or phone number
    const duplicateMap = new Map<string, Profile[]>();
    
    profiles.forEach(profile => {
      // Create a key based on email or phone (whichever exists)
      const key = profile.email || profile.phone_number;
      if (key) {
        if (!duplicateMap.has(key)) {
          duplicateMap.set(key, []);
        }
        duplicateMap.get(key)!.push(profile);
      }
    });

    // Filter out entries with only one profile (not duplicates)
    const duplicates: string[] = [];
    duplicateMap.forEach((profileList, key) => {
      if (profileList.length > 1) {
        // Sort by created_at, keep the newest one, mark others for deletion
        const sortedProfiles = profileList.sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        // Add all except the first (newest) to the deletion list
        sortedProfiles.slice(1).forEach(p => duplicates.push(p.id));
      }
    });

    setDuplicateIds(duplicates);
    setDuplicateCount(duplicates.length);
    setCheckingDuplicates(false);

    if (duplicates.length === 0) {
      toast({
        title: 'No Duplicates Found',
        description: 'All candidate profiles are unique',
      });
    } else {
      setShowDeleteDialog(true);
    }
  };

  const handleDeleteDuplicates = async () => {
    setDeletingDuplicates(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .in('id', duplicateIds);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Deleted ${duplicateCount} duplicate profile(s)`,
      });

      await fetchProfiles();
      setShowDeleteDialog(false);
      setDuplicateIds([]);
      setDuplicateCount(0);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete duplicates',
        variant: 'destructive',
      });
    } finally {
      setDeletingDuplicates(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const currentPageIds = filteredProfiles
        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        .map(p => p.id);
      setSelectedCandidates(new Set(currentPageIds));
    } else {
      setSelectedCandidates(new Set());
    }
  };

  const handleSelectCandidate = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedCandidates);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedCandidates(newSelected);
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .in('id', Array.from(selectedCandidates));

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Deleted ${selectedCandidates.size} candidate(s)`,
      });

      await fetchProfiles();
      setShowBulkDeleteDialog(false);
      setSelectedCandidates(new Set());
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete candidates',
        variant: 'destructive',
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  const exportToCSV = () => {
    const csvData = filteredProfiles.map(profile => ({
      'Name': profile.full_name || '',
      'Email': profile.email || '',
      'Phone': profile.phone_number || '',
      'Location': profile.location || '',
      'Job Title': profile.job_title || '',
      'Experience (Years)': profile.years_of_experience || 0,
      'Sector': profile.sector || '',
      'Skills': profile.skills?.join(', ') || '',
      'Education': profile.education || '',
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidates_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Export Successful',
      description: `Exported ${filteredProfiles.length} candidates to CSV`,
    });
  };

  const exportToExcel = () => {
    const excelData = filteredProfiles.map(profile => ({
      'Name': profile.full_name || '',
      'Email': profile.email || '',
      'Phone': profile.phone_number || '',
      'Location': profile.location || '',
      'Job Title': profile.job_title || '',
      'Experience (Years)': profile.years_of_experience || 0,
      'Sector': profile.sector || '',
      'Skills': profile.skills?.join(', ') || '',
      'Education': profile.education || '',
      'Resume URL': profile.resume_file_url || '',
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    
    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(excelData[0] || {}).map(key => ({
      wch: Math.min(maxWidth, Math.max(key.length, ...excelData.map(row => String(row[key as keyof typeof row]).length)))
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `candidates_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: 'Export Successful',
      description: `Exported ${filteredProfiles.length} candidates to Excel`,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-primary/5 flex flex-col">
      <div className="container mx-auto px-4 py-8 flex-1">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <h1 className="text-4xl font-bold text-foreground">All Candidates</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCandidates.size > 0 && (
              <Button
                variant="destructive"
                onClick={() => setShowBulkDeleteDialog(true)}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedCandidates.size})
              </Button>
            )}
            <Button
              variant="outline"
              onClick={exportToCSV}
              disabled={filteredProfiles.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={exportToExcel}
              disabled={filteredProfiles.length === 0}
              className="gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button
              variant="destructive"
              onClick={findDuplicates}
              disabled={checkingDuplicates || profiles.length === 0}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {checkingDuplicates ? 'Checking...' : 'Delete Duplicates'}
            </Button>
          </div>
        </div>

        {/* Advanced Filters */}
        <Card className="p-6 mb-8 bg-card/50 backdrop-blur-sm">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="search" className="text-sm font-medium mb-2 block">
                  Search Candidates
                </Label>
                <Input
                  id="search"
                  placeholder="Search by name, email, phone, job title, location, sector, or skills..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="job-title" className="text-sm font-medium mb-2 block">
                  Job Title
                </Label>
                <Select value={selectedJobTitle} onValueChange={setSelectedJobTitle}>
                  <SelectTrigger id="job-title">
                    <SelectValue placeholder="All Job Titles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Job Titles</SelectItem>
                    {jobTitles.map((title) => (
                      <SelectItem key={title} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="location" className="text-sm font-medium mb-2 block">
                  Location
                </Label>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger id="location">
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="experience" className="text-sm font-medium mb-2 block">
                  Years of Experience
                </Label>
                <Select value={experienceFilter} onValueChange={setExperienceFilter}>
                  <SelectTrigger id="experience">
                    <SelectValue placeholder="All Experience Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Experience Levels</SelectItem>
                    <SelectItem value="0-2">0-2 years</SelectItem>
                    <SelectItem value="3-5">3-5 years</SelectItem>
                    <SelectItem value="6-10">6-10 years</SelectItem>
                    <SelectItem value="10+">10+ years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(searchTerm || selectedJobTitle !== 'all' || locationFilter !== 'all' || experienceFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedJobTitle('all');
                  setLocationFilter('all');
                  setExperienceFilter('all');
                }}
                className="text-sm"
              >
                Clear All Filters
              </Button>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {Math.min(currentPage * ITEMS_PER_PAGE, filteredProfiles.length)} of {filteredProfiles.length} candidates
              {filteredProfiles.length !== profiles.length && ` (${profiles.length} total)`}
            </span>
            {selectedCandidates.size > 0 && (
              <span className="font-medium text-primary">
                {selectedCandidates.size} selected
              </span>
            )}
          </div>
        </Card>

        {/* Candidates List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading candidates...</p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No Candidates Found</h3>
            <p className="text-muted-foreground">
              {profiles.length === 0
                ? 'Upload some resumes to get started'
                : 'Try adjusting your filters'}
            </p>
          </Card>
        ) : (
          <>
            {/* Bulk Select Header */}
            {filteredProfiles.length > 0 && (
              <Card className="p-4 mb-4 bg-muted/50">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={
                      selectedCandidates.size > 0 &&
                      filteredProfiles
                        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                        .every(p => selectedCandidates.has(p.id))
                    }
                    onCheckedChange={handleSelectAll}
                  />
                  <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Select all on this page
                  </Label>
                </div>
              </Card>
            )}
            
            <div className="grid gap-4">
              {filteredProfiles
                .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                .map((profile) => (
              <Card
                key={profile.id}
                className="p-6 hover:shadow-lg transition-all duration-300 bg-card/50 backdrop-blur-sm border-2 hover:border-primary/50"
              >
                <div className="flex gap-4">
                  <div className="flex items-start pt-1">
                    <Checkbox
                      checked={selectedCandidates.has(profile.id)}
                      onCheckedChange={(checked) => handleSelectCandidate(profile.id, checked as boolean)}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-foreground">
                              {profile.full_name || 'Unknown'}
                            </h3>
                            {profile.job_title && (
                              <div className="flex items-center gap-2 mt-1">
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                              {profile.job_title}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-2 text-sm">
                      {profile.email && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-4 w-4" />
                          <span>{profile.email}</span>
                        </div>
                      )}
                      {profile.phone_number && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <span>{profile.phone_number}</span>
                        </div>
                      )}
                      {profile.location && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{profile.location}</span>
                        </div>
                      )}
                      {profile.years_of_experience && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Briefcase className="h-4 w-4" />
                          <span>{profile.years_of_experience} years experience</span>
                        </div>
                      )}
                    </div>

                    {profile.skills && profile.skills.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {profile.skills.slice(0, 5).map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                        {profile.skills.length > 5 && (
                          <span className="px-3 py-1 bg-muted text-muted-foreground rounded-full text-xs font-medium">
                            +{profile.skills.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex md:flex-col gap-2">
                    <Button
                      onClick={() => handleViewResume(profile.resume_file_url)}
                      className="gap-2 whitespace-nowrap"
                      disabled={!profile.resume_file_url}
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Resume
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
            ))}
            </div>
            
            {/* Pagination */}
            {filteredProfiles.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.ceil(filteredProfiles.length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      onClick={() => setCurrentPage(page)}
                      size="sm"
                      className="min-w-[40px]"
                    >
                      {page}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredProfiles.length / ITEMS_PER_PAGE), p + 1))}
                  disabled={currentPage === Math.ceil(filteredProfiles.length / ITEMS_PER_PAGE)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Candidates?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCandidates.size} candidate profile(s) will be permanently deleted. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? 'Deleting...' : `Delete ${selectedCandidates.size} Profile(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Duplicates Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Duplicate Candidates?</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateCount} duplicate candidate profile(s) will be permanently deleted. 
              This action cannot be undone.
              <br /><br />
              <strong>Note:</strong> For candidates with the same email or phone number, 
              only the most recently uploaded profile will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDuplicates}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDuplicates}
              disabled={deletingDuplicates}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingDuplicates ? 'Deleting...' : `Delete ${duplicateCount} Profile(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Footer />
    </div>
  );
}
