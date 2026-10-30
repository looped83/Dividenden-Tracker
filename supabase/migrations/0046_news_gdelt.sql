-- News: GDELT statt Google News (SECURITY_MODEL.md „News“).
--
-- Google News beantwortet Anfragen von Supabase-Servern durchweg mit 503,
-- deshalb gab es nie eine Zeile mit `google_news`. Die Ersatzquelle GDELT
-- übernimmt den Enum-Wert per Umbenennung; Rechte und Daten bleiben unberührt.

alter type news_provider rename value 'google_news' to 'gdelt';
