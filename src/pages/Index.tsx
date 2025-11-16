import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResumeUpload } from '@/components/ResumeUpload';
import { CandidateHunting } from '@/components/CandidateHunting';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Users, Upload, LogOut, Bookmark, History } from 'lucide-react';
import talentProLogo from '@/assets/talent-pro-logo.png';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen relative overflow-hidden animate-fade-in">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="absolute inset-0 bg-mesh" />
        
        {/* Floating Orbs */}
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 left-1/4 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-accent/10 rounded-full blur-3xl animate-pulse-glow" />
      </div>
      
      <div className="container mx-auto px-4 py-8 max-w-7xl relative z-10">
        <header className="mb-12 text-center space-y-4">
          <div className="inline-flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse-glow" />
            <img src={talentProLogo} alt="Talent Pro Logo" className="h-24 w-auto relative z-10 drop-shadow-2xl" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-foreground bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-accent animate-fade-in">
            Talent Radar
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            AI-Powered Recruitment Platform - Upload resumes, store candidate data, and find the perfect match with intelligent ranking
          </p>
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Welcome, {user.email}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={signOut}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/bookmarks')}
                className="gap-2 bg-card/50 backdrop-blur-sm hover:bg-primary/10 border-primary/30"
              >
                <Bookmark className="h-4 w-4" />
                My Bookmarks
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/history')}
                className="gap-2 bg-card/50 backdrop-blur-sm hover:bg-primary/10 border-primary/30"
              >
                <History className="h-4 w-4" />
                Search History
              </Button>
            </div>
          </div>
        </header>

        <Tabs defaultValue="upload" className="space-y-8">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 h-14 bg-card/50 backdrop-blur-sm border border-primary/20 shadow-[var(--shadow-elegant)]">
            <TabsTrigger 
              value="upload" 
              className="text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all"
            >
              <Upload className="h-5 w-5 mr-2" />
              Upload Resumes
            </TabsTrigger>
            <TabsTrigger 
              value="hunt" 
              className="text-base data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all"
            >
              <Users className="h-5 w-5 mr-2" />
              Find Candidates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <ResumeUpload />
          </TabsContent>

          <TabsContent value="hunt" className="space-y-6">
            <CandidateHunting />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
