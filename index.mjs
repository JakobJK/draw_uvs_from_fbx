import { Canvas } from "skia-canvas";
import minimist from "minimist";
import { parseText, parseBinary } from "fbx-parser";
import * as fs from "fs";

const drawBackground = () => {
  // TODO: Add Background grid
  ctx.fillStyle = settings.BACKGROUND_COLOR;
  ctx.fillRect(0, 0, settings.UV_SIZE, settings.UV_SIZE);
};

const getProps = (fbx, steps) => {
  let result = fbx;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!Array.isArray(result)) {
      throw new TypeError(`Expected an array but got: ${typeof result}`);
    }
    const next = result.find((x) => x.name === step);
    if (!next) {
      return undefined; // Stop if the step is not found
    }
    result = i === steps.length - 1 ? next : next.nodes;
  }
  return result.props[0];
};

const getUVs = (fbx) =>
  getProps(fbx, ["Objects", "Geometry", "LayerElementUV", "UV"]);
const getUVIndices = (fbx) =>
  getProps(fbx, ["Objects", "Geometry", "LayerElementUV", "UVIndex"]);

const getFaceIndices = (fbx) =>
  getProps(fbx, ["Objects", "Geometry", "PolygonVertexIndex"]);

const drawVertices = (fbx) => {
  const uvs = getProps(fbx, ["Objects", "Geometry", "LayerElementUV", "UV"]);
  ctx.fillStyle = settings.VERTEX_COLOR;

  for (let i = 0; i < uvs.length; i += 2) {
    const x = uvs[i] * settings.UV_SIZE;
    const y = (1 - uvs[i + 1]) * settings.UV_SIZE;

    ctx.beginPath();
    ctx.arc(x, y, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
};

const getEdgesStructure = (fbx) => {
  const uvs = getUVs(fbx);
  const uvIndices = getUVIndices(fbx);
  const faceIndices = getFaceIndices(fbx);

  const edges = {};

  let lastNoneMinusIdx = 0;
  for (let i = 0; i < faceIndices.length; i++) {
    let a;
    let b;

    // FBX will indicate a new face by having the vertex idx
    // listed as negative value (Ex: 22 will be -23).
    if (faceIndices[i] < 0) {
      a = uvIndices[lastNoneMinusIdx];
      b = uvIndices[i];
      lastNoneMinusIdx = i + 1;
    } else {
      a = uvIndices[i];
      b = uvIndices[i + 1];
    }

    const key = [a, b].sort((x, y) => x - y).join("_");
    if (!edges.hasOwnProperty(key)) {
      edges[key] = [uvs[a * 2], uvs[a * 2 + 1], uvs[b * 2], uvs[b * 2 + 1], 1];
    } else {
      edges[key][4] += 1;
    }
  }
  return edges;
};

const drawEdges = (edges) => {
  for (const [_, value] of Object.entries(edges)) {
    const [startX, startY, endX, endY, connectedFaces] = value;

    // If the edge is a border edge.
    if (connectedFaces === 1) {
      ctx.strokeStyle = settings.BORDER_COLOR;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = settings.EDGE_COLOR;
      ctx.lineWidth = 1;
    }

    ctx.beginPath();
    ctx.moveTo(startX * settings.UV_SIZE, (1 - startY) * settings.UV_SIZE);
    ctx.lineTo(endX * settings.UV_SIZE, (1 - endY) * settings.UV_SIZE);
    ctx.stroke();
  }
};

const getSettings = () => {
  const argv = minimist(process.argv.slice(2));
  const settings = {
    UV_SIZE: argv?.size ?? 2048,
    FILE_PATH: argv?.file ?? "./model.fbx",
    BACKGROUND_COLOR: argv?.bg ?? "#2e2e2e",
    EDGE_COLOR: argv?.edge_color ?? "red",
    BORDER_COLOR: argv?.border_color ?? "white",
    VERTEX_COLOR: argv?.vertex_color ?? "blue",
    OUTPUT_FILE: argv?.output ?? "rainbow.png",
  };
  return settings;
};

const getFaces = (fbx) => {
  const uvs = getUVs(fbx); // UV positions
  const uvIndices = getUVIndices(fbx); // UV indices
  const faceIndices = getFaceIndices(fbx); // Face indices

  const faces = [];
  let currentFace = [];

  // Organize UV IDs into individual faces
  for (let i = 0; i < faceIndices.length; i++) {
    currentFace.push(uvIndices[i]);

    // End of face detected
    if (faceIndices[i] < 0) {
      faces.push(currentFace);
      currentFace = [];
    }
  }

  // Compute winding for each face
  const windings = faces.map((face) => {
    let signedArea = 0;

    // Iterate over all vertices in the face
    for (let i = 0; i < face.length; i++) {
      const currentIdx = face[i];
      const nextIdx = face[(i + 1) % face.length]; // Wrap around to the first vertex

      const x1 = uvs[currentIdx * 2];
      const y1 = uvs[currentIdx * 2 + 1];
      const x2 = uvs[nextIdx * 2];
      const y2 = uvs[nextIdx * 2 + 1];

      // Shoelace formula to compute signed area
      signedArea += x1 * y2 - y1 * x2;
    }

    // Determine the winding based on signed area
    return {
      face,
      winding: signedArea > 0 ? "front-facing" : "backward-facing",
    };
  });

  return windings;
};


const loadFbx = () => {
  let fbx;
  try {
    fbx = parseBinary(fs.readFileSync(settings.FILE_PATH));
  } catch (e) {
    fbx = parseText(fs.readFileSync(settings.FILE_PATH, "utf-8"));
  }
  return fbx;
};

const createCanvas = () => {
  const canvas = new Canvas(settings.UV_SIZE, settings.UV_SIZE);
  const ctx = canvas.getContext("2d");
  return { ctx, canvas };
};

async function render() {
  await canvas.saveAs(settings.OUTPUT_FILE, { density: 2 });
}



const drawFaces = (faces) => {

}

// TODO: UDIM support
const settings = getSettings(); // Get Settings

const { ctx, canvas } = createCanvas(); // Build Canvas

const fbx = loadFbx(); // Load FBX
const faces = getFaces(fbx)


drawBackground();
drawFaces(faces) // draw UVs normals blue for front facing, red for backfacing.
const edges = getEdgesStructure(fbx);
drawEdges(edges); // Draw Edges
drawVertices(fbx); // Draw Vertices

render();

