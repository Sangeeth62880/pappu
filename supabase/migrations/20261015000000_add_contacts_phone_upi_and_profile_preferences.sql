-- Migration: Add phone and upi_id to contacts, add preferences to profiles
-- Scoped per-user with Row Level Security

-- 1. Add phone and upi_id columns to contacts table
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS upi_id TEXT;

-- 2. Add preferences to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS voice_replies BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS haptic_feedback BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS sound_effects BOOLEAN NOT NULL DEFAULT true;
