# Bench lab supplies

Bench helps a scientist check lab supplies and review a proposed purchase. A purchase proposal and a confirmed purchase order are distinct domain records.

## Language

**Lab**:
The scientist's explicitly declared destination for supply purchases.
_Avoid_: Team or department when referring to the delivery destination.

**Supply item**:
A particular lab consumable or reagent, including its size or formulation and ordering unit.
_Avoid_: Product family when a specific supply item is meant.

**SKU**:
The identifier of a specific supply item. Different sizes or formulations have distinct SKUs.
_Avoid_: Item name as a substitute for an exact identifier.

**Pack**:
One whole ordering unit, such as a box, bottle or package. The number of tips or volume inside a pack is distinct from the number of packs requested.
_Avoid_: Individual tip or milliliter when counting packs.

**Stock**:
The number of packs currently available for a supply item.
_Avoid_: Ordered quantity when referring to available stock.

**Approved catalogue**:
The set of supply items eligible for purchasing from approved suppliers.
_Avoid_: Inventory when referring to purchasing eligibility.

**Requested quantity**:
The total number of packs the scientist says they need, including packs already in stock.
_Avoid_: Purchase quantity when referring to total need.

**Shortfall**:
The positive difference between requested quantity and available stock. A request covered by stock has a shortfall of zero.
_Avoid_: Reorder threshold, which is a different replenishment policy.

**Purchase proposal**:
The exact item, supplier, shortfall quantity, price and lab presented for a scientist's decision before ordering.
_Avoid_: Purchase order or receipt before a purchase is confirmed.

**Approval**:
The scientist's explicit acceptance of the purchase proposal being reviewed. A request for supplies alone is not approval.
_Avoid_: Intent to buy as a substitute for approval.

**Decline**:
The scientist's rejection of a pending purchase proposal before ordering.
_Avoid_: Order cancellation, which would concern an existing purchase order.

**Purchase order**:
A confirmed record of an approved supply purchase.
_Avoid_: Proposal when referring to a confirmed purchase.

**Order receipt**:
A record confirming the purchase order and its identifier.
_Avoid_: Approval message as evidence that an order was created.

**Unconfirmed purchase**:
An approved purchase whose order receipt has not been confirmed. The purchase order may already exist, so recovery must reconcile the original purchase.
_Avoid_: Failed order when the outcome is uncertain.
