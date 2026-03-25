import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, Send, Image, Check, CheckCheck, Loader2, Mail, Phone, Instagram } from 'lucide-react';
import { format } from 'date-fns';
import {
  TEAM_CONTACT_EMAIL,
  TEAM_INSTAGRAM_HANDLE,
  TEAM_INSTAGRAM_URL,
  TEAM_PHONE_DISPLAY,
  teamMailtoHref,
  teamTelHref,
} from '@/lib/contact';

interface Conversation {
  id: string;
  job_id: string | null;
  participant_1: string;
  participant_2: string;
  updated_at: string;
  otherName?: string;
  jobTitle?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
  image_url?: string | null;
}

// Typing indicator component
const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-md px-4 py-2.5">
      <div className="flex gap-1 items-center h-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  </div>
);

// Notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
};

const Messages = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contactTeamOpen, setContactTeamOpen] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (selectedConvo) {
      loadMessages(selectedConvo);
      markAsRead(selectedConvo);
    }
  }, [selectedConvo]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime: new messages + read receipt updates
  useEffect(() => {
    if (!selectedConvo || !user) return;
    const channel = supabase
      .channel(`messages-${selectedConvo}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConvo}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (newMsg.sender_id !== user.id) {
          playNotificationSound();
          markAsRead(selectedConvo);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConvo}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, read: updated.read } : m));
      })
      .subscribe();

    // Typing broadcast channel
    const typingChannel = supabase
      .channel(`typing-${selectedConvo}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user_id !== user.id) {
          setOtherTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2500);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(typingChannel);
    };
  }, [selectedConvo, user]);

  const sendTypingEvent = useCallback(() => {
    if (!selectedConvo || !user) return;
    supabase.channel(`typing-${selectedConvo}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user.id },
    });
  }, [selectedConvo, user]);

  const loadConversations = useCallback(async (userId: string) => {
    const { data: convos } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (!convos || convos.length === 0) { setConversations([]); return; }

    const otherIds = convos.map((c) => c.participant_1 === userId ? c.participant_2 : c.participant_1);
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', otherIds);

    const jobIds = convos.filter((c) => c.job_id).map((c) => c.job_id!);
    const { data: jobs } = jobIds.length > 0
      ? await supabase.from('jobs').select('id, title').in('id', jobIds)
      : { data: [] };

    const enriched = convos.map((c) => {
      const otherId = c.participant_1 === userId ? c.participant_2 : c.participant_1;
      return {
        ...c,
        otherName: profiles?.find((p) => p.user_id === otherId)?.display_name || 'User',
        jobTitle: jobs?.find((j) => j.id === c.job_id)?.title || '',
      };
    });
    setConversations(enriched);
  }, []);

  const loadUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate('/auth'); return; }
    setUser(session.user);
    await loadConversations(session.user.id);
    setLoading(false);
  };

  const withOpenParam = searchParams.get('with');
  const draftOpenParam = searchParams.get('draft');

  useEffect(() => {
    if (loading || !user || !withOpenParam || withOpenParam === user.id) return;

    let cancelled = false;

    (async () => {
      const { data: rows } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${user.id},participant_2.eq.${withOpenParam}),and(participant_1.eq.${withOpenParam},participant_2.eq.${user.id})`)
        .limit(1);

      let convoId = rows?.[0]?.id as string | undefined;
      if (!convoId) {
        const { data: ins, error } = await supabase
          .from('conversations')
          .insert({ participant_1: user.id, participant_2: withOpenParam })
          .select('id')
          .single();
        if (error || !ins) {
          if (!cancelled) {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('with');
              next.delete('draft');
              return next;
            }, { replace: true });
          }
          return;
        }
        convoId = ins.id;
      }

      if (cancelled || !convoId) return;

      setSelectedConvo(convoId);
      if (draftOpenParam) {
        try {
          setNewMessage(decodeURIComponent(draftOpenParam));
        } catch {
          setNewMessage(draftOpenParam);
        }
      }

      await loadConversations(user.id);

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('with');
        next.delete('draft');
        return next;
      }, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, user, withOpenParam, draftOpenParam, loadConversations, setSearchParams]);

  const loadMessages = async (convoId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const markAsRead = async (convoId: string) => {
    if (!user) return;
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('conversation_id', convoId)
      .neq('sender_id', user.id);
  };

  const sendMessage = async (imageUrl?: string) => {
    if ((!newMessage.trim() && !imageUrl) || !selectedConvo || !user) return;
    setSending(true);
    const insertData: any = {
      conversation_id: selectedConvo,
      sender_id: user.id,
      content: newMessage.trim() || (imageUrl ? '📷 Image' : ''),
    };
    if (imageUrl) insertData.image_url = imageUrl;

    await supabase.from('messages').insert(insertData);
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', selectedConvo);

    // Send push notification to the other participant
    const convo = conversations.find(c => c.id === selectedConvo);
    if (convo) {
      const recipientId = convo.participant_1 === user.id ? convo.participant_2 : convo.participant_1;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        fetch(`https://${projectId}.supabase.co/functions/v1/notify-new-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            recipient_id: recipientId,
            message_preview: insertData.content,
          }),
        }).catch(() => {}); // Fire and forget
      }
    }

    setNewMessage('');
    setSending(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedConvo) return;
    setUploadingImage(true);

    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('chat-images').upload(path, file);
    if (error) {
      setUploadingImage(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path);
    await sendMessage(urlData.publicUrl);
    setUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    sendTypingEvent();
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;

  const selectedConversation = conversations.find((c) => c.id === selectedConvo);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="Messages – VANO" description="Chat with businesses and students on VANO." />
      <Navbar />
      <div className="max-w-5xl mx-auto px-0 sm:px-4 md:px-8 pt-16 sm:pt-20 pb-0 sm:pb-4">
        <div className="flex h-[calc(100vh-4rem)] sm:h-[calc(100vh-6rem)] border-0 sm:border border-border sm:rounded-2xl overflow-hidden bg-card">
          {/* Conversation list */}
          <div className={`w-full md:w-80 border-r border-border flex flex-col shrink-0 ${selectedConvo ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-lg flex items-center gap-2"><MessageCircle size={20} /> Messages</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => setContactTeamOpen(true)}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-secondary/50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Mail size={16} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Contact team</p>
                  <p className="truncate text-xs text-muted-foreground">Email, phone &amp; Instagram</p>
                </div>
              </button>

              <Dialog open={contactTeamOpen} onOpenChange={setContactTeamOpen}>
                <DialogContent className="max-h-[min(90dvh,32rem)] overflow-y-auto sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Contact team</DialogTitle>
                    <DialogDescription>
                      Choose how you’d like to reach us — we’ll get back to you as soon as we can.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3 pt-2">
                    <a
                      href={teamMailtoHref}
                      onClick={() => setContactTeamOpen(false)}
                      className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Mail size={20} className="text-primary" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p>
                        <p className="mt-1 break-all text-base font-medium text-foreground">{TEAM_CONTACT_EMAIL}</p>
                      </div>
                    </a>
                    <a
                      href={teamTelHref}
                      onClick={() => setContactTeamOpen(false)}
                      className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Phone size={20} className="text-primary" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</p>
                        <p className="mt-1 text-base font-medium text-foreground">{TEAM_PHONE_DISPLAY}</p>
                      </div>
                    </a>
                    <a
                      href={TEAM_INSTAGRAM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setContactTeamOpen(false)}
                      className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Instagram size={20} className="text-primary" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instagram</p>
                        <p className="mt-1 text-base font-medium text-foreground">@{TEAM_INSTAGRAM_HANDLE}</p>
                      </div>
                    </a>
                  </div>
                </DialogContent>
              </Dialog>

              {conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12 px-4">No conversations yet. Message someone from a job or a Community listing.</p>
              ) : (
                conversations.map((convo) => (
                  <button
                    key={convo.id}
                    onClick={() => setSelectedConvo(convo.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary/50 transition-colors ${selectedConvo === convo.id ? 'bg-secondary' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm truncate">{convo.otherName}</p>
                      <span className="text-xs text-muted-foreground">{format(new Date(convo.updated_at), 'MMM d')}</span>
                    </div>
                    {convo.jobTitle && <p className="text-xs text-primary truncate mt-0.5">Re: {convo.jobTitle}</p>}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat area */}
          <div className={`flex-1 flex flex-col ${!selectedConvo ? 'hidden md:flex' : 'flex'}`}>
            {selectedConvo ? (
              <>
                <div className="p-4 border-b border-border flex items-center gap-3">
                  <button onClick={() => setSelectedConvo(null)} className="md:hidden text-muted-foreground hover:text-foreground text-sm">← Back</button>
                  <div>
                    <p className="font-semibold text-sm">{selectedConversation?.otherName}</p>
                    {selectedConversation?.jobTitle && <p className="text-xs text-primary">Re: {selectedConversation.jobTitle}</p>}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                        msg.sender_id === user?.id
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-secondary text-secondary-foreground rounded-bl-md'
                      }`}>
                        {msg.image_url && (
                          <img
                            src={msg.image_url}
                            alt="Shared image"
                            className="rounded-lg mb-1.5 max-w-full max-h-48 object-cover cursor-pointer"
                            onClick={() => window.open(msg.image_url!, '_blank')}
                          />
                        )}
                        {msg.content && msg.content !== '📷 Image' && <p>{msg.content}</p>}
                        <div className={`flex items-center gap-1 mt-1 ${msg.sender_id === user?.id ? 'justify-end' : ''}`}>
                          <p className={`text-[10px] ${msg.sender_id === user?.id ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </p>
                          {msg.sender_id === user?.id && (
                            msg.read
                              ? <CheckCheck size={12} className="text-primary-foreground/80" />
                              : <Check size={12} className="text-primary-foreground/50" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {otherTyping && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-4 border-t border-border">
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl transition-colors disabled:opacity-50"
                      title="Send image"
                    >
                      <Image size={18} />
                    </button>
                    <input
                      value={newMessage}
                      onChange={handleInputChange}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Type a message..."
                      className="flex-1 border border-input rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={() => sendMessage()}
                      disabled={sending || (!newMessage.trim() && !uploadingImage)}
                      className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Select a conversation to start chatting
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Messages;
