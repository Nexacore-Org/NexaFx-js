export function jaroWinkler(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length === 0 || right.length === 0) return 0;

  const window = Math.max(
    Math.floor(Math.max(left.length, right.length) / 2) - 1,
    0,
  );
  const leftMatches: boolean[] = new Array<boolean>(left.length).fill(false);
  const rightMatches: boolean[] = new Array<boolean>(right.length).fill(false);
  let matches = 0;

  for (let i = 0; i < left.length; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, right.length);
    for (let j = start; j < end; j++) {
      if (rightMatches[j] || left[i] !== right[j]) continue;
      leftMatches[i] = true;
      rightMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let j = 0;
  for (let i = 0; i < left.length; i++) {
    if (!leftMatches[i]) continue;
    while (!rightMatches[j]) j++;
    if (left[i] !== right[j]) transpositions++;
    j++;
  }

  const jaro =
    (matches / left.length +
      matches / right.length +
      (matches - transpositions / 2) / matches) /
    3;
  if (jaro <= 0.7) return jaro;

  let prefix = 0;
  while (
    prefix < 4 &&
    prefix < left.length &&
    prefix < right.length &&
    left[prefix] === right[prefix]
  ) {
    prefix++;
  }
  return Math.min(1, jaro + prefix * 0.1 * (1 - jaro));
}
