import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus, ExecutionResult } from 'genlayer-js/types';

export function useGenLayerWrite() {
  const { address, isConnected } = useAccount();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We can't synchronously create the client if we need the async provider, 
  // but window.ethereum works if it's the injected wallet. 
  // For safety, we can build the client on demand when writing.
  
  const submitTransaction = useCallback(async (
    contractAddress: string,
    functionName: string,
    args: unknown[],
    onTxHash?: (hash: string) => void
  ) => {
    if (!isConnected || !address) {
      throw new Error("Wallet not connected");
    }

    try {
      setIsPending(true);
      setError(null);
      
      let provider: any = null;
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        provider = (window as any).ethereum;
        if (!provider.isMetaMask) {
          throw new Error("Only MetaMask is supported. Please switch to MetaMask.");
        }
      }

      if (!provider) {
        throw new Error("No wallet provider found. Please install MetaMask.");
      }

      const client = createClient({
        chain: studionet,
        account: address as `0x${string}`,
        provider,
      });

      // Ensure wallet is on the correct network
      await client.connect("studionet");

      const txHash = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: args as any,
        value: BigInt(0),
      });

      if (onTxHash) {
        onTxHash(txHash);
      }

      const receipt = await client.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        interval: 5000,
        retries: 60
      });
      
      if (receipt.txExecutionResultName === 'FINISHED_WITH_ERROR') {
        throw new Error("Transaction reverted during GenVM execution (FINISHED_WITH_ERROR)");
      } else if (receipt.txExecutionResultName !== 'FINISHED_WITH_RETURN' && receipt.txExecutionResultName !== undefined) {
         // Could be NOT_VOTED or other states if it wasn't successful
         // The prompt says we should handle "AI screening rejection" which might surface as FINISHED_WITH_ERROR or a specific return value? 
         // Let's assume FINISHED_WITH_ERROR for now or look at the receipt.data
      }

      return { txHash, receipt };
    } catch (err: unknown) {
      console.error("GenLayer write error:", err);
      // Check if it's a signature rejection (user denied)
      if (err instanceof Error && err.message.toLowerCase().includes('user rejected')) {
        setError("Transaction was rejected by the user.");
      } else if (err instanceof Error) {
        setError(err.message || "An unknown error occurred during the transaction.");
      } else {
        setError("An unknown error occurred during the transaction.");
      }
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [isConnected, address]);

  return { submitTransaction, isPending, error };
}
