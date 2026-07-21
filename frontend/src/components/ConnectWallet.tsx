"use client";

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { isAuthenticated, isInitializing, logout, setAccessToken } = useAuth();
  const { fetchApi } = useApi();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    try {
      setError('');
      setIsAuthenticating(true);

      let walletAddress = address;
      let currentChainId = chainId;

      // 1. Connect wallet if not already connected
      if (!isConnected || !walletAddress) {
        const connectResult = await connectAsync({ connector: connectors[0] });
        walletAddress = connectResult.accounts[0];
        currentChainId = connectResult.chainId;
      }

      // 2. Fetch nonce
      const nonceRes = await fetchApi('/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress })
      });
      if (!nonceRes.ok) throw new Error('Failed to fetch nonce');
      const { nonce } = await nonceRes.json();

      // 3. Create SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address: walletAddress as string,
        statement: 'Sign in to Covenant Escrow DAO',
        uri: window.location.origin,
        version: '1',
        chainId: currentChainId,
        nonce,
      });
      const preparedMessage = message.prepareMessage();

      // 4. Sign message
      const signature = await signMessageAsync({ message: preparedMessage });

      // 5. Verify and get token
      const verifyRes = await fetchApi('/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: preparedMessage, signature }),
      });
      if (!verifyRes.ok) throw new Error('Failed to verify signature');
      const { access } = await verifyRes.json();

      // 6. Set token
      setAccessToken(access);
    } catch (err: any) {
      console.error('Connection error:', err);
      setError(err.message || 'Connection failed');
      await disconnectAsync().catch(() => {});
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetchApi('/auth/logout', {
        method: 'POST',
      });
    } catch (e) {
      console.error('Logout error:', e);
    }
    await disconnectAsync();
    logout();
  };

  if (isAuthenticated && isConnected) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm font-mono font-medium text-foreground bg-foreground/5 px-3 py-1.5 rounded-full border border-foreground/10 shadow-sm backdrop-blur-sm">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
        <button
          onClick={handleDisconnect}
          className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="flex flex-col items-end gap-2 opacity-50">
        <button
          disabled
          className="h-10 px-5 rounded-full bg-zinc-800 text-transparent animate-pulse font-medium"
        >
          Connecting...
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleConnect}
        disabled={isAuthenticating}
        className="h-10 px-5 rounded-full bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-sm"
      >
        {isAuthenticating ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {error && <span className="text-xs text-red-500 max-w-[200px] text-right">{error}</span>}
    </div>
  );
}
