import { armedDeleteMessage } from "./armedDeleteMessage";

describe("armedDeleteMessage", () => {
  it("single verse marker, backward → Backspace + remove verse marker", () => {
    expect(armedDeleteMessage("verse", "deleteBackward")).toEqual({
      key: "Backspace",
      text: "again to remove verse marker",
    });
  });

  it("single verse marker, forward → Delete + remove verse marker", () => {
    expect(armedDeleteMessage("verse", "deleteForward")).toEqual({
      key: "Delete",
      text: "again to remove verse marker",
    });
  });

  it("range selection, backward → Backspace + delete selection", () => {
    expect(armedDeleteMessage("selection", "deleteBackward")).toEqual({
      key: "Backspace",
      text: "again to delete selection",
    });
  });

  it("range selection, forward → Delete + delete selection", () => {
    expect(armedDeleteMessage("selection", "deleteForward")).toEqual({
      key: "Delete",
      text: "again to delete selection",
    });
  });
});
