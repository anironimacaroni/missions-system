/** "משימה אחת" / "2 משימות" */
export function tasksLabel(n: number): string {
  return n === 1 ? "משימה אחת" : `${n} משימות`;
}
