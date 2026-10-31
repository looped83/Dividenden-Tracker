-- News: Yahoo Finance statt GDELT (SECURITY_MODEL.md „News“).
--
-- GDELT drosselte Supabase-Server und auch den Browser (31.10.2026) und hat
-- nie eine Zeile gespeichert (seit 2.60.0 lief es nur im Browser). Yahoo
-- Finance übernimmt den Enum-Wert per Umbenennung; Rechte und Daten bleiben
-- unberührt.

alter type news_provider rename value 'gdelt' to 'yahoo';
