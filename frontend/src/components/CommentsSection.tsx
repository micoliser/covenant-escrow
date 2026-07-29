"use client";

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAccount } from 'wagmi';
import { useHasMounted } from '@/hooks/useHasMounted';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SkeletonCard } from '@/components/Skeletons';
import { MessageSquare, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ConnectWallet } from '@/components/ConnectWallet';
import { formatDistanceToNow } from '@/lib/date';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Comment {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

interface CommentsSectionProps {
  proposalId: string;
}

export function CommentsSection({ proposalId }: CommentsSectionProps) {
  const { fetchApi } = useApi();
  const { address, isConnected } = useAccount();
  const hasMounted = useHasMounted();
  const { isAuthenticated } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  
  const [newComment, setNewComment] = useState("");
  const MAX_CHARS = 2000;

  const fetchComments = async (url?: string) => {
    try {
      if (!url) setIsLoading(true);
      else setIsLoadingMore(true);

      const endpoint = url || `/api/proposals/${proposalId}/comments/`;
      const res = await fetchApi(endpoint);
      
      if (res.ok) {
        const data = await res.json();
        if (url) {
          setComments(prev => [...prev, ...data.results]);
        } else {
          setComments(data.results || []);
        }
        
        if (data.next) {
          // DRF might return full URL, we need to extract path for fetchApi if necessary,
          // or fetchApi might handle full URLs. Assuming fetchApi handles relative paths well,
          // but if next is a full URL, we extract the path + query.
          try {
            const urlObj = new URL(data.next);
            setNextPage(urlObj.pathname + urlObj.search);
          } catch (e) {
            setNextPage(data.next);
          }
        } else {
          setNextPage(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (proposalId) {
      fetchComments();
    }
  }, [proposalId]);

  const handlePostComment = async () => {
    if (!newComment.trim() || newComment.length > MAX_CHARS) return;
    
    try {
      setIsPosting(true);
      const res = await fetchApi(`/api/proposals/${proposalId}/comments/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment.trim() })
      });

      if (res.ok) {
        setNewComment("");
        // Reload from scratch to get latest
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setIsPosting(false);
    }
  };

  const confirmDelete = (commentId: number) => {
    setCommentToDelete(commentId);
  };

  const handleDeleteComment = async () => {
    if (commentToDelete === null) return;

    try {
      const res = await fetchApi(`/api/comments/${commentToDelete}/`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setComments(prev => prev.filter(c => c.id !== commentToDelete));
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    } finally {
      setCommentToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5" aria-hidden="true" />
          Discussion
        </h2>
        <SkeletonCard />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-display font-semibold text-white flex items-center gap-2">
        <MessageSquare className="w-5 h-5" aria-hidden="true" />
        Discussion
      </h2>

      {/* Posting Section */}
      <Card>
        <CardContent className="p-6">
          {(!hasMounted || !isConnected || !isAuthenticated) ? (
            <div className="text-center p-6 bg-zinc-900/50 rounded-lg border border-white/5 flex flex-col items-center gap-4">
              <p className="text-zinc-400">You must be connected and signed in to comment.</p>
              <ConnectWallet />
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea 
                aria-label="New comment"
                placeholder="Add to the discussion..."
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                className="min-h-[100px] bg-zinc-950/50 border-zinc-800 text-zinc-300 resize-y"
              />
              <div className="flex justify-between items-center">
                <span className={`text-xs font-medium ${newComment.length > MAX_CHARS ? 'text-red-400' : 'text-zinc-400'}`}>
                  {newComment.length} / {MAX_CHARS}
                </span>
                <Button 
                  disabled={isPosting || !newComment.trim() || newComment.length > MAX_CHARS}
                  onClick={handlePostComment}
                  className="bg-accent text-white hover:bg-accent-hover"
                >
                  {isPosting ? 'Posting...' : 'Post Comment'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comments List */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-8">No comments yet. Be the first to start the discussion!</p>
        ) : (
          comments.map(comment => (
            <Card key={comment.id} className="bg-zinc-900/50">
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium text-zinc-300 text-sm bg-zinc-800 px-2 py-1 rounded">
                      {comment.author.slice(0, 6)}...{comment.author.slice(-4)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {formatDistanceToNow(comment.created_at)}
                    </span>
                  </div>
                  {hasMounted && address && comment.author.toLowerCase() === address.toLowerCase() && (
                    <button 
                      onClick={() => confirmDelete(comment.id)}
                      className="text-zinc-400 hover:text-red-400 transition-colors p-1"
                      title="Delete comment"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {comment.body}
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {nextPage && (
          <div className="pt-4 flex justify-center">
            <Button 
              variant="outline" 
              onClick={() => fetchComments(nextPage)}
              disabled={isLoadingMore}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {isLoadingMore ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={commentToDelete !== null} onOpenChange={(open) => !open && setCommentToDelete(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Comment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this comment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setCommentToDelete(null)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleDeleteComment}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
