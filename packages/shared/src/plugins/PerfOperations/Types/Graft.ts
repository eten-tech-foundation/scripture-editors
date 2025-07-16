import Sequence from "./Sequence";

type GraftType = "graft";

interface BaseGraft {
  type: GraftType;
}

export type ExistingGraft<GraftSubtype> = BaseGraft & {
  target: string;
  subtype: GraftSubtype;
  preview_text?: string;
};

export type NewGraft<GraftSubtype> = BaseGraft & {
  new: true;
  sequence?: Sequence;
  subtype?: GraftSubtype;
  target?: string;
};

export type Graft<GraftSubtype> = ExistingGraft<GraftSubtype> | NewGraft<GraftSubtype>;
