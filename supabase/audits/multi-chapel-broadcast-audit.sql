select key,updated_at,updated_by from public.site_content where key='livestream';
select role_key,permission_key from public.cms_role_permissions where permission_key='livestream.manage' order by role_key;
