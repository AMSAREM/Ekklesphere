// src/server/churchWallStore.ts
// Multi-tenant Church Wall persistence backed by Supabase Postgres (`church_wall_posts`)
// with an org-scoped in-memory fallback store for test / pre-migration environments.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { ChurchWallPost } from '../types/ekklesphere.ts';

function buildServiceClient(): SupabaseClient | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'MB';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function mapRow(row: any): ChurchWallPost {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    authorId: String(row.author_id),
    authorName: String(row.author_name),
    authorInitials: String(row.author_initials || getInitials(String(row.author_name || 'Member'))),
    authorAvatar: row.author_avatar ? String(row.author_avatar) : undefined,
    category:
      row.category === 'testimony' || row.category === 'celebration' ? row.category : 'birthday',
    message: String(row.message),
    targetMemberId: row.target_member_id ? String(row.target_member_id) : undefined,
    targetMemberName: row.target_member_name ? String(row.target_member_name) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
    amens: Array.isArray(row.amens) ? row.amens.map(String) : [],
  };
}

class ChurchWallStore {
  private readonly fallbackByOrg = new Map<string, ChurchWallPost[]>();
  private readonly supabase: SupabaseClient | null = buildServiceClient();

  public async listPosts(organizationId: string, limit = 40): Promise<ChurchWallPost[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('church_wall_posts')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && Array.isArray(data)) {
          return data.map(mapRow);
        }
      } catch {
        // Fallback when migration has not yet been applied
      }
    }

    return [...(this.fallbackByOrg.get(organizationId) || [])].slice(0, limit);
  }

  public async createPost(
    organizationId: string,
    input: {
      authorId: string;
      authorName: string;
      authorAvatar?: string;
      category?: 'birthday' | 'testimony' | 'celebration';
      message: string;
      targetMemberId?: string;
      targetMemberName?: string;
    }
  ): Promise<ChurchWallPost> {
    const cleanName = input.authorName.trim() || 'Church Member';
    const post: ChurchWallPost = {
      id: randomUUID(),
      organizationId,
      authorId: input.authorId,
      authorName: cleanName,
      authorInitials: getInitials(cleanName),
      authorAvatar: input.authorAvatar,
      category: input.category || 'birthday',
      message: input.message.trim().slice(0, 600),
      targetMemberId: input.targetMemberId,
      targetMemberName: input.targetMemberName,
      createdAt: new Date().toISOString(),
      amens: [],
    };

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('church_wall_posts')
          .insert({
            id: post.id,
            organization_id: post.organizationId,
            author_id: post.authorId,
            author_name: post.authorName,
            author_initials: post.authorInitials,
            author_avatar: post.authorAvatar || null,
            category: post.category,
            message: post.message,
            target_member_id: post.targetMemberId || null,
            target_member_name: post.targetMemberName || null,
            amens: post.amens,
            created_at: post.createdAt,
          })
          .select('*')
          .single();

        if (!error && data) {
          return mapRow(data);
        }
      } catch {
        // Fallback to org-scoped memory store
      }
    }

    const existing = this.fallbackByOrg.get(organizationId) || [];
    this.fallbackByOrg.set(organizationId, [post, ...existing].slice(0, 100));
    return post;
  }

  public async toggleAmen(
    organizationId: string,
    postId: string,
    actorId: string
  ): Promise<ChurchWallPost | null> {
    if (this.supabase) {
      try {
        const { data: existing, error: fetchErr } = await this.supabase
          .from('church_wall_posts')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', postId)
          .maybeSingle();

        if (!fetchErr && existing) {
          const currentAmens = Array.isArray(existing.amens) ? existing.amens.map(String) : [];
          const hasReacted = currentAmens.includes(actorId);
          const nextAmens = hasReacted
            ? currentAmens.filter((id: string) => id !== actorId)
            : [...currentAmens, actorId];

          const { data: updated, error: updErr } = await this.supabase
            .from('church_wall_posts')
            .update({ amens: nextAmens })
            .eq('organization_id', organizationId)
            .eq('id', postId)
            .select('*')
            .single();

          if (!updErr && updated) {
            return mapRow(updated);
          }
        }
      } catch {
        // Fallback to org-scoped memory store
      }
    }

    const posts = this.fallbackByOrg.get(organizationId) || [];
    const index = posts.findIndex((p) => p.id === postId);
    if (index === -1) return null;

    const target = posts[index];
    const hasReacted = target.amens.includes(actorId);
    const updatedPost: ChurchWallPost = {
      ...target,
      amens: hasReacted
        ? target.amens.filter((id) => id !== actorId)
        : [...target.amens, actorId],
    };
    const nextList = [...posts];
    nextList[index] = updatedPost;
    this.fallbackByOrg.set(organizationId, nextList);
    return updatedPost;
  }
}

export const churchWallStore = new ChurchWallStore();
