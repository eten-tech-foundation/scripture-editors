interface BookData {
  name?: string;
  file: Promise<unknown>;
}

interface ServerMap {
  [server: string]: {
    [organization: string]: {
      [languageCode: string]: {
        [identifier: string]: {
          [book: string]: BookData;
        };
      };
    };
  };
}

export const serverMap: ServerMap = {
  door43: {
    unfoldingWord: {
      en: {
        ult: {
          psa: {
            file: import("../../data/psa.usfm.js").then((data) => data.default),
          },
        },
      },
    },
    idiomasPuentes: {
      "es-419": {
        tpl: {
          jon: {
            file: import("../../data/jon.glt.usfm.js").then((data) => data.default),
          },
          rev: {
            file: import("../../data/blank.usfm.js").then((data) => data.default),
          },
        },
      },
    },
  },
  dbl: {
    bfbs: {
      fra: {
        lsg: {
          tit: {
            file: import("../../data/tit.usfm.js").then((data) => data.default),
          },
          rev: {
            file: import("../../data/rev.usfm.js").then((data) => data.default),
          },
        },
      },
    },
  },
  ebible: {
    web: {
      en: {
        web: {
          psa: {
            file: import("../../data/psa.usfm.js").then((data) => data.default),
          },
        },
      },
    },
  },
};
