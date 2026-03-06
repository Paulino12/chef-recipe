# Recipe Costing Prototype

Conservative standalone recipe cost calculation using only trusted ingredient matches.

## Rules

- Trusted ingredient matches: `exact`, `high_confidence`
- Other ingredient matches are left unresolved
- Supported unit conversions: `G`, `KG`, `ML`, `L`, `EA`
- `PTN` lines attempt sub-recipe rollup using recipe title matching
- No app code or recipe source data is modified

## Summary

- Recipes analysed: `2,641`
- Fully costed recipes: `3`
- Partially costed recipes: `2,009`
- Recipes with no trusted cost coverage: `629`
- Output JSON: `web/data/recipe_cost_prototype.json`

## Sample Fully Costed Recipes

| Recipe | Portions | Batch cost | Portion cost | Coverage |
| --- | ---: | ---: | ---: | ---: |
| Yakitori - Salmon Yakitori | 10 | 0.6993 | 0.0699 | 100.0% |
| Sliced Avocado | 1 | 0.6749 | 0.6749 | 100.0% |
| Salad - Sliced Beetroot | 1 | 0.1371 | 0.1371 | 100.0% |

## Sample Partial Recipes

| Recipe | Costed lines | Unresolved lines | Batch cost | Coverage | Unresolved items |
| --- | ---: | ---: | ---: | ---: | --- |
| Salad Veggies - Massaged Kale | 3 | 1 | 5.5432 | 75.0% | Oil Pomace KTC |
| Roti Telur - Egg Pastry Pancake | 5 | 2 | 1.0459 | 71.4% | Spread Vitalite CB, Water Cold |
| Beetroot tzatziki | 4 | 2 | 0.252 | 66.7% | Herb Bunched Dill, Yoghurt Greek Kolios |
| Cheese and tom pizza | 2 | 1 | 0.1579 | 66.7% | Cheese Mozzarella Ball C/12 Galbani |
| Chicken Gammon & Leek Pie | 2 | 1 | 1.3632 | 66.7% | Pie Chicken Gammon Leek Piglets Pantry 1CXGL |
| Garlic Yoghurt | 2 | 1 | 0.0313 | 66.7% | Yoghurt Greek Kolios |
| Sweet Potato Butternut Squash & Chilli Soup | 7 | 4 | 2.7958 | 63.6% | Margarine Buttery Kerrymaid, Spice Smoked Paprika, VegetableBouillon Powder Chefs Pass, Water Hot |
| Hummous | 5 | 3 | 1.5314 | 62.5% | Chickpeas in Water Riverdene, Oil Pomace KTC, Spices Cumin Ground |
| Rice & Peas | 5 | 3 | 1.5923 | 62.5% | Coconut Milk, Herb Thyme Bunch, Spring Onion Bunch |
| Chargrilled Sprouting Broccoli with Chilli and Garlic | 3 | 2 | 0.1712 | 60.0% | Broccoli, Oil Pomace KTC |

## Detailed Samples

### Yakitori - Salmon Yakitori

- Recipe id: `12163452`
- Portions: `10`
- Batch cost: `0.6993`
- Portion cost: `0.0699`
- Coverage: `100.0%`

| Ingredient | Qty | Unit | Status | Match | Line cost | Notes |
| --- | ---: | --- | --- | --- | ---: | --- |
| Yakitori Salmon | 10 | PTN | costed | Yakitori salmon | 0.6947 | rolled_up_from_recipe:12205968 |
| Yakitori Garnish | 10 | PTN | costed | Yakitori - Garnish | 0.0046 | rolled_up_from_recipe:12162997 |

### Sliced Avocado

- Recipe id: `12085857`
- Portions: `1`
- Batch cost: `0.6749`
- Portion cost: `0.6749`
- Coverage: `100.0%`

| Ingredient | Qty | Unit | Status | Match | Line cost | Notes |
| --- | ---: | --- | --- | --- | ---: | --- |
| Avocado Slices IQF | 75 | G | costed | Iqf Avocado Slices | 0.6749 | high_confidence |

### Salad - Sliced Beetroot

- Recipe id: `12077230`
- Portions: `1`
- Batch cost: `0.1371`
- Portion cost: `0.1371`
- Coverage: `100.0%`

| Ingredient | Qty | Unit | Status | Match | Line cost | Notes |
| --- | ---: | --- | --- | --- | ---: | --- |
| Beetroot Sliced In Water | 100 | G | costed | Beetroot Sliced In Water | 0.1371 | exact |

### Salad Veggies - Massaged Kale

