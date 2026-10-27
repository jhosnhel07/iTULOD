-- =============================================================================
-- 055: Referral bonus lowered from ₱50 to ₱5
-- -----------------------------------------------------------------------------
-- The friend who redeems a code gets ₱5 in their wallet right away, and the
-- customer who shared it gets ₱5 once that friend's first booking completes.
-- apply-referral-code writes both amounts on each referral_events row; these
-- defaults only matter for a row written without them.
-- =============================================================================

alter table public.referral_events alter column referrer_bonus set default 5;
alter table public.referral_events alter column referred_bonus set default 5;
