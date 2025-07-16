type AppOrPublisher = `x-${"app" | "publisher"}-${string}-${string}`;
type Local = `x-local-${string}`;

type Ref = "bcv_ref" | "book_ref";

type Label = "label";

type Key = Ref | AppOrPublisher | Local;

type Value = Label | Exclude<string, Label>;

export type Hook = [Key, Value];

export type Hooks = Hook[];
export default Hooks;
