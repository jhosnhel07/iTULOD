-- =============================================================================
-- iTULOD migration 021: more Ilocos Norte restaurants (all towns)
-- -----------------------------------------------------------------------------
-- 206 food businesses across Ilocos Norte, taken from OpenStreetMap
-- (amenity = restaurant / fast_food / cafe / ice_cream, shop = bakery /
-- confectionery / tea), with OSM coordinates. Generated Oct 2026; places
-- already seeded in 020 are skipped.
--
-- MENUS: chains get their standard items at typical Philippine prices.
-- Local places whose menus aren't published get a typical menu for their
-- kind of business (empanadaan, bakery, café, carinderia, grill…), and each
-- of those items says "typical item, availability may vary". The rider
-- confirms the real fare at pickup and can mark items out of stock, so
-- orders still work — but replace these with the real menus in the web
-- admin's Restaurants tab as you collect them.
--
-- No logos or photos (need the owners' permission) — image_url is null.
-- Idempotent: skips any restaurant whose name already exists.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Laoag City (97)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Hap Chan (Laoag City)', 'Laoag City, Ilocos Norte', 18.1865115, 120.5868163, 'Chinese', true
  where not exists (select 1 from public.restaurants where name = 'Hap Chan (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Yang Chow Fried Rice', 'Chinese fried rice · typical item, availability may vary', 220.00),
  ('Pancit Canton', 'Stir-fried noodles · typical item, availability may vary', 250.00),
  ('Sweet and Sour Pork', 'Classic Chinese dish · typical item, availability may vary', 320.00),
  ('Siomai (4 pcs)', 'Steamed dumplings · typical item, availability may vary', 80.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Virgie''s Empanadaan (Laoag City)', 'Laoag City, Ilocos Norte', 18.1954811, 120.5917807, 'Ilocano empanada', true
  where not exists (select 1 from public.restaurants where name = 'Virgie''s Empanadaan (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Ordinary Empanada', 'Longganisa, egg and green papaya · typical item, availability may vary', 60.00),
  ('Special Empanada', 'Extra egg and longganisa · typical item, availability may vary', 80.00),
  ('Okoy (Shrimp Fritter)', 'Crispy fritter · typical item, availability may vary', 35.00),
  ('Soft Drink', 'Bottled soft drink · typical item, availability may vary', 25.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chowking (F. R. Castro St., Laoag City)', 'F. R. Castro Street, Laoag City, Ilocos Norte', 18.1941577, 120.5943706, 'Chinese fast food', true
  where not exists (select 1 from public.restaurants where name = 'Chowking (F. R. Castro St., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chao Fan (Regular)', 'Chinese-style fried rice', 85.00),
  ('Chinese-Style Fried Chicken with Rice', 'Fried chicken with rice', 125.00),
  ('Siopao Asado', 'Steamed pork bun', 55.00),
  ('Beef Wonton Mami', 'Noodle soup with beef and wontons', 125.00),
  ('Halo-Halo', 'Shaved ice dessert', 120.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Macy''s Diner (Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.1968115, 120.5946274, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Macy''s Diner (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Tatalaok Roasters (Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2039509, 120.5989455, 'Roast & fried chicken', true
  where not exists (select 1 from public.restaurants where name = 'Tatalaok Roasters (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Lechon Manok (Whole)', 'Roasted chicken · typical item, availability may vary', 320.00),
  ('Lechon Manok (Half)', 'Roasted half chicken · typical item, availability may vary', 170.00),
  ('Liempo (per 1/2 kg)', 'Roasted pork belly · typical item, availability may vary', 250.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Citycup Cafe (Laoag City)', 'J. P. Rizal Avenue, Laoag City, Ilocos Norte', 18.197052, 120.5906586, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Citycup Cafe (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Eagle''s Nest (Laoag City)', 'Laoag City, Ilocos Norte', 18.2094882, 120.6024393, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Eagle''s Nest (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chicken Ati-atihan (Laoag City)', 'Laoag City, Ilocos Norte', 18.2038675, 120.5988719, 'Roast & fried chicken', true
  where not exists (select 1 from public.restaurants where name = 'Chicken Ati-atihan (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Lechon Manok (Whole)', 'Roasted chicken · typical item, availability may vary', 320.00),
  ('Lechon Manok (Half)', 'Roasted half chicken · typical item, availability may vary', 170.00),
  ('Liempo (per 1/2 kg)', 'Roasted pork belly · typical item, availability may vary', 250.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Pamulinawen (Laoag City)', 'Laoag City, Ilocos Norte', 18.200973, 120.5990007, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Pamulinawen (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Li''lls Cafe & Restaurant (Laoag City)', 'M. H. del Pilar Street, Laoag City, Ilocos Norte', 18.1920894, 120.6099937, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Li''lls Cafe & Restaurant (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Bulosan (Laoag City)', 'Laoag City, Ilocos Norte', 18.2001176, 120.5897927, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Bulosan (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Ravanden''s (Laoag City)', 'Laoag City, Ilocos Norte', 18.1976186, 120.5888825, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Ravanden''s (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mang Inasal (J. P. Rizal St., Laoag City)', 'J. P. Rizal Street, Laoag City, Ilocos Norte', 18.1945282, 120.596297, 'Grilled chicken', true
  where not exists (select 1 from public.restaurants where name = 'Mang Inasal (J. P. Rizal St., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chicken Inasal Paa with Rice', 'Grilled chicken leg quarter with rice', 149.00),
  ('Chicken Inasal Pecho with Rice', 'Grilled chicken breast with rice', 169.00),
  ('Pork BBQ (2 sticks) with Rice', 'Grilled pork barbecue', 119.00),
  ('Palabok', 'Rice noodles with shrimp sauce', 99.00),
  ('Halo-Halo', 'Shaved ice dessert', 89.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Ramen House (Laoag City)', 'Laoag City, Ilocos Norte', 18.1926216, 120.6056538, 'Japanese', true
  where not exists (select 1 from public.restaurants where name = 'Ramen House (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Tonkotsu Ramen', 'Pork broth ramen · typical item, availability may vary', 289.00),
  ('Shoyu Ramen', 'Soy broth ramen · typical item, availability may vary', 269.00),
  ('Gyoza (5 pcs)', 'Pan-fried dumplings · typical item, availability may vary', 140.00),
  ('California Maki', 'Maki rolls · typical item, availability may vary', 180.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Katrina''s Store and Carinderia (Laoag City)', 'Laoag City, Ilocos Norte', 18.205376, 120.58494, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Katrina''s Store and Carinderia (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Empanadería Har–Lei (Laoag City)', 'P. Gomez Street, Laoag City, Ilocos Norte', 18.202808, 120.5940683, 'Ilocano empanada', true
  where not exists (select 1 from public.restaurants where name = 'Empanadería Har–Lei (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Ordinary Empanada', 'Longganisa, egg and green papaya · typical item, availability may vary', 60.00),
  ('Special Empanada', 'Extra egg and longganisa · typical item, availability may vary', 80.00),
  ('Okoy (Shrimp Fritter)', 'Crispy fritter · typical item, availability may vary', 35.00),
  ('Soft Drink', 'Bottled soft drink · typical item, availability may vary', 25.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Tacos del Norte (Laoag City)', 'Laoag City, Ilocos Norte', 18.1965595, 120.5923774, 'Mexican', true
  where not exists (select 1 from public.restaurants where name = 'Tacos del Norte (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Beef Tacos (3 pcs)', 'Soft or hard shell · typical item, availability may vary', 150.00),
  ('Burrito', 'Beef or chicken · typical item, availability may vary', 170.00),
  ('Nachos', 'With cheese and salsa · typical item, availability may vary', 140.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'T-Avenue Milktea Corner (Laoag City)', 'Governor Ablan Avenue, Laoag City, Ilocos Norte', 18.1987871, 120.588921, 'Milk tea', true
  where not exists (select 1 from public.restaurants where name = 'T-Avenue Milktea Corner (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Milk Tea', 'With pearls · typical item, availability may vary', 99.00),
  ('Wintermelon Milk Tea', 'With pearls · typical item, availability may vary', 109.00),
  ('Brown Sugar Milk Tea', 'With pearls · typical item, availability may vary', 119.00),
  ('Fruit Tea', 'Iced fruit tea · typical item, availability may vary', 99.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Ekhikaia Seafood Restaurant (Laoag City)', 'Laoag City, Ilocos Norte', 18.1874553, 120.5734229, 'Seafood', true
  where not exists (select 1 from public.restaurants where name = 'Ekhikaia Seafood Restaurant (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Grilled Fish', 'Catch of the day · typical item, availability may vary', 280.00),
  ('Garlic Butter Shrimp', 'Shrimp in garlic butter · typical item, availability may vary', 380.00),
  ('Sinigang na Hipon', 'Sour shrimp soup · typical item, availability may vary', 320.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'McDonald''s (General Segundo Ave., Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2001333, 120.5960728, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'McDonald''s (General Segundo Ave., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chicken McDo with Rice', 'Fried chicken with rice', 109.00),
  ('McSpaghetti', 'Sweet-style spaghetti', 70.00),
  ('Burger McDo', 'Classic beef burger', 50.00),
  ('Cheeseburger', 'Beef patty with cheese', 75.00),
  ('Fries (Medium)', 'World-famous fries', 70.00),
  ('Coke McFloat', 'Coke with vanilla soft serve', 50.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Shakey''s (Laoag City)', 'Laoag City, Ilocos Norte', 18.1964924, 120.5958363, 'Pizza', true
  where not exists (select 1 from public.restaurants where name = 'Shakey''s (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Manager''s Choice Pizza (Regular)', 'Signature thin-crust pizza', 395.00),
  ('Hawaiian Delight Pizza (Regular)', 'Ham and pineapple', 375.00),
  ('Chicken ''N'' Mojos', 'Fried chicken with mojo potatoes', 395.00),
  ('Spaghetti Bolognese', 'Pasta with meat sauce', 195.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mister Donut Centro (General Segundo Ave., Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.1956559, 120.5939038, 'Donuts & coffee', true
  where not exists (select 1 from public.restaurants where name = 'Mister Donut Centro (General Segundo Ave., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pon de Ring', 'Chewy ring donut', 45.00),
  ('Choco Honey Dip', 'Chocolate-dipped donut', 40.00),
  ('Box of 6 Donuts', 'Assorted donuts', 260.00),
  ('Iced Coffee', 'Iced coffee', 85.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mang Inasal (General Segundo Ave., Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.197782, 120.5948049, 'Grilled chicken', true
  where not exists (select 1 from public.restaurants where name = 'Mang Inasal (General Segundo Ave., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chicken Inasal Paa with Rice', 'Grilled chicken leg quarter with rice', 149.00),
  ('Chicken Inasal Pecho with Rice', 'Grilled chicken breast with rice', 169.00),
  ('Pork BBQ (2 sticks) with Rice', 'Grilled pork barbecue', 119.00),
  ('Palabok', 'Rice noodles with shrimp sauce', 99.00),
  ('Halo-Halo', 'Shaved ice dessert', 89.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Andok''s (General Segundo Ave., Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2008524, 120.5968873, 'Roast chicken', true
  where not exists (select 1 from public.restaurants where name = 'Andok''s (General Segundo Ave., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Litson Manok (Whole)', 'Roasted whole chicken', 330.00),
  ('Litson Manok (Half)', 'Roasted half chicken', 170.00),
  ('Liempo (per 1/2 kg)', 'Roasted pork belly', 260.00),
  ('Dokito', 'Fried chicken with rice', 95.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chocos Lechon Manok (Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2007924, 120.5968159, 'Roast & fried chicken', true
  where not exists (select 1 from public.restaurants where name = 'Chocos Lechon Manok (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Lechon Manok (Whole)', 'Roasted chicken · typical item, availability may vary', 320.00),
  ('Lechon Manok (Half)', 'Roasted half chicken · typical item, availability may vary', 170.00),
  ('Liempo (per 1/2 kg)', 'Roasted pork belly · typical item, availability may vary', 250.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'The Shawarma Shack (General Segundo Ave., Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2043598, 120.5989708, 'Shawarma', true
  where not exists (select 1 from public.restaurants where name = 'The Shawarma Shack (General Segundo Ave., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Beef Shawarma Wrap (Regular)', 'Beef shawarma in pita', 99.00),
  ('Shawarma Rice', 'Shawarma over rice', 119.00),
  ('Overload Shawarma', 'Extra meat and cheese', 149.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Infinitea (Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2043308, 120.5989505, 'Milk tea', true
  where not exists (select 1 from public.restaurants where name = 'Infinitea (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Milk Tea', 'With pearls · typical item, availability may vary', 99.00),
  ('Wintermelon Milk Tea', 'With pearls · typical item, availability may vary', 109.00),
  ('Brown Sugar Milk Tea', 'With pearls · typical item, availability may vary', 119.00),
  ('Fruit Tea', 'Iced fruit tea · typical item, availability may vary', 99.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kabuto Ramen House (Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2044018, 120.5990027, 'Japanese', true
  where not exists (select 1 from public.restaurants where name = 'Kabuto Ramen House (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Tonkotsu Ramen', 'Pork broth ramen · typical item, availability may vary', 289.00),
  ('Shoyu Ramen', 'Soy broth ramen · typical item, availability may vary', 269.00),
  ('Gyoza (5 pcs)', 'Pan-fried dumplings · typical item, availability may vary', 140.00),
  ('California Maki', 'Maki rolls · typical item, availability may vary', 180.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chooks to Go (Laoag City)', 'Laoag City, Ilocos Norte', 18.1876282, 120.5808614, 'Roast chicken', true
  where not exists (select 1 from public.restaurants where name = 'Chooks to Go (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Roast Chicken (Whole)', 'Chooks to Go roast chicken', 315.00),
  ('Roast Chicken (Half)', 'Half roast chicken', 165.00),
  ('Fried Chicken (6 pcs)', 'Fried chicken', 330.00),
  ('Java Rice', 'Seasoned rice', 30.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Burg and Go (Laoag City)', 'Rodolfo G. Fariñas Bypass Road, Laoag City, Ilocos Norte', 18.2140876, 120.5815696, 'Burgers', true
  where not exists (select 1 from public.restaurants where name = 'Burg and Go (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Burger', 'Beef burger · typical item, availability may vary', 60.00),
  ('Cheeseburger', 'Burger with cheese · typical item, availability may vary', 75.00),
  ('Fries', 'Regular fries · typical item, availability may vary', 50.00),
  ('Soft Serve / Iced Tea', 'Drink or dessert · typical item, availability may vary', 35.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Roadside Kitchenette (Laoag City)', 'Rodolfo G. Fariñas Bypass Road, Laoag City, Ilocos Norte', 18.2137882, 120.5817817, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Roadside Kitchenette (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kurimi x DM Express (Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2055269, 120.5999743, 'Milk tea', true
  where not exists (select 1 from public.restaurants where name = 'Kurimi x DM Express (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Milk Tea', 'With pearls · typical item, availability may vary', 99.00),
  ('Wintermelon Milk Tea', 'With pearls · typical item, availability may vary', 109.00),
  ('Brown Sugar Milk Tea', 'With pearls · typical item, availability may vary', 119.00),
  ('Fruit Tea', 'Iced fruit tea · typical item, availability may vary', 99.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kamalig Grill and Restaurant (Laoag City)', 'F. Julian Street, Laoag City, Ilocos Norte', 18.206619, 120.5850253, 'Grill', true
  where not exists (select 1 from public.restaurants where name = 'Kamalig Grill and Restaurant (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pork BBQ (3 sticks)', 'Grilled pork barbecue · typical item, availability may vary', 90.00),
  ('Grilled Liempo', 'Grilled pork belly · typical item, availability may vary', 180.00),
  ('Inihaw na Manok', 'Grilled chicken · typical item, availability may vary', 150.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mr. Coffee Bean (F. Julian St., Laoag City)', 'F. Julian Street, Laoag City, Ilocos Norte', 18.20657, 120.585314, 'Coffee & drinks', true
  where not exists (select 1 from public.restaurants where name = 'Mr. Coffee Bean (F. Julian St., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Americano (Small)', 'Espresso with hot water', 150.00),
  ('Café Latte (Small)', 'Espresso with milk', 175.00),
  ('Pure Double Chocolate Ice Blended (Small)', 'Blended chocolate', 210.00),
  ('Cheesecake Slice', 'Dessert', 185.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'MJM Ramyeon and Korean Food Mart (Laoag City)', 'P. Gomez Street, Laoag City, Ilocos Norte', 18.2065236, 120.5855971, 'Korean', true
  where not exists (select 1 from public.restaurants where name = 'MJM Ramyeon and Korean Food Mart (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Samgyupsal Set (good for 2)', 'Grilled pork belly with sides · typical item, availability may vary', 499.00),
  ('Ramyeon', 'Korean instant noodle bowl · typical item, availability may vary', 120.00),
  ('Kimchi Fried Rice', 'Fried rice with kimchi · typical item, availability may vary', 150.00),
  ('Tteokbokki', 'Spicy rice cakes · typical item, availability may vary', 160.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kelly’s Korean Grill (Laoag City)', 'P. Gomez Street, Laoag City, Ilocos Norte', 18.2064547, 120.5857812, 'Korean', true
  where not exists (select 1 from public.restaurants where name = 'Kelly’s Korean Grill (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Samgyupsal Set (good for 2)', 'Grilled pork belly with sides · typical item, availability may vary', 499.00),
  ('Ramyeon', 'Korean instant noodle bowl · typical item, availability may vary', 120.00),
  ('Kimchi Fried Rice', 'Fried rice with kimchi · typical item, availability may vary', 150.00),
  ('Tteokbokki', 'Spicy rice cakes · typical item, availability may vary', 160.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mr Bing''s Cafe (Laoag City)', 'P. Gomez Street, Laoag City, Ilocos Norte', 18.2064746, 120.5856836, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Mr Bing''s Cafe (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Vis-a-vis Lounge Laoag', 'A. Mabini Street, Laoag City, Ilocos Norte', 18.2019423, 120.593246, 'International', true
  where not exists (select 1 from public.restaurants where name = 'Vis-a-vis Lounge Laoag')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('House Pasta', 'Chef''s pasta · typical item, availability may vary', 280.00),
  ('Grilled Pork Chop', 'With rice or potatoes · typical item, availability may vary', 320.00),
  ('Clubhouse Sandwich', 'With fries · typical item, availability may vary', 250.00),
  ('Fresh Fruit Shake', 'Seasonal fruit · typical item, availability may vary', 120.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Coffee Project - Laoag (Airport Road, Laoag City)', 'Airport Road, Laoag City, Ilocos Norte', 18.1887574, 120.5500597, 'Coffee & drinks', true
  where not exists (select 1 from public.restaurants where name = 'Coffee Project - Laoag (Airport Road, Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Spanish Latte (Iced)', 'Sweet milk latte', 175.00),
  ('Americano', 'Espresso with water', 140.00),
  ('Matcha Latte', 'Green tea latte', 185.00),
  ('Cheesecake Slice', 'Dessert', 195.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Hotchick Sushi Shop (Laoag City)', 'Antonio Luna Street, Laoag City, Ilocos Norte', 18.1969909, 120.5930225, 'Japanese', true
  where not exists (select 1 from public.restaurants where name = 'Hotchick Sushi Shop (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Tonkotsu Ramen', 'Pork broth ramen · typical item, availability may vary', 289.00),
  ('Shoyu Ramen', 'Soy broth ramen · typical item, availability may vary', 269.00),
  ('Gyoza (5 pcs)', 'Pan-fried dumplings · typical item, availability may vary', 140.00),
  ('California Maki', 'Maki rolls · typical item, availability may vary', 180.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Pares Pare (Laoag City)', 'Magat Salamat Street, Laoag City, Ilocos Norte', 18.2047535, 120.6050269, 'Pares & goto', true
  where not exists (select 1 from public.restaurants where name = 'Pares Pare (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Beef Pares with Rice', 'Braised beef with rice and soup · typical item, availability may vary', 99.00),
  ('Goto', 'Rice porridge with tripe · typical item, availability may vary', 70.00),
  ('Lugaw with Egg', 'Rice porridge · typical item, availability may vary', 50.00),
  ('Tokwa''t Baboy', 'Tofu and pork · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Bareng and Aguto Coach Diner (Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2074193, 120.6012819, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Bareng and Aguto Coach Diner (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'CaffeLUC (Laoag City)', 'J. P. Rizal Avenue, Laoag City, Ilocos Norte', 18.2015601, 120.5841613, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'CaffeLUC (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Bakers Ph (Laoag City)', 'Rodolfo G. Fariñas Bypass Road, Laoag City, Ilocos Norte', 18.185722, 120.5665463, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Bakers Ph (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Baker''s PH (Laoag City)', 'F. R. Castro Street, Laoag City, Ilocos Norte', 18.1935791, 120.5960081, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Baker''s PH (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Tealive Fariñas Terminal (F. R. Castro St., Laoag City)', 'F. R. Castro Street, Laoag City, Ilocos Norte', 18.1960731, 120.591195, 'Milk tea', true
  where not exists (select 1 from public.restaurants where name = 'Tealive Fariñas Terminal (F. R. Castro St., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Signature Brown Sugar Milk Tea', 'With pearls', 130.00),
  ('Classic Milk Tea', 'With pearls', 110.00),
  ('Mango Yakult', 'Fruit tea', 120.00),
  ('Taro Milk Tea', 'With pearls', 125.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'El Comedor Restaurant (Laoag City)', 'Airport Road, Laoag City, Ilocos Norte', 18.1857294, 120.5652972, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'El Comedor Restaurant (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Cheesebakes Bus Cafe (Laoag City)', 'Laoag City, Ilocos Norte', 18.200432, 120.6031684, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Cheesebakes Bus Cafe (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kooke House (J. P. Rizal St., Laoag City)', 'J. P. Rizal Street, Laoag City, Ilocos Norte', 18.1949053, 120.5954598, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Kooke House (J. P. Rizal St., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kooke House (General Segundo Ave., Laoag City)', 'General Segundo Avenue, Laoag City, Ilocos Norte', 18.2067832, 120.6005658, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Kooke House (General Segundo Ave., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chooks to Go (Hernando St., Laoag City)', 'Hernando Street, Laoag City, Ilocos Norte', 18.197937, 120.5915405, 'Roast chicken', true
  where not exists (select 1 from public.restaurants where name = 'Chooks to Go (Hernando St., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Roast Chicken (Whole)', 'Chooks to Go roast chicken', 315.00),
  ('Roast Chicken (Half)', 'Half roast chicken', 165.00),
  ('Fried Chicken (6 pcs)', 'Fried chicken', 330.00),
  ('Java Rice', 'Seasoned rice', 30.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chooks to Go (P. Gomez St., Laoag City)', 'P. Gomez Street, Laoag City, Ilocos Norte', 18.2019538, 120.5959647, 'Roast chicken', true
  where not exists (select 1 from public.restaurants where name = 'Chooks to Go (P. Gomez St., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Roast Chicken (Whole)', 'Chooks to Go roast chicken', 315.00),
  ('Roast Chicken (Half)', 'Half roast chicken', 165.00),
  ('Fried Chicken (6 pcs)', 'Fried chicken', 330.00),
  ('Java Rice', 'Seasoned rice', 30.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Ely''s Place (Laoag City)', 'Hernando Street, Laoag City, Ilocos Norte', 18.1979088, 120.591323, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Ely''s Place (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Angel''s Pizza (Governor Primo Lazaro St., Laoag City)', 'Governor Primo Lazaro Street, Laoag City, Ilocos Norte', 18.1973886, 120.5941926, 'Pizza', true
  where not exists (select 1 from public.restaurants where name = 'Angel''s Pizza (Governor Primo Lazaro St., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Angel''s Hawaiian Pizza (Medium)', 'Ham and pineapple', 399.00),
  ('All Meat Pizza (Medium)', 'Meat lover''s pizza', 449.00),
  ('Carbonara', 'Creamy pasta', 225.00),
  ('Garlic Bread', 'Toasted', 95.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kubolaluhan Foodhouse (Laoag City)', 'F. Julian, Laoag City, Ilocos Norte', 18.2097303, 120.5861973, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Kubolaluhan Foodhouse (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Marsha''s Delicacies (Laoag City)', 'Antonio Luna Street, Laoag City, Ilocos Norte', 18.1985781, 120.5903989, 'Native delicacies', true
  where not exists (select 1 from public.restaurants where name = 'Marsha''s Delicacies (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Tupig (bundle)', 'Grilled glutinous rice in banana leaf · typical item, availability may vary', 50.00),
  ('Bibingka', 'Rice cake · typical item, availability may vary', 60.00),
  ('Cassava Cake', 'Baked cassava cake · typical item, availability may vary', 80.00),
  ('Kalamay', 'Sticky rice delicacy · typical item, availability may vary', 60.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Pahingá Coffee Shop (Laoag City)', 'P. Gomez Street, Laoag City, Ilocos Norte', 18.1998121, 120.6019728, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Pahingá Coffee Shop (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Café Marqueza (Laoag City)', 'Laoag City, Ilocos Norte', 18.1972106, 120.6081262, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Café Marqueza (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Starbucks (J. P. Rizal Ave., Laoag City)', 'J. P. Rizal Avenue, Laoag City, Ilocos Norte', 18.1963834, 120.5914035, 'Coffee & drinks', true
  where not exists (select 1 from public.restaurants where name = 'Starbucks (J. P. Rizal Ave., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Caffè Americano (Tall)', 'Espresso with hot water', 140.00),
  ('Caffè Latte (Tall)', 'Espresso with steamed milk', 165.00),
  ('Caramel Macchiato (Tall)', 'Vanilla, milk, espresso, caramel', 185.00),
  ('Java Chip Frappuccino (Tall)', 'Blended coffee with chocolate chips', 195.00),
  ('Chocolate Chip Cookie', 'Baked cookie', 85.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'El Wings Unlimited Main (Laoag City)', 'Laoag City, Ilocos Norte', 18.19794, 120.5924738, 'Chicken wings', true
  where not exists (select 1 from public.restaurants where name = 'El Wings Unlimited Main (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chicken Wings (6 pcs)', 'Choice of flavor · typical item, availability may vary', 199.00),
  ('Chicken Wings (12 pcs)', 'Choice of flavor · typical item, availability may vary', 379.00),
  ('Fries', 'Regular fries · typical item, availability may vary', 70.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jollibee (Airport Access Road, Laoag City)', 'Airport Access Road, Laoag City, Ilocos Norte', 18.1861854, 120.5700583, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'Jollibee (Airport Access Road, Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chickenjoy with Rice', 'Crispy fried chicken with rice', 109.00),
  ('Jolly Spaghetti', 'Sweet-style spaghetti', 75.00),
  ('Yumburger', 'Classic beef burger', 45.00),
  ('1-pc Burger Steak with Rice', 'Beef patty in mushroom gravy', 75.00),
  ('Super Meal A', 'Chickenjoy, half spaghetti, Yumburger, rice and drink', 185.00),
  ('Peach Mango Pie', 'Peach-mango filled pie', 45.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Dunkin’ - Laoag Carmen Tower (J. P. Rizal St., Laoag City)', 'J. P. Rizal Street, Laoag City, Ilocos Norte', 18.1940327, 120.5969872, 'Donuts & coffee', true
  where not exists (select 1 from public.restaurants where name = 'Dunkin’ - Laoag Carmen Tower (J. P. Rizal St., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Glazed Donut', 'Classic glazed donut', 45.00),
  ('Bavarian Donut', 'Cream-filled donut', 50.00),
  ('Box of 6 Assorted Donuts', 'Six classic donuts', 299.00),
  ('Munchkins (25 pcs)', 'Donut holes', 199.00),
  ('Iced Coffee', 'Dunkin'' iced coffee', 95.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'McDonald''s Laoag Rotunda (Laoag - Balaccad Road, Laoag City)', 'Laoag - Balaccad Road, Laoag City, Ilocos Norte', 18.1842633, 120.5664937, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'McDonald''s Laoag Rotunda (Laoag - Balaccad Road, Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chicken McDo with Rice', 'Fried chicken with rice', 109.00),
  ('McSpaghetti', 'Sweet-style spaghetti', 70.00),
  ('Burger McDo', 'Classic beef burger', 50.00),
  ('Cheeseburger', 'Beef patty with cheese', 75.00),
  ('Fries (Medium)', 'World-famous fries', 70.00),
  ('Coke McFloat', 'Coke with vanilla soft serve', 50.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Durong (Laoag City)', 'Laoag City, Ilocos Norte', 18.1954629, 120.6038597, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Durong (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Dawang''s Eatery sa Laoag', 'P. Paterno Street, Laoag City, Ilocos Norte', 18.19486, 120.6030428, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Dawang''s Eatery sa Laoag')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Edgar''s Miki (Bernaida''s Store) (Laoag City)', 'Laoag City, Ilocos Norte', 18.2003655, 120.5937472, 'Miki & empanada', true
  where not exists (select 1 from public.restaurants where name = 'Edgar''s Miki (Bernaida''s Store) (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Miki Soup (Bowl)', 'Ilocano thick noodle soup · typical item, availability may vary', 70.00),
  ('Special Miki', 'With extra toppings · typical item, availability may vary', 90.00),
  ('Empanada', 'Ilocos empanada · typical item, availability may vary', 60.00),
  ('Soft Drink', 'Bottled soft drink · typical item, availability may vary', 25.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Rafael''s Restaurant - Laoag Branch', 'Manila North Road, Laoag City, Ilocos Norte', 18.184201, 120.5893353, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Rafael''s Restaurant - Laoag Branch')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Starbucks (Laoag City)', 'Laoag City, Ilocos Norte', 18.1877318, 120.5859701, 'Coffee & drinks', true
  where not exists (select 1 from public.restaurants where name = 'Starbucks (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Caffè Americano (Tall)', 'Espresso with hot water', 140.00),
  ('Caffè Latte (Tall)', 'Espresso with steamed milk', 165.00),
  ('Caramel Macchiato (Tall)', 'Vanilla, milk, espresso, caramel', 185.00),
  ('Java Chip Frappuccino (Tall)', 'Blended coffee with chocolate chips', 195.00),
  ('Chocolate Chip Cookie', 'Baked cookie', 85.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Bonchon Chicken (Laoag City)', 'Laoag City, Ilocos Norte', 18.1873764, 120.5856347, 'Korean chicken', true
  where not exists (select 1 from public.restaurants where name = 'Bonchon Chicken (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bonchon Chicken (6 pcs)', 'Soy garlic or spicy wings', 359.00),
  ('Chicken Rice Box', 'Chicken with rice', 199.00),
  ('Japchae', 'Korean glass noodles', 199.00),
  ('Bibimbap', 'Korean mixed rice bowl', 259.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Bo''s Coffee (Laoag City)', 'Laoag City, Ilocos Norte', 18.1872219, 120.5854395, 'Coffee & drinks', true
  where not exists (select 1 from public.restaurants where name = 'Bo''s Coffee (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee (Medium)', 'Philippine-grown coffee', 125.00),
  ('Café Latte (Medium)', 'Espresso with milk', 170.00),
  ('Mocha Frappe (Medium)', 'Blended mocha', 195.00),
  ('Ensaymada', 'Pastry', 85.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Pancake House (Laoag City)', 'Laoag City, Ilocos Norte', 18.1874826, 120.5854273, 'Filipino-American', true
  where not exists (select 1 from public.restaurants where name = 'Pancake House (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Pancakes (2 pcs)', 'Buttermilk pancakes', 165.00),
  ('Taco Plate', 'Pancake House tacos', 245.00),
  ('Chicken Fried Steak', 'With rice', 335.00),
  ('Spaghetti with Meatballs', 'Pasta', 265.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jollibee (Laoag City)', 'Laoag City, Ilocos Norte', 18.1870346, 120.5847444, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'Jollibee (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chickenjoy with Rice', 'Crispy fried chicken with rice', 109.00),
  ('Jolly Spaghetti', 'Sweet-style spaghetti', 75.00),
  ('Yumburger', 'Classic beef burger', 45.00),
  ('1-pc Burger Steak with Rice', 'Beef patty in mushroom gravy', 75.00),
  ('Super Meal A', 'Chickenjoy, half spaghetti, Yumburger, rice and drink', 185.00),
  ('Peach Mango Pie', 'Peach-mango filled pie', 45.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Cafe Amian (Laoag City)', 'Laoag City, Ilocos Norte', 18.1870249, 120.5845695, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Cafe Amian (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Buffalo Wings N'' Things (Laoag City)', 'Laoag City, Ilocos Norte', 18.1876333, 120.5856367, 'Chicken wings', true
  where not exists (select 1 from public.restaurants where name = 'Buffalo Wings N'' Things (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chicken Wings (6 pcs)', 'Choice of flavor · typical item, availability may vary', 199.00),
  ('Chicken Wings (12 pcs)', 'Choice of flavor · typical item, availability may vary', 379.00),
  ('Fries', 'Regular fries · typical item, availability may vary', 70.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Ineng’s Special BBQ (Laoag City)', 'Laoag City, Ilocos Norte', 18.1880659, 120.586277, 'Grill', true
  where not exists (select 1 from public.restaurants where name = 'Ineng’s Special BBQ (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pork BBQ (3 sticks)', 'Grilled pork barbecue · typical item, availability may vary', 90.00),
  ('Grilled Liempo', 'Grilled pork belly · typical item, availability may vary', 180.00),
  ('Inihaw na Manok', 'Grilled chicken · typical item, availability may vary', 150.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mesa (Laoag City)', 'Laoag City, Ilocos Norte', 18.1873975, 120.5854744, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Mesa (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Classic Savory (Laoag City)', 'Laoag City, Ilocos Norte', 18.187388, 120.5853481, 'Filipino-Chinese', true
  where not exists (select 1 from public.restaurants where name = 'Classic Savory (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Savory Fried Chicken (Half)', 'Signature fried chicken', 360.00),
  ('Yang Chow Fried Rice (Regular)', 'Chinese fried rice', 260.00),
  ('Pancit Canton (Regular)', 'Stir-fried noodles', 320.00),
  ('Sweet and Sour Pork', 'Pork in sweet and sour sauce', 380.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Botejyu (Laoag City)', 'Laoag City, Ilocos Norte', 18.1874305, 120.5852586, 'Japanese', true
  where not exists (select 1 from public.restaurants where name = 'Botejyu (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Okonomiyaki (Pork)', 'Japanese savory pancake', 395.00),
  ('Yakisoba', 'Stir-fried noodles', 345.00),
  ('Takoyaki (6 pcs)', 'Octopus balls', 245.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Nabe Unlimited Japanese Hotpot (Laoag City)', 'Laoag City, Ilocos Norte', 18.1877202, 120.5858176, 'Japanese', true
  where not exists (select 1 from public.restaurants where name = 'Nabe Unlimited Japanese Hotpot (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Tonkotsu Ramen', 'Pork broth ramen · typical item, availability may vary', 289.00),
  ('Shoyu Ramen', 'Soy broth ramen · typical item, availability may vary', 269.00),
  ('Gyoza (5 pcs)', 'Pan-fried dumplings · typical item, availability may vary', 140.00),
  ('California Maki', 'Maki rolls · typical item, availability may vary', 180.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Marugame Udon (Laoag City)', 'Laoag City, Ilocos Norte', 18.1874763, 120.585076, 'Japanese', true
  where not exists (select 1 from public.restaurants where name = 'Marugame Udon (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Kake Udon (Regular)', 'Udon in dashi broth', 155.00),
  ('Niku Udon (Regular)', 'Udon with beef', 279.00),
  ('Chicken Tempura', 'Tempura side', 75.00),
  ('Ebi Tempura', 'Shrimp tempura', 95.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Gerry’s Grill (Laoag City)', 'Laoag City, Ilocos Norte', 18.1872441, 120.5846259, 'Filipino grill', true
  where not exists (select 1 from public.restaurants where name = 'Gerry’s Grill (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Sizzling Sisig', 'Pork sisig on a sizzling plate', 365.00),
  ('Crispy Pata', 'Deep-fried pork knuckle', 795.00),
  ('Grilled Tuna Belly', 'With soy-calamansi', 495.00),
  ('Pancit Bihon', 'Stir-fried rice noodles', 335.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kenny Rogers Roasters (Laoag City)', 'Laoag City, Ilocos Norte', 18.1876917, 120.5858763, 'Roast chicken', true
  where not exists (select 1 from public.restaurants where name = 'Kenny Rogers Roasters (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Quarter Roast Chicken Meal', 'With rice and two sides', 249.00),
  ('Half Roast Chicken', 'Rotisserie chicken', 399.00),
  ('Mac & Cheese', 'Side', 85.00),
  ('Blueberry Cheesecake Muffin', 'Muffin', 85.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Tokyo Tokyo (Laoag City)', 'Laoag City, Ilocos Norte', 18.1877383, 120.5859335, 'Japanese fast food', true
  where not exists (select 1 from public.restaurants where name = 'Tokyo Tokyo (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Beef Misono with Rice', 'Teppanyaki beef', 189.00),
  ('Chicken Teriyaki Bento', 'Chicken teriyaki with rice', 199.00),
  ('Kani Salad', 'Crab stick salad', 125.00),
  ('California Maki (8 pcs)', 'Maki rolls', 185.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'KFC (Laoag City)', 'Laoag City, Ilocos Norte', 18.1878259, 120.5860187, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'KFC (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chicken with Rice', 'Original Recipe or Hot & Crispy', 125.00),
  ('2-pc Chicken with Rice', 'Two pieces with rice', 229.00),
  ('Famous Bowl', 'Rice, mashed potato, corn, chicken and gravy', 125.00),
  ('Zinger Burger', 'Spicy chicken fillet burger', 165.00),
  ('Mashed Potato', 'With gravy', 50.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Sumo Niku (Laoag City)', 'Laoag City, Ilocos Norte', 18.187751, 120.5851129, 'Japanese', true
  where not exists (select 1 from public.restaurants where name = 'Sumo Niku (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Tonkotsu Ramen', 'Pork broth ramen · typical item, availability may vary', 289.00),
  ('Shoyu Ramen', 'Soy broth ramen · typical item, availability may vary', 269.00),
  ('Gyoza (5 pcs)', 'Pan-fried dumplings · typical item, availability may vary', 140.00),
  ('California Maki', 'Maki rolls · typical item, availability may vary', 180.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Goldilocks (Laoag City)', 'Laoag City, Ilocos Norte', 18.1878339, 120.5852413, 'Bakeshop', true
  where not exists (select 1 from public.restaurants where name = 'Goldilocks (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Mocha Roll', 'Mocha chiffon roll', 260.00),
  ('Ube Cake (Junior)', 'Purple yam cake', 420.00),
  ('Polvoron (pack)', 'Milk powder shortbread', 90.00),
  ('Ensaymada', 'Buttery brioche with cheese', 40.00),
  ('Pancit Malabon (Solo)', 'Thick noodles with seafood', 160.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Max''s Restaurant (Laoag City)', 'Laoag City, Ilocos Norte', 18.1871902, 120.5852532, 'Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Max''s Restaurant (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Max''s Fried Chicken (Half)', 'Classic fried chicken', 395.00),
  ('Kare-Kare', 'Oxtail in peanut sauce', 525.00),
  ('Pancit Canton (Regular)', 'Stir-fried noodles', 350.00),
  ('Lumpiang Ubod', 'Fresh spring roll', 220.00),
  ('Caramel Bar', 'Signature caramel bar', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'BreadTalk (Laoag City)', 'Laoag City, Ilocos Norte', 18.1876108, 120.585684, 'Bakeshop', true
  where not exists (select 1 from public.restaurants where name = 'BreadTalk (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Floss Bun', 'Signature pork floss bun', 75.00),
  ('Cheese Bun', 'Soft cheese bun', 55.00),
  ('Ensaymada', 'Pastry', 60.00),
  ('Chiffon Cake (Slice)', 'Cake', 85.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Pepper Lunch (Laoag City)', 'Laoag City, Ilocos Norte', 18.1874771, 120.5849477, 'Japanese', true
  where not exists (select 1 from public.restaurants where name = 'Pepper Lunch (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Beef Pepper Rice', 'Sizzling beef pepper rice', 229.00),
  ('Chicken Pepper Rice', 'Sizzling chicken pepper rice', 209.00),
  ('Salmon Pepper Rice', 'Sizzling salmon pepper rice', 299.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Old Soul Bar x Beans (Laoag City)', 'Laoag City, Ilocos Norte', 18.1873747, 120.584818, 'International', true
  where not exists (select 1 from public.restaurants where name = 'Old Soul Bar x Beans (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('House Pasta', 'Chef''s pasta · typical item, availability may vary', 280.00),
  ('Grilled Pork Chop', 'With rice or potatoes · typical item, availability may vary', 320.00),
  ('Clubhouse Sandwich', 'With fries · typical item, availability may vary', 250.00),
  ('Fresh Fruit Shake', 'Seasonal fruit · typical item, availability may vary', 120.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'The Coffee Bean & Tea Leaf (Laoag City)', 'Laoag City, Ilocos Norte', 18.1874226, 120.5851923, 'Coffee & drinks', true
  where not exists (select 1 from public.restaurants where name = 'The Coffee Bean & Tea Leaf (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Americano (Small)', 'Espresso with hot water', 150.00),
  ('Café Latte (Small)', 'Espresso with milk', 175.00),
  ('Pure Double Chocolate Ice Blended (Small)', 'Blended chocolate', 210.00),
  ('Cheesecake Slice', 'Dessert', 185.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kenangan Coffee (Laoag City)', 'Laoag City, Ilocos Norte', 18.1873431, 120.5847531, 'Coffee & drinks', true
  where not exists (select 1 from public.restaurants where name = 'Kenangan Coffee (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Kenangan Latte (Iced)', 'Palm sugar latte', 140.00),
  ('Americano', 'Espresso with water', 110.00),
  ('Avocado Coffee', 'Signature drink', 170.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Pizza Hut (J. P. Rizal Ave., Laoag City)', 'J. P. Rizal Avenue, Laoag City, Ilocos Norte', 18.1961243, 120.5921905, 'Pizza', true
  where not exists (select 1 from public.restaurants where name = 'Pizza Hut (J. P. Rizal Ave., Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Hawaiian Supreme Pan Pizza (Regular)', 'Ham and pineapple', 399.00),
  ('Super Supreme Pan Pizza (Regular)', 'Loaded meat and veggies', 449.00),
  ('Baked Carbonara', 'Creamy baked pasta', 199.00),
  ('Garlic Breadsticks', 'With dip', 99.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Popeyes - Laoag Airport Road (Laoag City)', 'Laoag City, Ilocos Norte', 18.1867898, 120.5727097, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'Popeyes - Laoag Airport Road (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('2-pc Signature Chicken with Rice', 'Louisiana-style fried chicken', 229.00),
  ('Chicken Sandwich', 'Crispy chicken sandwich', 199.00),
  ('Cajun Fries (Regular)', 'Seasoned fries', 85.00),
  ('Biscuit', 'Buttermilk biscuit', 45.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Bro''s Brew Cafe (Laoag City)', 'Rodolfo G. Fariñas Bypass Road, Laoag City, Ilocos Norte', 18.1938969, 120.5671528, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Bro''s Brew Cafe (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'The Artisan Blends (Laoag City)', 'Laoag City, Ilocos Norte', 18.1966094, 120.5959174, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'The Artisan Blends (Laoag City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kape Sina Una Ilocos Norte - Laoag Bypass Road', 'Rodolfo G. Fariñas Bypass Road, Laoag City, Ilocos Norte', 18.1963132, 120.5679415, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Kape Sina Una Ilocos Norte - Laoag Bypass Road')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Pagudpud (23)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Lagundino Carinderia (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5603479, 120.7866974, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Lagundino Carinderia (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'BergBlick Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.575241, 120.8031494, 'International', true
  where not exists (select 1 from public.restaurants where name = 'BergBlick Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('House Pasta', 'Chef''s pasta · typical item, availability may vary', 280.00),
  ('Grilled Pork Chop', 'With rice or potatoes · typical item, availability may vary', 320.00),
  ('Clubhouse Sandwich', 'With fries · typical item, availability may vary', 250.00),
  ('Fresh Fruit Shake', 'Seasonal fruit · typical item, availability may vary', 120.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Bondat Lechon Manok (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5615831, 120.7882377, 'Roast & fried chicken', true
  where not exists (select 1 from public.restaurants where name = 'Bondat Lechon Manok (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Lechon Manok (Whole)', 'Roasted chicken · typical item, availability may vary', 320.00),
  ('Lechon Manok (Half)', 'Roasted half chicken · typical item, availability may vary', 170.00),
  ('Liempo (per 1/2 kg)', 'Roasted pork belly · typical item, availability may vary', 250.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Sarabo (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5693013, 120.7935572, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Sarabo (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kingfisher Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.6327407, 120.7996558, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Kingfisher Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Tartaruga''s Hotel and Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5876775, 120.7874757, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Tartaruga''s Hotel and Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Burayoc Junction (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5744273, 120.7978746, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Burayoc Junction (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Pares & Grill (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5949062, 120.7911048, 'Pares & goto', true
  where not exists (select 1 from public.restaurants where name = 'Pares & Grill (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Beef Pares with Rice', 'Braised beef with rice and soup · typical item, availability may vary', 99.00),
  ('Goto', 'Rice porridge with tripe · typical item, availability may vary', 70.00),
  ('Lugaw with Egg', 'Rice porridge · typical item, availability may vary', 50.00),
  ('Tokwa''t Baboy', 'Tofu and pork · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Villa Deocarez Restobar (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.594913, 120.7911249, 'Seafood & Ilocano', true
  where not exists (select 1 from public.restaurants where name = 'Villa Deocarez Restobar (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Grilled Fish', 'Catch of the day · typical item, availability may vary', 280.00),
  ('Garlic Butter Shrimp', 'Shrimp in garlic butter · typical item, availability may vary', 380.00),
  ('Sinigang na Hipon', 'Sour shrimp soup · typical item, availability may vary', 320.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Emohruo Beach Restobar (Pagudpud)', 'romero street, Pagudpud, Ilocos Norte', 18.5814649, 120.7834464, 'Seafood & Ilocano', true
  where not exists (select 1 from public.restaurants where name = 'Emohruo Beach Restobar (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Grilled Fish', 'Catch of the day · typical item, availability may vary', 280.00),
  ('Garlic Butter Shrimp', 'Shrimp in garlic butter · typical item, availability may vary', 380.00),
  ('Sinigang na Hipon', 'Sour shrimp soup · typical item, availability may vary', 320.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'JC Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5811016, 120.7830806, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'JC Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Ella''s Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5811597, 120.78452, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Ella''s Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Villa del Mar Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5817235, 120.7845866, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Villa del Mar Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'La Helen Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5814302, 120.783695, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'La Helen Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Casa Grill Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5813036, 120.7834365, 'Grill', true
  where not exists (select 1 from public.restaurants where name = 'Casa Grill Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pork BBQ (3 sticks)', 'Grilled pork barbecue · typical item, availability may vary', 90.00),
  ('Grilled Liempo', 'Grilled pork belly · typical item, availability may vary', 180.00),
  ('Inihaw na Manok', 'Grilled chicken · typical item, availability may vary', 150.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Villa Manuela Restobar (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5816241, 120.7840813, 'Seafood & Ilocano', true
  where not exists (select 1 from public.restaurants where name = 'Villa Manuela Restobar (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Grilled Fish', 'Catch of the day · typical item, availability may vary', 280.00),
  ('Garlic Butter Shrimp', 'Shrimp in garlic butter · typical item, availability may vary', 380.00),
  ('Sinigang na Hipon', 'Sour shrimp soup · typical item, availability may vary', 320.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Agullana''s Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5770251, 120.7949386, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Agullana''s Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Junior Eatery and Zane Sari Sari Store (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5783002, 120.7933956, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Junior Eatery and Zane Sari Sari Store (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Cabasaan Eatery (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5890391, 120.7867596, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Cabasaan Eatery (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Babu Rice Bowl (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.5843255, 120.7893405, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Babu Rice Bowl (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Hannah''s Beach Resort Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.6257781, 120.8575758, 'Seafood & Ilocano', true
  where not exists (select 1 from public.restaurants where name = 'Hannah''s Beach Resort Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Grilled Fish', 'Catch of the day · typical item, availability may vary', 280.00),
  ('Garlic Butter Shrimp', 'Shrimp in garlic butter · typical item, availability may vary', 380.00),
  ('Sinigang na Hipon', 'Sour shrimp soup · typical item, availability may vary', 320.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'K&G Restaurant (Pagudpud)', 'Pagudpud, Ilocos Norte', 18.6081061, 120.8696404, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'K&G Restaurant (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Zephyr Cafe (Pagudpud)', 'Balaoi-Aryargo Road, Pagudpud, Ilocos Norte', 18.6309957, 120.859479, 'International', true
  where not exists (select 1 from public.restaurants where name = 'Zephyr Cafe (Pagudpud)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('House Pasta', 'Chef''s pasta · typical item, availability may vary', 280.00),
  ('Grilled Pork Chop', 'With rice or potatoes · typical item, availability may vary', 320.00),
  ('Clubhouse Sandwich', 'With fries · typical item, availability may vary', 250.00),
  ('Fresh Fruit Shake', 'Seasonal fruit · typical item, availability may vary', 120.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- San Nicolas (16)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Golden Pavilion Chinese Restaurant & Night Club (San Nicolas)', 'San Nicolas, Ilocos Norte', 18.1564113, 120.5225696, 'Chinese', true
  where not exists (select 1 from public.restaurants where name = 'Golden Pavilion Chinese Restaurant & Night Club (San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Yang Chow Fried Rice', 'Chinese fried rice · typical item, availability may vary', 220.00),
  ('Pancit Canton', 'Stir-fried noodles · typical item, availability may vary', 250.00),
  ('Sweet and Sour Pork', 'Classic Chinese dish · typical item, availability may vary', 320.00),
  ('Siomai (4 pcs)', 'Steamed dumplings · typical item, availability may vary', 80.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'CDM Marios Bar & Restaurant (San Nicolas)', 'Federico Fariñas Avenue, San Nicolas, Ilocos Norte', 18.156399, 120.5321586, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'CDM Marios Bar & Restaurant (San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Joker Bakery (San Nicolas)', 'Federico Fariñas Avenue, San Nicolas, Ilocos Norte', 18.1521772, 120.5284537, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Joker Bakery (San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Red Ribbon (Manila North Road, San Nicolas)', 'Manila North Road, San Nicolas, Ilocos Norte', 18.1801373, 120.5902916, 'Bakeshop', true
  where not exists (select 1 from public.restaurants where name = 'Red Ribbon (Manila North Road, San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Black Forest Cake (Junior)', 'Chocolate cake with cherries', 450.00),
  ('Chocolate Mousse Cake (Junior)', 'Chocolate mousse cake', 450.00),
  ('Mamon (Classic)', 'Soft chiffon cupcake', 35.00),
  ('Ensaymada', 'Buttery brioche with cheese', 40.00),
  ('Palabok Fiesta', 'Rice noodles with shrimp sauce', 165.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Shakey''s (Manila North Road, San Nicolas)', 'Manila North Road, San Nicolas, Ilocos Norte', 18.1798891, 120.5904089, 'Pizza', true
  where not exists (select 1 from public.restaurants where name = 'Shakey''s (Manila North Road, San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Manager''s Choice Pizza (Regular)', 'Signature thin-crust pizza', 395.00),
  ('Hawaiian Delight Pizza (Regular)', 'Ham and pineapple', 375.00),
  ('Chicken ''N'' Mojos', 'Fried chicken with mojo potatoes', 395.00),
  ('Spaghetti Bolognese', 'Pasta with meat sauce', 195.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Adobo Connection Ilocos Inc. (Manila North Road, San Nicolas)', 'Manila North Road, San Nicolas, Ilocos Norte', 18.179039, 120.5926366, 'Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Adobo Connection Ilocos Inc. (Manila North Road, San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chicken Adobo with Rice', 'Classic adobo', 125.00),
  ('Pork Adobo with Rice', 'Classic adobo', 135.00),
  ('Adobo Flakes with Rice and Egg', 'Crispy adobo flakes', 135.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'La Via (San Nicolas)', 'San Nicolas, Ilocos Norte', 18.158304, 120.5354906, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'La Via (San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mang Inasal (Robinsons Place, San Nicolas)', 'Robinsons Place, San Nicolas, Ilocos Norte', 18.1795096, 120.5934189, 'Grilled chicken', true
  where not exists (select 1 from public.restaurants where name = 'Mang Inasal (Robinsons Place, San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chicken Inasal Paa with Rice', 'Grilled chicken leg quarter with rice', 149.00),
  ('Chicken Inasal Pecho with Rice', 'Grilled chicken breast with rice', 169.00),
  ('Pork BBQ (2 sticks) with Rice', 'Grilled pork barbecue', 119.00),
  ('Palabok', 'Rice noodles with shrimp sauce', 99.00),
  ('Halo-Halo', 'Shaved ice dessert', 89.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jollibee (Manila North Road, San Nicolas)', 'Manila North Road, San Nicolas, Ilocos Norte', 18.1713764, 120.5934364, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'Jollibee (Manila North Road, San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chickenjoy with Rice', 'Crispy fried chicken with rice', 109.00),
  ('Jolly Spaghetti', 'Sweet-style spaghetti', 75.00),
  ('Yumburger', 'Classic beef burger', 45.00),
  ('1-pc Burger Steak with Rice', 'Beef patty in mushroom gravy', 75.00),
  ('Super Meal A', 'Chickenjoy, half spaghetti, Yumburger, rice and drink', 185.00),
  ('Peach Mango Pie', 'Peach-mango filled pie', 45.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Greenwich (San Nicolas)', 'San Nicolas, Ilocos Norte', 18.1794427, 120.593095, 'Pizza & pasta', true
  where not exists (select 1 from public.restaurants where name = 'Greenwich (San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Hawaiian Overload Pizza (Regular)', 'Ham and pineapple pizza', 299.00),
  ('Pepperoni Overload Pizza (Regular)', 'Loaded pepperoni pizza', 299.00),
  ('Lasagna Supreme', 'Baked lasagna', 165.00),
  ('Spaghetti with Meatballs', 'Sweet-style spaghetti', 120.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Partz Sizzling Grill (San Nicolas)', 'San Nicolas, Ilocos Norte', 18.1806962, 120.5914868, 'Grill', true
  where not exists (select 1 from public.restaurants where name = 'Partz Sizzling Grill (San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pork BBQ (3 sticks)', 'Grilled pork barbecue · typical item, availability may vary', 90.00),
  ('Grilled Liempo', 'Grilled pork belly · typical item, availability may vary', 180.00),
  ('Inihaw na Manok', 'Grilled chicken · typical item, availability may vary', 150.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Andok''s (Manila North Road, San Nicolas)', 'Manila North Road, San Nicolas, Ilocos Norte', 18.1745826, 120.594245, 'Roast chicken', true
  where not exists (select 1 from public.restaurants where name = 'Andok''s (Manila North Road, San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Litson Manok (Whole)', 'Roasted whole chicken', 330.00),
  ('Litson Manok (Half)', 'Roasted half chicken', 170.00),
  ('Liempo (per 1/2 kg)', 'Roasted pork belly', 260.00),
  ('Dokito', 'Fried chicken with rice', 95.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mama Aket Eatery (San Nicolas)', 'Manila North Road, San Nicolas, Ilocos Norte', 18.1779115, 120.5908342, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Mama Aket Eatery (San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Pah Ramen - Balatong Branch (San Nicolas)', 'San Nicolas, Ilocos Norte', 18.1596481, 120.5557345, 'Japanese', true
  where not exists (select 1 from public.restaurants where name = 'Pah Ramen - Balatong Branch (San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Tonkotsu Ramen', 'Pork broth ramen · typical item, availability may vary', 289.00),
  ('Shoyu Ramen', 'Soy broth ramen · typical item, availability may vary', 269.00),
  ('Gyoza (5 pcs)', 'Pan-fried dumplings · typical item, availability may vary', 140.00),
  ('California Maki', 'Maki rolls · typical item, availability may vary', 180.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'McDonald''s (Manila North Road, San Nicolas)', 'Manila North Road, San Nicolas, Ilocos Norte', 18.1663147, 120.5906047, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'McDonald''s (Manila North Road, San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chicken McDo with Rice', 'Fried chicken with rice', 109.00),
  ('McSpaghetti', 'Sweet-style spaghetti', 70.00),
  ('Burger McDo', 'Classic beef burger', 50.00),
  ('Cheeseburger', 'Beef patty with cheese', 75.00),
  ('Fries (Medium)', 'World-famous fries', 70.00),
  ('Coke McFloat', 'Coke with vanilla soft serve', 50.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'McDonald''s (San Nicolas)', 'San Nicolas, Ilocos Norte', 18.1802195, 120.5909101, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'McDonald''s (San Nicolas)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chicken McDo with Rice', 'Fried chicken with rice', 109.00),
  ('McSpaghetti', 'Sweet-style spaghetti', 70.00),
  ('Burger McDo', 'Classic beef burger', 50.00),
  ('Cheeseburger', 'Beef patty with cheese', 75.00),
  ('Fries (Medium)', 'World-famous fries', 70.00),
  ('Coke McFloat', 'Coke with vanilla soft serve', 50.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Bacarra (12)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Petrina''s Cassava Cake (Bacarra)', 'Bacarra, Ilocos Norte', 18.2659935, 120.6021208, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Petrina''s Cassava Cake (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'RVA Eatery (Bacarra)', 'Bacarra, Ilocos Norte', 18.2546062, 120.6082047, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'RVA Eatery (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'LC BigMak (Bacarra)', 'Bacarra, Ilocos Norte', 18.2536004, 120.6084977, 'Burgers', true
  where not exists (select 1 from public.restaurants where name = 'LC BigMak (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Burger', 'Beef burger · typical item, availability may vary', 60.00),
  ('Cheeseburger', 'Burger with cheese · typical item, availability may vary', 75.00),
  ('Fries', 'Regular fries · typical item, availability may vary', 50.00),
  ('Soft Serve / Iced Tea', 'Drink or dessert · typical item, availability may vary', 35.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Editha’s Panaderia (Bacarra)', 'Bacarra, Ilocos Norte', 18.2544223, 120.6080506, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Editha’s Panaderia (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Ron Ron Restaurant (Bacarra)', 'Bacarra, Ilocos Norte', 18.2541109, 120.6084958, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Ron Ron Restaurant (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mister Donut (Bacarra)', 'Bacarra, Ilocos Norte', 18.2536039, 120.6084106, 'Donuts & coffee', true
  where not exists (select 1 from public.restaurants where name = 'Mister Donut (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pon de Ring', 'Chewy ring donut', 45.00),
  ('Choco Honey Dip', 'Chocolate-dipped donut', 40.00),
  ('Box of 6 Donuts', 'Assorted donuts', 260.00),
  ('Iced Coffee', 'Iced coffee', 85.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Geodithe’s Restaurant (Bacarra)', 'Bacarra, Ilocos Norte', 18.2528852, 120.6079915, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Geodithe’s Restaurant (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kusina ni Aksyon Mel (Bacarra)', 'Bacarra, Ilocos Norte', 18.2578961, 120.6088198, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Kusina ni Aksyon Mel (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Franks n’ Burgers (Bacarra)', 'Bacarra, Ilocos Norte', 18.2516122, 120.6110425, 'Burgers', true
  where not exists (select 1 from public.restaurants where name = 'Franks n’ Burgers (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Franks Burger', 'Classic burger', 45.00),
  ('Cheeseburger', 'Burger with cheese', 55.00),
  ('Footlong Hotdog', 'Hotdog sandwich', 50.00),
  ('Fries', 'Regular fries', 45.00),
  ('Iced Tea', 'Drink', 25.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Planaxis Grill and Restaurant (Bacarra)', 'Manila North Road, Bacarra, Ilocos Norte', 18.233567, 120.6113791, 'Grill', true
  where not exists (select 1 from public.restaurants where name = 'Planaxis Grill and Restaurant (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pork BBQ (3 sticks)', 'Grilled pork barbecue · typical item, availability may vary', 90.00),
  ('Grilled Liempo', 'Grilled pork belly · typical item, availability may vary', 180.00),
  ('Inihaw na Manok', 'Grilled chicken · typical item, availability may vary', 150.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Moon Bar & Café (Bacarra)', 'Bacarra, Ilocos Norte', 18.2561779, 120.6147967, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Moon Bar & Café (Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'McDonald''s (Manila North Road, Bacarra)', 'Manila North Road, Bacarra, Ilocos Norte', 18.2351247, 120.6122172, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'McDonald''s (Manila North Road, Bacarra)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chicken McDo with Rice', 'Fried chicken with rice', 109.00),
  ('McSpaghetti', 'Sweet-style spaghetti', 70.00),
  ('Burger McDo', 'Classic beef burger', 50.00),
  ('Cheeseburger', 'Beef patty with cheese', 75.00),
  ('Fries (Medium)', 'World-famous fries', 70.00),
  ('Coke McFloat', 'Coke with vanilla soft serve', 50.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Batac City (10)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jollibee (Marcos Ave., Batac City)', 'Marcos Avenue, Batac City, Ilocos Norte', 18.0546411, 120.562778, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'Jollibee (Marcos Ave., Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chickenjoy with Rice', 'Crispy fried chicken with rice', 109.00),
  ('Jolly Spaghetti', 'Sweet-style spaghetti', 75.00),
  ('Yumburger', 'Classic beef burger', 45.00),
  ('1-pc Burger Steak with Rice', 'Beef patty in mushroom gravy', 75.00),
  ('Super Meal A', 'Chickenjoy, half spaghetti, Yumburger, rice and drink', 185.00),
  ('Peach Mango Pie', 'Peach-mango filled pie', 45.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chowking (Marcos Ave., Batac City)', 'Marcos Avenue, Batac City, Ilocos Norte', 18.0547061, 120.5624128, 'Chinese fast food', true
  where not exists (select 1 from public.restaurants where name = 'Chowking (Marcos Ave., Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chao Fan (Regular)', 'Chinese-style fried rice', 85.00),
  ('Chinese-Style Fried Chicken with Rice', 'Fried chicken with rice', 125.00),
  ('Siopao Asado', 'Steamed pork bun', 55.00),
  ('Beef Wonton Mami', 'Noodle soup with beef and wontons', 125.00),
  ('Halo-Halo', 'Shaved ice dessert', 120.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Rafael''s restaurant (Batac City)', 'Batac City, Ilocos Norte', 18.0571468, 120.5642819, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Rafael''s restaurant (Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Sikat Tuna (Batac City)', 'Marcos Avenue, Batac City, Ilocos Norte', 18.0554923, 120.5597599, 'Seafood', true
  where not exists (select 1 from public.restaurants where name = 'Sikat Tuna (Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Grilled Fish', 'Catch of the day · typical item, availability may vary', 280.00),
  ('Garlic Butter Shrimp', 'Shrimp in garlic butter · typical item, availability may vary', 380.00),
  ('Sinigang na Hipon', 'Sour shrimp soup · typical item, availability may vary', 320.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chong Kitchen (Batac City)', 'Batac City, Ilocos Norte', 18.0575065, 120.5633058, 'Chinese', true
  where not exists (select 1 from public.restaurants where name = 'Chong Kitchen (Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Yang Chow Fried Rice', 'Chinese fried rice · typical item, availability may vary', 220.00),
  ('Pancit Canton', 'Stir-fried noodles · typical item, availability may vary', 250.00),
  ('Sweet and Sour Pork', 'Classic Chinese dish · typical item, availability may vary', 320.00),
  ('Siomai (4 pcs)', 'Steamed dumplings · typical item, availability may vary', 80.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Barako Cafe (Batac City)', 'Batac City, Ilocos Norte', 18.0573037, 120.5636255, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Barako Cafe (Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Teatone by The Kusingeros (Batac City)', 'Batac City, Ilocos Norte', 18.0557319, 120.5645339, 'Milk tea', true
  where not exists (select 1 from public.restaurants where name = 'Teatone by The Kusingeros (Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Milk Tea', 'With pearls · typical item, availability may vary', 99.00),
  ('Wintermelon Milk Tea', 'With pearls · typical item, availability may vary', 109.00),
  ('Brown Sugar Milk Tea', 'With pearls · typical item, availability may vary', 119.00),
  ('Fruit Tea', 'Iced fruit tea · typical item, availability may vary', 99.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'C&E Pizza Pasta Restaurant (Batac City)', 'Batac City, Ilocos Norte', 18.059703, 120.5588779, 'Pizza & pasta', true
  where not exists (select 1 from public.restaurants where name = 'C&E Pizza Pasta Restaurant (Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('House Special Pizza (Regular)', 'Assorted toppings · typical item, availability may vary', 299.00),
  ('Hawaiian Pizza (Regular)', 'Ham and pineapple · typical item, availability may vary', 279.00),
  ('Spaghetti', 'Filipino-style spaghetti · typical item, availability may vary', 120.00),
  ('Carbonara', 'Creamy pasta · typical item, availability may vary', 140.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Nomad Coffee (Batac City)', 'Batac City, Ilocos Norte', 18.046524, 120.5640942, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Nomad Coffee (Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jollibee (Batac City)', 'Batac City, Ilocos Norte', 18.0678819, 120.5608388, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'Jollibee (Batac City)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chickenjoy with Rice', 'Crispy fried chicken with rice', 109.00),
  ('Jolly Spaghetti', 'Sweet-style spaghetti', 75.00),
  ('Yumburger', 'Classic beef burger', 45.00),
  ('1-pc Burger Steak with Rice', 'Beef patty in mushroom gravy', 75.00),
  ('Super Meal A', 'Chickenjoy, half spaghetti, Yumburger, rice and drink', 185.00),
  ('Peach Mango Pie', 'Peach-mango filled pie', 45.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Paoay (8)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Dunkin'' Donuts (Paoay)', 'Paoay, Ilocos Norte', 18.0618863, 120.5225598, 'Donuts & coffee', true
  where not exists (select 1 from public.restaurants where name = 'Dunkin'' Donuts (Paoay)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Glazed Donut', 'Classic glazed donut', 45.00),
  ('Bavarian Donut', 'Cream-filled donut', 50.00),
  ('Box of 6 Assorted Donuts', 'Six classic donuts', 299.00),
  ('Munchkins (25 pcs)', 'Donut holes', 199.00),
  ('Iced Coffee', 'Dunkin'' iced coffee', 95.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Authentic Miki/Empanada (Paoay)', 'Paoay, Ilocos Norte', 18.0606752, 120.5222512, 'Ilocano empanada', true
  where not exists (select 1 from public.restaurants where name = 'Authentic Miki/Empanada (Paoay)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Ordinary Empanada', 'Longganisa, egg and green papaya · typical item, availability may vary', 60.00),
  ('Special Empanada', 'Extra egg and longganisa · typical item, availability may vary', 80.00),
  ('Okoy (Shrimp Fritter)', 'Crispy fritter · typical item, availability may vary', 35.00),
  ('Soft Drink', 'Bottled soft drink · typical item, availability may vary', 25.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Bellagio Hills Hotel & Restaurant (Paoay)', 'bgy 22 nagbacalan, Paoay, Ilocos Norte', 18.1134587, 120.5269037, 'International', true
  where not exists (select 1 from public.restaurants where name = 'Bellagio Hills Hotel & Restaurant (Paoay)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('House Pasta', 'Chef''s pasta · typical item, availability may vary', 280.00),
  ('Grilled Pork Chop', 'With rice or potatoes · typical item, availability may vary', 320.00),
  ('Clubhouse Sandwich', 'With fries · typical item, availability may vary', 250.00),
  ('Fresh Fruit Shake', 'Seasonal fruit · typical item, availability may vary', 120.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Regina''s Restaurant (Paoay)', 'Paoay, Ilocos Norte', 18.1316273, 120.5334926, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Regina''s Restaurant (Paoay)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Vista del Lago (Paoay)', 'Paoay, Ilocos Norte', 18.1202814, 120.5278529, 'International', true
  where not exists (select 1 from public.restaurants where name = 'Vista del Lago (Paoay)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('House Pasta', 'Chef''s pasta · typical item, availability may vary', 280.00),
  ('Grilled Pork Chop', 'With rice or potatoes · typical item, availability may vary', 320.00),
  ('Clubhouse Sandwich', 'With fries · typical item, availability may vary', 250.00),
  ('Fresh Fruit Shake', 'Seasonal fruit · typical item, availability may vary', 120.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Strassburg (Paoay)', 'Paoay, Ilocos Norte', 18.0616486, 120.520006, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Strassburg (Paoay)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kusina Valentin (Paoay)', 'Paoay, Ilocos Norte', 18.0623417, 120.5202216, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Kusina Valentin (Paoay)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Café Bloom (Paoay)', 'Paoay, Ilocos Norte', 18.1116107, 120.5215293, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Café Bloom (Paoay)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Banna (8)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'F&R’s Snack Shack (Banna)', 'Banna, Ilocos Norte', 17.9816224, 120.6567397, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'F&R’s Snack Shack (Banna)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Ervin’s Lechon Manok & Liempo (Banna)', 'Banna, Ilocos Norte', 17.9798391, 120.6557796, 'Roast & fried chicken', true
  where not exists (select 1 from public.restaurants where name = 'Ervin’s Lechon Manok & Liempo (Banna)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Lechon Manok (Whole)', 'Roasted chicken · typical item, availability may vary', 320.00),
  ('Lechon Manok (Half)', 'Roasted half chicken · typical item, availability may vary', 170.00),
  ('Liempo (per 1/2 kg)', 'Roasted pork belly · typical item, availability may vary', 250.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Barbarian’s Burger (Banna)', 'Banna, Ilocos Norte', 17.9817767, 120.6564381, 'Burgers', true
  where not exists (select 1 from public.restaurants where name = 'Barbarian’s Burger (Banna)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Burger', 'Beef burger · typical item, availability may vary', 60.00),
  ('Cheeseburger', 'Burger with cheese · typical item, availability may vary', 75.00),
  ('Fries', 'Regular fries · typical item, availability may vary', 50.00),
  ('Soft Serve / Iced Tea', 'Drink or dessert · typical item, availability may vary', 35.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Friends Corner Lechon Manok (Banna)', 'Banna, Ilocos Norte', 17.9784737, 120.6578643, 'Roast & fried chicken', true
  where not exists (select 1 from public.restaurants where name = 'Friends Corner Lechon Manok (Banna)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Lechon Manok (Whole)', 'Roasted chicken · typical item, availability may vary', 320.00),
  ('Lechon Manok (Half)', 'Roasted half chicken · typical item, availability may vary', 170.00),
  ('Liempo (per 1/2 kg)', 'Roasted pork belly · typical item, availability may vary', 250.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Soriano’s Bakery (Banna)', 'Banna, Ilocos Norte', 17.9811928, 120.6566542, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Soriano’s Bakery (Banna)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Franks n’ Burgers (Banna)', 'Banna, Ilocos Norte', 17.9804212, 120.6550628, 'Burgers', true
  where not exists (select 1 from public.restaurants where name = 'Franks n’ Burgers (Banna)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Franks Burger', 'Classic burger', 45.00),
  ('Cheeseburger', 'Burger with cheese', 55.00),
  ('Footlong Hotdog', 'Hotdog sandwich', 50.00),
  ('Fries', 'Regular fries', 45.00),
  ('Iced Tea', 'Drink', 25.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Lolong’s Bakery (Banna)', 'Banna, Ilocos Norte', 17.981408, 120.6571118, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Lolong’s Bakery (Banna)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mang Tyson’s Tapsilogan (Banna)', 'Banna, Ilocos Norte', 17.9816159, 120.6568062, 'Silog meals', true
  where not exists (select 1 from public.restaurants where name = 'Mang Tyson’s Tapsilogan (Banna)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Tapsilog', 'Beef tapa, garlic rice, egg · typical item, availability may vary', 99.00),
  ('Longsilog', 'Ilocos longganisa, garlic rice, egg · typical item, availability may vary', 89.00),
  ('Tocilog', 'Pork tocino, garlic rice, egg · typical item, availability may vary', 89.00),
  ('Bulalo (solo)', 'Beef marrow soup · typical item, availability may vary', 150.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Burgos (7)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kangkang Windmill Cafe (Burgos)', 'Burgos, Ilocos Norte', 18.5287762, 120.6920794, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Kangkang Windmill Cafe (Burgos)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Hilmar Restaurant (Burgos)', 'Burgos, Ilocos Norte', 18.5174025, 120.5983525, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Hilmar Restaurant (Burgos)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jhonfel''s Restaurant (Burgos)', 'Burgos, Ilocos Norte', 18.5186812, 120.66831, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Jhonfel''s Restaurant (Burgos)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chooks to Go (Burgos)', 'Burgos, Ilocos Norte', 18.5110651, 120.6406468, 'Roast chicken', true
  where not exists (select 1 from public.restaurants where name = 'Chooks to Go (Burgos)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Roast Chicken (Whole)', 'Chooks to Go roast chicken', 315.00),
  ('Roast Chicken (Half)', 'Half roast chicken', 165.00),
  ('Fried Chicken (6 pcs)', 'Fried chicken', 330.00),
  ('Java Rice', 'Seasoned rice', 30.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Agbayani’s Restaurant (Burgos)', 'Burgos, Ilocos Norte', 18.5192232, 120.6656112, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Agbayani’s Restaurant (Burgos)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'LVT Food House (Burgos)', 'Burgos, Ilocos Norte', 18.4595242, 120.5809861, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'LVT Food House (Burgos)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jovy and Yolly''s Place Restaurant (Burgos)', 'Burgos, Ilocos Norte', 18.4589085, 120.581088, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Jovy and Yolly''s Place Restaurant (Burgos)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Piddig (7)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Cristine''s Miki (Piddig)', 'Piddig, Ilocos Norte', 18.1575722, 120.7240544, 'Miki & empanada', true
  where not exists (select 1 from public.restaurants where name = 'Cristine''s Miki (Piddig)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Miki Soup (Bowl)', 'Ilocano thick noodle soup · typical item, availability may vary', 70.00),
  ('Special Miki', 'With extra toppings · typical item, availability may vary', 90.00),
  ('Empanada', 'Ilocos empanada · typical item, availability may vary', 60.00),
  ('Soft Drink', 'Bottled soft drink · typical item, availability may vary', 25.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Biguiata Bakery (Piddig)', 'Piddig, Ilocos Norte', 18.165337, 120.7158849, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Biguiata Bakery (Piddig)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'MNM''s Foodstand (Piddig)', 'Piddig, Ilocos Norte', 18.1648199, 120.7159572, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'MNM''s Foodstand (Piddig)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Duting''s Empanada (Piddig)', 'Piddig, Ilocos Norte', 18.1648087, 120.7160748, 'Ilocano empanada', true
  where not exists (select 1 from public.restaurants where name = 'Duting''s Empanada (Piddig)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Ordinary Empanada', 'Longganisa, egg and green papaya · typical item, availability may vary', 60.00),
  ('Special Empanada', 'Extra egg and longganisa · typical item, availability may vary', 80.00),
  ('Okoy (Shrimp Fritter)', 'Crispy fritter · typical item, availability may vary', 35.00),
  ('Soft Drink', 'Bottled soft drink · typical item, availability may vary', 25.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mark Bryan Carinderia (Piddig)', 'Piddig, Ilocos Norte', 18.16467, 120.7159737, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Mark Bryan Carinderia (Piddig)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'R. Bacud Bakery & Sari-Sari Store (Piddig)', 'Piddig, Ilocos Norte', 18.1644658, 120.7160307, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'R. Bacud Bakery & Sari-Sari Store (Piddig)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Kabayan Bakery (Piddig Branch)', 'Piddig, Ilocos Norte', 18.1651658, 120.7156076, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Kabayan Bakery (Piddig Branch)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Pasuquin (5)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Pasuquin Bakery', 'Manila North Road, Pasuquin, Ilocos Norte', 18.3307, 120.6173106, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Pasuquin Bakery')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Comedor de Rafael (Pasuquin)', 'Pasuquin, Ilocos Norte', 18.3285035, 120.6804841, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Comedor de Rafael (Pasuquin)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Clarisse Tinapayan (Pasuquin)', 'Pasuquin, Ilocos Norte', 18.332345, 120.6184089, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Clarisse Tinapayan (Pasuquin)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Franks n'' Burgers (Pasuquin)', 'Pasuquin, Ilocos Norte', 18.334292, 120.618112, 'Burgers', true
  where not exists (select 1 from public.restaurants where name = 'Franks n'' Burgers (Pasuquin)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Franks Burger', 'Classic burger', 45.00),
  ('Cheeseburger', 'Burger with cheese', 55.00),
  ('Footlong Hotdog', 'Hotdog sandwich', 50.00),
  ('Fries', 'Regular fries', 45.00),
  ('Iced Tea', 'Drink', 25.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Vince Coffee Brew (Pasuquin)', 'Tandang Sora Street, Pasuquin, Ilocos Norte', 18.3313878, 120.6174485, 'Café', true
  where not exists (select 1 from public.restaurants where name = 'Vince Coffee Brew (Pasuquin)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Brewed Coffee', 'Hot brewed coffee · typical item, availability may vary', 90.00),
  ('Café Latte', 'Espresso with milk · typical item, availability may vary', 130.00),
  ('Iced Spanish Latte', 'Sweet milk latte · typical item, availability may vary', 150.00),
  ('Chocolate Drink', 'Hot or iced · typical item, availability may vary', 120.00),
  ('Pastry of the Day', 'Baked pastry · typical item, availability may vary', 90.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Bangui (3)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'North Wind Restaurant & Videoke Bar (Bangui)', 'Bangui, Ilocos Norte', 18.5375598, 120.7659839, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'North Wind Restaurant & Videoke Bar (Bangui)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Miguel Luis (Pansiteria) (Bangui)', 'Bangui, Ilocos Norte', 18.5361748, 120.7643087, 'Chinese', true
  where not exists (select 1 from public.restaurants where name = 'Miguel Luis (Pansiteria) (Bangui)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Yang Chow Fried Rice', 'Chinese fried rice · typical item, availability may vary', 220.00),
  ('Pancit Canton', 'Stir-fried noodles · typical item, availability may vary', 250.00),
  ('Sweet and Sour Pork', 'Classic Chinese dish · typical item, availability may vary', 320.00),
  ('Siomai (4 pcs)', 'Steamed dumplings · typical item, availability may vary', 80.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Yzza''s Eatery (Bangui)', 'Bangui, Ilocos Norte', 18.5144526, 120.71452, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Yzza''s Eatery (Bangui)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Marcos (2)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chooks to Go (Marcos)', 'Marcos, Ilocos Norte', 18.0365818, 120.6813243, 'Roast chicken', true
  where not exists (select 1 from public.restaurants where name = 'Chooks to Go (Marcos)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Roast Chicken (Whole)', 'Chooks to Go roast chicken', 315.00),
  ('Roast Chicken (Half)', 'Half roast chicken', 165.00),
  ('Fried Chicken (6 pcs)', 'Fried chicken', 330.00),
  ('Java Rice', 'Seasoned rice', 30.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Simon Snack Corner (Marcos)', 'South Parola Dingras-Marcos-Banna-Nueva Era Road, Marcos, Ilocos Norte', 18.0390446, 120.6788742, 'Pares & goto', true
  where not exists (select 1 from public.restaurants where name = 'Simon Snack Corner (Marcos)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Beef Pares with Rice', 'Braised beef with rice and soup · typical item, availability may vary', 99.00),
  ('Goto', 'Rice porridge with tripe · typical item, availability may vary', 70.00),
  ('Lugaw with Egg', 'Rice porridge · typical item, availability may vary', 50.00),
  ('Tokwa''t Baboy', 'Tofu and pork · typical item, availability may vary', 90.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Currimao (2)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Irene''s Native Delicacies (Currimao)', 'Manila North Road, Currimao, Ilocos Norte', 17.992981, 120.5024207, 'Native delicacies', true
  where not exists (select 1 from public.restaurants where name = 'Irene''s Native Delicacies (Currimao)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Tupig (bundle)', 'Grilled glutinous rice in banana leaf · typical item, availability may vary', 50.00),
  ('Bibingka', 'Rice cake · typical item, availability may vary', 60.00),
  ('Cassava Cake', 'Baked cassava cake · typical item, availability may vary', 80.00),
  ('Kalamay', 'Sticky rice delicacy · typical item, availability may vary', 60.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Lazo''s Kitchenette (Currimao)', 'Manila North Road, Currimao, Ilocos Norte', 17.9947463, 120.5025414, 'Carinderia', true
  where not exists (select 1 from public.restaurants where name = 'Lazo''s Kitchenette (Currimao)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Rice Meal (1 ulam)', 'Rice with one viand of the day · typical item, availability may vary', 80.00),
  ('Rice Meal (2 ulam)', 'Rice with two viands · typical item, availability may vary', 110.00),
  ('Pinakbet (order)', 'Ilocano vegetable stew · typical item, availability may vary', 60.00),
  ('Dinengdeng (order)', 'Vegetable soup with bagoong · typical item, availability may vary', 50.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 15.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Dingras (2)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Bakers PH - Dingras', 'Josefa Llanes Escoda National Highway, Dingras, Ilocos Norte', 18.1017271, 120.699209, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Bakers PH - Dingras')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jollibee (Josefa Llanes Escoda National Highway, Dingras)', 'Josefa Llanes Escoda National Highway, Dingras, Ilocos Norte', 18.1041983, 120.6982374, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'Jollibee (Josefa Llanes Escoda National Highway, Dingras)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chickenjoy with Rice', 'Crispy fried chicken with rice', 109.00),
  ('Jolly Spaghetti', 'Sweet-style spaghetti', 75.00),
  ('Yumburger', 'Classic beef burger', 45.00),
  ('1-pc Burger Steak with Rice', 'Beef patty in mushroom gravy', 75.00),
  ('Super Meal A', 'Chickenjoy, half spaghetti, Yumburger, rice and drink', 185.00),
  ('Peach Mango Pie', 'Peach-mango filled pie', 45.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Dumalneg (1)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select '2N1 Place (Dumalneg)', 'Dumalneg, Ilocos Norte', 18.530756, 120.7942458, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = '2N1 Place (Dumalneg)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Adams (1)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Burgers & Soft Serve (Adams)', 'Adams, Ilocos Norte', 18.4619479, 120.9019912, 'Burgers', true
  where not exists (select 1 from public.restaurants where name = 'Burgers & Soft Serve (Adams)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Classic Burger', 'Beef burger · typical item, availability may vary', 60.00),
  ('Cheeseburger', 'Burger with cheese · typical item, availability may vary', 75.00),
  ('Fries', 'Regular fries · typical item, availability may vary', 50.00),
  ('Soft Serve / Iced Tea', 'Drink or dessert · typical item, availability may vary', 35.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Solsona (1)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Dinna''s Bakery (Solsona)', 'Laoag-Sarrat-Piddig-Solsona Road, Solsona, Ilocos Norte', 18.0955766, 120.7708013, 'Bakery', true
  where not exists (select 1 from public.restaurants where name = 'Dinna''s Bakery (Solsona)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pandesal (10 pcs)', 'Freshly baked bread rolls · typical item, availability may vary', 30.00),
  ('Ensaymada', 'Soft buttery bread · typical item, availability may vary', 25.00),
  ('Spanish Bread', 'Sweet rolled bread · typical item, availability may vary', 10.00),
  ('Cheese Bread', 'Soft cheese roll · typical item, availability may vary', 10.00),
  ('Loaf Bread', 'Sliced loaf · typical item, availability may vary', 70.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Nueva Era (1)
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Celia’s Restaurant (Nueva Era)', 'Nueva Era, Ilocos Norte', 17.9150817, 120.6650063, 'Ilocano & Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Celia’s Restaurant (Nueva Era)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Bagnet', 'Ilocano crispy pork belly · typical item, availability may vary', 250.00),
  ('Pinakbet', 'Ilocano vegetable stew · typical item, availability may vary', 180.00),
  ('Dinakdakan', 'Grilled pork in creamy dressing · typical item, availability may vary', 200.00),
  ('Poqui-Poqui', 'Smoked eggplant with egg · typical item, availability may vary', 150.00),
  ('Ilocos Longganisa with Rice', 'Garlicky local sausage · typical item, availability may vary', 120.00),
  ('Rice', 'Plain rice · typical item, availability may vary', 20.00)
) as v(name, description, price);
