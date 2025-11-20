import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ProcessingLogsDialog } from '@/components/ProcessingLogsDialog';
import { supabase } from '@/integrations/supabase/client';

export const ResumeUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [processingLogs, setProcessingLogs] = useState<Array<{ timestamp: string; level: 'info' | 'error' | 'success'; message: string }>>([]);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);
  const [droppedFiles, setDroppedFiles] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelUpload = () => {
    setIsCancelled(true);
    abortControllerRef.current?.abort();
    setProcessingLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'Upload cancelled by user'
    }]);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Pre-validate files
    const filesArray = Array.from(files);
    const validFiles: File[] = [];
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    const ALLOWED_TYPES = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    
    for (const file of filesArray) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: 'File Too Large',
          description: `${file.name} exceeds 20MB limit`,
          variant: 'destructive',
        });
        continue;
      }
      
      if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|txt|doc|docx)$/i)) {
        toast({
          title: 'Invalid File Type',
          description: `${file.name} is not a supported format`,
          variant: 'destructive',
        });
        continue;
      }
      
      validFiles.push(file);
    }
    
    if (validFiles.length === 0) {
      toast({
        title: 'No Valid Files',
        description: 'Please upload PDF, TXT, DOC, or DOCX files under 20MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setShowLogsDialog(true);
    setProcessingLogs([]);
    setProgress(0);
    setIsComplete(false);
    setHasError(false);
    setTotalFiles(validFiles.length);
    setProcessedFiles(0);
    setDroppedFiles(0);
    setUploadedCount(0);
    setEstimatedTimeRemaining(null);
    setIsCancelled(false);
    abortControllerRef.current = new AbortController();
    let successCount = 0;
    const startTime = Date.now();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No active session found');

      // Process files in parallel batches of 8 for faster bulk uploads
      const BATCH_SIZE = 8;
      const batches: File[][] = [];
      for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
        batches.push(validFiles.slice(i, i + BATCH_SIZE));
      }

      for (const batch of batches) {
        if (isCancelled || abortControllerRef.current?.signal.aborted) {
          break;
        }
        
        // Process batch in parallel
        const batchPromises = batch.map(async (file) => {
          if (abortControllerRef.current?.signal.aborted) {
            return { success: false, fileName: file.name, cancelled: true };
          }
          const formData = new FormData();
          formData.append('file', file);
          formData.append('fileName', file.name);

          try {
            const response = await fetch(
              'https://olkbhjyfpdvcovtuekzt.supabase.co/functions/v1/parse-resume',
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: formData,
                signal: abortControllerRef.current?.signal,
              }
            );

            if (!response.ok || !response.body) {
              throw new Error(`Upload failed for ${file.name}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fileSuccess = false;

            let currentEvent = '';
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim() || line.startsWith(':')) continue;
                
                // Track event type
                if (line.startsWith('event:')) {
                  currentEvent = line.slice(6).trim();
                  continue;
                }
                
                if (line.startsWith('data:')) {
                  try {
                    const data = JSON.parse(line.slice(5).trim());
                    
                    // Handle log events
                    if (data.level && data.message) {
                      setProcessingLogs(prev => [...prev, {
                        timestamp: new Date().toLocaleTimeString(),
                        level: data.level,
                        message: data.message
                      }]);
                    }
                    
                    // Handle complete event
                    if (currentEvent === 'complete' && data.success) {
                      fileSuccess = true;
                    }
                    
                    // Handle error event
                    if (currentEvent === 'error') {
                      setProcessingLogs(prev => [...prev, {
                        timestamp: new Date().toLocaleTimeString(),
                        level: 'error',
                        message: data.message || 'Processing failed'
                      }]);
                    }
                    
                    currentEvent = ''; // Reset after processing
                  } catch (parseError) {
                    console.error('Failed to parse SSE data:', parseError);
                  }
                }
              }
            }

            return { success: fileSuccess, fileName: file.name };
          } catch (error) {
            setProcessingLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString(),
              level: 'error',
              message: `Failed: ${file.name}`
            }]);
            return { success: false, fileName: file.name };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        
        let failedInBatch = 0;
        let cancelledInBatch = 0;
        batchResults.forEach(result => {
          if (result.success) {
            successCount++;
          } else if (!(result as any).cancelled) {
            failedInBatch++;
          } else {
            cancelledInBatch++;
          }
          if (!(result as any).cancelled) {
            setProcessedFiles(prev => prev + 1);
          }
        });

        setDroppedFiles(prev => prev + failedInBatch);
        const currentProcessed = successCount + failedInBatch;
        setProgress((currentProcessed / validFiles.length) * 100);
        
        // Update time estimation
        const elapsedTime = Date.now() - startTime;
        const avgTimePerFile = elapsedTime / currentProcessed;
        const remainingFiles = validFiles.length - currentProcessed;
        setEstimatedTimeRemaining(Math.ceil((avgTimePerFile * remainingFiles) / 1000));
      }

      setUploadedCount(successCount);
      setIsComplete(true);
      setEstimatedTimeRemaining(null);
      
      if (isCancelled || abortControllerRef.current?.signal.aborted) {
        toast({
          title: 'Upload Cancelled',
          description: `Processed ${successCount} resume(s) before cancellation`,
          variant: 'default',
        });
      } else {
        const failedCount = validFiles.length - successCount;
        toast({
          title: failedCount === 0 ? 'Success!' : 'Partially Complete',
          description: failedCount === 0 
            ? `Successfully uploaded ${successCount} resume(s)`
            : `Uploaded ${successCount} resume(s), ${failedCount} failed`,
          variant: failedCount === 0 ? 'default' : 'destructive',
        });
      }
      event.target.value = '';
    } catch (error) {
      setHasError(true);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload',
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
              <span className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                {uploading ? 'Processing...' : 'Select Resume Files'}
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

      <ProcessingLogsDialog
        open={showLogsDialog}
        logs={processingLogs}
        progress={progress}
        status={
          uploading 
            ? `Processing resumes... (${processedFiles}/${totalFiles} processed, ${droppedFiles} dropped)` 
            : `Upload complete - ${processedFiles} processed, ${uploadedCount} uploaded, ${droppedFiles} dropped`
        }
        isComplete={isComplete}
        hasError={hasError}
        onClose={() => {
          setShowLogsDialog(false);
          setIsComplete(false);
          setHasError(false);
        }}
        onCancel={uploading ? handleCancelUpload : undefined}
        estimatedTimeRemaining={estimatedTimeRemaining}
      />
    </Card>
  );
};