import { Item } from "./filterAndRankItems";

export interface OptionItem extends Item {
  name: string;
  label: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (args: any) => void;
}
