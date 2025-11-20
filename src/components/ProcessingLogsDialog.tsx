import React, { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'success';
  message: string;
}

interface ProcessingLogsDialogProps {
  open: boolean;
  logs: LogEntry[];
  progress: number;
  status: string;
  isComplete: boolean;
  hasError: boolean;
}

interface ProcessingLogsDialogProps {
  open: boolean;
  logs: LogEntry[];
  progress: number;
  status: string;
  isComplete: boolean;
  hasError: boolean;
  onClose: () => void;
  onCancel?: () => void;
  estimatedTimeRemaining?: number | null;
}

export const ProcessingLogsDialog: React.FC<ProcessingLogsDialogProps> = ({
  open,
  logs,
  progress,
  status,
  isComplete,
  hasError,
  onClose,
  onCancel,
  estimatedTimeRemaining,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getIcon = (level: string) => {
    switch (level) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Info className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && (isComplete || hasError) && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!isComplete && !hasError && (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {isComplete && !hasError && (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            {hasError && <XCircle className="h-5 w-5 text-destructive" />}
            Processing Candidates
          </DialogTitle>
          <DialogDescription>
            {status}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{Math.round(progress)}%</span>
                {estimatedTimeRemaining && estimatedTimeRemaining > 0 && !isComplete && (
                  <span className="text-xs text-muted-foreground">
                    ~{estimatedTimeRemaining}s remaining
                  </span>
                )}
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {hasError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                An error occurred during processing. Check the logs below for details.
              </AlertDescription>
            </Alert>
          )}

          <div className="border rounded-lg bg-muted/50">
            <ScrollArea className="h-[300px] p-4" ref={scrollRef}>
              <div className="space-y-2 font-mono text-xs">
                {logs.length === 0 ? (
                  <div className="text-muted-foreground text-center py-8">
                    Waiting for processing to start...
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-2 p-2 rounded transition-colors ${
                        log.level === 'error'
                          ? 'bg-destructive/10'
                          : log.level === 'success'
                          ? 'bg-green-500/10'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <span className="flex-shrink-0 mt-0.5">{getIcon(log.level)}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-muted-foreground">
                          [{log.timestamp}]
                        </span>{' '}
                        <span
                          className={`${
                            log.level === 'error'
                              ? 'text-destructive font-medium'
                              : log.level === 'success'
                              ? 'text-green-600 dark:text-green-400'
                              : ''
                          }`}
                        >
                          {log.message}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {(isComplete || hasError) ? (
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={onClose} variant="default">
                Close
              </Button>
            </div>
          ) : onCancel ? (
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={onCancel} variant="destructive">
                Cancel Upload
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
