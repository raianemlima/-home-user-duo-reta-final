-- PDF original da versão: o aluno baixa o arquivo pelo app (a URL assinada é gerada no servidor; o bucket continua só da equipe).
alter table public.content_versions add column if not exists source_path text null;
alter table public.content_versions add column if not exists source_file_name text null;

-- Versões já criadas: recupera o arquivo pelo processamento que as gerou.
update public.content_versions v
set source_path = d.storage_path, source_file_name = d.file_name
from public.job_stages s
join public.documents d on d.id = s.subject_id
where s.job_id = v.job_id and s.stage = 'segmentation' and v.source_path is null;
