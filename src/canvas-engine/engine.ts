import axios from "axios";
import { Cords, Shapes, shapesMessage } from "../config/types";
import { getExistingShapes } from "./utils";
import getStroke from "perfect-freehand";
import { getSvgPathFromStroke } from "./utils";

export class Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private existingShapes: shapesMessage[];
  private roomId: number;
  private clicked: boolean;
  private startX = 0;
  private startY = 0;
  private selectedTool: Shapes | null;
  private freeDrawCords: Cords[] = [];
  private input: HTMLTextAreaElement;
  private mouseDownHandler: (e: MouseEvent) => void;
  private mouseUpHanlder: (e: MouseEvent) => void;
  private mouseMoveHandler: (e: MouseEvent) => void;
  private mouseClickHandler: (e: MouseEvent) => void;
  socket?: WebSocket;

  constructor(
    canvas: HTMLCanvasElement,
    roomId: number,
    socket?: WebSocket
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas.");
    }
    this.ctx = ctx;
    this.existingShapes = [];
    this.roomId = roomId;
    this.socket = socket;
    // this.initHandlers();
    this.initMouseHanlders();
    // this.init();
  }

  public setTool(tool: Shapes) {
    this.selectedTool = tool;
  }

  async init() {
    this.existingShapes = await getExistingShapes(this.roomId);
    this.clearCanvas();
  }

  //   async initHandlers() {
  //     this.socket.onmessage = (event) => {
  //       const message = JSON.parse(event.data);
  //       if (message.type === "CHAT") {
  //         const parsedData = JSON.parse(message.message);
  //         this.existingShapes.push(parsedData);
  //         this.clearCanvas();
  //       }
  //     };
  //   }

  informWsServer(shape: shapesMessage) {
    this.existingShapes.push(shape);
    // this.socket.send(
    //   JSON.stringify({
    //     type: "CHAT",
    //     message: JSON.stringify(shape),
    //     roomId: this.roomId,
    //     userId: this.userId,
    //   })
    // );
    this.clearCanvas();
  }

  clearCanvas() {
    console.log("clearning canvas ..."); // this needs to be deleted later
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#121212";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.existingShapes.map((shape) => {
      this.ctx.strokeStyle = "#FFFFFF";

      switch (shape.type) {
        case "rect":
          {
            this.ctx.strokeStyle = "white";
            this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
          }
          break;

        case "circle":
          {
            this.ctx.beginPath();
            this.ctx.strokeStyle = "white";
            this.ctx.arc(
              shape.centerX,
              shape.centerY,
              shape.radius,
              0,
              Math.PI * 2
            );
            this.ctx.stroke();
          }
          break;

        case "line":
          {
            this.ctx.strokeStyle = "white";
            this.ctx.moveTo(shape.startX, shape.startY);
            this.ctx.lineTo(shape.endX, shape.endY);
            this.ctx.stroke();
          }
          break;

        case "text":
          {
            this.ctx.fillStyle = shape.style;
            this.ctx.strokeStyle = "white";
            this.ctx.font = "24px 'Dancing Script', cursive";
            this.ctx.fillText(shape.text, shape.x, shape.y + 24);
          }
          break;

        case "diamond":
          {
            this.ctx.beginPath();
            this.ctx.strokeStyle = "white";
            this.ctx.moveTo(shape.xLeft, shape.yHorizontal);
            this.ctx.lineTo(shape.xVertical, shape.yTop);
            this.ctx.lineTo(shape.xRight, shape.yHorizontal);
            this.ctx.lineTo(shape.xVertical, shape.yBottom);
            this.ctx.lineTo(shape.xLeft, shape.yHorizontal);
            this.ctx.stroke();
          }
          break;

        case "pencil":
          {
            const path = new Path2D(this.generatePencilPath(shape.cords, 1));
            this.ctx.save();
            this.ctx.fillStyle = shape.style;
            this.ctx.fill(path);
            this.ctx.restore();
          }
          break;

        default:
          break;
      }
    });
    1;
  }

  initTextDraw(x: number, y: number) {
    this.input = document.createElement("textarea");
    this.input.style.color = "#FFFFFF";
    this.input.autofocus = true;
    this.input.style.left = `${x}px`;
    this.input.style.top = `${y}px`;
    this.input.style.fontSize = "24px";
    Object.assign(this.input.style, {
      position: "absolute",
      display: "inline-block",
      backfaceVisibility: "hidden",
      margin: "0",
      padding: "0",
      border: `1px dotted white`,
      outline: "0",
      resize: "none",
      background: "transparent",
      overflowX: "hidden",
      overflowY: "hidden",
      overflowWrap: "normal",
      boxSizing: "content-box",
      wordBreak: "normal",
      whiteSpace: "pre",
      verticalAlign: "top",
      opacity: "1",
      wrap: "off",
      tabIndex: 0,
      dir: "auto",
      width: "auto",
      minHeight: "auto",
    });
    document.body.appendChild(this.input);
    this.input.addEventListener("blur", () => {
      this.clearCanvas();
      this.ctx.strokeStyle = "rgb(256, 256, 256)";
      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.font = "24px 'Dancing Script', cursive";
      this.ctx.fillText(this.input.value, x, y);
      const shape: shapesMessage = {
        type: "text",
        text: this.input.value,
        style: "#FFFFFF",
        x,
        y,
      };
      this.informWsServer(shape);
      document.body.removeChild(this.input);
    });
    this.selectedTool = null;
  }

  initPencilDraw(cords: Cords[], strokeWidth: number) {
    const path = new Path2D(this.generatePencilPath(cords, strokeWidth));
    this.ctx.save();
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.fill(path);
    this.ctx.restore();
  }

  generatePencilPath(cords: Cords[], strokeWidth: number) {
    const cordinates = cords.map((cord) => [cord.x, cord.y]);

    if (!cordinates.length) {
      return "";
    }

    const options = {
      simulatePressure: true,
      size: strokeWidth * 4.25,
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.5,
      //   easing: (t) => Math.sin((t * Math.PI) / 2), // easeOutSine
      last: true,
    };

    const strokeCords = getStroke(cordinates, options);
    const pencilPath = getSvgPathFromStroke(strokeCords);
    return pencilPath;
  }

  isPointInShape(x: number, y: number, shape: shapesMessage) {
    console.log("checking for point in shape"); // this needs to be deleted later
    switch (shape.type) {
      case "rect":
        {
          if (
            x >= shape.x &&
            x <= shape.x + shape.width &&
            y >= shape.y &&
            y <= shape.y + shape.height
          ) {
            console.log(`rectangle found`);
            console.log(`shape is ${shape.type}`);
            console.log(`x is ${x}`);
            console.log(`y is ${y}`);
            console.log(`shape x is ${shape.x}`);
            console.log(`shape y is ${shape.y}`);
            return true;
          }
        }
        break;

      case "diamond":
        {
          // if ) {
          // }
        }
        break;

      default:
        break;
    }
  }

  async EraseCanvas() {
    this.init();
    await axios.patch(`http://localhost:3001/delete/${this.roomId}`, {
      headers: {
        authorization:
          "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.RMfebNn3ViUE40wpF_u-tMK-5kmVYsB1uwuRYE9EJl8",
      },
    });
    this.existingShapes = [];
  }

  deleteShape(shape: shapesMessage) {
    this.existingShapes = this.existingShapes.filter(
      (existingShape) => existingShape !== shape
    );
    this.clearCanvas();
  }

  initMouseHanlders() {
    this.mouseClickHandler = (e) => {
      if (this.selectedTool === "text") {
        this.initTextDraw(e.clientX, e.clientY);
      }
      if (this.selectedTool === "eraser") {
        for (let i = 0; i < this.existingShapes.length - 1; i++) {
          const shape = this.existingShapes[i];
          if (this.isPointInShape(this.startX, this.startY, shape)) {
            this.deleteShape(shape);
          }
        }
        return false;
      }
    };

    this.mouseDownHandler = (e) => {
      if (!this.selectedTool) {
        return;
      }
      this.clicked = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      if (this.selectedTool === "pencil") {
        this.freeDrawCords.push({
          x: this.startX,
          y: this.startY,
        });
      }
    };

    this.mouseUpHanlder = (e) => {
      if (!this.selectedTool) {
        return;
      }
      this.clicked = false;
      let shape: shapesMessage | null = null;
      const width = e.clientX - this.startX;
      const height = e.clientY - this.startY;

      switch (this.selectedTool) {
        case "rect":
          {
            shape = {
              type: "rect",
              x: this.startX,
              y: this.startY,
              width,
              height,
            };
            // this.informWsServer(shape);
            this.existingShapes.push(shape);
          }
          break;

        case "circle":
          {
            shape = {
              type: "circle",
              centerX: this.startX + width / 2,
              centerY: this.startY + height / 2,
              radius: Math.max(width, height) / 2,
            };
            // this.informWsServer(shape);
            this.existingShapes.push(shape);
          }
          break;

        case "line":
          {
            shape = {
              type: "line",
              startX: this.startX,
              startY: this.startY,
              endX: e.clientX,
              endY: e.clientY,
            };
            // this.informWsServer(shape);
            this.existingShapes.push(shape);
          }
          break;
        case "diamond":
          {
            shape = {
              type: "diamond",
              xLeft: this.startX,
              xRight: e.clientX,
              yHorizontal: (this.startY + e.clientY) / 2,
              xVertical: (this.startX + e.clientX) / 2,
              yTop: this.startY,
              yBottom: e.clientY,
            };
            // this.informWsServer(shape);
            this.existingShapes.push(shape);
          }
          break;
        case "pencil":
          {
            shape = {
              type: "pencil",
              cords: this.freeDrawCords,
              style: "#FFFFFF",
            };
            // this.informWsServer(shape);
            this.initPencilDraw(this.freeDrawCords, 1);
            this.freeDrawCords = [];
            this.existingShapes.push(shape);
            this.clearCanvas();
          }
          break;

        default:
          break;
      }
    };

    this.mouseMoveHandler = (e) => {
      if (!this.selectedTool) {
        return;
      }

      if (this.clicked) {
        const width = e.clientX - this.startX;
        const height = e.clientY - this.startY;
        this.clearCanvas();
        this.ctx.strokeStyle = "rgb(256, 256, 256)";

        if (this.selectedTool === "rect") {
          this.ctx.strokeRect(this.startX, this.startY, width, height);
        } else if (this.selectedTool === "circle") {
          console.log("circle inside functions");
          const centerX = this.startX + width / 2;
          const centerY = this.startY + height / 2;
          const radius = Math.max(width, height) / 2;
          this.ctx.beginPath();
          this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.closePath();
        } else if (this.selectedTool === "line") {
          console.log("line inside functions"); // this needs to be deleted later
          this.ctx.moveTo(this.startX, this.startY);
          this.ctx.lineTo(e.clientX, e.clientY);
          this.ctx.stroke();
        } else if (this.selectedTool === "diamond") {
          const xLeft = this.startX;
          const xRight = e.clientX;
          const yHorizontal = (this.startY + e.clientY) / 2;
          const xVertical = (this.startX + e.clientX) / 2;
          const yTop = this.startY;
          const yBottom = e.clientY;

          this.ctx.beginPath();
          this.ctx.moveTo(xLeft, yHorizontal);
          this.ctx.lineTo(xVertical, yTop);
          this.ctx.lineTo(xRight, yHorizontal);
          this.ctx.lineTo(xVertical, yBottom);
          this.ctx.lineTo(xLeft, yHorizontal);
          this.ctx.stroke();
        } else if (this.selectedTool === "pencil") {
          this.freeDrawCords.push({
            x: e.clientX,
            y: e.clientY,
          });
          this.clearCanvas();
          this.initPencilDraw(this.freeDrawCords, 1);
        }
      }
    };

    this.canvas.addEventListener("click", this.mouseClickHandler);
    this.canvas.addEventListener("mousedown", this.mouseDownHandler);
    this.canvas.addEventListener("mouseup", this.mouseUpHanlder);
    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
  }

  cleanup() {
    this.canvas.removeEventListener("click", this.mouseClickHandler);
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHanlder);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
  }
}
