-- 039: Tricycle gets its own icon (a motorcycle with a sidecar).
-- Font Awesome has no tricycle, so 'fa-tricycle' is a custom class drawn from
-- assets/icons/tricycle.svg (css/main.css); the app has the same drawing
-- (lib/shared/widgets/tricycle_icon.dart). It used to show a bicycle.
update public.vehicles set icon = 'fa-tricycle' where name = 'Tricycle';