- Recipe id: `12211358`
- Portions: `10`
- Batch cost: `5.5432`
- Portion cost: `0.5543`
- Coverage: `75.0%`

| Ingredient | Qty | Unit | Status | Match | Line cost | Notes |
| --- | ---: | --- | --- | --- | ---: | --- |
| Cabbage Curly Kale | 1 | KG | costed | Cabbage Curly Kale... | 4.68 | exact |
| Lemons | 3 | EA | costed | Bb - Lemons | 0.834 | high_confidence |
| Oil Pomace KTC | 110 | ML | unresolved | Ktc Vegetable Oil | - | untrusted_match_status:low_confidence |
| Salt Sea Maldon Tub | 3 | G | costed | Maldon Sea Salt | 0.0292 | high_confidence |

### Roti Telur - Egg Pastry Pancake

- Recipe id: `12091398`
- Portions: `10`
- Batch cost: `1.0459`
- Portion cost: `0.1046`
- Coverage: `71.4%`

| Ingredient | Qty | Unit | Status | Match | Line cost | Notes |
| --- | ---: | --- | --- | --- | ---: | --- |
| Flour Plain | 300 | G | costed | Everyday Favourites Plain Flour | 0.2113 | high_confidence |
| Water Cold | 100 | ML | unresolved | Paper Cold Water Cone With Rim 4Oz | - | untrusted_match_status:low_confidence |
| Pepper White Ground | 5 | G | costed | Everyday Favourites Ground White Pepper | 0.0807 | high_confidence |
| Salt Cooking | 8 | G | costed | Everyday Favourites Cooking Salt | 0.0077 | high_confidence |
| Onion Red | 200 | G | costed | Red Onion | 0.3602 | high_confidence |
| Chillies Green | 50 | G | costed | Bb - Green Chillies | 0.386 | high_confidence |
| Spread Vitalite CB | 250 | G | unresolved | Everyday Favourites Soft Spread | - | untrusted_match_status:low_confidence |

### Beetroot tzatziki

- Recipe id: `12206400`
- Portions: `10`
- Batch cost: `0.252`
- Portion cost: `0.0252`
- Coverage: `66.7%`

| Ingredient | Qty | Unit | Status | Match | Line cost | Notes |
| --- | ---: | --- | --- | --- | ---: | --- |
| Beetroot Raw | 125 | G | costed | Bb - Raw Beetroot | 0.205 | high_confidence |
| Yoghurt Greek Kolios | 125 | G | unresolved | - | - | untrusted_match_status:unmatched |
| Herb Bunched Dill | 22 | G | unresolved | Bb - Dill | - | untrusted_match_status:low_confidence |
| Garlic Peeled | 2 | G | costed | Bb - Prep Garlic Peeled | 0.0114 | high_confidence |
| Vinegar Red Wine | 4 | ML | costed | Everyday Favourites Red Wine Vinegar | 0.0064 | high_confidence |
| Salt Sea Maldon Tub | 3 | G | costed | Maldon Sea Salt | 0.0292 | high_confidence |

### Cheese and tom pizza

- Recipe id: `12210708`
- Portions: `10`
- Batch cost: `0.1579`
- Portion cost: `0.0158`
- Coverage: `66.7%`

| Ingredient | Qty | Unit | Status | Match | Line cost | Notes |
| --- | ---: | --- | --- | --- | ---: | --- |
| Flat bread | 10 | PTN | costed | Flat bread | 0.0432 | rolled_up_from_recipe:12210706 |
| Cheese Mozzarella Ball C/12 Galbani | 100 | G | unresolved | Galbani Mozzarella Balls | - | untrusted_match_status:low_confidence |
| Tomato sauce | 10 | PTN | costed | Tomato Sauce | 0.1148 | rolled_up_from_recipe:12174199 |

### Chicken Gammon & Leek Pie

- Recipe id: `12184571`
- Portions: `10`
- Batch cost: `1.3632`
- Portion cost: `0.1363`
- Coverage: `66.7%`

| Ingredient | Qty | Unit | Status | Match | Line cost | Notes |
| --- | ---: | --- | --- | --- | ---: | --- |
| Pie Chicken Gammon Leek Piglets Pantry 1CXGL | 10 | EA | unresolved | Little & Cull Chicken, Ham Hock & Leek Pie | - | untrusted_match_status:low_confidence |
| MASH | 10 | PTN | costed | Mash | 0.0064 | rolled_up_from_recipe:12176640 |
| Buttered Greens | 10 | PTN | costed | Buttered Greens | 1.3568 | rolled_up_from_recipe:12230770 |
