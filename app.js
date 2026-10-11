import * as XSTATE from "https://cdn.jsdelivr.net/npm/xstate@5.32.6/+esm";

/** @type {HTMLButtonElement} */
let $undoButton = $("#undo-button");

/** @type {HTMLButtonElement} */
let $redoButton = $("#redo-button");

/** @type {HTMLCanvasElement} */
let $canvas = $("#canvas");

/** @type {CanvasRenderingContext2D} */
let canvasContext = $canvas.getContext("2d");

/** @type {{ window: HTMLDivElement, closeButton: HTMLButtonElement, selectActionButton: HTMLButtonElement }} */
let $selectingActions = {
  window: $("#selecting-actions-window"),
  closeButton: $("#close-selecting-actions-window-button"),
  selectActionButton: $("#select-action-button"),
};

/** @type {{ window: HTMLDivElement, closeButton: HTMLButtonElement }} */
let $adjustingDiameter = {
  window: $("#adjusting-diameter-window"),
  closeButton: $("#close-adjusting-diameter-window-button"),
};

/** @type {HTMLInputElement} */
let $diameterInput = $("#diameter-input");

/** @type {{ x: HTMLSpanElement, y: HTMLSpanElement }} */
let $circlePosition = {
  x: $("#circle-position-x"),
  y: $("#circle-position-y"),
};

const globals = {
  circleId: 0,
};

const machine = XSTATE.setup({
  guards: {
    anyCircleClicked,
    isStatesToUndoEmpty({ context }) {
      return context.statesToUndo.length === 0;
    },
    isStatesToRedoEmpty({ context }) {
      return context.statesToRedo.length === 0;
    },
  },
  actions: {
    addCircle: XSTATE.assign({
      circles({ context, event }) {
        let circle = {
          id: ++globals.circleId,
          x: event.x,
          y: event.y,
          radius: 20,
        };
        let nextCircles = { ...context.circles };
        nextCircles[circle.id] = circle;
        return nextCircles;
      },
    }),

    snapshot: XSTATE.assign(function ({ context }) {
      let nextContext = {
        ...context,
        statesToUndo: [...context.statesToUndo, { ...context.circles }],
        statesToRedo: [],
      };
      return nextContext;
    }),

    setSelectedCircle: XSTATE.assign({
      selectedCircleId({ context, event: clickPosition }) {
        let selectedCircle = Object.values(context.circles).find(
          function (circle) {
            return circleClicked(circle, clickPosition);
          },
        );
        return selectedCircle.id;
      },
    }),

    unsetSelectedCircle: XSTATE.assign({
      selectedCircleId() {
        return null;
      },
    }),

    changeDiameter: XSTATE.assign({
      circles({ context, event }) {
        let nextCircles = { ...context.circles };
        nextCircles[context.selectedCircleId] = {
          ...nextCircles[context.selectedCircleId],
          radius: event.diameter / 2,
        };
        return nextCircles;
      },
    }),

    undo: XSTATE.assign(function ({ context }) {
      let nextStatesToRedo = [
        ...context.statesToRedo,
        context.statesToUndo.at(-1),
      ];
      let nextStatesToUndo = context.statesToUndo.slice(
        0,
        context.statesToUndo.length - 1,
      );
      let nextCircles = nextStatesToUndo.at(-1) ?? {};
      return {
        ...context,
        circles: nextCircles,
        statesToUndo: nextStatesToUndo,
        statesToRedo: nextStatesToRedo,
      };
    }),

    redo: XSTATE.assign(function ({ context }) {
      let nextStatesToRedo = context.statesToRedo.slice(
        0,
        context.statesToRedo.length - 1,
      );
      let nextStatesToUndo = [
        ...context.statesToUndo,
        context.statesToRedo.at(-1),
      ];
      let nextCircles = nextStatesToUndo.at(-1) ?? {};
      return {
        ...context,
        circles: nextCircles,
        statesToUndo: nextStatesToUndo,
        statesToRedo: nextStatesToRedo,
      };
    }),
  },
}).createMachine({
  id: "circle-drawer",
  context: {
    selectedCircleId: null,
    circles: {},
    statesToUndo: [],
    statesToRedo: [],
  },
  initial: "Drawing",
  states: {
    Drawing: {
      on: {
        "CANVAS.CLICK": {
          guard: XSTATE.not({
            type: "anyCircleClicked",
            params: ({ event }) => event,
          }),
          actions: ["addCircle", "snapshot"],
        },
        "CANVAS.CONTEXT_MENU": {
          guard: {
            type: "anyCircleClicked",
            params: ({ event }) => event,
          },
          actions: "setSelectedCircle",
          target: "SelectingActions",
        },
        UNDO: {
          guard: XSTATE.not("isStatesToUndoEmpty"),
          actions: "undo",
        },
        REDO: {
          guard: XSTATE.not("isStatesToRedoEmpty"),
          actions: "redo",
        },
      },
    },
    SelectingActions: {
      on: {
        "ADJUST_DIAMETER.SELECT": {
          target: "AdjustingDiameter",
        },
        "WINDOW.CLOSE": {
          actions: "unsetSelectedCircle",
          target: "Drawing",
        },
      },
    },
    AdjustingDiameter: {
      on: {
        "DIAMETER.CHANGE": {
          actions: "changeDiameter",
        },
        "WINDOW.CLOSE": {
          actions: ["unsetSelectedCircle", "snapshot"],
          target: "Drawing",
        },
      },
    },
  },
});

