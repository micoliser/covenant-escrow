import { useState, useCallback } from 'react';
import { useGenLayerWrite } from './useGenLayerWrite';
import { toast } from 'sonner';
import { ExecutionResult } from 'genlayer-js/types';
import { useApi } from '@/hooks/useApi';

export type TxPhase = 
  | 'IDLE' 
  | 'CONFIRMING' 
  | 'SUBMITTED' 
  | 'CONFIRMED' 
  | 'FAILED' 
  | 'UNDETERMINED';

export interface ExecuteOptions {
  onConfirmed?: (receipt: any) => Promise<void> | void;
  confirmingMessage?: string;
  submittedMessage?: string;
  confirmedMessage?: string;
  syncRequests?: { entityType: 'dao' | 'proposal', entityId: number | string }[];
}

export function useTransaction() {
  const { submitTransaction } = useGenLayerWrite();
  const { fetchApi } = useApi();
  const [txPhase, setTxPhase] = useState<TxPhase>('IDLE');
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (
    contractAddress: string, 
    functionName: string, 
    args: unknown[], 
    opts?: ExecuteOptions
  ) => {
    setTxPhase('CONFIRMING');
    setError(null);
    const toastId = toast.loading(opts?.confirmingMessage || "Please confirm in your wallet...");

    let timeoutId: NodeJS.Timeout;
    try {
      const { receipt } = await submitTransaction(
        contractAddress,
        functionName,
        args,
        (hash) => {
          setTxPhase('SUBMITTED');
          toast.loading(opts?.submittedMessage || "Transaction submitted, waiting for confirmation...", { id: toastId });
          
          timeoutId = setTimeout(() => {
            toast.loading("Transaction is taking longer than expected. It is still being processing...", { id: toastId });
          }, 60000);
        }
      );

      // Timeout or undetermined states should be caught by submitTransaction throwing, 
      // but if we get a receipt back that isn't FINISHED_WITH_RETURN
      if (receipt.txExecutionResultName === 'FINISHED_WITH_ERROR') {
         throw new Error("Transaction reverted during GenVM execution (FINISHED_WITH_ERROR)");
      } else if (receipt.txExecutionResultName !== 'FINISHED_WITH_RETURN' && receipt.txExecutionResultName !== undefined) {
         setTxPhase('UNDETERMINED');
         toast.warning("The transaction was submitted but we couldn't confirm its outcome. Please wait a moment and refresh to check.", { id: toastId, duration: 10000 });
         return;
      }

      if (opts?.syncRequests && opts.syncRequests.length > 0) {
        toast.loading("Syncing updated state...", { id: toastId });
        for (const req of opts.syncRequests) {
          try {
            await fetchApi('/api/indexer/sync-request/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: req.entityType,
                entity_id: typeof req.entityId === 'string' ? parseInt(req.entityId) : req.entityId
              })
            });
          } catch (e) {
            console.warn("Failed to manually sync", req, e);
          }
        }
      }

      setTxPhase('CONFIRMED');
      toast.success(opts?.confirmedMessage || "Transaction confirmed!", { id: toastId });
      
      if (opts?.onConfirmed) {
        await opts.onConfirmed(receipt);
      }

      if (timeoutId!) clearTimeout(timeoutId);

    } catch (err: any) {
      if (timeoutId!) clearTimeout(timeoutId);
      console.error("Tx Error:", err);
      const errMsg = err.message || String(err);
      
      if (errMsg.toLowerCase().includes('user rejected') || errMsg.toLowerCase().includes('denied')) {
        setTxPhase('FAILED');
        setError("Transaction was rejected by the user.");
        toast.dismiss(toastId);
        return;
      }

      // If it looks like a timeout or unhandled promise rejection from the provider
      if (errMsg.toLowerCase().includes('timeout') || errMsg.toLowerCase().includes('timed out')) {
        setTxPhase('UNDETERMINED');
        toast.warning("The transaction was submitted but we couldn't confirm its outcome. Please wait a moment and refresh to check.", { id: toastId, duration: 10000 });
        return;
      }

      setTxPhase('FAILED');
      setError(errMsg);
      toast.error(errMsg, { id: toastId });
    }
  }, [submitTransaction]);

  const isLocked = txPhase === 'CONFIRMING' || txPhase === 'SUBMITTED';

  const reset = useCallback(() => {
    setTxPhase('IDLE');
    setError(null);
  }, []);

  return {
    execute,
    txPhase,
    isLocked,
    error,
    reset
  };
}
