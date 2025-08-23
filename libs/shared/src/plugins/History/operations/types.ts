/* eslint-disable @typescript-eslint/no-explicit-any */

export enum OperationType {
  Add = "add",
  Replace = "replace",
  Remove = "remove",
  Move = "move",
}

export interface OperationBase {
  type: OperationType;
  path: string | (string | number)[];
  value: any;
}

export interface OperationAdd extends OperationBase {
  type: OperationType.Add;
}

export interface OperationReplace extends OperationBase {
  type: OperationType.Replace;
}

export interface OperationRemove extends Omit<OperationBase, "value"> {
  type: OperationType.Remove;
  value?: any;
}

export type Operation =
  | OperationAdd
  | OperationReplace
  | OperationRemove
  | { [key: string]: unknown };
