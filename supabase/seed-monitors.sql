-- Uptime Kuma Monitors Migration to Supabase
-- Extracted from kuma.db-wal file
-- 
-- BEFORE RUNNING: Replace 'YOUR_USER_ID_HERE' with your actual Supabase user UUID
-- You can find your user ID by running: SELECT id FROM auth.users WHERE email = 'your-email@example.com';

-- Set the user ID variable (PostgreSQL)
DO $$
DECLARE
    user_uuid UUID := '2a2baa88-b0f4-4a27-9b09-829e64e71caf';
BEGIN

-- Insert monitors extracted from Uptime Kuma
INSERT INTO monitors (user_id, name, type, active, url, hostname, method, interval, timeout, max_retries, description)
VALUES
    -- Foodshare main sites
    (user_uuid, 'Foodshare', 'http', true, 'https://foodshare.club', 'foodshare.club', 'GET', 60, 30, 3, 'Main Foodshare website'),
    (user_uuid, 'Blog', 'http', true, 'https://blog.foodshare.club/', 'blog.foodshare.club', 'GET', 60, 30, 3, 'Foodshare Blog'),
    
    -- Infrastructure services
    (user_uuid, 'Portainer', 'http', true, 'https://portainer.foodshare.club/#!/auth', 'portainer.foodshare.club', 'GET', 60, 30, 3, 'Docker management'),
    (user_uuid, 'N8N', 'http', true, 'https://n8n.foodshare.club/', 'n8n.foodshare.club', 'GET', 60, 30, 3, 'Workflow automation'),
    (user_uuid, 'Audiobookshelf', 'keyword', true, 'https://audiobookshelf.foodshare.club/', 'audiobookshelf.foodshare.club', 'GET', 60, 30, 3, 'Audiobook server'),
    (user_uuid, 'Appsmith', 'http', true, 'https://appsmith.foodshare.club/', 'appsmith.foodshare.club', 'GET', 60, 30, 3, 'Internal apps'),
    (user_uuid, 'Novu', 'http', true, 'https://novu.foodshare.club/', 'novu.foodshare.club', 'GET', 60, 30, 3, 'Notification infrastructure'),
    
    -- VPN endpoints  
    (user_uuid, 'VPN Poland', 'http', true, 'https://vpn.foodshare.club/', 'vpn.foodshare.club', 'GET', 60, 30, 3, 'VPN Poland server'),
    (user_uuid, 'VPN The UK', 'http', true, 'https://vpnuk.foodshare.club/', 'vpnuk.foodshare.club', 'GET', 60, 30, 3, 'VPN UK server'),
    
    -- Azure endpoints
    (user_uuid, 'Foodshare Polandcentral', 'tcp', true, NULL, 'foodshare.polandcentral.cloudapp.azure.com', 'GET', 60, 30, 3, 'Azure Poland datacenter'),
    (user_uuid, 'Monitoring Foodshare', 'tcp', true, NULL, 'monitoring-foodshare.uksouth.cloudapp.azure.com', 'GET', 60, 30, 3, 'Azure UK South monitoring'),
    
    -- Client sites
    (user_uuid, 'Careecho', 'keyword', true, 'https://www.careecho.online/', 'www.careecho.online', 'GET', 300, 30, 3, 'Careecho client site'),
    (user_uuid, 'Catch-22', 'keyword', true, 'https://catch-22.co.nz/', 'catch-22.co.nz', 'GET', 300, 30, 3, 'Catch-22 client site'),
    (user_uuid, 'Colorcraft', 'keyword', true, 'https://colorcraft.live/', 'colorcraft.live', 'GET', 300, 30, 3, 'Colorcraft client site'),
    (user_uuid, 'Hipnosisclinica', 'keyword', true, 'https://hipnosisclinica.pro/', 'hipnosisclinica.pro', 'GET', 300, 30, 3, 'Hipnosisclinica client site'),
    (user_uuid, 'Hybridized FlutterFlow', 'keyword', true, 'https://hybridized.flutterflow.app/', 'hybridized.flutterflow.app', 'GET', 300, 30, 3, 'FlutterFlow app'),
    (user_uuid, 'Netfleet', 'keyword', true, 'https://netfleet.ru/', 'netfleet.ru', 'GET', 300, 30, 3, 'Netfleet client site'),
    (user_uuid, 'Topdesignpro', 'keyword', true, 'https://topdesignpro.ru/', 'topdesignpro.ru', 'GET', 300, 30, 3, 'Topdesignpro client site')
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Successfully inserted monitors for user %', user_uuid;

END $$;

-- Verify the inserts
SELECT id, name, type, url, hostname, active FROM monitors ORDER BY name;
