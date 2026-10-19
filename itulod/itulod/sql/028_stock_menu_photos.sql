-- 028_stock_menu_photos.sql
-- Gives menu items without a photo a sample photo of their dish type, from the
-- CC0 / public-domain set in catalog-images/stock (sql/027, STOCK_PHOTOS.md).
-- The apps show these with a "Sample photo" tag. First matching dish wins;
-- only items whose image_url is still empty are touched, so a real photo
-- uploaded by an admin is never overwritten. Safe to re-run.

update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/halo-halo.jpg'
  where image_url is null and lower(name) ~ 'halo-halo';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/pizza.jpg'
  where image_url is null and lower(name) ~ 'pizza';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/pinakbet.jpg'
  where image_url is null and lower(name) ~ 'pinakbet';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/dinakdakan.jpg'
  where image_url is null and lower(name) ~ 'dinakdakan|sisig';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/longganisa.jpg'
  where image_url is null and lower(name) ~ 'longganisa|longanisa';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/kare-kare.jpg'
  where image_url is null and lower(name) ~ 'kare-kare';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/lumpia.jpg'
  where image_url is null and lower(name) ~ 'lumpia';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/empanada.jpg'
  where image_url is null and lower(name) ~ 'empanada';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/tupig.jpg'
  where image_url is null and lower(name) ~ 'tupig|bibingka|kakanin|suman';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/bread.jpg'
  where image_url is null and lower(name) ~ 'pandesal|spanish bread|cheese bread|loaf bread|garlic bread|pastry|bread';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/donut.jpg'
  where image_url is null and lower(name) ~ 'donut|doughnut|munchkin|choco honey dip|bavarian';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/cake.jpg'
  where image_url is null and lower(name) ~ 'cake';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/cookie.jpg'
  where image_url is null and lower(name) ~ 'cookie';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/pie.jpg'
  where image_url is null and lower(name) ~ '\ypie\y';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/ice-cream.jpg'
  where image_url is null and lower(name) ~ 'mcfloat|sundae|ice cream|soft serve';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/iced-coffee.jpg'
  where image_url is null and lower(name) ~ 'iced coffee|iced spanish latte|frappuccino|ice blended|frappe';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/coffee.jpg'
  where image_url is null and lower(name) ~ 'coffee|americano|caff|café|cafe|macchiato|latte|espresso|cappuccino';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/hot-chocolate.jpg'
  where image_url is null and lower(name) ~ 'chocolate drink|hot choco|tsokolate';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/milk-tea.jpg'
  where image_url is null and lower(name) ~ 'milk tea|fruit tea|boba';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/fruit-shake.jpg'
  where image_url is null and lower(name) ~ 'shake|smoothie';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/iced-tea.jpg'
  where image_url is null and lower(name) ~ 'iced tea|juice|lemonade';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/soft-drink.jpg'
  where image_url is null and lower(name) ~ 'soft drink|coke|soda|cola';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/burger.jpg'
  where image_url is null and lower(name) ~ 'burger(?! steak)|yumburger|big mac';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/fries.jpg'
  where image_url is null and lower(name) ~ 'fries';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/burger-steak.jpg'
  where image_url is null and lower(name) ~ 'burger steak|salisbury';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/fried-chicken.jpg'
  where image_url is null and lower(name) ~ 'chickenjoy|fried chicken|chicken mcdo|chicken with rice|chicken ''n''|famous bowl|max''s|chicken joy|chicken wings|bonchon|dokito';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/roast-chicken.jpg'
  where image_url is null and lower(name) ~ 'lechon manok|litson manok|roast chicken|inihaw na manok|inasal|grilled chicken';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/bbq.jpg'
  where image_url is null and lower(name) ~ 'bbq|barbecue';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/liempo.jpg'
  where image_url is null and lower(name) ~ 'liempo|pork chop|tokwa|lechon kawali|crispy pata';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/sweet-sour.jpg'
  where image_url is null and lower(name) ~ 'sweet and sour';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/beef.jpg'
  where image_url is null and lower(name) ~ 'pares|beef|bulalo|caldereta|kaldereta';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/shrimp.jpg'
  where image_url is null and lower(name) ~ 'shrimp|hipon|okoy|prawn|tempura';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/fish.jpg'
  where image_url is null and lower(name) ~ 'fish|tuna|bangus|tilapia';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/sushi.jpg'
  where image_url is null and lower(name) ~ 'maki|sushi';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/ramen.jpg'
  where image_url is null and lower(name) ~ 'ramen|ramyeon|udon|mami|miki|wonton|noodle soup';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/dumplings.jpg'
  where image_url is null and lower(name) ~ 'gyoza|siomai|dumpling|shumai';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/siopao.jpg'
  where image_url is null and lower(name) ~ 'siopao|bao';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/pancit.jpg'
  where image_url is null and lower(name) ~ 'pancit|palabok|lomi|bihon|canton|chow mein|yakisoba|japchae';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/fried-rice.jpg'
  where image_url is null and lower(name) ~ 'fried rice|chao fan|java rice|garlic rice';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/porridge.jpg'
  where image_url is null and lower(name) ~ 'lugaw|goto|arroz|congee|porridge';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/spaghetti.jpg'
  where image_url is null and lower(name) ~ 'spaghetti|pasta|lasagna|carbonara';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/sandwich.jpg'
  where image_url is null and lower(name) ~ 'sandwich|hotdog|hot dog';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/rice-meal.jpg'
  where image_url is null and lower(name) ~ 'rice meal|ulam|silog|super meal|meal|adobo|bento|rice box|pepper rice|igado|tocilog';
update public.menu_items set image_url = 'https://ajzlvrvqpggnnwerahhq.supabase.co/storage/v1/object/public/catalog-images/stock/rice.jpg'
  where image_url is null and lower(name) ~ '^rice$|plain rice|extra rice';
