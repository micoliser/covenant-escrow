import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectWallet } from '@/components/ConnectWallet';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { useHasMounted } from '@/hooks/useHasMounted';

// Mock the hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  useConnect: vi.fn(),
  useDisconnect: vi.fn(),
  useSignMessage: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useApi', () => ({
  useApi: vi.fn(),
}));

vi.mock('@/hooks/useHasMounted', () => ({
  useHasMounted: vi.fn(),
}));

describe('ConnectWallet Component', () => {
  const mockFetchApi = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    // Default mock implementations
    (useHasMounted as any).mockReturnValue(true);
    
    (useAccount as any).mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
    });
    
    (useConnect as any).mockReturnValue({
      connectors: [{}],
      connectAsync: vi.fn(),
    });
    
    (useDisconnect as any).mockReturnValue({
      disconnectAsync: vi.fn().mockResolvedValue(undefined),
    });
    
    (useSignMessage as any).mockReturnValue({
      signMessageAsync: vi.fn(),
    });
    
    (useAuth as any).mockReturnValue({
      isAuthenticated: false,
      isInitializing: false,
      logout: vi.fn(),
      setAccessToken: vi.fn(),
    });
    
    (useApi as any).mockReturnValue({
      fetchApi: mockFetchApi,
    });
  });

  it('renders connect button by default', () => {
    render(<ConnectWallet />);
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
  });

  it('shows connecting state when initializing', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: false,
      isInitializing: true,
      logout: vi.fn(),
      setAccessToken: vi.fn(),
    });
    
    render(<ConnectWallet />);
    const btn = screen.getByRole('button', { name: /connecting/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it('shows wallet address and disconnect when authenticated and connected', () => {
    (useAccount as any).mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    });
    
    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
    });
    
    render(<ConnectWallet />);
    expect(screen.getByText('0x1234...5678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
  });

  it('handles disconnect flow', async () => {
    const mockDisconnectAsync = vi.fn();
    const mockLogout = vi.fn();
    
    (useAccount as any).mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    });
    
    (useDisconnect as any).mockReturnValue({
      disconnectAsync: mockDisconnectAsync,
    });
    
    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isInitializing: false,
      logout: mockLogout,
    });
    
    // Make fetchApi resolve empty for the logout call
    mockFetchApi.mockResolvedValueOnce({ ok: true });
    
    render(<ConnectWallet />);
    
    const disconnectBtn = screen.getByRole('button', { name: /disconnect/i });
    fireEvent.click(disconnectBtn);
    
    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
      expect(mockDisconnectAsync).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('shows error if metamask is not present', async () => {
    // Make sure window.ethereum is undefined
    const originalEthereum = (window as any).ethereum;
    delete (window as any).ethereum;
    
    render(<ConnectWallet />);
    
    const connectBtn = screen.getByRole('button', { name: /connect wallet/i });
    fireEvent.click(connectBtn);
    
    await waitFor(() => {
      expect(screen.getByText(/Only MetaMask is supported/i)).toBeInTheDocument();
    });
    
    // Restore
    if (originalEthereum) {
      (window as any).ethereum = originalEthereum;
    }
  });
});
