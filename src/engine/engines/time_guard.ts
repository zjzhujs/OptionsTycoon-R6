export interface HasDate { date: string }

export function is_visible<T extends HasDate>(item: T, game_date: string): boolean {
  return item.date <= game_date;
}

export function visible_events<T extends HasDate>(items: T[], game_date: string): T[] {
  return items.filter((item) => is_visible(item, game_date));
}

