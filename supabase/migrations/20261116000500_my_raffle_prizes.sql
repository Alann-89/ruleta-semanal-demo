-- =====================================================================
-- «Mis premios»: los premios de sorteo que ganó la persona, con su código
-- para recogerlo. Se listan aunque el sorteo ya esté archivado.
-- =====================================================================

create function public.get_my_raffle_prizes()
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := private.now();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'drawn_at' desc)
    from (
      select jsonb_build_object(
        'raffle_id', r.id, 'title', r.title, 'prize', r.prize, 'prize_detail', r.prize_detail,
        'prize_image_url', r.prize_image_url, 'number', t.number, 'drawn_at', r.drawn_at,
        'claim_until', r.drawn_at + make_interval(days => r.claim_days), 'claimed_at', r.claimed_at,
        'status', case
          when r.claimed_at is not null then 'claimed'
          when v_now >= r.drawn_at + make_interval(days => r.claim_days) then 'expired'
          else 'pending' end,
        'claim_code', case
          when r.claimed_at is null and v_now < r.drawn_at + make_interval(days => r.claim_days) then r.claim_code end
      ) as x
      from public.raffles r
      join public.raffle_tickets t on t.id = r.winner_ticket_id
      where t.user_id = v_uid and r.status <> 'draft'
    ) s), '[]'::jsonb);
end $$;

revoke all on function public.get_my_raffle_prizes() from public, anon, authenticated;
grant execute on function public.get_my_raffle_prizes() to authenticated;
