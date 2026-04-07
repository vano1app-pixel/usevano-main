import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, Send, Image, Check, CheckCheck, Mail, Phone, Instagram, SquarePen, Search } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday, isThisWeek } from 'date-fns';
import {
  TEAM_CONTACT_EMAIL,
  TEAM_INSTAGRAM_HANDLE,
  TEAM_INSTAGRAM_URL,
  TEAM_PHONE_DISPLAY,
  teamMailtoHref,
  teamTelHref,
} from '@/lib/contact';
import { getSupabaseProjectRef } from '@/lib/supabaseEnv';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  job_id: string | null;
  participant_1: string;
  participant_2: string;
  updated_at: string;
  otherUserId?: string;
  otherName?: string;
  otherAvatar?: string | null;
  jobTitle?: string;
  lastMessageText?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
  image_url?: string | null;
  optimistic?: boolean;
}

const TypingIndicator = () => (
  <div className="flex justify-start">
    <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-md px-4 py-2.5">
      <div className="flex gap-1 items-center h-4">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  </div>
);

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
};

function formatConvoTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date)) return format(date, 'EEE');
  return format(date, 'dd MMM');
}

const Messages = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [otherTyping, setOtherTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contactTeamOpen, setContactTeamOpen] = useState(false);
  const [newConvoOpen, setNewConvoOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<{ user_id: string; display_name: string | null; avatar_url: string | null }[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  useEffect(() => { loadUser(); }, []);

  useEffect(() => {
    if (selectedConvo) {
      loadMessages(selectedConvo);
      markAsRead(selectedConvo);
    }
  }, [selectedConvo]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [newMessage]);

  // Realtime: new messages + read receipts
  useEffect(() => {
    if (!selectedConvo || !user) return;
    const channel = supabase
      .channel(`messages-${selectedConvo}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConvo}` }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (newMsg.sender_id !== user.id) {
          playNotificationSound();
          markAsRead(selectedConvo);
        }
        // Update last message preview in sidebar
        setConversations((prev) => prev.map((c) =>
          c.id === selectedConvo
            ? { ...c, lastMessageText: newMsg.content, lastMessageTime: newMsg.created_at, updated_at: newMsg.created_at }
            : c
        ));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConvo}` }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, read: updated.read } : m));
      })
      .subscribe();

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

    return () => { supabase.removeChannel(channel); supabase.removeChannel(typingChannel); };
  }, [selectedConvo, user]);

  const sendTypingEvent = useCallback(() => {
    if (!selectedConvo || !user) return;
    supabase.channel(`typing-${selectedConvo}`).send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id } });
  }, [selectedConvo, user]);

  const searchUsers = async (q: string) => {
    if (!q.trim() || !user) { setUserResults([]); return; }
    setSearchingUsers(true);
    const { data } = await supabase.from('profiles').select('user_id, display_name, avatar_url').ilike('display_name', `%${q.trim()}%`).neq('user_id', user.id).limit(8);
    setUserResults(data || []);
    setSearchingUsers(false);
  };

  const startConvoWith = async (otherUserId: string) => {
    if (!user) return;
    const { data: existing } = await supabase
      .from('conversations').select('id')
      .or(`and(participant_1.eq.${user.id},participant_2.eq.${otherUserId}),and(participant_1.eq.${otherUserId},participant_2.eq.${user.id})`)
      .limit(1);
    let convoId = existing?.[0]?.id as string | undefined;
    if (!convoId) {
      const { data: ins } = await supabase.from('conversations').insert({ participant_1: user.id, participant_2: otherUserId }).select('id').single();
      convoId = ins?.id;
    }
    if (convoId) {
      setNewConvoOpen(false);
      setUserSearch('');
      setUserResults([]);
      await loadConversations(user.id);
      setSelectedConvo(convoId);
    }
  };

  const loadConversations = useCallback(async (userId: string) => {
    const { data: convos } = await supabase
      .from('conversations').select('*')
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      .order('updated_at', { ascending: false });

    if (!convos || convos.length === 0) { setConversations([]); return; }

    const otherIds = convos.map((c) => c.participant_1 === userId ? c.participant_2 : c.participant_1);
    const convoIds = convos.map((c) => c.id);

    // Parallel: profiles, jobs, last messages, unread counts
    const [{ data: profiles }, { data: jobs }, { data: lastMsgs }, { data: unreadMsgs }] = await Promise.all([
      supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', otherIds),
      convos.some((c) => c.job_id)
        ? supabase.from('jobs').select('id, title').in('id', convos.filter((c) => c.job_id).map((c) => c.job_id!))
        : Promise.resolve({ data: [] }),
      supabase.from('messages').select('conversation_id, content, created_at, image_url').in('conversation_id', convoIds).order('created_at', { ascending: false }),
      supabase.from('messages').select('conversation_id').in('conversation_id', convoIds).neq('sender_id', userId).eq('read', false),
    ]);

    // Last message per convo
    const lastMsgMap: Record<string, { content: string; created_at: string; image_url?: string | null }> = {};
    for (const msg of lastMsgs || []) {
      if (!lastMsgMap[msg.conversation_id]) lastMsgMap[msg.conversation_id] = msg;
    }

    // Unread count per convo
    const unreadMap: Record<string, number> = {};
    for (const msg of unreadMsgs || []) {
      unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] || 0) + 1;
    }

    const enriched = convos.map((c) => {
      const otherId = c.participant_1 === userId ? c.participant_2 : c.participant_1;
      const prof = profiles?.find((p) => p.user_id === otherId);
      const last = lastMsgMap[c.id];
      const lastText = last
        ? (last.image_url ? '📷 Photo' : last.content)
        : '';
      return {
        ...c,
        otherUserId: otherId,
        otherName: prof?.display_name || 'User',
        otherAvatar: prof?.avatar_url || null,
        jobTitle: (jobs as any[])?.find((j) => j.id === c.job_id)?.title || '',
        lastMessageText: lastText,
        lastMessageTime: last?.created_at || c.updated_at,
        unreadCount: unreadMap[c.id] || 0,
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
      const { data: rows } = await supabase.from('conversations').select('id')
        .or(`and(participant_1.eq.${user.id},participant_2.eq.${withOpenParam}),and(participant_1.eq.${withOpenParam},participant_2.eq.${user.id})`)
        .limit(1);
      let convoId = rows?.[0]?.id as string | undefined;
      if (!convoId) {
        const { data: ins, error } = await supabase.from('conversations').insert({ participant_1: user.id, participant_2: withOpenParam }).select('id').single();
        if (error || !ins) {
          if (!cancelled) setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('with'); next.delete('draft'); return next; }, { replace: true });
          return;
        }
        convoId = ins.id;
      }
      if (cancelled || !convoId) return;
      setSelectedConvo(convoId);
      if (draftOpenParam) { try { setNewMessage(decodeURIComponent(draftOpenParam)); } catch { setNewMessage(draftOpenParam); } }
      await loadConversations(user.id);
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('with'); next.delete('draft'); return next; }, { replace: true });
    })();
    return () => { cancelled = true; };
  }, [loading, user, withOpenParam, draftOpenParam, loadConversations, setSearchParams]);

  const loadMessages = async (convoId: string) => {
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', convoId).order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const markAsRead = async (convoId: string) => {
    if (!user) return;
    // Clear unread locally immediately
    setConversations((prev) => prev.map((c) => c.id === convoId ? { ...c, unreadCount: 0 } : c));
    await supabase.from('messages').update({ read: true }).eq('conversation_id', convoId).neq('sender_id', user.id);
  };

  const sendMessage = async (imageUrl?: string) => {
    const content = newMessage.trim();
    if ((!content && !imageUrl) || !selectedConvo || !user) return;

    // Optimistic: show message instantly
    const tempId = `opt-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      conversation_id: selectedConvo,
      sender_id: user.id,
      content: content || (imageUrl ? '📷 Photo' : ''),
      read: false,
      created_at: new Date().toISOString(),
      image_url: imageUrl || null,
      optimistic: true,
    };
    setMessages((prev) => [...prev, tempMsg]);
    setNewMessage('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Insert to DB
    const insertData: any = { conversation_id: selectedConvo, sender_id: user.id, content: tempMsg.content };
    if (imageUrl) insertData.image_url = imageUrl;

    const { data: realMsg, error } = await supabase.from('messages').insert(insertData).select().single();

    if (error || !realMsg) {
      // Rollback
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(content);
      return;
    }

    // Replace temp with confirmed message
    setMessages((prev) => prev.map((m) => m.id === tempId ? { ...realMsg, optimistic: false } : m));

    // Update conversation preview
    setConversations((prev) => prev.map((c) =>
      c.id === selectedConvo
        ? { ...c, lastMessageText: tempMsg.content, lastMessageTime: realMsg.created_at, updated_at: realMsg.created_at }
        : c
    ));

    // Update conversation timestamp + fire push notification (both fire-and-forget)
    supabase.from('conversations').update({ updated_at: realMsg.created_at }).eq('id', selectedConvo).then(() => {});

    const convo = conversations.find((c) => c.id === selectedConvo);
    if (convo) {
      const recipientId = convo.participant_1 === user.id ? convo.participant_2 : convo.participant_1;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.access_token) return;
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || getSupabaseProjectRef();
        if (!projectId) return;
        fetch(`https://${projectId}.supabase.co/functions/v1/notify-new-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ recipient_id: recipientId, message_preview: tempMsg.content }),
        }).catch(() => {});
      });

      // Notify admin about business↔freelancer messages (in-app + email)
      (async () => {
        try {
          const [{ data: senderProfile }, { data: recipientProfile }] = await Promise.all([
            supabase.from('profiles').select('user_type, display_name').eq('user_id', user.id).single(),
            supabase.from('profiles').select('user_type, display_name').eq('user_id', recipientId).single(),
          ]);
          const isBizToFreelancer = senderProfile?.user_type === 'business' && recipientProfile?.user_type === 'student';
          const isFreelancerToBiz = senderProfile?.user_type === 'student' && recipientProfile?.user_type === 'business';
          if (isBizToFreelancer || isFreelancerToBiz) {
            // In-app notification for admins
            const { data: adminIds } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
            if (adminIds?.length) {
              const title = isBizToFreelancer
                ? `${senderProfile!.display_name} messaged ${recipientProfile!.display_name}`
                : `${senderProfile!.display_name} responded to ${recipientProfile!.display_name}`;
              await supabase.from('notifications').insert(
                adminIds
                  .filter((a) => a.user_id !== user.id)
                  .map((a) => ({ user_id: a.user_id, title, message: tempMsg.content.slice(0, 100) }))
              );
            }

            // Email notification to admin via Resend
            const freelancerUid = isBizToFreelancer ? recipientId : user.id;
            const { data: spPhone } = await supabase.from('student_profiles').select('phone').eq('user_id', freelancerUid).maybeSingle();

            const sess = await supabase.auth.getSession();
            const token = sess.data.session?.access_token;
            if (token) {
              const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || getSupabaseProjectRef();
              if (projectId) {
                fetch(`https://${projectId}.supabase.co/functions/v1/notify-admin-message`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify({
                    sender_name: senderProfile!.display_name,
                    recipient_name: recipientProfile!.display_name,
                    sender_type: senderProfile!.user_type,
                    recipient_type: recipientProfile!.user_type,
                    message_preview: tempMsg.content,
                    freelancer_phone: spPhone?.phone || null,
                  }),
                }).catch(() => {});
              }
            }
          }
        } catch {}
      })();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedConvo) return;
    setUploadingImage(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('chat-images').upload(path, file);
    if (!error) {
      const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path);
      await sendMessage(urlData.publicUrl);
    }
    setUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    sendTypingEvent();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );

  const selectedConversation = conversations.find((c) => c.id === selectedConvo);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead title="Messages – VANO" description="Chat with businesses and students on VANO." />
      <Navbar />
      <div className="max-w-5xl mx-auto px-0 sm:px-4 md:px-8 pt-16 sm:pt-20 pb-0 sm:pb-4">
        <div className="flex h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-6rem)] overflow-hidden border-0 bg-card sm:rounded-2xl sm:border sm:border-border">

          {/* ── Conversation list ── */}
          <div className={cn('w-full shrink-0 flex-col border-r border-border md:flex md:w-80', selectedConvo ? 'hidden md:flex' : 'flex')}>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <MessageCircle size={18} strokeWidth={2} /> Messages
              </h2>
              <button
                type="button"
                onClick={() => setNewConvoOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="New conversation"
              >
                <SquarePen size={16} />
              </button>
            </div>

            {/* New conversation dialog */}
            <Dialog open={newConvoOpen} onOpenChange={(o) => { setNewConvoOpen(o); if (!o) { setUserSearch(''); setUserResults([]); } }}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>New conversation</DialogTitle>
                  <DialogDescription>Search for someone by name to start a chat.</DialogDescription>
                </DialogHeader>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input autoFocus value={userSearch} onChange={(e) => { setUserSearch(e.target.value); searchUsers(e.target.value); }} placeholder="Search by name…" className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="min-h-[4rem] space-y-1">
                  {searchingUsers && <p className="py-4 text-center text-sm text-muted-foreground">Searching…</p>}
                  {!searchingUsers && userSearch.trim() && userResults.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No users found.</p>}
                  {userResults.map((u) => (
                    <button key={u.user_id} type="button" onClick={() => startConvoWith(u.user_id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{(u.display_name || '?')[0].toUpperCase()}</div>
                      }
                      <span className="text-sm font-medium">{u.display_name || 'User'}</span>
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <div className="flex-1 overflow-y-auto">
              {/* Contact team */}
              <button type="button" onClick={() => setContactTeamOpen(true)} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-secondary/50">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Mail size={15} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Contact VANO</p>
                  <p className="truncate text-xs text-muted-foreground">Email, phone &amp; Instagram</p>
                </div>
              </button>

              <Dialog open={contactTeamOpen} onOpenChange={setContactTeamOpen}>
                <DialogContent className="max-h-[min(90dvh,32rem)] overflow-y-auto sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Contact team</DialogTitle>
                    <DialogDescription>Choose how you'd like to reach us.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3 pt-2">
                    <a href={teamMailtoHref} onClick={() => setContactTeamOpen(false)} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><Mail size={20} className="text-primary" /></span>
                      <div className="min-w-0 pt-0.5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p><p className="mt-1 break-all text-base font-medium">{TEAM_CONTACT_EMAIL}</p></div>
                    </a>
                    <a href={teamTelHref} onClick={() => setContactTeamOpen(false)} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><Phone size={20} className="text-primary" /></span>
                      <div className="min-w-0 pt-0.5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</p><p className="mt-1 text-base font-medium">{TEAM_PHONE_DISPLAY}</p></div>
                    </a>
                    <a href={TEAM_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" onClick={() => setContactTeamOpen(false)} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><Instagram size={20} className="text-primary" /></span>
                      <div className="min-w-0 pt-0.5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instagram</p><p className="mt-1 text-base font-medium">@{TEAM_INSTAGRAM_HANDLE}</p></div>
                    </a>
                  </div>
                </DialogContent>
              </Dialog>

              {conversations.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">No conversations yet.<br />Message someone from a gig or Community listing.</p>
              ) : (
                conversations.map((convo) => {
                  const isActive = selectedConvo === convo.id;
                  const hasUnread = (convo.unreadCount || 0) > 0;
                  return (
                    <button
                      key={convo.id}
                      onClick={() => setSelectedConvo(convo.id)}
                      className={cn(
                        'flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors',
                        isActive ? 'bg-secondary' : 'hover:bg-secondary/50'
                      )}
                    >
                      {/* Avatar */}
                      {convo.otherAvatar
                        ? <img src={convo.otherAvatar} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" loading="lazy" />
                        : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">{(convo.otherName || '?')[0].toUpperCase()}</div>
                      }
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={cn('truncate text-sm', hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>
                            {convo.otherName}
                          </p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatConvoTime(convo.lastMessageTime || convo.updated_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <p className={cn('truncate text-xs', hasUnread ? 'font-medium text-foreground/80' : 'text-muted-foreground')}>
                            {convo.lastMessageText || (convo.jobTitle ? `Re: ${convo.jobTitle}` : 'Start of conversation')}
                          </p>
                          {hasUnread && (
                            <span className="ml-1 flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
                              {convo.unreadCount! > 9 ? '9+' : convo.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Chat area ── */}
          <div className={cn('flex flex-1 flex-col', !selectedConvo ? 'hidden md:flex' : 'flex')}>
            {selectedConvo ? (
              <>
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <button onClick={() => setSelectedConvo(null)} className="text-sm text-muted-foreground transition-colors hover:text-foreground md:hidden">← Back</button>
                  {selectedConversation?.otherAvatar
                    ? <img src={selectedConversation.otherAvatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                    : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">{(selectedConversation?.otherName || '?')[0].toUpperCase()}</div>
                  }
                  <div>
                    <p className="text-sm font-semibold leading-tight">{selectedConversation?.otherName}</p>
                    {selectedConversation?.jobTitle && <p className="text-xs text-primary leading-tight">Re: {selectedConversation.jobTitle}</p>}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                  {messages.map((msg) => {
                    const isMine = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id} className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm',
                          isMine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-secondary text-secondary-foreground',
                          msg.optimistic && 'opacity-75'
                        )}>
                          {msg.image_url && (
                            <img src={msg.image_url} alt="Shared" className="mb-1.5 max-h-52 max-w-full cursor-pointer rounded-xl object-cover" onClick={() => window.open(msg.image_url!, '_blank')} />
                          )}
                          {msg.content && msg.content !== '📷 Image' && msg.content !== '📷 Photo' && <p className="leading-relaxed">{msg.content}</p>}
                          <div className={cn('mt-1 flex items-center gap-1', isMine ? 'justify-end' : '')}>
                            <p className={cn('text-[10px]', isMine ? 'text-primary-foreground/55' : 'text-muted-foreground')}>
                              {format(new Date(msg.created_at), 'HH:mm')}
                            </p>
                            {isMine && !msg.optimistic && (
                              msg.read
                                ? <CheckCheck size={11} className="text-primary-foreground/70" />
                                : <Check size={11} className="text-primary-foreground/45" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {otherTyping && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="border-t border-border px-3 py-3">
                  <div className="flex items-end gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="mb-0.5 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
                      title="Send image"
                    >
                      <Image size={18} />
                    </button>
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={newMessage}
                      onChange={handleTextareaChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Message…"
                      className="flex-1 resize-none overflow-hidden rounded-2xl border border-input bg-background px-4 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                      style={{ maxHeight: 120 }}
                    />
                    <button
                      type="button"
                      onClick={() => sendMessage()}
                      disabled={!newMessage.trim() && !uploadingImage}
                      className="mb-0.5 rounded-xl bg-primary p-2.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                    >
                      <Send size={17} strokeWidth={2.2} />
                    </button>
                  </div>
                  <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">Enter to send · Shift+Enter for new line</p>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
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
