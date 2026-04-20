export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      community_listing_requests: {
        Row: {
          applicant_email: string | null
          category: string
          created_at: string
          description: string
          id: string
          image_url: string | null
          rate_max: number | null
          rate_min: number | null
          rate_unit: string | null
          reviewer_note: string | null
          reviewed_at: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          applicant_email?: string | null
          category: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          rate_max?: number | null
          rate_min?: number | null
          rate_unit?: string | null
          reviewer_note?: string | null
          reviewed_at?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          applicant_email?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          rate_max?: number | null
          rate_min?: number | null
          rate_unit?: string | null
          reviewer_note?: string | null
          reviewed_at?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      community_post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          image_url: string | null
          likes_count: number
          moderation_status: string
          rate_max: number | null
          rate_min: number | null
          rate_unit: string | null
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          likes_count?: number
          moderation_status?: string
          rate_max?: number | null
          rate_min?: number | null
          rate_unit?: string | null
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          likes_count?: number
          moderation_status?: string
          rate_max?: number | null
          rate_min?: number | null
          rate_unit?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          participant_1: string
          participant_2: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          participant_1: string
          participant_2: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          participant_1?: string
          participant_2?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          event_id: string
          id: string
          registered_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          registered_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          registered_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string
          background_image_url: string
          created_by: string
          creator: string
          date: string
          description: string
          id: string
          target_date: string
          time: string
          title: string
        }
        Insert: {
          address: string
          background_image_url: string
          created_by?: string
          creator: string
          date: string
          description: string
          id?: string
          target_date: string
          time: string
          title: string
        }
        Update: {
          address?: string
          background_image_url?: string
          created_by?: string
          creator?: string
          date?: string
          description?: string
          id?: string
          target_date?: string
          time?: string
          title?: string
        }
        Relationships: []
      }
      favourite_students: {
        Row: {
          business_user_id: string
          created_at: string
          id: string
          student_user_id: string
        }
        Insert: {
          business_user_id: string
          created_at?: string
          id?: string
          student_user_id: string
        }
        Update: {
          business_user_id?: string
          created_at?: string
          id?: string
          student_user_id?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_requests: {
        Row: {
          created_at: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      freelancer_preferences: {
        Row: {
          created_at: string | null
          id: string
          max_budget: number | null
          min_budget: number | null
          notify_instant: boolean | null
          preferred_tags: string[] | null
          preferred_work_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          max_budget?: number | null
          min_budget?: number | null
          notify_instant?: boolean | null
          preferred_tags?: string[] | null
          preferred_work_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          max_budget?: number | null
          min_budget?: number | null
          notify_instant?: boolean | null
          preferred_tags?: string[] | null
          preferred_work_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          applied_at: string
          business_confirmed: boolean
          confirmed_at: string | null
          id: string
          job_id: string
          message: string | null
          paid_at: string | null
          payment_confirmed: boolean
          status: Database["public"]["Enums"]["application_status"]
          student_confirmed: boolean
          student_id: string
        }
        Insert: {
          applied_at?: string
          business_confirmed?: boolean
          confirmed_at?: string | null
          id?: string
          job_id: string
          message?: string | null
          paid_at?: string | null
          payment_confirmed?: boolean
          status?: Database["public"]["Enums"]["application_status"]
          student_confirmed?: boolean
          student_id: string
        }
        Update: {
          applied_at?: string
          business_confirmed?: boolean
          confirmed_at?: string | null
          id?: string
          job_id?: string
          message?: string | null
          paid_at?: string | null
          payment_confirmed?: boolean
          status?: Database["public"]["Enums"]["application_status"]
          student_confirmed?: boolean
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string
          fixed_price: number | null
          hourly_rate: number
          id: string
          is_urgent: boolean
          latitude: number | null
          location: string
          longitude: number | null
          payment_amount: number | null
          payment_type: string
          posted_by: string
          shift_date: string
          shift_end: string | null
          shift_start: string | null
          status: Database["public"]["Enums"]["job_status"]
          tags: string[] | null
          title: string
          work_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string
          fixed_price?: number | null
          hourly_rate?: number
          id?: string
          is_urgent?: boolean
          latitude?: number | null
          location?: string
          longitude?: number | null
          payment_amount?: number | null
          payment_type?: string
          posted_by?: string
          shift_date: string
          shift_end?: string | null
          shift_start?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          tags?: string[] | null
          title: string
          work_type?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string
          fixed_price?: number | null
          hourly_rate?: number
          id?: string
          is_urgent?: boolean
          latitude?: number | null
          location?: string
          longitude?: number | null
          payment_amount?: number | null
          payment_type?: string
          posted_by?: string
          shift_date?: string
          shift_end?: string | null
          shift_start?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          tags?: string[] | null
          title?: string
          work_type?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          read: boolean
          sender_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          read?: boolean
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          read?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          message: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          student_email: string | null
          updated_at: string
          user_id: string
          user_type: string | null
          work_description: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          student_email?: string | null
          updated_at?: string
          user_id: string
          user_type?: string | null
          work_description?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          student_email?: string | null
          updated_at?: string
          user_id?: string
          user_type?: string | null
          work_description?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          notify_gigs: boolean
          notify_messages: boolean
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          notify_gigs?: boolean
          notify_messages?: boolean
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          notify_gigs?: boolean
          notify_messages?: boolean
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          job_id: string | null
          vano_payment_id: string | null
          photos: string[] | null
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          vano_payment_id?: string | null
          photos?: string[] | null
          rating: number
          reviewee_id: string
          reviewer_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          vano_payment_id?: string | null
          photos?: string[] | null
          rating?: number
          reviewee_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_jobs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      student_achievements: {
        Row: {
          badge_key: string
          badge_label: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_key: string
          badge_label: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_key?: string
          badge_label?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_client_referrals: {
        Row: {
          business_user_id: string
          commission_eur: number
          created_at: string
          deal_value_eur: number
          disputed: boolean
          id: string
          note: string | null
          sales_user_id: string
          updated_at: string
          verified_by_business: boolean
        }
        Insert: {
          business_user_id: string
          commission_eur?: number
          created_at?: string
          deal_value_eur?: number
          disputed?: boolean
          id?: string
          note?: string | null
          sales_user_id: string
          updated_at?: string
          verified_by_business?: boolean
        }
        Update: {
          business_user_id?: string
          commission_eur?: number
          created_at?: string
          deal_value_eur?: number
          disputed?: boolean
          id?: string
          note?: string | null
          sales_user_id?: string
          updated_at?: string
          verified_by_business?: boolean
        }
        Relationships: []
      }
      student_profiles: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          community_board_status: string | null
          created_at: string
          hourly_rate: number | null
          id: string
          expected_bonus_amount: number | null
          expected_bonus_unit: string | null
          initial_clients_brought: number
          is_available: boolean | null
          payment_details: string | null
          phone: string | null
          service_area: string | null
          skills: string[] | null
          stripe_account_id: string | null
          stripe_payouts_enabled: boolean
          student_verified: boolean
          tiktok_url: string | null
          instagram_url: string | null
          linkedin_url: string | null
          website_url: string | null
          typical_budget_max: number | null
          typical_budget_min: number | null
          university: string | null
          updated_at: string
          user_id: string
          verified_email: string | null
          work_links: Json
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          community_board_status?: string | null
          created_at?: string
          expected_bonus_amount?: number | null
          expected_bonus_unit?: string | null
          hourly_rate?: number | null
          id?: string
          initial_clients_brought?: number
          is_available?: boolean | null
          payment_details?: string | null
          phone?: string | null
          service_area?: string | null
          skills?: string[] | null
          stripe_account_id?: string | null
          stripe_payouts_enabled?: boolean
          student_verified?: boolean
          tiktok_url?: string | null
          instagram_url?: string | null
          linkedin_url?: string | null
          website_url?: string | null
          typical_budget_max?: number | null
          typical_budget_min?: number | null
          university?: string | null
          updated_at?: string
          user_id: string
          verified_email?: string | null
          work_links?: Json
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          community_board_status?: string | null
          created_at?: string
          expected_bonus_amount?: number | null
          expected_bonus_unit?: string | null
          hourly_rate?: number | null
          id?: string
          initial_clients_brought?: number
          is_available?: boolean | null
          payment_details?: string | null
          phone?: string | null
          service_area?: string | null
          skills?: string[] | null
          stripe_account_id?: string | null
          stripe_payouts_enabled?: boolean
          student_verified?: boolean
          tiktok_url?: string | null
          instagram_url?: string | null
          linkedin_url?: string | null
          website_url?: string | null
          typical_budget_max?: number | null
          typical_budget_min?: number | null
          university?: string | null
          updated_at?: string
          user_id?: string
          verified_email?: string | null
          work_links?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vano_payments: {
        Row: {
          amount_cents: number
          auto_release_at: string | null
          business_id: string
          completed_at: string | null
          conversation_id: string
          created_at: string
          currency: string
          description: string | null
          dispute_reason: string | null
          disputed_at: string | null
          error_message: string | null
          fee_cents: number
          freelancer_id: string
          hire_agreement_id: string | null
          id: string
          paid_at: string | null
          refunded_at: string | null
          reminder_sent_at: string | null
          released_at: string | null
          released_by: string | null
          status: string
          stripe_destination_account_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          stripe_session_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          auto_release_at?: string | null
          business_id: string
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          currency?: string
          description?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          error_message?: string | null
          fee_cents?: number
          freelancer_id: string
          hire_agreement_id?: string | null
          id?: string
          paid_at?: string | null
          refunded_at?: string | null
          reminder_sent_at?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: string
          stripe_destination_account_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_session_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          auto_release_at?: string | null
          business_id?: string
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          error_message?: string | null
          fee_cents?: number
          freelancer_id?: string
          hire_agreement_id?: string | null
          id?: string
          paid_at?: string | null
          refunded_at?: string | null
          reminder_sent_at?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: string
          stripe_destination_account_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_session_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_find_requests: {
        Row: {
          brief: string
          budget_range: string | null
          category: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          location: string | null
          paid_at: string | null
          requester_id: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_payment_status: string | null
          stripe_session_id: string | null
          timeline: string | null
          updated_at: string
          vano_match_feedback: "up" | "down" | null
          vano_match_reason: string | null
          vano_match_score: number | null
          vano_match_user_id: string | null
          vano_retry_count: number
          web_match_feedback: "up" | "down" | null
          web_retry_count: number
          web_scout_id: string | null
        }
        Insert: {
          brief: string
          budget_range?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          location?: string | null
          paid_at?: string | null
          requester_id: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          stripe_session_id?: string | null
          timeline?: string | null
          updated_at?: string
          vano_match_feedback?: "up" | "down" | null
          vano_match_reason?: string | null
          vano_match_score?: number | null
          vano_match_user_id?: string | null
          vano_retry_count?: number
          web_match_feedback?: "up" | "down" | null
          web_retry_count?: number
          web_scout_id?: string | null
        }
        Update: {
          brief?: string
          budget_range?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          location?: string | null
          paid_at?: string | null
          requester_id?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          stripe_session_id?: string | null
          timeline?: string | null
          updated_at?: string
          vano_match_feedback?: "up" | "down" | null
          vano_match_reason?: string | null
          vano_match_score?: number | null
          vano_match_user_id?: string | null
          vano_retry_count?: number
          web_match_feedback?: "up" | "down" | null
          web_retry_count?: number
          web_scout_id?: string | null
        }
        Relationships: []
      }
      scouted_freelancers: {
        Row: {
          avatar_url: string | null
          bio: string | null
          brief_snapshot: string | null
          claim_token: string
          claim_token_expires_at: string
          claimed_at: string | null
          claimed_by: string | null
          contact_email: string | null
          contact_instagram: string | null
          contact_linkedin: string | null
          created_at: string
          id: string
          location: string | null
          match_score: number | null
          name: string
          outreach_channel: string | null
          outreach_sent_at: string | null
          portfolio_url: string | null
          requester_id: string
          skills: string[] | null
          source_platform: string | null
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          brief_snapshot?: string | null
          claim_token?: string
          claim_token_expires_at?: string
          claimed_at?: string | null
          claimed_by?: string | null
          contact_email?: string | null
          contact_instagram?: string | null
          contact_linkedin?: string | null
          created_at?: string
          id?: string
          location?: string | null
          match_score?: number | null
          name: string
          outreach_channel?: string | null
          outreach_sent_at?: string | null
          portfolio_url?: string | null
          requester_id: string
          skills?: string[] | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          brief_snapshot?: string | null
          claim_token?: string
          claim_token_expires_at?: string
          claimed_at?: string | null
          claimed_by?: string | null
          contact_email?: string | null
          contact_instagram?: string | null
          contact_linkedin?: string | null
          created_at?: string
          id?: string
          location?: string | null
          match_score?: number | null
          name?: string
          outreach_channel?: string | null
          outreach_sent_at?: string | null
          portfolio_url?: string | null
          requester_id?: string
          skills?: string[] | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_community_listing_request: {
        Args: { _request_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reject_community_listing_request: {
        Args: { _note?: string; _request_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      application_status: "pending" | "accepted" | "rejected"
      job_status: "open" | "filled" | "closed" | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      application_status: ["pending", "accepted", "rejected"],
      job_status: ["open", "filled", "closed", "completed"],
    },
  },
} as const
