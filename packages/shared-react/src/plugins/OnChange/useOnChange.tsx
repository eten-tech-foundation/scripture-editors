/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { LexicalEditor } from "lexical";

import { registerOnChange } from "./";
import { useEffect } from "react";
import { UpdateListener } from "lexical/LexicalEditor";

export function useOnChange(editor: LexicalEditor, onChange: UpdateListener): void {
  useEffect(() => {
    return registerOnChange(editor, onChange);
  }, [onChange, editor]);
}
