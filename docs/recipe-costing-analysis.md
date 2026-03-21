# Recipe Costing Analysis

Prototype analysis comparing recipe ingredient labels against the imported purchasing workbook.

## Inputs

- Recipe dataset: `data\golden_samples_merged.json`
- Pricing workbook: `data\Recipes Ingredients.xlsx`
- Catalog sheet: `All Ingredients + Supplier`
- Catalog rows analysed: `11,027`
- Unique recipe ingredient labels: `3,195`
- Canonical ingredient groups: `2,932`
- Ingredient lines analysed: `23,249`

## Canonical Grouping

This prototype now separates exact stored labels from normalized ingredient concepts.

- `raw label`: the exact ingredient name stored on a recipe
- `canonical group`: a conservative normalized grouping used to collapse obvious variants such as singular/plural

- Label reduction after canonical grouping: `263` fewer labels (8.2%)

### Example Variant Groups

| Canonical group | Labels | Lines | Example raw labels |
| --- | ---: | ---: | --- |
| corn flour | 4 | 8 | Corn Flour 500g (V) Vegetarian Express FLOCORRP, Corn Flour 500g (V) Vegetarian Express FLOCORRP © Compass Group UK and Ireland, Flour Corn 3KG Vegetarian Express, Flour Corn 3KG Vegetarian Express FLOCOR3KG © Compass Group UK and Ireland |
| lemon | 3 | 454 | LEMON First Choice Produce, Lemon, Lemons |
| carrot | 3 | 201 | CARROTS, Carrot, Carrots |
| onion | 3 | 201 | ONION First Choice Produce, ONIONS, Onion |
| lime | 3 | 122 | LIME First Choice Produce, Lime, Limes x each The United Fresh Consortium Lt 10158E |
| 100gm basil herb pack | 3 | 115 | Fresh Herbs Basil 100gm Pack, Fresh Herbs Basil 100gm Pack The United Fresh Consortium Lt 12650E, Fresh Herbs Basil 100gm Pack The United Fresh Consortium Lt 12650E © Compass Group UK and Ireland |
| cumin ground spice | 3 | 109 | Spice Cumin Ground, Spice Cumin Ground 1KG Vegetarian Express, Spices Cumin Ground |
| pepper red | 3 | 79 | PEPPER RED First Choice Produce, Pepper Red, Red Peppers x 1kg The United Fresh Consortium Lt 302011K |
| cumin seed spice | 3 | 67 | Spice Cumin Seed, Spice Cumin Seed 1KG Vegetarian Express, Spices Cumin Seeds |
| juice lemon | 3 | 51 | Juice Lemon, LEMON JUICE 1L First Choice Produce, Lemon Juice |
| bag fine salt | 3 | 35 | Salt Fine Bag, Salt Fine Bag 1KG Vegetarian Express, Salt Fine Bag 1KG Vegetarian Express SALSEAFIN1KG © Compass Group UK and Ireland |
| seed sunflower | 3 | 32 | Seed Sunflower, Sunflower Seed G © Compass Group UK and Ireland, Sunflower seed |

## Readiness Summary

- Immediately costable unique items (`exact` + `high_confidence`): `149` (4.7%)
- Review queue unique items (`review` + `low_confidence`): `2,177` (68.1%)
- Unmatched unique items: `521` (16.3%)
- Sub-recipe unique items (`PTN`): `348` (10.9%)

- Immediately costable ingredient lines: `4,539` (19.5%)
- Review queue ingredient lines: `16,642` (71.6%)
- Unmatched ingredient lines: `1,522` (6.5%)
- Sub-recipe ingredient lines: `546` (2.3%)

## Interpretation

- `exact`: normalized recipe label matched a catalog description exactly.
- `high_confidence`: strong token overlap; likely safe to auto-map after spot checks.
- `review`: candidate exists, but should be confirmed by a human before costing.
- `low_confidence`: likely alias work needed before this becomes dependable.
- `unmatched`: no useful candidate found from the current workbook.
- `sub_recipe`: `PTN` line; should be costed by rolling up another recipe rather than matching directly to the supplier catalog.

