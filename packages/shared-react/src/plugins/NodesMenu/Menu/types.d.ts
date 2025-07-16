export type OptionItem = {
  name: string;
  label: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (args: any) => void;
};
