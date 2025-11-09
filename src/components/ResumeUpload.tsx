import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileText, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export const ResumeUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', file.name);

        const { data, error } = await supabase.functions.invoke('parse-resume', {
          body: formData,
        });

        if (error) {
          throw new Error(error.message || 'Failed to upload resume');
        }

        console.log('Resume uploaded:', data);
        setUploadedCount(prev => prev + 1);
      }

      toast({
        title: 'Success!',
        description: `Successfully uploaded and parsed ${files.length} resume(s)`,
      });

      event.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload resume',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-8 bg-gradient-to-br from-card/90 to-muted/20 backdrop-blur-sm border-2 border-dashed border-primary/30 hover:border-primary/60 hover:shadow-[var(--shadow-premium)] transition-all duration-300">
      <div className="flex flex-col items-center justify-center space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse-glow" />
          <div className="relative p-6 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-full ring-2 ring-primary/30 shadow-[var(--shadow-glow)]">
            <Upload className="h-16 w-16 text-primary animate-pulse" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-2xl font-bold text-foreground">Upload Resumes</h3>
          <p className="text-muted-foreground max-w-md">
            Upload candidate resumes in PDF or text format. Our AI will extract and store all relevant information.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <label htmlFor="resume-upload" className="w-full">
            <Button
              disabled={uploading}
              className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-[var(--shadow-elegant)] hover:shadow-[var(--shadow-premium)] hover:scale-105 transition-all duration-300"
              asChild
            >
              <span>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-5 w-5" />
                    Select Resume Files
                  </>
                )}
              </span>
            </Button>
            <input
              id="resume-upload"
              type="file"
              multiple
              accept=".pdf,.txt,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>

          {uploadedCount > 0 && (
            <div className="flex items-center gap-2 text-accent animate-fade-in bg-accent/10 px-4 py-2 rounded-lg border border-accent/30">
              <CheckCircle className="h-5 w-5 animate-pulse" />
              <span className="font-medium">{uploadedCount} resumes uploaded successfully</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};