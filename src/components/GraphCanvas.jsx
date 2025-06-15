import React, { useRef, useState, useEffect } from "react";

export default function GraphCanvas() {
  const canvasRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [input, setInput] = useState(`0\n1\n2\n3\n4\n0 1\n1 2\n2 3\n3 0\n1 4\n2 2`);
  const [isDragging, setIsDragging] = useState(false);
  const [dragNodeId, setDragNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingNode, setEditingNode] = useState(null);
  const [labelInput, setLabelInput] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentAlgorithm, setCurrentAlgorithm] = useState("");
  const [animationStep, setAnimationStep] = useState(0);
  const [algorithmState, setAlgorithmState] = useState({});
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [isDirected, setIsDirected] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [pathsBetweenNodes, setPathsBetweenNodes] = useState([]);
  const [foundCycles, setFoundCycles] = useState([]);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, nodeId: null });
  const [showControls, setShowControls] = useState(true);
  const [arrangingTree, setArrangingTree] = useState(false); // NEW

  const width = 900, height = 600;
  const dpr = window.devicePixelRatio || 1;

  // --- Graph Parsing ---
  function parseInput() {
    const lines = input.split("\n").map(l => l.trim()).filter(Boolean);
    const nodeIds = [];
    const edgeList = [];
    for (let line of lines) {
      if (/^\d+$/.test(line)) nodeIds.push(Number(line));
      else if (/^\d+\s+\d+(\s+\d+)?$/.test(line)) {
        const parts = line.split(/\s+/).map(Number);
        const [a, b, weight = 1] = parts;
        edgeList.push({ from: a, to: b, weight, isSelfLoop: a === b });
      }
    }
    const radius = Math.min(width, height) * 0.3;
    const centerX = width / 2;
    const centerY = height / 2;
    setNodes(nodeIds.map((id, i) => {
      const angle = (2 * Math.PI * i) / nodeIds.length;
      return {
        id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        label: "",
        color: "#3b82f6",
        visited: false,
        distance: Infinity,
        parent: null
      };
    }));
    setEdges(edgeList.map(e => ({ ...e, highlighted: false, color: "#6b7280" })));
    resetAlgorithmState();
    setFoundCycles([]);
    setPathsBetweenNodes([]);
  }

  function resetAlgorithmState() {
    setIsAnimating(false);
    setCurrentAlgorithm("");
    setAnimationStep(0);
    setAlgorithmState({});
    setSelectedNodes([]);
    setNodes(prev => prev.map(n => ({
      ...n,
      color: "#3b82f6",
      visited: false,
      distance: Infinity,
      parent: null
    })));
    setEdges(prev => prev.map(e => ({ ...e, highlighted: false, color: "#6b7280" })));
    setFoundCycles([]);
    setPathsBetweenNodes([]);
  }

  // --- Mouse and Node Helpers ---
  function getMousePos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left),
      y: (e.clientY - rect.top)
    };
  }

  function getNodeAtPoint(x, y) {
    return nodes.find(node => {
      const dx = x - node.x;
      const dy = y - node.y;
      return Math.sqrt(dx * dx + dy * dy) <= 28;
    });
  }

  // --- Mouse Events ---
  function handleMouseDown(e) {
    if (arrangingTree) {
      const pos = getMousePos(e);
      const node = getNodeAtPoint(pos.x, pos.y);
      if (node) {
        hangTreeFromRoot(node.id);
        setArrangingTree(false);
      }
      return;
    }
    const pos = getMousePos(e);
    const node = getNodeAtPoint(pos.x, pos.y);

    if (node) {
      // Always allow dragging
      setIsDragging(true);
      setDragNodeId(node.id);
      setDragOffset({
        x: pos.x - node.x,
        y: pos.y - node.y
      });

      // Handle algorithm selection only if not animating
      if (!isAnimating && currentAlgorithm) {
        if (["findpaths"].includes(currentAlgorithm)) {
          if (selectedNodes.length < 2) {
            setSelectedNodes(prev => {
              if (prev.includes(node.id)) return prev;
              return [...prev, node.id];
            });
          }
        }
        if (["dijkstra", "bfs", "dfs"].includes(currentAlgorithm)) {
          setSelectedNodes([node.id]);
        }
      }
    }
  }

  function handleMouseMove(e) {
    if (!isDragging || dragNodeId === null) return;
    const pos = getMousePos(e);
    setNodes(prevNodes =>
      prevNodes.map(node =>
        node.id === dragNodeId
          ? { ...node, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y }
          : node
      )
    );
  }

  function handleMouseUp() {
    setIsDragging(false);
    setDragNodeId(null);
    setDragOffset({ x: 0, y: 0 });
  }

  function handleDoubleClick(e) {
    if (isAnimating) return;
    const pos = getMousePos(e);
    const node = getNodeAtPoint(pos.x, pos.y);
    if (node) {
      setEditingNode(node.id);
      setLabelInput(node.label);
    }
  }

  function saveLabel() {
    if (editingNode !== null) {
      setNodes(prevNodes =>
        prevNodes.map(node =>
          node.id === editingNode
            ? { ...node, label: labelInput }
            : node
        )
      );
      setEditingNode(null);
      setLabelInput("");
    }
  }

  function cancelEdit() {
    setEditingNode(null);
    setLabelInput("");
  }

  // --- Context Menu for Hang Tree on Right Click ---
  function handleContextMenu(e) {
    e.preventDefault();
    const pos = getMousePos(e);
    const node = getNodeAtPoint(pos.x, pos.y);
    if (node) {
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        nodeId: node.id
      });
    } else {
      setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    }
  }

  useEffect(() => {
    function closeMenu() {
      setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    }
    if (contextMenu.visible) {
      window.addEventListener("mousedown", closeMenu);
      window.addEventListener("scroll", closeMenu, true);
      window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
      return () => {
        window.removeEventListener("mousedown", closeMenu);
        window.removeEventListener("scroll", closeMenu, true);
        window.removeEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
      };
    }
  }, [contextMenu.visible]);

  function hangTreeFromRootRightClick(nodeId) {
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    hangTreeFromRoot(nodeId);
  }

  // --- Hang Tree (Tree Layout) ---
  function hangTreeFromRoot(rootOverride = null) {
    const rootId = rootOverride != null ? rootOverride : (selectedNodes.length > 0 ? selectedNodes[0] : null);
    if (rootId == null) return;
    const nodeMap = new Map(nodes.map(n => [n.id, { ...n }]));
    const childMap = new Map(nodes.map(n => [n.id, []]));
    const parentMap = new Map();
    edges.forEach(e => {
      if (isDirected) {
        if (!e.isSelfLoop) childMap.get(e.from).push(e.to);
      } else {
        if (!e.isSelfLoop) {
          childMap.get(e.from).push(e.to);
          childMap.get(e.to).push(e.from);
        }
      }
    });
    const levels = [];
    const visited = new Set();
    const queue = [[rootId, 0, null]];
    while (queue.length) {
      const [node, level, parent] = queue.shift();
      if (visited.has(node)) continue;
      visited.add(node);
      parentMap.set(node, parent);
      if (!levels[level]) levels[level] = [];
      levels[level].push(node);
      for (const child of childMap.get(node)) {
        if (!visited.has(child)) queue.push([child, level + 1, node]);
      }
    }
    const verticalGap = 90;
    const nodeGap = 70;
    const baseY = 80;
    const canvasW = width;
    const newPositions = {};
    for (let lvl = 0; lvl < levels.length; lvl++) {
      const count = levels[lvl].length;
      const totalWidth = (count - 1) * nodeGap;
      for (let i = 0; i < count; i++) {
        const x = canvasW / 2 - totalWidth / 2 + i * nodeGap;
        const y = baseY + lvl * verticalGap;
        newPositions[levels[lvl][i]] = { x, y };
      }
    }
    setNodes(prev =>
      prev.map(n =>
        newPositions[n.id]
          ? { ...n, x: newPositions[n.id].x, y: newPositions[n.id].y }
          : n
      )
    );
  }

  // --- All Paths Between Two Nodes, Colorful ---
  async function findAllPathsBetweenNodes() {
    setIsAnimating(true);
    setPathsBetweenNodes([]);
    if (selectedNodes.length !== 2) {
      setIsAnimating(false);
      return;
    }
    const [start, end] = selectedNodes;
    const allPaths = [];
    const path = [];
    function getNeighbors(id) {
      if (isDirected) {
        return edges.filter(e => e.from === id && !e.isSelfLoop).map(e => e.to);
      } else {
        return edges.filter(e => (e.from === id || e.to === id) && !e.isSelfLoop)
          .map(e => e.from === id ? e.to : e.from);
      }
    }
    function dfs(current, visited) {
      visited.add(current);
      path.push(current);
      if (current === end) {
        allPaths.push([...path]);
      } else {
        for (const neighbor of getNeighbors(current)) {
          if (!visited.has(neighbor)) {
            dfs(neighbor, visited);
          }
        }
      }
      path.pop();
      visited.delete(current);
    }
    dfs(start, new Set());
    const pathColors = [
      "#ef4444", "#3b82f6", "#f59e0b", "#06b6d4", "#22c55e", "#ec4899", "#8b5cf6", "#84cc16",
      "#eab308", "#f43f5e", "#a21caf", "#0ea5e9"
    ];
    setEdges(prev => prev.map(e => ({ ...e, color: "#6b7280" })));
    setNodes(prev => prev.map(n => ({ ...n, color: "#3b82f6" })));
    for (let i = 0; i < allPaths.length; i++) {
      const path = allPaths[i];
      const color = pathColors[i % pathColors.length];
      for (let j = 0; j < path.length - 1; j++) {
        highlightEdge(path[j], path[j + 1], color);
      }
      for (let nodeId of path) {
        setNodeColor(nodeId, color);
      }
      await sleep(Math.max(150, speed / 3));
    }
    setPathsBetweenNodes([...allPaths]);
    setIsAnimating(false);
  }

  // --- Cycle Detection ---
  async function detectCycles() {
    setIsAnimating(true);
    const allCycles = [];
    const colors = ["#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
    const selfLoops = edges.filter(e => e.isSelfLoop);
    for (let selfLoop of selfLoops) {
      allCycles.push([selfLoop.from]);
      const color = colors[allCycles.length - 1] || "#ef4444";
      highlightEdge(selfLoop.from, selfLoop.to, color);
      setNodeColor(selfLoop.from, color);
      await sleep(speed);
    }
    if (!isDirected) {
      const visited = new Set();
      async function dfsUndirected(nodeId, parent, path) {
        visited.add(nodeId);
        setNodeColor(nodeId, "#fbbf24");
        await sleep(speed / 2);
        const neighbors = edges.filter(e => {
          if (e.isSelfLoop) return false;
          if (!(e.from === nodeId || e.to === nodeId)) return false;
          const neighbor = e.from === nodeId ? e.to : e.from;
          return neighbor !== parent;
        });
        for (let edge of neighbors) {
          const neighbor = edge.from === nodeId ? edge.to : edge.from;
          if (path.includes(neighbor)) {
            const cycleStart = path.indexOf(neighbor);
            const cycle = [...path.slice(cycleStart), nodeId];
            const cycleSorted = [...cycle].sort((a, b) => a - b);
            if (!allCycles.some(cy => cy.length === cycle.length && cy.sort((a,b)=>a-b).every((v,i)=>v===cycleSorted[i]))) {
              allCycles.push(cycle);
              const color = colors[allCycles.length - 1] || "#ef4444";
              for (let i = 0; i < cycle.length; i++) {
                const from = cycle[i];
                const to = cycle[(i + 1) % cycle.length];
                highlightEdge(from, to, color);
                setNodeColor(from, color);
              }
              await sleep(speed);
            }
          } else if (!visited.has(neighbor)) {
            await dfsUndirected(neighbor, nodeId, [...path, nodeId]);
          }
        }
      }
      for (let node of nodes) {
        if (!visited.has(node.id)) {
          await dfsUndirected(node.id, -1, []);
        }
      }
    } else {
      const globalVisited = new Set();
      const stack = [];
      const onStack = new Set();
      async function dfsDirected(nodeId, path) {
        stack.push(nodeId);
        onStack.add(nodeId);
        globalVisited.add(nodeId);
        setNodeColor(nodeId, "#fbbf24");
        await sleep(speed / 3);
        const neighbors = edges.filter(e => e.from === nodeId && !e.isSelfLoop);
        for (let edge of neighbors) {
          const neighbor = edge.to;
          if (!globalVisited.has(neighbor)) {
            await dfsDirected(neighbor, [...path, nodeId]);
          } else if (onStack.has(neighbor)) {
            const cycleStart = stack.indexOf(neighbor);
            const cycle = stack.slice(cycleStart);
            const cycleSorted = [...cycle].sort((a, b) => a - b);
            if (!allCycles.some(cy => cy.length === cycle.length && cy.sort((a,b)=>a-b).every((v,i)=>v===cycleSorted[i]))) {
              allCycles.push([...cycle, neighbor]);
              const color = colors[allCycles.length - 1] || "#ef4444";
              for (let i = 0; i < cycle.length; i++) {
                const from = cycle[i];
                const to = cycle[(i + 1) % cycle.length];
                highlightEdge(from, to, color);
                setNodeColor(from, color);
              }
              setNodeColor(neighbor, color);
              await sleep(speed);
            }
          }
        }
        stack.pop();
        onStack.delete(nodeId);
        setNodeColor(nodeId, "#10b981");
      }
      for (let node of nodes) {
        if (!globalVisited.has(node.id)) {
          await dfsDirected(node.id, []);
        }
      }
    }
    setFoundCycles(allCycles.map(c => [...c]));
    if (allCycles.length === 0) {
      nodes.forEach(node => setNodeColor(node.id, "#22c55e"));
      await sleep(1000);
      nodes.forEach(node => setNodeColor(node.id, "#3b82f6"));
    } else {
      setAlgorithmState({ cycleCount: allCycles.length, cycles: allCycles });
    }
    setIsAnimating(false);
  }

  // --- Helpers for Coloring ---
  function setNodeColor(nodeId, color) {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, color } : n));
  }

  function highlightEdge(from, to, color) {
    setEdges(prev => prev.map(e =>
      (e.from === from && e.to === to) || (!isDirected && e.from === to && e.to === from)
        ? { ...e, color, highlighted: true } : e
    ));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function runAlgorithm(algorithm) {
    if (isAnimating) return;
    resetAlgorithmState();
    setCurrentAlgorithm(algorithm);
    switch (algorithm) {
      case "cycles":
        await detectCycles();
        break;
      case "findpaths":
        if (selectedNodes.length === 2) {
          await findAllPathsBetweenNodes();
        }
        break;
    }
  }

  // --- Drawing ---
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * dpr, height * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Edges
    edges.forEach(e => {
      const a = nodes.find(n => n.id === e.from);
      const b = nodes.find(n => n.id === e.to);
      if (a && b) {
        ctx.strokeStyle = e.color;
        ctx.lineWidth = e.highlighted ? 5 : 3;
        ctx.lineCap = "round";

        if (e.isSelfLoop) {
          const loopRadius = 40;
          const loopCenterX = a.x + loopRadius;
          const loopCenterY = a.y - loopRadius;
          ctx.beginPath();
          ctx.arc(loopCenterX, loopCenterY, loopRadius, 0, 2 * Math.PI);
          ctx.stroke();
          if (isDirected) {
            const arrowX = loopCenterX + loopRadius * Math.cos(Math.PI / 4);
            const arrowY = loopCenterY + loopRadius * Math.sin(Math.PI / 4);
            const arrowLength = 12;
            const arrowAngle = Math.PI / 6;
            const tangentAngle = Math.PI / 4 + Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(
              arrowX - arrowLength * Math.cos(tangentAngle - arrowAngle),
              arrowY - arrowLength * Math.sin(tangentAngle - arrowAngle)
            );
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(
              arrowX - arrowLength * Math.cos(tangentAngle + arrowAngle),
              arrowY - arrowLength * Math.sin(tangentAngle + arrowAngle)
            );
            ctx.stroke();
          }
          if (e.weight !== 1) {
            ctx.fillStyle = "#1f2937";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(e.weight, loopCenterX, loopCenterY - loopRadius - 12);
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          if (isDirected) {
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            const arrowLength = 18;
            const arrowAngle = Math.PI / 6;
            const endX = b.x - 30 * Math.cos(angle);
            const endY = b.y - 30 * Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(
              endX - arrowLength * Math.cos(angle - arrowAngle),
              endY - arrowLength * Math.sin(angle - arrowAngle)
            );
            ctx.moveTo(endX, endY);
            ctx.lineTo(
              endX - arrowLength * Math.cos(angle + arrowAngle),
              endY - arrowLength * Math.sin(angle + arrowAngle)
            );
            ctx.stroke();
          }

          if (e.weight !== 1) {
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(midX - 15, midY - 10, 30, 20);
            ctx.fillStyle = "#1f2937";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(e.weight, midX, midY + 4);
          }
        }
      }
    });

    // Nodes
    nodes.forEach(n => {
      const isSelected = selectedNodes.includes(n.id);
      const isDragged = dragNodeId === n.id;

      // Node shadow
      ctx.beginPath();
      ctx.arc(n.x + 2, n.y + 2, 30, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fill();

      // Node body
      ctx.beginPath();
      ctx.arc(n.x, n.y, 28, 0, 2 * Math.PI);
      ctx.fillStyle = isDragged ? n.color + "DD" : n.color + "F0";
      ctx.fill();

      // Node border
      ctx.strokeStyle = isSelected ? "#facc15" : "#ffffff";
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.stroke();

      // Node ID
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.id, n.x, n.y);

      // Node label
      if (n.label) {
        ctx.fillStyle = "#1f2937";
        ctx.font = "14px sans-serif";
        ctx.fillText(n.label, n.x, n.y + 50);
      }
    });

    ctx.restore();
  }

  useEffect(draw, [nodes, edges, dpr, dragNodeId, currentAlgorithm, selectedNodes]);
  useEffect(() => { parseInput(); }, []);

  // --- UI ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Arrange as Tree floating button */}
      <button
        onClick={() => setArrangingTree(true)}
        className="fixed right-12 bottom-12 bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-full shadow-xl z-50 text-lg font-semibold"
      >
        🌲 Arrange as Tree
      </button>
      {arrangingTree && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 shadow-xl flex flex-col items-center">
            <div className="text-lg mb-4 font-semibold">Click a node to choose as root for the tree layout</div>
            <button
              className="mt-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg"
              onClick={() => setArrangingTree(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Graph Algorithm Visualizer</h1>
              <p className="text-gray-600 mt-1">Interactive graph visualization with advanced algorithms</p>
            </div>
            <button
              onClick={() => setShowControls(!showControls)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {showControls ? "Hide Controls" : "Show Controls"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {showControls && (
          <div className="bg-white rounded-xl shadow-lg mb-6 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Controls</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Graph Definition</label>
                    <textarea
                      className="w-full border-2 border-gray-200 rounded-lg p-3 font-mono text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-colors"
                      rows={8}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder="Nodes: 0, 1, 2&#10;Edges: 0 1 [weight]&#10;Self-loops: 2 2 [weight]"
                      disabled={isAnimating}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      onClick={parseInput}
                      disabled={isAnimating}
                    >
                      Generate Graph
                    </button>
                    <button
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      onClick={resetAlgorithmState}
                      disabled={isAnimating}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center text-sm font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={isDirected}
                        onChange={e => setIsDirected(e.target.checked)}
                        disabled={isAnimating}
                        className="mr-2 w-4 h-4 text-indigo-600"
                      />
                      Directed Graph
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">Algorithms</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        currentAlgorithm === "cycles" 
                          ? "bg-red-600 text-white" 
                          : "bg-red-100 hover:bg-red-200 text-red-700"
                      }`}
                      onClick={() => runAlgorithm("cycles")}
                      disabled={isAnimating}
                    >
                      🔍 Detect Cycles
                    </button>
                    <button
                      className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        currentAlgorithm === "findpaths" 
                          ? "bg-teal-600 text-white" 
                          : "bg-teal-100 hover:bg-teal-200 text-teal-700"
                      }`}
                      onClick={() => {
                        resetAlgorithmState();
                        setCurrentAlgorithm("findpaths");
                      }}
                      disabled={isAnimating}
                    >
                      🛤️ Find All Paths
                    </button>
                  </div>
                  
                  {currentAlgorithm === "findpaths" && selectedNodes.length === 2 && (
                    <button
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      disabled={isAnimating}
                      onClick={() => runAlgorithm("findpaths")}
                    >
                      Show Paths: {selectedNodes[0]} → {selectedNodes[1]}
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">Layout & Settings</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Animation Speed</label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      value={speed}
                      onChange={e => setSpeed(Number(e.target.value))}
                      disabled={isAnimating}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 mt-1">{speed} ms</div>
                  </div>
                  <button
                    className="w-full bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    onClick={() => hangTreeFromRoot()}
                    disabled={isAnimating || selectedNodes.length === 0}
                  >
                    🌲 Hang Tree from Selected Root
                  </button>
                  <div className="text-xs text-gray-500 mt-2">
                    Or <span className="font-semibold">right-click</span> any node on the canvas to hang the tree from it.
                  </div>
                  {selectedNodes.length > 0 && (currentAlgorithm !== "findpaths" || selectedNodes.length === 1) && (
                    <div className="mt-1 text-xs text-indigo-700">Selected node: {selectedNodes[0]}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Canvas & Results */}
        <div className="flex flex-col items-center">
          <div className="border-2 border-gray-200 rounded-xl bg-white shadow-xl relative">
            <canvas
              ref={canvasRef}
              width={width * dpr}
              height={height * dpr}
              style={{ width: `${width}px`, height: `${height}px`, display: "block", background: "#f8fafc" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onDoubleClick={handleDoubleClick}
              onContextMenu={handleContextMenu}
              className="cursor-pointer select-none"
            />
            {contextMenu.visible && (
              <div
                style={{
                  position: "fixed",
                  left: contextMenu.x,
                  top: contextMenu.y,
                  zIndex: 9999,
                  background: "white",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  minWidth: 190
                }}
                onContextMenu={e => e.preventDefault()}
              >
                <button
                  className="block w-full text-left px-5 py-3 hover:bg-indigo-50 rounded-lg text-sm"
                  onClick={() => hangTreeFromRootRightClick(contextMenu.nodeId)}
                >
                  🌲 Hang Tree from this Node
                </button>
              </div>
            )}
          </div>

          {/* Edit node label dialog */}
          {editingNode !== null && (
            <div className="mt-4 flex gap-2 items-center">
              <input
                type="text"
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                placeholder="Enter node label"
                className="border px-2 py-1 rounded"
                onKeyPress={e => e.key === "Enter" && saveLabel()}
                autoFocus
              />
              <button
                onClick={saveLabel}
                className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-sm"
              >
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-sm"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Results & Paths */}
          {algorithmState.cycleCount > 0 && (
            <div className="mt-6 text-center">
              <p className="text-base text-red-600 font-semibold mb-2">
                Found {algorithmState.cycleCount} cycle{algorithmState.cycleCount > 1 ? 's' : ''}:
              </p>
              <ol className="text-xs text-gray-800 flex flex-col items-center">
                {foundCycles.map((cycle, idx) => (
                  <li key={idx}>[{cycle.join(" → ")}]</li>
                ))}
              </ol>
            </div>
          )}
          {pathsBetweenNodes.length > 0 && (
            <div className="mt-6 text-center">
              <p className="text-base text-teal-700 font-semibold mb-2">
                Found {pathsBetweenNodes.length} path{pathsBetweenNodes.length > 1 ? 's' : ''} between {selectedNodes[0]} and {selectedNodes[1]}:
              </p>
              <ol className="text-xs text-gray-800 flex flex-col items-center">
                {pathsBetweenNodes.map((path, idx) => (
                  <li key={idx}>[{path.join(" → ")}]</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 mb-8 text-center text-sm text-gray-600 max-w-2xl mx-auto px-3">
        <p>
          <strong>Instructions:</strong> <br />
          • Drag nodes to reposition them.<br />
          • Double-click nodes to add or edit labels.<br />
          • Right-click a node for a quick tree layout.<br />
          • <strong>Arrange as Tree</strong>: Click the green button, then a node.<br />
          • <strong>Find All Paths</strong>: Click two nodes, then "Show Paths".<br />
          • Self-loops supported (e.g., "2 2" creates a loop on node 2).<br />
          • Toggle between directed and undirected.<br />
          • Adjust animation speed with the slider.<br />
        </p>
      </div>
    </div>
  );
}