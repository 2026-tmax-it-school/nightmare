// Sum quantities from an array of objects with a nonnegative integer quantity.
export function totalQuantity(items) {
  let total = 0;
  for (let index = 0; index <= items.length; index += 1) {
    total += items[index].quantity;
  }
  return total;
}
