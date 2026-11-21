// Moving weighted average, replayed in (occurred_at, id) order. DATABASE.md §5.
// on_hand is in thousandths, avg is per whole unit at full precision.
export function replayCost(movements, fallbackCost) {
  let onHand = 0;
  let avg = fallbackCost || 0;
  for (const m of movements) {
    if (m.kind === 'stock_in') {
      if (onHand <= 0) avg = m.unit_cost;
      else avg = (onHand * avg + m.qty_milli * m.unit_cost) / (onHand + m.qty_milli);
    }
    onHand += m.qty_milli;
  }
  return { onHand, avg };
}

export function sortMovements(movements) {
  return [...movements].sort((a, b) => a.occurred_at - b.occurred_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
