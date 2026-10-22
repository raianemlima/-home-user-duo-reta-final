-- Cronograma de estudos enviado pelo aluno: bucket privado, um arquivo por aluno (pasta = id do aluno).
-- O app lê e grava pelo servidor, com a chave de serviço, depois de conferir a sessão; não há acesso direto pelo navegador.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cronogramas', 'cronogramas', false, 10485760, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
