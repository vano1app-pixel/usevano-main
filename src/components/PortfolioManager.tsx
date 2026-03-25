import React, { useState, useEffect, useRef } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Image } from 'lucide-react';

interface PortfolioManagerProps {
  userId: string;
}

export const PortfolioManager: React.FC<PortfolioManagerProps> = ({ userId }) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadItems();
  }, [userId]);

  const loadItems = async () => {
    const { data } = await supabase.from('portfolio_items').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    setItems(data || []);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('portfolio-images').upload(path, file);
    if (error) {
      toast({ title: 'Upload failed', variant: 'destructive' });
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('portfolio-images').getPublicUrl(path);
    setImageUrl(publicUrl);
    setUploading(false);
  };

  const handleAdd = async () => {
    if (!title.trim()) { toast({ title: 'Please add a title', variant: 'destructive' }); return; }
    setAdding(true);
    const { error } = await supabase.from('portfolio_items').insert({
      user_id: userId,
      title: title.trim(),
      description: description.trim(),
      image_url: imageUrl,
    });
    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Portfolio item added!' });
      setTitle('');
      setDescription('');
      setImageUrl('');
      loadItems();
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('portfolio_items').delete().eq('id', id);
    toast({ title: 'Item removed' });
    loadItems();
  };

  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="bg-card border border-border rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 space-y-5">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Image size={18} className="text-primary" /> Portfolio
      </h2>
      <p className="text-sm text-muted-foreground -mt-3">Showcase your best work to attract more clients.</p>

      {/* Add new item */}
      <div className="space-y-3 border border-dashed border-border rounded-xl p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Project title" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-[60px] resize-none`} placeholder="Brief description of the work..." />

        {imageUrl ? (
          <div className="relative">
            <img src={imageUrl} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
            <button onClick={() => setImageUrl('')} className="absolute top-2 right-2 p-1.5 bg-background/80 rounded-lg hover:bg-destructive/10 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <><Plus size={16} /> Add Image (optional)</>
            )}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

        <button
          onClick={handleAdd}
          disabled={adding || !title.trim()}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {adding ? 'Adding...' : 'Add to Portfolio'}
        </button>
      </div>

      {/* Existing items */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item) => (
            <div key={item.id} className="border border-border rounded-xl overflow-hidden group relative">
              {item.image_url && (
                <img src={item.image_url} alt={item.title} className="w-full h-32 object-cover" />
              )}
              <div className="p-3">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                className="absolute top-2 right-2 p-1.5 bg-background/80 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
              >
                <Trash2 size={14} className="text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