## Top Review Candidates

| Ingredient | Lines | Status | Confidence | Best candidate | Sample recipes |
| --- | ---: | --- | ---: | --- | --- |
| Oil Rapeseed Extended Life | 324 | review | 0.83 | Prep Multi Extended Life Rapeseed Oil (Bidfood) | 'Thai Red' Quinoa & Haddock Fish Cake Steamed, African Chicken & Sweet Potato Stew |
| Butter Unsalted | 274 | review | 0.77 | Everyday Favourites Unsalted Packet Butter (Bidfood) | 12 Hour Feather Blade, 12 Hour Featherblade |
| Herb Bunched Coriander | 229 | review | 0.76 | Bb - Herb Coriander 500G (Bidfood) | 'Thai Red' Quinoa & Haddock Fish Cake Steamed, Aji Limo (Green pepper hot sauce) |
| Onion | 193 | review | 0.77 | Red Onion (Bidfood) | African Beef Curry, African Chicken & Sweet Potato Stew |
| Ginger | 185 | review | 0.77 | Bb - Root Ginger (Bidfood) | Achari Tikka, African Chicken & Sweet Potato Stew |
| Carrot | 172 | review | 0.76 | Prep Carrot Diced 10Mm (Bidfood) | Arroz con Pato (Duck Rice and Coriander Stew), Avocado carrot & hummus wrap |
| Oil Rapeseed Extended Life KTC | 136 | review | 0.72 | Prep Multi Extended Life Rapeseed Oil (Bidfood) | Aubergine Salad With Baby Gems Spinach, Bacon & brie toastie red onion jam. |
| Lime | 113 | review | 0.74 | Bb - Fresh Lime Juice (Bidfood) | 'Thai Red' Quinoa & Haddock Fish Cake Steamed, Aji Limo (Green pepper hot sauce) |
| Brakes Plain Flour | 92 | review | 0.75 | Everyday Favourites Plain Flour (Bidfood) | African Fried Fish and spicy Tomato Sauce, BEEF LASAGNE |
| Lemon | 87 | review | 0.76 | Everyday Favourites Lemon Curd (Bidfood) | (Bagel), Alu Phal Chaat |
| Pepper Red | 76 | review | 0.78 | Red Pepper Houmous (Bidfood) | (Bagel), Arroz con Mariscos (Fish and Rice Stew) |
| Celery | 72 | review | 0.76 | Bb - Micro Celery (Bidfood) | 'waldorf' Goats cheese apple grapes, Arroz con Pato (Duck Rice and Coriander Stew) |

## Top Unmatched Ingredients

| Ingredient | Lines | Status | Confidence | Best candidate | Sample recipes |
| --- | ---: | --- | ---: | --- | --- |
| Yoghurt Greek Kolios | 78 | unmatched | 0.00 | - | Apple & Cinnamon Granola Pot, Aubergine sorrel yoghurt & pickled radish salad |
| Aubergines | 47 | unmatched | 0.00 | - | Alla Norma (Fried Aubergine & Tomato), Alu Brinjal |
| Fries Rustic Sunf HomeStyle FF IBP | 44 | unmatched | 0.00 | - | B-52 SHARER, Bacon Cheese Burger |
| Seed Chia UK 1KG SEECHIUK | 25 | unmatched | 0.00 | - | 4 Grain Porridge with Raisins Camelina Chia, Apple & Honey Bircher |
| Veg Onion Whole Prep 2.5KG Reynolds Catering Supplies | 25 | unmatched | 0.00 | - | Aji de Gallina (Chicken in an Aji Chilli Sauce), Arroz con Mariscos (Fish and Rice Stew) |
| Bread London Sourdough 800g 48HR Paul Rhodes London | 21 | unmatched | 0.00 | - | Baked Beans on Toast, British ploughman |
| Chives 100g Solstice | 20 | unmatched | 0.00 | - | Artichoke volute truffle honey hazelnut (vv), Asparagus & pea tartlet |
| Pea Tendrils pnt Solstice | 20 | unmatched | 0.00 | - | Beer battered cod crushed peas salt and, Chalk Stream Trout asparagus hollandaise |
| Oil EVO Romeo FO | 18 | unmatched | 0.00 | - | Confit chicken leg toasted fregola rocket, Cured Duck Ham asparagus duck egg |
| Pea Tendrilsx 100gm APL | 17 | unmatched | 0.00 | - | Chalk Stream Trout asparagus hollandaise, Chicken & Avocado Sourdough baguette fries & |
| Chilli Red Thai PP 250g Reynolds Catering Supplies | 16 | unmatched | 0.00 | - | Chicken Maghlai, Green Papaya salad dressing |
| Nuts Almond Flakes OL | 16 | unmatched | 0.00 | - | Bakewell Tarts, Fig Frangipane tart |

