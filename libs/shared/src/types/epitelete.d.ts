/* eslint-disable @typescript-eslint/no-explicit-any */

declare module "epitelete" {
  interface Options {
    readPipeline?: string;
    writePipeline?: string;
    cloning?: boolean;
  }

  export default class Epitelete {
    constructor(options: { docSetId: string });

    docSetId: string;
    validator: any;

    readPerf(bookCode: string, options?: Options): Promise<PerfDocument>;
    writePerf(bookCode: string, options?: Options): Promise<PerfDocument>;
    sideloadPerf(
      bookCode: string,
      perfDocument: PerfDocument,
      options?: Options,
    ): Promise<PerfDocument>;
    readUsfm(bookCode: string, options?: Options): Promise<string>;
  }
}
