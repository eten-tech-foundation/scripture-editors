/* eslint-disable @typescript-eslint/no-explicit-any */

type NodeKey = string;
type Path = Array<string | number>;

export enum OperationType {
  Add = "add",
  Replace = "replace",
  Remove = "remove",
  Move = "move",
}
type PlainObject<T> = Record<string | number, T>;
type ArrayKey<T> = keyof T[];
type PlainObjectKey<T> = keyof PlainObject<T>;
type ObjectOrArray<T> = PlainObject<T> | T[];
type ObjectOrArrayKey<T> = ArrayKey<T> | PlainObjectKey<T>;
interface OperationBase {
  type: OperationType;
  path: string | ObjectOrArrayKey<any>[];
  value: any;
}
interface OperationAdd extends OperationBase {
  type: OperationType.Add;
}
interface OperationReplace extends OperationBase {
  type: OperationType.Replace;
}
interface OperationRemove extends Omit<OperationBase, "value"> {
  type: OperationType.Remove;
  value?: any;
}
export type Operation = OperationAdd | OperationReplace | OperationRemove | { [string]: unknown };
