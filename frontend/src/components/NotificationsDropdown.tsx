"use client";

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, XCircle, CheckCircle, Lock, ThumbsDown, AlertTriangle, FileCheck, CornerUpLeft, MessageCircle, FilePlus, BellRing } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useAccount } from 'wagmi';
import { useHasMounted } from '@/hooks/useHasMounted';
import { formatDistanceToNow } from '@/lib/date';
import { Card } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

export interface Notification {
  id: number;
  type: string;
  proposal?: number;
  read_at: string | null;
  created_at: string;
}

export function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { fetchApi } = useApi();
  const { isAuthenticated } = useAuth();
  const { isConnected } = useAccount();
  const hasMounted = useHasMounted();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Polling for unread count
  const { data: countData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const res = await fetchApi('/auth/notifications/unread-count/');
      if (!res.ok) throw new Error('Failed to fetch unread count');
      return res.json();
    },
    enabled: !!hasMounted && !!isConnected && !!isAuthenticated,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const unreadCount = countData?.unread_count ?? 0;

  // Fetch full list ONLY when opened
  const { data: notifications, isLoading, refetch } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: async () => {
      const res = await fetchApi('/auth/notifications/');
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const data = await res.json();
      return data.results || data; // Handle paginated response
    },
    enabled: isOpen,
    staleTime: 0, // Always fetch fresh on open
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetchApi(`/auth/notifications/${id}/read/`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to mark as read');
      return res.json();
    },
    onMutate: async (id) => {
      // Optimistically update
      await queryClient.cancelQueries({ queryKey: ['notifications-list'] });
      await queryClient.cancelQueries({ queryKey: ['notifications-unread-count'] });

      const previousNotifications = queryClient.getQueryData(['notifications-list']);
      
      queryClient.setQueryData(['notifications-list'], (old: Notification[] | undefined) => {
        if (!old) return old;
        return old.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n);
      });

      queryClient.setQueryData(['notifications-unread-count'], (old: { unread_count: number } | undefined) => {
        if (!old) return old;
        return { unread_count: Math.max(0, old.unread_count - 1) };
      });

      return { previousNotifications };
    },
    onError: (err, id, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(['notifications-list'], context.previousNotifications);
      }
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchApi('/auth/notifications/mark-all-read/', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to mark all as read');
    },
    onSuccess: () => {
      queryClient.setQueryData(['notifications-list'], (old: Notification[] | undefined) => {
        if (!old) return old;
        return old.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
      });
      queryClient.setQueryData(['notifications-unread-count'], { unread_count: 0 });
    }
  });

  useEffect(() => {
    if (isOpen) {
      refetch();
    }
  }, [isOpen, refetch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);


  if (!hasMounted || !isConnected || !isAuthenticated) {
    return null; // Don't render for logged out users
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read_at) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.proposal) {
      const url = notification.type === 'new_comment'
        ? `/proposal/${notification.proposal}#comments`
        : `/proposal/${notification.proposal}`;
      router.push(url);
      setIsOpen(false);
    }
  };

  const getNotificationDetails = (type: string) => {
    switch(type) {
      case 'status_rejected': 
        return { message: 'Your proposal was rejected', color: 'text-red-400 bg-red-400/10', icon: <XCircle className="w-4 h-4" aria-hidden="true" /> };
      case 'status_approved': 
        return { message: 'Your proposal is open for voting', color: 'text-accent bg-accent/10', icon: <CheckCircle className="w-4 h-4" aria-hidden="true" /> };
      case 'status_escrowed': 
        return { message: 'Your proposal was escrowed', color: 'text-amber-500 bg-amber-500/10', icon: <Lock className="w-4 h-4" aria-hidden="true" /> };
      case 'status_vote_failed': 
        return { message: 'The vote for your proposal failed', color: 'text-zinc-400 bg-zinc-400/10', icon: <ThumbsDown className="w-4 h-4" aria-hidden="true" /> };
      case 'status_verification_failed': 
        return { message: 'Deliverable verification failed', color: 'text-red-400 bg-red-400/10', icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" /> };
      case 'status_verification_passed': 
        return { message: 'Deliverable verification passed', color: 'text-emerald-400 bg-emerald-400/10', icon: <FileCheck className="w-4 h-4" aria-hidden="true" /> };
      case 'status_reclaimed': 
        return { message: 'Funds were reclaimed by the DAO', color: 'text-zinc-400 bg-zinc-400/10', icon: <CornerUpLeft className="w-4 h-4" aria-hidden="true" /> };
      case 'new_comment': 
        return { message: 'New comment on your proposal', color: 'text-zinc-300 bg-zinc-700/20', icon: <MessageCircle className="w-4 h-4" aria-hidden="true" /> };
      case 'new_proposal_in_dao': 
        return { message: 'New proposal opened for voting', color: 'text-zinc-300 bg-zinc-700/20', icon: <FilePlus className="w-4 h-4" aria-hidden="true" /> };
      default: 
        return { message: 'New notification', color: 'text-zinc-400 bg-zinc-800', icon: <BellRing className="w-4 h-4" aria-hidden="true" /> };
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center text-zinc-400 hover:text-white transition-colors p-2 rounded-full hover:bg-zinc-800/50"
      >
        <Bell className="w-5 h-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex min-w-[16px] h-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white ring-2 ring-zinc-950">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <Card className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 bg-zinc-900 border border-zinc-800 shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/50 flex justify-between items-center bg-zinc-900">
            <h3 className="font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsReadMutation.mutate();
                }}
                disabled={markAllAsReadMutation.isPending}
                className="text-xs text-accent hover:text-accent-hover transition-colors font-medium disabled:opacity-50"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-2 h-2 mt-2 rounded-full bg-zinc-800" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-zinc-800 rounded w-3/4" />
                      <div className="h-3 bg-zinc-800 rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="divide-y divide-zinc-800/50">
                {notifications.map((notification: Notification) => {
                  const details = getNotificationDetails(notification.type);
                  return (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left p-4 hover:bg-zinc-800/50 transition-colors flex gap-3 ${
                        !notification.read_at ? 'bg-accent/5' : ''
                      }`}
                    >
                      <div className="mt-1 flex-shrink-0 relative">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${details.color}`}>
                          {details.icon}
                          {!notification.read_at && (
                            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-zinc-900" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <p className={`text-sm ${!notification.read_at ? 'text-white font-medium' : 'text-zinc-300'}`}>
                          {details.message}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {formatDistanceToNow(notification.created_at)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-400 text-sm">
                No notifications yet.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