## Top Sub-Recipe Lines

| Ingredient | Lines | Status | Confidence | Best candidate | Sample recipes |
| --- | ---: | --- | ---: | --- | --- |
| RAG PIZZA | 14 | sub_recipe | 0.46 | Kraft Pizza Box 12" | Pizza - Boqueronnes, Pizza - Boscaiola |
| Pizza Base Sauce | 11 | sub_recipe | 0.72 | Pizzasi 10 Inch Pizza Base With Tomato Sauce | Pizza - Boqueronnes, Pizza - Boscaiola |
| SDOUGH PIZZA BAS | 11 | sub_recipe | 0.37 | Pizza Base Mix | Boqueronnes, Caprese |
| GRANOLA | 10 | sub_recipe | 0.63 | Fuel Choc Chunks Granola | Apple & Cinnamon Granola Pot, Banana & Blueberry Granola Pot |
| Garlic Aioli | 8 | sub_recipe | 0.51 | Garlic Loose 4Kg | Bacon & Cheese Burger, Bacon & cheese burger |
| Granola | 7 | sub_recipe | 0.63 | Fuel Choc Chunks Granola | Banana & Blueberry Granola Pot, Berry Granola Pot |
| Vegan Burger Rel | 7 | sub_recipe | 0.63 | Miami Burger Classic Vegan Burger. | BURGER, Beef burger in brioche bun |
| Pickled Red Onio | 6 | sub_recipe | 0.65 | Everyday Favourites Pickled Red Cabbage.. | Bashed Chickpeas Pickled Red Onions & Rocket, Beetroot salad chive cream |
| Flat bread | 5 | sub_recipe | 0.52 | Malted Bread 18+2 | Cheese and tom pizza, Cheese platter 1 |
| Naan Bread | 5 | sub_recipe | 0.61 | Cook Asia Large Tear Drop Plain Naan Bread | Chicken tikka naan masala fries, Garlic & coriander naan |
| Skin On Fries | 5 | sub_recipe | 0.69 | Everyday Favourites Coated Julienne Fries Skin On 7X7Mm | Chargrilled Chicken Burger, Cheeseburger in brioche bun |
| BBQ Potato Salad | 4 | sub_recipe | 0.77 | Potato Salad | Brisket, Chicken |

## Recommendation

Use this output to create a maintained alias table:

- Auto-accept `exact` items.
- Promote selected `high_confidence` items after a quick review.
- Work through the `review` queue and save confirmed mappings.
- Route `sub_recipe` items through recursive recipe costing.
- Keep `unmatched` items in a manual queue until a new catalog row or alias is added.

The JSON output in `web/data/costing_match_candidates.json` is intended to seed that alias table.

The grouped output in `web/data/costing_canonical_groups.json` shows where several raw labels can be maintained as one ingredient concept.