const actor = XSTATE.createActor(machine);

window.ACTOR = actor;

actor.subscribe(function (snapshot) {
  window.SNAPSHOT = snapshot;
  let { circles, selectedCircleId } = snapshot.context;

  canvasContext.clearRect(0, 0, $canvas.width, $canvas.height);
  Object.values(circles).forEach(function (circle) {
    let { x, y, radius } = circle;
    canvasContext.fillStyle = "hsl(0 75 60)";
    canvasContext.beginPath();
    canvasContext.arc(x, y, radius, 0, 2 * Math.PI);
    canvasContext.fill();
    canvasContext.strokeStyle = "hsl(0 75 75)";
    canvasContext.lineWidth = 4;
    canvasContext.beginPath();
    canvasContext.arc(x, y, radius, 0, 2 * Math.PI);
    canvasContext.stroke();
  });

  $selectingActions.window.hidden = snapshot.value !== "SelectingActions";
  $adjustingDiameter.window.hidden = snapshot.value !== "AdjustingDiameter";
  let selectedCircle = circles[selectedCircleId];
  $circlePosition.x.innerText = selectedCircle?.x?.toFixed(2);
  $circlePosition.y.innerText = selectedCircle?.y?.toFixed(2);
});

actor.start();

$undoButton.addEventListener("click", function () {
  actor.send({ type: "UNDO" });
});

$redoButton.addEventListener("click", function () {
  actor.send({ type: "REDO" });
});

$canvas.addEventListener("click", function (event) {
  let canvasRect = $canvas.getBoundingClientRect();
  let x = event.clientX - canvasRect.left;
  let y = event.clientY - canvasRect.top;
  actor.send({ type: "CANVAS.CLICK", x, y });
});

$canvas.addEventListener("contextmenu", function (event) {
  event.preventDefault();
  let canvasRect = $canvas.getBoundingClientRect();
  let x = event.clientX - canvasRect.left;
  let y = event.clientY - canvasRect.top;
  actor.send({ type: "CANVAS.CONTEXT_MENU", x, y });
});

$diameterInput.addEventListener("input", function () {
  actor.send({
    type: "DIAMETER.CHANGE",
    diameter: $diameterInput.valueAsNumber,
  });
});

$selectingActions.closeButton.addEventListener("click", function () {
  actor.send({ type: "WINDOW.CLOSE" });
});

$selectingActions.selectActionButton.addEventListener("click", function () {
  actor.send({ type: "ADJUST_DIAMETER.SELECT" });
});

$adjustingDiameter.closeButton.addEventListener("click", function () {
  actor.send({ type: "WINDOW.CLOSE" });
});

// ---- ---- ---- ---- ---- ---- ---- ----

function $(selector) {
  return document.querySelector(selector);
}

function anyCircleClicked({ context }, clickPosition) {
  let { circles } = context;
  return Object.values(circles).some(function (circle) {
    return circleClicked(circle, clickPosition);
  });
}

function circleClicked(circle, clickPosition) {
  let { x, y, radius } = circle;
  let circleCenterPosition = { x, y };
  let distance = distanceBetween(clickPosition, circleCenterPosition);
  return distance < radius;
}

function distanceBetween(p1, p2) {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}
