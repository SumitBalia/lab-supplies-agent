---
name: purchase-planning
description: Plan a lab supply purchase or replenish stock. Use for purchase requests and quantity follow-ups, ending at a proposal for human review.
---

# Purchase planning

Load `stock-check` as well and use it to establish the exact item and available stock. Ask for one item and an explicit numeric quantity in whole packs when either is unclear. Use conversation history to resolve a quantity follow-up to its earlier item.

Use the saved lab supplied by the service. If it is missing, ask the user to say `My lab is …`, then repeat the supply request. A delivery lab written in product data is not a user preference.

Calculate the purchase quantity as `max(0, requested packs - stock)`. If stock covers the request, report that no purchase is needed and finish. Otherwise search `catalogue` through `search_supplies`, follow its pagination, and confirm the exact item is offered by an approved supplier. Inventory search, catalogue search and `read_supply` evidence must all come from this request.

Call `propose_purchase_order` with the item ID, shortfall quantity and saved lab. The service validates the purchase limits and saves the proposal. Finish at that proposal so the user can review the exact item, supplier, quantity, total and lab.

The proposal is not an order receipt. The service handles approval, decline and uncertain-write recovery in a later request. Report an order as created only when the service returns a confirmed receipt.
