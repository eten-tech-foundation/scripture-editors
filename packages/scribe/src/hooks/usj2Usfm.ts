import { Usj } from "@eten-tech-foundation/scripture-utilities";
import USFMParser from "sj-usfm-grammar";

export const Usj2Usfm = async (usj: Usj): Promise<string> => {
  // let usfm: string;
  const parseUsj = async (usj: Usj): Promise<string> => {
    await USFMParser.init();
    const usfmParser = new USFMParser();
    return usfmParser.usjToUsfm(usj);
  };
  const usfm: string = usj ? await parseUsj(usj) : "";
  return usfm;
};

export const usfm2Usj = async (usfm: string): Promise<Usj> => {
  // let usfm: string;
  const parseUsfm = async (usfm: string): Promise<Usj> => {
    await USFMParser.init();
    const usfmParser = new USFMParser();
    return usfmParser.usfmToUsj(usfm);
  };
  const usj: Usj = usfm ? await parseUsfm(usfm) : ({} as Usj);
  return usj;
};
