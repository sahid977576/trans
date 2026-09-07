alter table public.activation_keys alter column created_by drop not null;

alter table public.activation_keys drop constraint if exists activation_keys_public_trial_creator_check;
alter table public.activation_keys add constraint activation_keys_public_trial_creator_check check (created_by is not null or notes = 'public_trial');

create unique index if not exists one_public_trial_per_email_idx
	on public.activation_keys (lower(customer_email))
	where notes = 'public_trial';
