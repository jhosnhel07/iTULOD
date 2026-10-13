-- =============================================================================
-- iTULOD migration 020: seed Ilocos Norte restaurants + menus
-- -----------------------------------------------------------------------------
-- Starter catalogue for the food-delivery cart (restaurants + menu_items,
-- sql/018) — fast-food chains, Robinsons Place Ilocos tenants, and well-known
-- local spots in Laoag, San Nicolas, Batac, Paoay and Pagudpud.
--
-- Sources (Oct 2026): OpenStreetMap for coordinates; Laoag City tourism
-- "Where to Eat", Mang Inasal store locator, Robinsons Malls directory,
-- Tripadvisor / Wanderlog / Yelp listings for names and addresses.
--
-- PRICES ARE ESTIMATES. Current menus/prices for most of these businesses
-- aren't published online, so items use typical Philippine prices. That's
-- within how food orders already work — the rider confirms the real fare at
-- pickup (finalize-fare) and GCash/wallet is only charged after that — but
-- review them in the web admin's Restaurants tab and correct as needed.
--
-- No logos or photos are included (image_url left null): brand logos and
-- other businesses' food photos need the owner's permission. Add images you
-- own or have permission for from the admin Restaurants tab.
--
-- Idempotent: a restaurant (and its menu) is only inserted when no
-- restaurant with the same name exists yet.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Laoag City — fast food
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jollibee Laoag (Gen. Segundo Ave.)', 'General Segundo Ave. (Bacarra Road), Brgy. 13, Laoag City',
         18.1975130, 120.5946172, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'Jollibee Laoag (Gen. Segundo Ave.)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chickenjoy with Rice', 'Crispy fried chicken with steamed rice', 109.00),
  ('2-pc Chickenjoy with Rice', 'Two pieces of Chickenjoy with steamed rice', 199.00),
  ('Jolly Spaghetti', 'Sweet-style spaghetti with hotdog slices and cheese', 75.00),
  ('Yumburger', 'Classic beef burger', 45.00),
  ('Cheesy Yumburger', 'Yumburger with a slice of cheese', 70.00),
  ('1-pc Burger Steak with Rice', 'Beef patty in mushroom gravy with rice', 75.00),
  ('Super Meal A', 'Chickenjoy, half Jolly Spaghetti, Yumburger, rice and a drink', 185.00),
  ('Peach Mango Pie', 'Crispy pie with peach-mango filling', 45.00),
  ('Coke (Regular)', 'Regular-size soft drink', 55.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'McDonald''s Laoag (Juan Luna St.)', 'Juan Luna St., Brgy. 13, Laoag City',
         18.1943543, 120.5927189, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'McDonald''s Laoag (Juan Luna St.)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chicken McDo with Rice', 'Fried chicken with steamed rice', 109.00),
  ('2-pc Chicken McDo with Rice', 'Two pieces of fried chicken with rice', 199.00),
  ('McSpaghetti', 'Spaghetti in sweet-style sauce', 70.00),
  ('Burger McDo', 'Classic beef burger', 50.00),
  ('Cheeseburger', 'Beef patty with cheese', 75.00),
  ('Big Mac', 'Two beef patties, special sauce, lettuce and cheese', 199.00),
  ('Fries (Medium)', 'World-famous fries', 70.00),
  ('Coke McFloat', 'Coke topped with vanilla soft serve', 50.00),
  ('Hot Fudge Sundae', 'Vanilla soft serve with hot fudge', 45.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Chowking Laoag (Gen. Segundo Ave.)', 'General Segundo Ave. (Bacarra Road), Brgy. 13, Laoag City',
         18.1990402, 120.5954687, 'Chinese fast food', true
  where not exists (select 1 from public.restaurants where name = 'Chowking Laoag (Gen. Segundo Ave.)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chao Fan (Regular)', 'Chinese-style fried rice', 85.00),
  ('Chinese-Style Fried Chicken with Rice', 'Fried chicken with steamed rice', 125.00),
  ('Siopao Asado', 'Steamed bun with sweet pork filling', 55.00),
  ('Beef Wonton Mami', 'Noodle soup with beef and wontons', 125.00),
  ('Pancit Canton (Solo)', 'Stir-fried egg noodles with vegetables', 130.00),
  ('Sweet and Sour Pork with Rice', 'Pork in sweet and sour sauce with rice', 145.00),
  ('Halo-Halo', 'Shaved ice dessert with sweet beans, leche flan and ube', 120.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Greenwich Laoag (Gen. Segundo Ave.)', 'General Segundo Ave. (Bacarra Road), Brgy. 13, Laoag City',
         18.1989514, 120.5957051, 'Pizza & pasta', true
  where not exists (select 1 from public.restaurants where name = 'Greenwich Laoag (Gen. Segundo Ave.)')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Hawaiian Overload Pizza (Regular)', 'Ham and pineapple pizza', 299.00),
  ('Pepperoni Overload Pizza (Regular)', 'Loaded pepperoni pizza', 299.00),
  ('Lasagna Supreme', 'Baked lasagna with meat sauce and cheese', 165.00),
  ('Spaghetti with Meatballs', 'Sweet-style spaghetti with meatballs', 120.00),
  ('Garlic Bread', 'Toasted garlic bread', 60.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Mang Inasal Laoag', 'J.P. Rizal St., Brgy. 16, Laoag City',
         18.1955059, 120.5931256, 'Grilled chicken', true
  where not exists (select 1 from public.restaurants where name = 'Mang Inasal Laoag')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Chicken Inasal Paa with Rice', 'Grilled chicken leg quarter with rice (unli-rice when dining in)', 149.00),
  ('Chicken Inasal Pecho with Rice', 'Grilled chicken breast with rice', 169.00),
  ('Pork BBQ (2 sticks) with Rice', 'Grilled pork barbecue with rice', 119.00),
  ('Palabok', 'Rice noodles with shrimp sauce and toppings', 99.00),
  ('Halo-Halo', 'Shaved ice dessert', 89.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Laoag City — Ilocano restaurants
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Saramsam Ylocano Restaurant', 'Rizal St. cor. Hizon St., N. Corpuz Bldg., Brgy. 7-A, Laoag City',
         18.2030188, 120.5938475, 'Ilocano fusion', true
  where not exists (select 1 from public.restaurants where name = 'Saramsam Ylocano Restaurant')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Poque-Poque Pizza', 'Pizza topped with Ilocano smoked-eggplant poqui-poqui', 280.00),
  ('Pinakbet Pizza', 'Pizza topped with pinakbet vegetables and bagoong', 280.00),
  ('Saramsam Pasta', 'House pasta with Ilocano flavors', 220.00),
  ('Bagnet', 'Crispy deep-fried pork belly with KBL dip', 280.00),
  ('Dinakdakan', 'Grilled pork face and ears in a creamy, tangy dressing', 230.00),
  ('Igado', 'Pork and liver stewed in vinegar and soy', 230.00),
  ('Dragon Fruit Ice Cream', 'Ice cream made with Ilocos dragon fruit', 120.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'La Preciosa', 'F. Julian St., Brgy. 58 Casili, Laoag City',
         18.2092856, 120.5859671, 'Ilocano & desserts', true
  where not exists (select 1 from public.restaurants where name = 'La Preciosa')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Carrot Cake (Slice)', 'The famous La Preciosa carrot cake', 140.00),
  ('Carrot Cake (Whole)', 'Whole carrot cake — order ahead', 950.00),
  ('Bagnet', 'Crispy pork belly with sukang Iloko', 290.00),
  ('Pinakbet', 'Ilocano vegetable stew with bagoong', 220.00),
  ('Poqui-Poqui', 'Smoked eggplant scrambled with egg and tomato', 180.00),
  ('Dinakdakan', 'Grilled pork in a creamy, tangy dressing', 240.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- San Nicolas — Robinsons Place Ilocos
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'KFC Robinsons Place Ilocos', 'Level 1, Robinsons Place Ilocos, Brgy. San Francisco, San Nicolas',
         18.1797109, 120.5926885, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'KFC Robinsons Place Ilocos')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chicken with Rice', 'Original Recipe or Hot & Crispy with rice', 125.00),
  ('2-pc Chicken with Rice', 'Two pieces of chicken with rice', 229.00),
  ('Famous Bowl', 'Rice, mashed potato, corn, chicken and gravy', 125.00),
  ('Zinger Burger', 'Spicy chicken fillet burger', 165.00),
  ('Mashed Potato', 'Mashed potato with gravy', 50.00),
  ('Krushers', 'Blended iced drink', 110.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Jollibee Robinsons Place Ilocos', 'Level 1, Robinsons Place Ilocos, Brgy. San Francisco, San Nicolas',
         18.1794527, 120.5924332, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'Jollibee Robinsons Place Ilocos')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chickenjoy with Rice', 'Crispy fried chicken with steamed rice', 109.00),
  ('Jolly Spaghetti', 'Sweet-style spaghetti with hotdog slices and cheese', 75.00),
  ('Yumburger', 'Classic beef burger', 45.00),
  ('Super Meal A', 'Chickenjoy, half Jolly Spaghetti, Yumburger, rice and a drink', 185.00),
  ('Peach Mango Pie', 'Crispy pie with peach-mango filling', 45.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Max''s Restaurant Robinsons Place Ilocos', 'Robinsons Place Ilocos, Brgy. San Francisco, San Nicolas',
         18.1794527, 120.5924332, 'Filipino', true
  where not exists (select 1 from public.restaurants where name = 'Max''s Restaurant Robinsons Place Ilocos')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Max''s Fried Chicken (Half)', 'The classic "sarap to the bones" fried chicken', 395.00),
  ('Max''s Fried Chicken (Whole)', 'Whole fried chicken, good for 3-4', 720.00),
  ('Kare-Kare', 'Oxtail and vegetables in peanut sauce with bagoong', 525.00),
  ('Pancit Canton (Regular)', 'Stir-fried noodles with meat and vegetables', 350.00),
  ('Lumpiang Ubod', 'Fresh spring roll with heart of palm', 220.00),
  ('Caramel Bar', 'Max''s signature caramel bar', 70.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Gerry''s Grill Robinsons Place Ilocos', 'Level 1, Robinsons Place Ilocos, Brgy. San Francisco, San Nicolas',
         18.1794527, 120.5924332, 'Filipino grill', true
  where not exists (select 1 from public.restaurants where name = 'Gerry''s Grill Robinsons Place Ilocos')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Sizzling Sisig', 'Chopped pork sisig on a sizzling plate', 365.00),
  ('Crispy Pata', 'Deep-fried pork knuckle', 795.00),
  ('Grilled Tuna Belly', 'Grilled tuna belly with soy-calamansi', 495.00),
  ('Kare-Kare', 'Oxtail and vegetables in peanut sauce', 525.00),
  ('Pancit Bihon', 'Stir-fried rice noodles', 335.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Starbucks Robinsons Place Ilocos', 'Robinsons Place Ilocos, Brgy. San Francisco, San Nicolas',
         18.1794527, 120.5924332, 'Coffee & drinks', true
  where not exists (select 1 from public.restaurants where name = 'Starbucks Robinsons Place Ilocos')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Caffè Americano (Tall)', 'Espresso with hot water', 140.00),
  ('Caffè Latte (Tall)', 'Espresso with steamed milk', 165.00),
  ('Caramel Macchiato (Tall)', 'Vanilla, milk, espresso and caramel drizzle', 185.00),
  ('Java Chip Frappuccino (Tall)', 'Blended coffee with chocolate chips', 195.00),
  ('Iced Shaken Black Tea (Tall)', 'Black tea shaken with ice', 135.00),
  ('Chocolate Chip Cookie', 'Baked chocolate chip cookie', 85.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Dunkin'' Robinsons Place Ilocos', 'Robinsons Place Ilocos, Brgy. San Francisco, San Nicolas',
         18.1794527, 120.5924332, 'Donuts & coffee', true
  where not exists (select 1 from public.restaurants where name = 'Dunkin'' Robinsons Place Ilocos')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Glazed Donut', 'Classic glazed donut', 45.00),
  ('Bavarian Donut', 'Cream-filled chocolate-topped donut', 50.00),
  ('Box of 6 Assorted Donuts', 'Six assorted classic donuts', 299.00),
  ('Munchkins (25 pcs)', 'Bite-size donut holes', 199.00),
  ('Iced Coffee', 'Dunkin'' iced coffee', 95.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Batac City
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Glory''s Empanada', 'Batac Riverside Empanadaan, Valdez St., Batac City',
         18.0547145, 120.5606386, 'Ilocano empanada', true
  where not exists (select 1 from public.restaurants where name = 'Glory''s Empanada')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Ordinary Empanada', 'Batac empanada with longganisa, egg and green papaya', 60.00),
  ('Special Empanada', 'With extra egg and longganisa', 80.00),
  ('Double Special Empanada', 'Double egg and double longganisa', 100.00),
  ('Ukoy (Shrimp Fritter)', 'Crispy shrimp and vegetable fritter', 35.00),
  ('Soft Drink', 'Bottled soft drink', 25.00)
) as v(name, description, price);

with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'McDonald''s Batac', 'Manila North Road, Brgy. San Julian, Batac City',
         18.0614837, 120.5588647, 'Fast food', true
  where not exists (select 1 from public.restaurants where name = 'McDonald''s Batac')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('1-pc Chicken McDo with Rice', 'Fried chicken with steamed rice', 109.00),
  ('McSpaghetti', 'Spaghetti in sweet-style sauce', 70.00),
  ('Burger McDo', 'Classic beef burger', 50.00),
  ('Cheeseburger', 'Beef patty with cheese', 75.00),
  ('Fries (Medium)', 'World-famous fries', 70.00),
  ('Coke McFloat', 'Coke topped with vanilla soft serve', 50.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Paoay
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Herencia Cafe', 'McArthur St., Brgy. Veronica, Paoay (across Paoay Church)',
         18.0624517, 120.5201212, 'Ilocano & pizza', true
  where not exists (select 1 from public.restaurants where name = 'Herencia Cafe')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Pinakbet Pizza', 'The original pinakbet pizza with bagoong and vegetables', 300.00),
  ('Dinardaraan Pizza', 'Pizza topped with Ilocano pork blood stew', 300.00),
  ('Poqui-Poqui Pizza', 'Pizza topped with smoked eggplant and egg', 300.00),
  ('Bagnet', 'Crispy pork belly with sukang Iloko', 290.00),
  ('Pinakbet', 'Ilocano vegetable stew', 220.00)
) as v(name, description, price);

-- ---------------------------------------------------------------------------
-- Pagudpud
-- ---------------------------------------------------------------------------
with r as (
  insert into public.restaurants (name, address, lat, lng, cuisine_type, is_active)
  select 'Saud Beach Resort Restaurant', 'Saud Beach Resort & Hotel, Pag-asa Road, Saud, Pagudpud',
         18.5849524, 120.7860345, 'Seafood', true
  where not exists (select 1 from public.restaurants where name = 'Saud Beach Resort Restaurant')
  returning id
)
insert into public.menu_items (restaurant_id, name, description, price, is_available)
select r.id, v.name, v.description, v.price, true from r cross join (values
  ('Grilled Fish (per order)', 'Fresh catch grilled, served with rice', 350.00),
  ('Garlic Butter Shrimp', 'Shrimp sautéed in garlic butter', 420.00),
  ('Bagnet', 'Crispy pork belly with sukang Iloko', 300.00),
  ('Pinakbet', 'Ilocano vegetable stew', 220.00),
  ('Fresh Buko Juice', 'Young coconut juice', 80.00)
) as v(name, description, price);
